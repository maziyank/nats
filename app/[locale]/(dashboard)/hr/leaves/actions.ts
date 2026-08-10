'use server';

import { revalidatePath } from 'next/cache';
import { LeaveService } from '@/services/modules/hr/services/leave.service';
import { CreateLeaveRequestDTO, ReviewLeaveRequestDTO } from '@/services/modules/hr/types';
import type { ActionResponse } from '@/types/actions';
import { SuperJSON } from '@/services/lib/superjson';
import { authorizedAction } from '@/services/lib/permissions/protected-action';
import { getSession } from '@/services/lib/auth/auth';
import { hasPermission } from '@/services/lib/permissions/utils';
import { LeaveRequestStatus, LeaveType } from '@/prisma/generated/prisma/client';
import { z } from 'zod';
import { requiredIdSchema, dateSchema } from '@/services/lib/validation/schemas';

const createLeaveRequestSchema = z.object({
    employeeDetailId: requiredIdSchema,
    leaveType: z.nativeEnum(LeaveType),
    startDate: dateSchema,
    endDate: dateSchema,
    days: z.number().int().positive(),
    reason: z.string().optional(),
});

const reviewLeaveRequestSchema = z.object({
    requestId: requiredIdSchema,
    status: z.enum(['APPROVED', 'REJECTED', 'CANCELLED']),
    approvedById: z.string().optional(),
});

export async function getLeaveRequests(params: {
    page?: number;
    pageSize?: number;
    status?: LeaveRequestStatus;
    employeeDetailId?: string;
}): Promise<ActionResponse> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, 'hr.leave.view')) {
        return { success: false, error: 'Forbidden: Insufficient permissions' };
    }
    try {
        const result = await LeaveService.listRequests(params);
        return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export const createLeaveRequest = authorizedAction(
    'hr.leave.manage',
    async (data: CreateLeaveRequestDTO): Promise<ActionResponse> => {
        const parsed = createLeaveRequestSchema.safeParse(data);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
        }
        try {
            const request = await LeaveService.createRequest(parsed.data);
            revalidatePath('/hr/leaves');
            return { success: true, data: SuperJSON.serialize(request) };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const reviewLeaveRequest = authorizedAction(
    'hr.leave.manage',
    async (data: ReviewLeaveRequestDTO): Promise<ActionResponse> => {
        const parsed = reviewLeaveRequestSchema.safeParse(data);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
        }
        try {
            const request = await LeaveService.reviewRequest(parsed.data);
            revalidatePath('/hr/leaves');
            return { success: true, data: SuperJSON.serialize(request) };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export async function getLeaveBalances(employeeDetailId: string, year?: number): Promise<ActionResponse> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, 'hr.leave.view')) {
        return { success: false, error: 'Forbidden: Insufficient permissions' };
    }
    try {
        const balances = await LeaveService.getBalances(employeeDetailId, year);
        return { success: true, data: SuperJSON.serialize(balances) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}
