import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmployeeService } from './employee.service';
import { prisma } from '@/lib/prisma';
import { ContactType, EmploymentStatus } from '@/prisma/generated/prisma/client';

vi.mock('@/lib/prisma', () => ({
    prisma: {
        contact: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            count: vi.fn(),
        },
        employeeDetail: {
            create: vi.fn(),
            update: vi.fn(),
            upsert: vi.fn(),
            findUniqueOrThrow: vi.fn(),
        },
        leaveBalance: {
            create: vi.fn(),
        },
        auditLog: {
            create: vi.fn(),
        },
        department: {
            findUnique: vi.fn(),
        },
        $transaction: vi.fn((callback) => callback(prisma)),
    },
}));

describe('EmployeeService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getEmployees', () => {
        it('should return paginated employees', async () => {
            const employees = [
                { id: '1', name: 'John Doe', type: ContactType.EMPLOYEE },
                { id: '2', name: 'Jane Doe', type: ContactType.EMPLOYEE },
            ];
            vi.mocked(prisma.contact.findMany).mockResolvedValue(employees as any);
            vi.mocked(prisma.contact.count).mockResolvedValue(2);

            const result = await EmployeeService.getEmployees({ page: 1, pageSize: 10 });

            expect(prisma.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ type: ContactType.EMPLOYEE }),
                skip: 0,
                take: 10,
            }));
            expect(result.items).toHaveLength(2);
            expect(result.total).toBe(2);
        });
    });

    describe('createEmployee', () => {
        it('should create contact and employee detail', async () => {
            const data = {
                name: 'New Employee',
                joinDate: new Date(),
                employmentStatus: EmploymentStatus.FULL_TIME,
                jobTitle: 'Developer',
                department: 'IT',
            };

            const createdContact = { id: 'c-1', name: data.name };
            const createdDetail = { id: 'ed-1', contactId: 'c-1', jobTitle: data.jobTitle };

            vi.mocked(prisma.contact.create).mockResolvedValue(createdContact as any);
            vi.mocked(prisma.employeeDetail.create).mockResolvedValue(createdDetail as any);
            vi.mocked(prisma.employeeDetail.findUniqueOrThrow).mockResolvedValue(createdDetail as any);
            vi.mocked(prisma.leaveBalance.create).mockResolvedValue({} as any);
            vi.mocked(prisma.contact.findUnique).mockResolvedValue({
                ...createdContact,
                employeeDetail: createdDetail,
            } as any);

            const result = await EmployeeService.createEmployee(data as any);

            expect(prisma.contact.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    name: data.name,
                    type: ContactType.EMPLOYEE,
                }),
            }));

            expect(prisma.employeeDetail.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    contactId: createdContact.id,
                    jobTitle: data.jobTitle,
                }),
            }));

            expect(prisma.leaveBalance.create).toHaveBeenCalled();
            expect(result).toEqual({ ...createdContact, employeeDetail: createdDetail });
        });
    });

    describe('updateEmployee', () => {
        it('should update contact and employee detail', async () => {
            const id = 'cemp0000000000000000000001';
            const data = {
                name: 'Updated Name',
                jobTitle: 'Senior Developer',
            };

            vi.mocked(prisma.contact.findFirst).mockResolvedValue({
                id,
                type: ContactType.EMPLOYEE,
                employeeDetail: { id: 'ed-1', contactId: id },
            } as any);
            vi.mocked(prisma.contact.update).mockResolvedValue({ id } as any);
            vi.mocked(prisma.employeeDetail.update).mockResolvedValue({} as any);
            vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
            vi.mocked(prisma.contact.findUnique).mockResolvedValue({ id, name: data.name } as any);

            await EmployeeService.updateEmployee(id, data as any);

            expect(prisma.contact.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id },
                data: expect.objectContaining({ name: data.name }),
            }));

            expect(prisma.employeeDetail.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { contactId: id },
                data: expect.objectContaining({ jobTitle: data.jobTitle }),
            }));
        });
    });
});
