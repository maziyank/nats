import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PayrollService } from './payroll.service';
import { prisma } from '@/services/lib/prisma';
import { PayrollPeriodStatus, SalaryComponentType } from '@/prisma/generated/prisma/client';
import { enqueueIntegrationEvent } from '@/services/modules/integration/outbox';

vi.mock('@/lib/prisma', () => ({
    prisma: {
        payrollPeriod: {
            create: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        salaryStructure: {
            updateMany: vi.fn(),
            create: vi.fn(),
            findMany: vi.fn(),
        },
        salaryComponent: {
            findFirst: vi.fn(),
            create: vi.fn(),
        },
        contact: {
            findMany: vi.fn(),
        },
        auditLog: {
            create: vi.fn(),
        },
        $transaction: vi.fn((callback) => callback(prisma)),
        salarySlip: {
            deleteMany: vi.fn(),
            create: vi.fn(),
            createMany: vi.fn(),
            findMany: vi.fn(),
            updateMany: vi.fn(),
        },
        salarySlipItem: {
            createMany: vi.fn(),
        },
        payrollRun: {
            create: vi.fn(),
        },
    },
}));

vi.mock('@/modules/integration/outbox', () => ({
    enqueueIntegrationEvent: vi.fn(),
}));

vi.mock('./statutory.service', () => ({
    StatutoryService: {
        calculateForEmployee: vi.fn().mockResolvedValue([]),
    },
}));

describe('PayrollService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createPayrollPeriod', () => {
        it('should create a payroll period', async () => {
            const data = {
                name: 'January 2024',
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-01-31'),
            };

            const expectedPeriod = { ...data, id: '1', status: PayrollPeriodStatus.DRAFT };
            vi.mocked(prisma.payrollPeriod.create).mockResolvedValue(expectedPeriod as any);

            const result = await PayrollService.createPayrollPeriod(data);

            expect(prisma.payrollPeriod.create).toHaveBeenCalledWith({
                data: {
                    name: data.name,
                    startDate: data.startDate,
                    endDate: data.endDate,
                    status: PayrollPeriodStatus.DRAFT,
                },
            });
            expect(result).toEqual(expectedPeriod);
        });
    });

    describe('runPayroll', () => {
        it('should generate salary slips for active employees', async () => {
            const periodId = 'period-1';
            const period = { id: periodId, status: PayrollPeriodStatus.DRAFT };
            vi.mocked(prisma.payrollPeriod.findUnique).mockResolvedValue(period as any);

            const structure = {
                baseSalary: 5000,
                items: [
                    { componentId: 'comp-1', amount: 1000, formula: null, component: { type: SalaryComponentType.EARNING } },
                    { componentId: 'comp-2', amount: 200, formula: null, component: { type: SalaryComponentType.DEDUCTION } },
                ],
            };
            const employees = [{
                id: 'emp-1',
                name: 'Alice',
                salaryStructures: [structure],
                type: 'EMPLOYEE',
                employeeDetail: { taxFilingStatus: 'TK0', hasNpwp: true },
            }];
            vi.mocked(prisma.contact.findMany).mockResolvedValue(employees as any);
            vi.mocked(prisma.salaryComponent.findFirst).mockResolvedValue(null as any);
            vi.mocked(prisma.salaryComponent.create).mockImplementation((({ data }: any) => ({
                id: `auto-${data.name}`,
                ...data,
            }) as any));

            vi.mocked(prisma.salarySlip.findMany).mockResolvedValue([] as any);

            const result = await PayrollService.runPayroll(periodId, { applyStatutory: false });

            expect(prisma.salarySlip.createMany).toHaveBeenCalled();
            expect(result.totalSlips).toBe(1);
        });

        it('should evaluate formula on structure items', async () => {
            const periodId = 'period-1';
            vi.mocked(prisma.payrollPeriod.findUnique).mockResolvedValue({
                id: periodId,
                status: PayrollPeriodStatus.DRAFT,
            } as any);

            const structure = {
                baseSalary: 10000,
                items: [
                    {
                        componentId: 'comp-bonus',
                        amount: 0,
                        formula: 'BASE * 0.1',
                        component: { type: SalaryComponentType.EARNING },
                    },
                ],
            };
            vi.mocked(prisma.contact.findMany).mockResolvedValue([
                {
                    id: 'emp-1',
                    name: 'Bob',
                    salaryStructures: [structure],
                    employeeDetail: null,
                },
            ] as any);
            vi.mocked(prisma.salarySlip.findMany).mockResolvedValue([{ id: 'slip-2', contactId: 'emp-1' }] as any);

            await PayrollService.runPayroll(periodId, { applyStatutory: false });

            expect(prisma.salarySlip.createMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.arrayContaining([
                        expect.objectContaining({ grossSalary: 11000 }),
                    ]),
                })
            );
            expect(prisma.salarySlipItem.createMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.arrayContaining([
                        expect.objectContaining({
                            componentId: 'comp-bonus',
                            amount: 1000,
                        }),
                    ]),
                })
            );
        });
    });

    describe('approvePayrollRun', () => {
        it('should complete period, publish slips, and emit events', async () => {
            const periodId = 'period-1';
            const userId = 'user-1';
            const period = { id: periodId, status: PayrollPeriodStatus.PROCESSING };
            vi.mocked(prisma.payrollPeriod.findUnique).mockResolvedValue(period as any);

            const slips = [{ id: 'slip-1', grossSalary: 6000, totalDeductions: 200, netSalary: 5800, contactId: 'emp-1' }];
            vi.mocked(prisma.salarySlip.findMany).mockResolvedValue(slips as any);

            const payrollRun = { id: 'run-1' };
            vi.mocked(prisma.payrollRun.create).mockResolvedValue(payrollRun as any);
            vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

            await PayrollService.approvePayrollRun(periodId, userId);

            expect(prisma.payrollPeriod.update).toHaveBeenCalledWith({
                where: { id: periodId },
                data: { status: PayrollPeriodStatus.COMPLETED },
            });
            expect(enqueueIntegrationEvent).toHaveBeenCalledTimes(1); // 1 run-level event (handlers fan out)
        });
    });

    describe('getSalaryHistory', () => {
        it('should return salary history for a contact', async () => {
            const contactId = 'emp-1';
            const history = [
                { id: 'struct-1', isActive: false, createdAt: new Date() },
                { id: 'struct-2', isActive: true, createdAt: new Date() },
            ];
            vi.mocked(prisma.salaryStructure.findMany).mockResolvedValue(history as any);

            const result = await PayrollService.getSalaryHistory(contactId);

            expect(prisma.salaryStructure.findMany).toHaveBeenCalledWith({
                where: { contactId },
                orderBy: { createdAt: 'desc' },
                include: {
                    items: {
                        include: { component: true },
                    },
                },
            });
            expect(result).toHaveLength(2);
        });
    });

    describe('markSlipsPaid', () => {
        it('should mark published slips as paid', async () => {
            vi.mocked(prisma.payrollPeriod.findUnique).mockResolvedValue({
                id: 'period-1',
                status: PayrollPeriodStatus.COMPLETED,
            } as any);
            vi.mocked(prisma.salarySlip.updateMany).mockResolvedValue({ count: 3 } as any);

            const result = await PayrollService.markSlipsPaid('period-1');
            expect(result.updated).toBe(3);
        });
    });
});
