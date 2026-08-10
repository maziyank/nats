'use server';

import { revalidatePath } from 'next/cache';
import { AttendanceService } from '@/services/modules/hr/services/attendance.service';
import {
    CreateAttendanceDTO,
    ImportAttendanceRowDTO,
} from '@/services/modules/hr/types';
import type { ActionResponse } from '@/types/actions';
import { SuperJSON } from '@/services/lib/superjson';
import { authorizedAction } from '@/services/lib/permissions/protected-action';
import { getSession } from '@/services/lib/auth/auth';
import { hasPermission } from "@/services/lib/permissions/utils";
import { AttendanceStatus } from '@/prisma/generated/prisma/client';
import { z } from 'zod';
import { requiredIdSchema, dateSchema } from '@/services/lib/validation/schemas';

const upsertAttendanceSchema = z.object({
    employeeDetailId: requiredIdSchema,
    date: dateSchema,
    status: z.nativeEnum(AttendanceStatus),
    checkIn: dateSchema.optional(),
    checkOut: dateSchema.optional(),
    overtimeHours: z.number().optional(),
    notes: z.string().optional(),
});

export async function getAttendanceRecords(params: {
    page?: number;
    pageSize?: number;
    employeeDetailId?: string;
    from?: string;
    to?: string;
}): Promise<ActionResponse> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, 'hr.attendance.view')) {
        return { success: false, error: 'Forbidden: Insufficient permissions' };
    }
    try {
        const result = await AttendanceService.list({
            page: params.page,
            pageSize: params.pageSize,
            employeeDetailId: params.employeeDetailId,
            from: params.from ? new Date(params.from) : undefined,
            to: params.to ? new Date(params.to) : undefined,
        });
        return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export const upsertAttendance = authorizedAction(
    'hr.attendance.manage',
    async (data: CreateAttendanceDTO): Promise<ActionResponse> => {
        const parsed = upsertAttendanceSchema.safeParse(data);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
        }
        try {
            const record = await AttendanceService.upsert(parsed.data);
            revalidatePath('/hr/attendance');
            return { success: true, data: SuperJSON.serialize(record) };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const bulkMarkPresent = authorizedAction(
    'hr.attendance.manage',
    async (employeeDetailIds: string[], dateIso: string): Promise<ActionResponse> => {
        const parsedIds = z.array(requiredIdSchema).safeParse(employeeDetailIds);
        if (!parsedIds.success) {
            return { success: false, error: parsedIds.error.issues[0]?.message ?? 'Invalid input' };
        }
        const parsedDate = dateSchema.safeParse(dateIso);
        if (!parsedDate.success) {
            return { success: false, error: parsedDate.error.issues[0]?.message ?? 'Invalid date' };
        }
        try {
            const records = await AttendanceService.bulkMarkPresent(
                parsedIds.data,
                parsedDate.data
            );
            revalidatePath('/hr/attendance');
            return { success: true, data: SuperJSON.serialize(records) };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

/**
 * Import attendance from CSV text.
 * Expected headers (case-insensitive):
 * employee_number,email,date,status,check_in,check_out,overtime_hours,notes
 * - employee_number OR email is required
 * - date required (YYYY-MM-DD)
 * - status optional (default PRESENT)
 * - check_in / check_out optional (HH:mm or HH:mm:ss)
 */
export const importAttendanceCsv = authorizedAction(
    'hr.attendance.manage',
    async (csvText: string): Promise<ActionResponse> => {
        const parsed = z.string().min(1, 'CSV text is required').safeParse(csvText);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
        }
        try {
            const rows = parseAttendanceCsv(parsed.data);
            if (!rows.length) {
                return { success: false, error: 'No valid rows found in CSV' };
            }
            const result = await AttendanceService.importRows(rows);
            revalidatePath('/hr/attendance');
            return { success: true, data: SuperJSON.serialize(result) };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

function parseAttendanceCsv(csvText: string): ImportAttendanceRowDTO[] {
    const lines = csvText
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

    if (lines.length < 2) return [];

    const headers = splitCsvLine(lines[0]).map((h) =>
        h.trim().toLowerCase().replace(/\s+/g, '_')
    );

    const idx = (names: string[]) =>
        headers.findIndex((h) => names.includes(h));

    const iNumber = idx(['employee_number', 'employee_no', 'employeenumber', 'emp_no']);
    const iEmail = idx(['email', 'employee_email']);
    const iDate = idx(['date', 'attendance_date']);
    const iStatus = idx(['status', 'attendance_status']);
    const iCheckIn = idx(['check_in', 'checkin', 'clock_in', 'time_in']);
    const iCheckOut = idx(['check_out', 'checkout', 'clock_out', 'time_out']);
    const iOvertime = idx(['overtime_hours', 'overtime', 'ot_hours']);
    const iNotes = idx(['notes', 'note', 'remark', 'remarks']);

    if (iDate < 0 || (iNumber < 0 && iEmail < 0)) {
        throw new Error(
            'CSV must include date and employee_number (or email) columns'
        );
    }

    const rows: ImportAttendanceRowDTO[] = [];

    for (let li = 1; li < lines.length; li++) {
        const cols = splitCsvLine(lines[li]);
        if (!cols.length || cols.every((c) => !c.trim())) continue;

        const dateStr = cols[iDate]?.trim();
        if (!dateStr) continue;

        const date = parseDateOnly(dateStr);
        const statusRaw = (iStatus >= 0 ? cols[iStatus] : '')?.trim().toUpperCase() || 'PRESENT';
        const status = (Object.values(AttendanceStatus).includes(statusRaw as AttendanceStatus)
            ? statusRaw
            : AttendanceStatus.PRESENT) as AttendanceStatus;

        const checkInStr = iCheckIn >= 0 ? cols[iCheckIn]?.trim() : '';
        const checkOutStr = iCheckOut >= 0 ? cols[iCheckOut]?.trim() : '';

        rows.push({
            employeeNumber: iNumber >= 0 ? cols[iNumber]?.trim() || undefined : undefined,
            email: iEmail >= 0 ? cols[iEmail]?.trim() || undefined : undefined,
            date,
            status,
            checkIn: checkInStr ? combineDateAndTime(date, checkInStr) : undefined,
            checkOut: checkOutStr ? combineDateAndTime(date, checkOutStr) : undefined,
            overtimeHours:
                iOvertime >= 0 && cols[iOvertime]?.trim()
                    ? Number(cols[iOvertime]) || 0
                    : 0,
            notes: iNotes >= 0 ? cols[iNotes]?.trim() || undefined : undefined,
        });
    }

    return rows;
}

function splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

function parseDateOnly(value: string): Date {
    // Accept YYYY-MM-DD or DD/MM/YYYY or MM/DD/YYYY-ish ISO
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
        return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    }
    const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
        // Prefer DD/MM/YYYY
        return new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]));
    }
    return new Date(value);
}

function combineDateAndTime(date: Date, time: string): Date {
    const match = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    const d = new Date(date);
    if (match) {
        d.setHours(Number(match[1]), Number(match[2]), Number(match[3] || 0), 0);
    }
    return d;
}
