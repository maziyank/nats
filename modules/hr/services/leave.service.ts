import { prisma } from '@/lib/prisma';
import { CreateLeaveRequestDTO, ReviewLeaveRequestDTO } from '../types';
import { LeaveRequestStatus, LeaveType, Prisma } from '@/prisma/generated/prisma/client';
import { z } from 'zod';
import { requiredIdSchema, dateSchema } from '@/lib/validation/schemas';

const createLeaveRequestSchema: z.ZodType<CreateLeaveRequestDTO> = z.object({
    employeeDetailId: requiredIdSchema,
    leaveType: z.nativeEnum(LeaveType),
    startDate: dateSchema,
    endDate: dateSchema,
    days: z.number().positive(),
    reason: z.string().optional(),
});

const reviewLeaveRequestSchema: z.ZodType<ReviewLeaveRequestDTO> = z.object({
    requestId: requiredIdSchema,
    status: z.enum(['APPROVED', 'REJECTED', 'CANCELLED']),
    approvedById: z.string().optional(),
});

export class LeaveService {
    static async listRequests({
        page = 1,
        pageSize = 20,
        status,
        employeeDetailId,
    }: {
        page?: number;
        pageSize?: number;
        status?: LeaveRequestStatus;
        employeeDetailId?: string;
    }) {
        const skip = (page - 1) * pageSize;
        const where: Prisma.LeaveRequestWhereInput = {
            ...(status ? { status } : {}),
            ...(employeeDetailId ? { employeeDetailId } : {}),
        };

        const [items, total] = await Promise.all([
            prisma.leaveRequest.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
                include: {
                    employeeDetail: {
                        include: { contact: { select: { id: true, name: true } } },
                    },
                    approvedBy: {
                        include: { contact: { select: { id: true, name: true } } },
                    },
                },
            }),
            prisma.leaveRequest.count({ where }),
        ]);

        return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    }

    static async createRequest(data: CreateLeaveRequestDTO) {
        data = createLeaveRequestSchema.parse(data);
        if (data.endDate < data.startDate) {
            throw new Error('End date must be on or after start date');
        }
        if (data.days <= 0) {
            throw new Error('Days must be greater than 0');
        }

        const year = data.startDate.getFullYear();
        const balance = await prisma.leaveBalance.findUnique({
            where: {
                employeeDetailId_leaveType_year: {
                    employeeDetailId: data.employeeDetailId,
                    leaveType: data.leaveType,
                    year,
                },
            },
        });

        if (balance) {
            const remaining = Number(balance.entitled) - Number(balance.used);
            if (data.days > remaining && data.leaveType !== 'UNPAID') {
                throw new Error(`Insufficient leave balance. Remaining: ${remaining}`);
            }
        }

        return prisma.leaveRequest.create({
            data: {
                employeeDetailId: data.employeeDetailId,
                leaveType: data.leaveType,
                startDate: data.startDate,
                endDate: data.endDate,
                days: data.days,
                reason: data.reason || null,
                status: 'PENDING',
            },
            include: {
                employeeDetail: {
                    include: { contact: { select: { id: true, name: true } } },
                },
            },
        });
    }

    static async reviewRequest(data: ReviewLeaveRequestDTO) {
        data = reviewLeaveRequestSchema.parse(data);
        const request = await prisma.leaveRequest.findUnique({
            where: { id: data.requestId },
        });
        if (!request) throw new Error('Leave request not found');
        if (request.status !== 'PENDING' && data.status !== 'CANCELLED') {
            throw new Error('Only pending requests can be reviewed');
        }

        return prisma.$transaction(async (tx) => {
            const updated = await tx.leaveRequest.update({
                where: { id: data.requestId },
                data: {
                    status: data.status,
                    approvedById: data.approvedById || null,
                    approvedAt: data.status === 'APPROVED' ? new Date() : null,
                },
            });

            if (data.status === 'APPROVED' && request.leaveType !== 'UNPAID') {
                const year = request.startDate.getFullYear();
                await tx.leaveBalance.upsert({
                    where: {
                        employeeDetailId_leaveType_year: {
                            employeeDetailId: request.employeeDetailId,
                            leaveType: request.leaveType,
                            year,
                        },
                    },
                    create: {
                        employeeDetailId: request.employeeDetailId,
                        leaveType: request.leaveType,
                        year,
                        entitled: 12,
                        used: request.days,
                    },
                    update: {
                        used: { increment: request.days },
                    },
                });
            }

            return updated;
        });
    }

    static async getBalances(employeeDetailId: string, year?: number) {
        const y = year || new Date().getFullYear();
        return prisma.leaveBalance.findMany({
            where: { employeeDetailId, year: y },
            orderBy: { leaveType: 'asc' },
        });
    }

    static async ensureBalance(employeeDetailId: string, leaveType: CreateLeaveRequestDTO['leaveType'], year: number, entitled = 12) {
        return prisma.leaveBalance.upsert({
            where: {
                employeeDetailId_leaveType_year: {
                    employeeDetailId,
                    leaveType,
                    year,
                },
            },
            create: {
                employeeDetailId,
                leaveType,
                year,
                entitled,
                used: 0,
            },
            update: {},
        });
    }
}
