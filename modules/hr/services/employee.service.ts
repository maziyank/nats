import { prisma } from '@/lib/prisma';
import { CreateEmployeeDTO, UpdateEmployeeDTO } from '../types';
import { ContactType, Prisma, EmploymentStatus, Gender, MaritalStatus, TaxFilingStatus } from '@/prisma/generated/prisma/client';
import { z } from 'zod';
import { requiredIdSchema, dateSchema } from '@/lib/validation/schemas';

const createEmployeeSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    taxId: z.string().optional(),
    employeeNumber: z.string().optional(),
    joinDate: dateSchema,
    terminationDate: dateSchema.optional(),
    employmentStatus: z.nativeEnum(EmploymentStatus),
    jobTitle: z.string().min(1, 'Job title is required'),
    department: z.string().optional(),
    departmentId: z.string().optional(),
    managerId: z.string().optional(),
    dateOfBirth: dateSchema.optional(),
    gender: z.nativeEnum(Gender).optional(),
    maritalStatus: z.nativeEnum(MaritalStatus).optional(),
    nationalId: z.string().optional(),
    employeeTaxId: z.string().optional(),
    taxFilingStatus: z.nativeEnum(TaxFilingStatus).optional(),
    hasNpwp: z.boolean().optional(),
    emergencyContactName: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
    bankName: z.string().optional(),
    bankAccount: z.string().optional(),
    bankHolder: z.string().optional(),
});

const updateEmployeeSchema = createEmployeeSchema
    .partial()
    .extend({ isActive: z.boolean().optional() });

async function resolveDepartmentName(departmentId?: string | null, fallback?: string) {
    if (departmentId) {
        const dept = await prisma.department.findUnique({ where: { id: departmentId } });
        if (dept) return dept.name;
    }
    return fallback || 'General';
}

export class EmployeeService {
    static async getEmployees({
        page = 1,
        pageSize = 10,
        search = '',
        departmentId,
        isActive,
    }: {
        page?: number;
        pageSize?: number;
        search?: string;
        departmentId?: string;
        isActive?: boolean;
    }) {
        const skip = (page - 1) * pageSize;
        const where: Prisma.ContactWhereInput = {
            type: ContactType.EMPLOYEE,
            ...(typeof isActive === 'boolean' ? { isActive } : {}),
            ...(departmentId
                ? { employeeDetail: { departmentId } }
                : {}),
            ...(search
                ? {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' as const } },
                        { email: { contains: search, mode: 'insensitive' as const } },
                        { employeeDetail: { jobTitle: { contains: search, mode: 'insensitive' as const } } },
                        { employeeDetail: { department: { contains: search, mode: 'insensitive' as const } } },
                        { employeeDetail: { employeeNumber: { contains: search, mode: 'insensitive' as const } } },
                    ],
                }
                : {}),
        };

        const [items, total] = await Promise.all([
            prisma.contact.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: { name: 'asc' },
                include: {
                    employeeDetail: {
                        include: {
                            departmentRef: true,
                            manager: { select: { id: true, name: true } },
                        },
                    },
                },
            }),
            prisma.contact.count({ where }),
        ]);

        return {
            items,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }

    static async getEmployee(id: string) {
        return prisma.contact.findFirst({
            where: { id, type: ContactType.EMPLOYEE },
            include: {
                employeeDetail: {
                    include: {
                        departmentRef: true,
                        manager: { select: { id: true, name: true } },
                    },
                },
            },
        });
    }

    static async createEmployee(data: CreateEmployeeDTO) {
        data = createEmployeeSchema.parse(data);
        const departmentName = await resolveDepartmentName(data.departmentId, data.department);

        return prisma.$transaction(async (tx) => {
            const contact = await tx.contact.create({
                data: {
                    type: ContactType.EMPLOYEE,
                    name: data.name,
                    email: data.email || null,
                    phone: data.phone || null,
                    address: data.address || null,
                    taxId: data.taxId || null,
                    isActive: true,
                },
            });

            await tx.employeeDetail.create({
                data: {
                    contactId: contact.id,
                    employeeNumber: data.employeeNumber || null,
                    joinDate: data.joinDate,
                    terminationDate: data.terminationDate || null,
                    employmentStatus: data.employmentStatus || 'FULL_TIME',
                    jobTitle: data.jobTitle,
                    department: departmentName,
                    departmentId: data.departmentId || null,
                    managerId: data.managerId || null,
                    dateOfBirth: data.dateOfBirth || null,
                    gender: data.gender || null,
                    maritalStatus: data.maritalStatus || null,
                    nationalId: data.nationalId || null,
                    taxId: data.employeeTaxId || null,
                    taxFilingStatus: data.taxFilingStatus || 'TK0',
                    hasNpwp: data.hasNpwp ?? true,
                    emergencyContactName: data.emergencyContactName || null,
                    emergencyContactPhone: data.emergencyContactPhone || null,
                    bankName: data.bankName || null,
                    bankAccount: data.bankAccount || null,
                    bankHolder: data.bankHolder || null,
                },
            });

            // Default annual leave balance for current year
            const year = new Date().getFullYear();
            await tx.leaveBalance.create({
                data: {
                    employeeDetailId: (await tx.employeeDetail.findUniqueOrThrow({ where: { contactId: contact.id } })).id,
                    leaveType: 'ANNUAL',
                    year,
                    entitled: 12,
                    used: 0,
                },
            });

            return tx.contact.findUnique({
                where: { id: contact.id },
                include: {
                    employeeDetail: {
                        include: {
                            departmentRef: true,
                            manager: { select: { id: true, name: true } },
                        },
                    },
                },
            });
        });
    }

    static async updateEmployee(id: string, data: UpdateEmployeeDTO, userId = 'system') {
        requiredIdSchema.parse(id);
        data = updateEmployeeSchema.parse(data);
        const departmentName = data.departmentId !== undefined
            ? await resolveDepartmentName(data.departmentId, data.department)
            : data.department;

        return prisma.$transaction(async (tx) => {
            const existing = await tx.contact.findFirst({
                where: { id, type: ContactType.EMPLOYEE },
                include: { employeeDetail: true },
            });
            if (!existing) throw new Error('Employee not found');

            await tx.contact.update({
                where: { id },
                data: {
                    ...(data.name !== undefined ? { name: data.name } : {}),
                    ...(data.email !== undefined ? { email: data.email || null } : {}),
                    ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
                    ...(data.address !== undefined ? { address: data.address || null } : {}),
                    ...(data.taxId !== undefined ? { taxId: data.taxId || null } : {}),
                    ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
                },
            });

            const detailData: Prisma.EmployeeDetailUpdateInput = {};
            if (data.employeeNumber !== undefined) detailData.employeeNumber = data.employeeNumber || null;
            if (data.joinDate !== undefined) detailData.joinDate = data.joinDate;
            if (data.terminationDate !== undefined) detailData.terminationDate = data.terminationDate || null;
            if (data.employmentStatus !== undefined) detailData.employmentStatus = data.employmentStatus;
            if (data.jobTitle !== undefined) detailData.jobTitle = data.jobTitle;
            if (departmentName !== undefined) detailData.department = departmentName;
            if (data.departmentId !== undefined) {
                detailData.departmentRef = data.departmentId
                    ? { connect: { id: data.departmentId } }
                    : { disconnect: true };
            }
            if (data.managerId !== undefined) {
                detailData.manager = data.managerId
                    ? { connect: { id: data.managerId } }
                    : { disconnect: true };
            }
            if (data.dateOfBirth !== undefined) detailData.dateOfBirth = data.dateOfBirth || null;
            if (data.gender !== undefined) detailData.gender = data.gender || null;
            if (data.maritalStatus !== undefined) detailData.maritalStatus = data.maritalStatus || null;
            if (data.nationalId !== undefined) detailData.nationalId = data.nationalId || null;
            if (data.employeeTaxId !== undefined) detailData.taxId = data.employeeTaxId || null;
            if (data.taxFilingStatus !== undefined) detailData.taxFilingStatus = data.taxFilingStatus;
            if (data.hasNpwp !== undefined) detailData.hasNpwp = data.hasNpwp;
            if (data.emergencyContactName !== undefined) detailData.emergencyContactName = data.emergencyContactName || null;
            if (data.emergencyContactPhone !== undefined) detailData.emergencyContactPhone = data.emergencyContactPhone || null;
            if (data.bankName !== undefined) detailData.bankName = data.bankName || null;
            if (data.bankAccount !== undefined) detailData.bankAccount = data.bankAccount || null;
            if (data.bankHolder !== undefined) detailData.bankHolder = data.bankHolder || null;

            if (Object.keys(detailData).length > 0) {
                if (existing.employeeDetail) {
                    await tx.employeeDetail.update({
                        where: { contactId: id },
                        data: detailData,
                    });
                } else {
                    await tx.employeeDetail.create({
                        data: {
                            contactId: id,
                            joinDate: data.joinDate || new Date(),
                            employmentStatus: data.employmentStatus || 'FULL_TIME',
                            jobTitle: data.jobTitle || 'Unknown',
                            department: departmentName || 'Unknown',
                            departmentId: data.departmentId || null,
                            managerId: data.managerId || null,
                            employeeNumber: data.employeeNumber || null,
                            dateOfBirth: data.dateOfBirth || null,
                            gender: data.gender || null,
                            maritalStatus: data.maritalStatus || null,
                            nationalId: data.nationalId || null,
                            taxId: data.employeeTaxId || null,
                            taxFilingStatus: data.taxFilingStatus || 'TK0',
                            hasNpwp: data.hasNpwp ?? true,
                            emergencyContactName: data.emergencyContactName || null,
                            emergencyContactPhone: data.emergencyContactPhone || null,
                            bankName: data.bankName || null,
                            bankAccount: data.bankAccount || null,
                            bankHolder: data.bankHolder || null,
                        },
                    });
                }
            }

            await tx.auditLog.create({
                data: {
                    userId,
                    action: 'EMPLOYEE_UPDATED',
                    entityType: 'EMPLOYEE',
                    entityId: id,
                    metadata: { fields: Object.keys(data) },
                },
            });

            return tx.contact.findUnique({
                where: { id },
                include: {
                    employeeDetail: {
                        include: {
                            departmentRef: true,
                            manager: { select: { id: true, name: true } },
                        },
                    },
                },
            });
        });
    }

    static async getDashboardStats() {
        const [totalEmployees, activeEmployees, pendingLeaves, openPeriods] = await Promise.all([
            prisma.contact.count({ where: { type: ContactType.EMPLOYEE } }),
            prisma.contact.count({ where: { type: ContactType.EMPLOYEE, isActive: true } }),
            prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
            prisma.payrollPeriod.count({ where: { status: { in: ['DRAFT', 'PROCESSING'] } } }),
        ]);

        const byDepartment = await prisma.employeeDetail.groupBy({
            by: ['department'],
            _count: { id: true },
        });

        return {
            totalEmployees,
            activeEmployees,
            inactiveEmployees: totalEmployees - activeEmployees,
            pendingLeaves,
            openPeriods,
            byDepartment: byDepartment.map((d) => ({
                department: d.department,
                count: d._count.id,
            })),
        };
    }
}
