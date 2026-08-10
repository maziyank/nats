import { prisma } from '@/services/lib/prisma';
import { CreateAttendanceDTO, ImportAttendanceResult, ImportAttendanceRowDTO } from '../types';
import { AttendanceStatus, Prisma } from '@/prisma/generated/prisma/client';
import { z } from 'zod';
import { requiredIdSchema, dateSchema } from '@/services/lib/validation/schemas';

const upsertAttendanceSchema: z.ZodType<CreateAttendanceDTO> = z.object({
    employeeDetailId: requiredIdSchema,
    date: dateSchema,
    status: z.nativeEnum(AttendanceStatus),
    checkIn: dateSchema.optional(),
    checkOut: dateSchema.optional(),
    overtimeHours: z.coerce.number().nonnegative().optional(),
    notes: z.string().optional(),
});

function startOfDay(date: Date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

export class AttendanceService {
    static async list({
        page = 1,
        pageSize = 20,
        employeeDetailId,
        from,
        to,
    }: {
        page?: number;
        pageSize?: number;
        employeeDetailId?: string;
        from?: Date;
        to?: Date;
    }) {
        const skip = (page - 1) * pageSize;
        const where: Prisma.AttendanceRecordWhereInput = {
            ...(employeeDetailId ? { employeeDetailId } : {}),
            ...(from || to
                ? {
                    date: {
                        ...(from ? { gte: startOfDay(from) } : {}),
                        ...(to ? { lte: startOfDay(to) } : {}),
                    },
                }
                : {}),
        };

        const [items, total] = await Promise.all([
            prisma.attendanceRecord.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
                include: {
                    employeeDetail: {
                        include: {
                            contact: { select: { id: true, name: true } },
                        },
                    },
                },
            }),
            prisma.attendanceRecord.count({ where }),
        ]);

        return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    }

    static async upsert(data: CreateAttendanceDTO) {
        data = upsertAttendanceSchema.parse(data);
        const date = startOfDay(data.date);
        return prisma.attendanceRecord.upsert({
            where: {
                employeeDetailId_date: {
                    employeeDetailId: data.employeeDetailId,
                    date,
                },
            },
            create: {
                employeeDetailId: data.employeeDetailId,
                date,
                status: data.status,
                checkIn: data.checkIn || null,
                checkOut: data.checkOut || null,
                overtimeHours: data.overtimeHours ?? 0,
                notes: data.notes || null,
            },
            update: {
                status: data.status,
                checkIn: data.checkIn || null,
                checkOut: data.checkOut || null,
                overtimeHours: data.overtimeHours ?? 0,
                notes: data.notes || null,
            },
            include: {
                employeeDetail: {
                    include: { contact: { select: { id: true, name: true } } },
                },
            },
        });
    }

    static async bulkMarkPresent(employeeDetailIds: string[], date: Date) {
        z.array(requiredIdSchema).min(1, "At least 1 employee required").parse(employeeDetailIds);
        dateSchema.parse(date);
        const day = startOfDay(date);
        const results = [];
        for (const employeeDetailId of employeeDetailIds) {
            results.push(
                await this.upsert({
                    employeeDetailId,
                    date: day,
                    status: AttendanceStatus.PRESENT,
                })
            );
        }
        return results;
    }

    /**
     * Import attendance rows resolved by employeeNumber (preferred) or email.
     * Each row is upserted by (employeeDetailId, date).
     */
    static async importRows(rows: ImportAttendanceRowDTO[]): Promise<ImportAttendanceResult> {
        z.array(
            z.object({
                employeeNumber: z.string().optional(),
                email: z.string().optional(),
                date: dateSchema,
                status: z.nativeEnum(AttendanceStatus),
                checkIn: dateSchema.optional(),
                checkOut: dateSchema.optional(),
                overtimeHours: z.coerce.number().nonnegative().optional(),
                notes: z.string().optional(),
            }),
        ).parse(rows);
        const result: ImportAttendanceResult = { imported: 0, failed: 0, errors: [] };

        const employeeNumbers = [
            ...new Set(
                rows
                    .map((r) => r.employeeNumber?.trim())
                    .filter((v): v is string => Boolean(v))
            ),
        ];
        const emails = [
            ...new Set(
                rows
                    .map((r) => r.email?.trim().toLowerCase())
                    .filter((v): v is string => Boolean(v))
            ),
        ];

        const orFilters: Prisma.EmployeeDetailWhereInput[] = [
            ...(employeeNumbers.length
                ? [{ employeeNumber: { in: employeeNumbers } }]
                : []),
            ...(emails.length
                ? [{ contact: { email: { in: emails, mode: 'insensitive' as const } } }]
                : []),
        ];

        const employees = orFilters.length
            ? await prisma.employeeDetail.findMany({
                where: { OR: orFilters },
                select: {
                    id: true,
                    employeeNumber: true,
                    contact: { select: { email: true } },
                },
            })
            : [];

        const byNumber = new Map(
            employees
                .filter((e) => e.employeeNumber)
                .map((e) => [e.employeeNumber!.toLowerCase(), e.id])
        );
        const byEmail = new Map(
            employees
                .filter((e) => e.contact.email)
                .map((e) => [e.contact.email!.toLowerCase(), e.id])
        );

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 1;
            try {
                const numberKey = row.employeeNumber?.trim().toLowerCase();
                const emailKey = row.email?.trim().toLowerCase();
                const employeeDetailId =
                    (numberKey ? byNumber.get(numberKey) : undefined) ||
                    (emailKey ? byEmail.get(emailKey) : undefined);

                if (!employeeDetailId) {
                    result.failed += 1;
                    result.errors.push({
                        row: rowNum,
                        message: `Employee not found (${row.employeeNumber || row.email || 'no identifier'})`,
                    });
                    continue;
                }

                if (!row.date || Number.isNaN(row.date.getTime())) {
                    result.failed += 1;
                    result.errors.push({ row: rowNum, message: 'Invalid date' });
                    continue;
                }

                if (!Object.values(AttendanceStatus).includes(row.status)) {
                    result.failed += 1;
                    result.errors.push({ row: rowNum, message: `Invalid status: ${row.status}` });
                    continue;
                }

                await this.upsert({
                    employeeDetailId,
                    date: row.date,
                    status: row.status,
                    checkIn: row.checkIn,
                    checkOut: row.checkOut,
                    overtimeHours: row.overtimeHours ?? 0,
                    notes: row.notes,
                });
                result.imported += 1;
            } catch (error) {
                result.failed += 1;
                result.errors.push({
                    row: rowNum,
                    message: (error as Error).message,
                });
            }
        }

        return result;
    }

    static async getOvertimeHours(employeeDetailId: string, from: Date, to: Date) {
        requiredIdSchema.parse(employeeDetailId);
        dateSchema.parse(from);
        dateSchema.parse(to);
        const records = await prisma.attendanceRecord.findMany({
            where: {
                employeeDetailId,
                date: { gte: startOfDay(from), lte: startOfDay(to) },
            },
        });
        return records.reduce((sum, r) => sum + Number(r.overtimeHours), 0);
    }
}
