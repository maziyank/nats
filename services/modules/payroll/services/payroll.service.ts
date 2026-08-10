import { prisma } from '@/services/lib/prisma';
import { CreatePayrollPeriodDTO, CreateSalaryStructureDTO } from '../types/payroll.types';
import { ContactType, PayrollPeriodStatus, SalaryComponentType, SalarySlipStatus } from '@/prisma/generated/prisma/client';
import { enqueueIntegrationEvent } from '@/services/modules/integration/outbox';
import { Decimal } from 'decimal.js';
import { evaluateFormula } from '../utils/formula';
import { StatutoryService } from './statutory.service';

export class PayrollService {
    static async getPayrollPeriods({
        page = 1,
        pageSize = 10,
        status,
    }: {
        page?: number;
        pageSize?: number;
        status?: PayrollPeriodStatus;
    }) {
        const skip = (page - 1) * pageSize;
        const where = status ? { status } : {};
        const [items, total] = await Promise.all([
            prisma.payrollPeriod.findMany({
                where,
                orderBy: { startDate: 'desc' },
                skip,
                take: pageSize,
                include: {
                    payrollRuns: true,
                    _count: { select: { salarySlips: true } },
                },
            }),
            prisma.payrollPeriod.count({ where }),
        ]);

        return {
            items,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }

    static async getPayrollPeriod(id: string) {
        return prisma.payrollPeriod.findUnique({
            where: { id },
            include: {
                payrollRuns: true,
                salarySlips: {
                    include: {
                        contact: {
                            include: { employeeDetail: true },
                        },
                        items: {
                            include: { component: true },
                        },
                    },
                    orderBy: { contact: { name: 'asc' } },
                },
            },
        });
    }

    static async createPayrollPeriod(data: CreatePayrollPeriodDTO) {
        return prisma.payrollPeriod.create({
            data: {
                name: data.name,
                startDate: data.startDate,
                endDate: data.endDate,
                status: PayrollPeriodStatus.DRAFT,
            },
        });
    }

    static async getSalaryStructure(contactId: string) {
        return prisma.salaryStructure.findFirst({
            where: { contactId, isActive: true },
            include: {
                items: {
                    include: { component: true },
                },
            },
        });
    }

    static async configureSalaryStructure(data: CreateSalaryStructureDTO) {
        return prisma.$transaction(async (tx) => {
            await tx.salaryStructure.updateMany({
                where: { contactId: data.contactId, isActive: true },
                data: { isActive: false },
            });

            const structure = await tx.salaryStructure.create({
                data: {
                    name: data.name,
                    contactId: data.contactId,
                    baseSalary: data.baseSalary,
                    createdById: data.createdById,
                    items: {
                        create: data.items.map((item) => ({
                            componentId: item.componentId,
                            amount: item.amount,
                            formula: item.formula,
                        })),
                    },
                },
                include: { items: true },
            });

            await tx.auditLog.create({
                data: {
                    userId: data.createdById || 'system',
                    action: 'SALARY_STRUCTURE_CONFIGURED',
                    entityType: 'SALARY_STRUCTURE',
                    entityId: structure.id,
                    metadata: {
                        contactId: data.contactId,
                        baseSalary: data.baseSalary,
                        itemCount: data.items.length,
                    },
                },
            });

            return structure;
        });
    }

    static async getSalaryHistory(contactId: string) {
        return prisma.salaryStructure.findMany({
            where: { contactId },
            orderBy: { createdAt: 'desc' },
            include: {
                items: {
                    include: { component: true },
                },
            },
        });
    }

    /** Employees who would be skipped by payroll run */
    static async getPayrollReadiness() {
        const activeEmployees = await prisma.contact.findMany({
            where: { type: ContactType.EMPLOYEE, isActive: true },
            include: {
                salaryStructures: {
                    where: { isActive: true },
                    take: 1,
                },
                employeeDetail: true,
            },
            orderBy: { name: 'asc' },
        });

        const ready = activeEmployees.filter((e) => e.salaryStructures.length > 0);
        const missingStructure = activeEmployees.filter((e) => e.salaryStructures.length === 0);

        return {
            totalActive: activeEmployees.length,
            readyCount: ready.length,
            missingStructure,
        };
    }

    static async runPayroll(periodId: string, options?: { applyStatutory?: boolean }) {
        const applyStatutory = options?.applyStatutory ?? true;
        const period = await prisma.payrollPeriod.findUnique({
            where: { id: periodId },
        });

        if (!period) throw new Error('Payroll period not found');
        if (period.status === PayrollPeriodStatus.COMPLETED) {
            throw new Error('Payroll period already completed');
        }

        const employees = await prisma.contact.findMany({
            where: {
                type: ContactType.EMPLOYEE,
                isActive: true,
                salaryStructures: {
                    some: { isActive: true },
                },
            },
            include: {
                employeeDetail: true,
                salaryStructures: {
                    where: { isActive: true },
                    include: {
                        items: {
                            include: { component: true },
                        },
                    },
                },
            },
        });

        // Ensure statutory component stubs exist for auto-deductions
        const statutoryComponentMap = applyStatutory
            ? await this.ensureStatutoryComponents()
            : new Map<string, string>();

        const skipped: string[] = [];
        type PreparedSlip = {
            contactId: string;
            grossSalary: number;
            totalDeductions: number;
            netSalary: number;
            items: Array<{
                componentId: string;
                amount: number;
                type: SalaryComponentType;
            }>;
        };
        const prepared: PreparedSlip[] = [];

        // Precompute all slips outside the DB write transaction (statutory calc can be slow).
        for (const emp of employees) {
            const structure = emp.salaryStructures[0];
            if (!structure) {
                skipped.push(emp.name);
                continue;
            }

            const baseSalary = new Decimal(structure.baseSalary);
            let grossSalary = baseSalary;
            let totalDeductions = new Decimal(0);
            const slipItems: Array<{
                componentId: string;
                amount: number;
                type: SalaryComponentType;
            }> = [];

            // First pass: fixed amounts + earnings formulas with BASE
            for (const item of structure.items) {
                let amount = new Decimal(item.amount);
                if (item.formula) {
                    try {
                        const evaluated = evaluateFormula(item.formula, {
                            BASE: baseSalary.toNumber(),
                            AMOUNT: Number(item.amount),
                            GROSS: grossSalary.toNumber(),
                        });
                        amount = new Decimal(evaluated);
                    } catch {
                        // fall back to fixed amount
                    }
                }

                slipItems.push({
                    componentId: item.componentId,
                    amount: amount.toNumber(),
                    type: item.component.type,
                });

                if (item.component.type === SalaryComponentType.EARNING) {
                    grossSalary = grossSalary.plus(amount);
                } else if (item.component.type === SalaryComponentType.DEDUCTION) {
                    totalDeductions = totalDeductions.plus(amount);
                }
            }

            // Statutory deductions (PPh21, BPJS employee share)
            if (applyStatutory) {
                const statutory = await StatutoryService.calculateForEmployee({
                    monthlyGross: grossSalary.toNumber(),
                    taxFilingStatus: emp.employeeDetail?.taxFilingStatus || 'TK0',
                    hasNpwp: emp.employeeDetail?.hasNpwp ?? true,
                });

                for (const ded of statutory) {
                    if (ded.employeeAmount <= 0) continue;
                    const componentId = statutoryComponentMap.get(ded.type);
                    if (!componentId) continue;

                    // Avoid double-counting if structure already has same component
                    const already = slipItems.find((i) => i.componentId === componentId);
                    if (already) continue;

                    slipItems.push({
                        componentId,
                        amount: ded.employeeAmount,
                        type: SalaryComponentType.DEDUCTION,
                    });
                    totalDeductions = totalDeductions.plus(ded.employeeAmount);
                }
            }

            const netSalary = grossSalary.minus(totalDeductions);
            prepared.push({
                contactId: emp.id,
                grossSalary: grossSalary.toNumber(),
                totalDeductions: totalDeductions.toNumber(),
                netSalary: netSalary.toNumber(),
                items: slipItems,
            });
        }

        // Short write transaction: delete old drafts, bulk-create slips + items.
        await prisma.$transaction(async (tx) => {
            await tx.salarySlip.deleteMany({
                where: { periodId, status: SalarySlipStatus.DRAFT },
            });

            const SLIP_CHUNK = 100;
            for (let i = 0; i < prepared.length; i += SLIP_CHUNK) {
                const chunk = prepared.slice(i, i + SLIP_CHUNK);
                await tx.salarySlip.createMany({
                    data: chunk.map((p) => ({
                        periodId,
                        contactId: p.contactId,
                        grossSalary: p.grossSalary,
                        totalDeductions: p.totalDeductions,
                        netSalary: p.netSalary,
                        status: SalarySlipStatus.DRAFT,
                    })),
                });
            }

            // Map created slips by contactId to attach items
            const createdSlips = await tx.salarySlip.findMany({
                where: { periodId, status: SalarySlipStatus.DRAFT },
                select: { id: true, contactId: true },
            });
            const slipIdByContact = new Map(
                createdSlips.map((s) => [s.contactId, s.id]),
            );

            const itemRows = prepared.flatMap((p) => {
                const slipId = slipIdByContact.get(p.contactId);
                if (!slipId) return [];
                return p.items.map((item) => ({
                    slipId,
                    componentId: item.componentId,
                    amount: item.amount,
                    type: item.type,
                }));
            });

            const ITEM_CHUNK = 500;
            for (let i = 0; i < itemRows.length; i += ITEM_CHUNK) {
                await tx.salarySlipItem.createMany({
                    data: itemRows.slice(i, i + ITEM_CHUNK),
                });
            }

            await tx.payrollPeriod.update({
                where: { id: periodId },
                data: { status: PayrollPeriodStatus.PROCESSING },
            });
        });

        return {
            periodId,
            totalSlips: prepared.length,
            skipped,
            missingStructureCount: skipped.length,
        };
    }

    private static async ensureStatutoryComponents() {
        const map = new Map<string, string>();
        const defs: Array<{ type: string; name: string }> = [
            { type: 'PPH21', name: 'PPh 21' },
            { type: 'BPJS_KESEHATAN', name: 'BPJS Kesehatan (Employee)' },
            { type: 'BPJS_TK_JHT', name: 'BPJS TK JHT (Employee)' },
            { type: 'BPJS_TK_JP', name: 'BPJS TK JP (Employee)' },
        ];

        for (const def of defs) {
            let component = await prisma.salaryComponent.findFirst({
                where: { name: def.name },
            });
            if (!component) {
                component = await prisma.salaryComponent.create({
                    data: {
                        name: def.name,
                        type: SalaryComponentType.DEDUCTION,
                        isTaxable: false,
                        description: `Auto-generated statutory component for ${def.type}`,
                    },
                });
            }
            map.set(def.type, component.id);
        }
        return map;
    }

    static async approvePayrollRun(periodId: string, userId: string) {
        const period = await prisma.payrollPeriod.findUnique({
            where: { id: periodId },
        });

        if (!period) throw new Error('Payroll period not found');
        if (period.status !== PayrollPeriodStatus.PROCESSING) {
            throw new Error('Payroll period not in processing state');
        }

        await prisma.$transaction(async (tx) => {
            await tx.payrollPeriod.update({
                where: { id: periodId },
                data: { status: PayrollPeriodStatus.COMPLETED },
            });

            await tx.salarySlip.updateMany({
                where: { periodId: period.id, status: SalarySlipStatus.DRAFT },
                data: { status: SalarySlipStatus.PUBLISHED },
            });

            const slips = await tx.salarySlip.findMany({
                where: { periodId },
            });

            const totalEarnings = slips.reduce(
                (sum, slip) => sum.plus(new Decimal(slip.grossSalary)),
                new Decimal(0)
            );
            const totalDeductions = slips.reduce(
                (sum, slip) => sum.plus(new Decimal(slip.totalDeductions)),
                new Decimal(0)
            );
            const netPay = slips.reduce(
                (sum, slip) => sum.plus(new Decimal(slip.netSalary)),
                new Decimal(0)
            );

            const payrollRun = await tx.payrollRun.create({
                data: {
                    periodId,
                    runDate: new Date(),
                    totalEarnings: totalEarnings.toNumber(),
                    totalDeductions: totalDeductions.toNumber(),
                    netPay: netPay.toNumber(),
                    status: PayrollPeriodStatus.COMPLETED,
                },
            });

            // One run-level event (handlers can fan out). Avoid N per-slip outbox writes.
            await enqueueIntegrationEvent(tx, {
                topic: 'PAYROLL',
                type: 'PAYROLL_RUN_COMPLETED',
                aggregateType: 'PAYROLL_RUN',
                aggregateId: payrollRun.id,
                payload: {
                    payrollRunId: payrollRun.id,
                    periodId,
                    totalAmount: netPay.toString(),
                    userId,
                    slipIds: slips.map((s) => s.id),
                    slipCount: slips.length,
                },
            });

            await tx.auditLog.create({
                data: {
                    userId,
                    action: 'PAYROLL_RUN_APPROVED',
                    entityType: 'PAYROLL_PERIOD',
                    entityId: periodId,
                    metadata: {
                        payrollRunId: payrollRun.id,
                        slipCount: slips.length,
                        netPay: netPay.toNumber(),
                    },
                },
            });
        });
    }

    static async markSlipsPaid(periodId: string, slipIds?: string[]) {
        const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
        if (!period) throw new Error('Payroll period not found');
        if (period.status !== PayrollPeriodStatus.COMPLETED) {
            throw new Error('Only completed payroll periods can mark slips as paid');
        }

        const where = {
            periodId,
            status: SalarySlipStatus.PUBLISHED,
            ...(slipIds?.length ? { id: { in: slipIds } } : {}),
        };

        const result = await prisma.salarySlip.updateMany({
            where,
            data: {
                status: SalarySlipStatus.PAID,
                paidAt: new Date(),
            },
        });

        return { updated: result.count };
    }

    static async getSalarySlip(slipId: string) {
        return prisma.salarySlip.findUnique({
            where: { id: slipId },
            include: {
                period: true,
                contact: {
                    include: { employeeDetail: true },
                },
                items: {
                    include: { component: true },
                },
            },
        });
    }

    static async getBankTransferExport(periodId: string) {
        const slips = await prisma.salarySlip.findMany({
            where: {
                periodId,
                status: { in: [SalarySlipStatus.PUBLISHED, SalarySlipStatus.PAID] },
            },
            include: {
                contact: {
                    include: { employeeDetail: true },
                },
            },
            orderBy: { contact: { name: 'asc' } },
        });

        return slips.map((slip) => ({
            employeeName: slip.contact.name,
            employeeNumber: slip.contact.employeeDetail?.employeeNumber || '',
            bankName: slip.contact.employeeDetail?.bankName || '',
            bankAccount: slip.contact.employeeDetail?.bankAccount || '',
            bankHolder: slip.contact.employeeDetail?.bankHolder || slip.contact.name,
            netSalary: Number(slip.netSalary),
            slipId: slip.id,
            status: slip.status,
        }));
    }

    static async getPayrollCostByDepartment(periodId?: string) {
        const slips = await prisma.salarySlip.findMany({
            where: periodId
                ? { periodId }
                : { status: { in: [SalarySlipStatus.PUBLISHED, SalarySlipStatus.PAID] } },
            include: {
                contact: {
                    include: { employeeDetail: true },
                },
            },
        });

        const map = new Map<string, { department: string; headcount: number; gross: number; net: number; deductions: number }>();

        for (const slip of slips) {
            const dept = slip.contact.employeeDetail?.department || 'Unassigned';
            const current = map.get(dept) || { department: dept, headcount: 0, gross: 0, net: 0, deductions: 0 };
            current.headcount += 1;
            current.gross += Number(slip.grossSalary);
            current.net += Number(slip.netSalary);
            current.deductions += Number(slip.totalDeductions);
            map.set(dept, current);
        }

        return Array.from(map.values()).sort((a, b) => b.gross - a.gross);
    }
}
