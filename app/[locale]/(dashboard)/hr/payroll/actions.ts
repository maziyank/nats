'use server';

import { revalidatePath } from 'next/cache';
import { PayrollService } from '@/services/modules/payroll/services/payroll.service';
import { CreatePayrollPeriodDTO, CreateSalaryStructureDTO, CreateSalaryComponentDTO } from '@/services/modules/payroll/types/payroll.types';
import type { ActionResponse } from '@/types/actions';
import { prisma } from '@/services/lib/prisma';
import { verifySession, getSession } from "@/services/lib/auth/auth";
import { SalaryComponentService } from '@/services/modules/payroll/services/salary-component.service';
import { ContactType, PayrollPeriodStatus } from '@/prisma/generated/prisma/client';
import { SuperJSON } from "@/services/lib/superjson";
import type { SuperJSONResult } from "superjson";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { hasPermission } from "@/services/lib/permissions/utils";
import { StatutoryService } from '@/services/modules/payroll/services/statutory.service';
import { StatutoryRuleType } from '@/prisma/generated/prisma/client';
import { z } from 'zod';
import { requiredIdSchema, dateSchema } from '@/services/lib/validation/schemas';

const createPayrollPeriodSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    startDate: dateSchema,
    endDate: dateSchema,
});

const createSalaryComponentSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    type: z.enum(['EARNING', 'DEDUCTION']),
    isTaxable: z.boolean().optional(),
    description: z.string().optional(),
    accountId: z.string().optional(),
});

const createSalaryStructureSchema = z.object({
    contactId: requiredIdSchema,
    name: z.string().min(1, 'Name is required'),
    baseSalary: z.number(),
    createdById: z.string().optional(),
    items: z.array(z.object({
        componentId: requiredIdSchema,
        amount: z.number(),
        formula: z.string().optional(),
    })).min(1, 'At least one salary item is required'),
});

const upsertStatutoryRuleSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, 'Name is required'),
    type: z.nativeEnum(StatutoryRuleType),
    config: z.record(z.string(), z.unknown()),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
});

export const createPayrollPeriod = authorizedAction(
    "payroll.create",
    async (data: CreatePayrollPeriodDTO): Promise<ActionResponse> => {
        const parsed = createPayrollPeriodSchema.safeParse(data);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
        }
        try {
            const period = await PayrollService.createPayrollPeriod(parsed.data);
            revalidatePath('/hr/payroll');
            return { success: true, data: SuperJSON.serialize(period) };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const configureSalaryStructure = authorizedAction(
    "payroll.configure",
    async (data: CreateSalaryStructureDTO): Promise<ActionResponse> => {
        const parsed = createSalaryStructureSchema.safeParse(data);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
        }
        try {
            const { userId } = await verifySession();
            const structure = await PayrollService.configureSalaryStructure({
                ...parsed.data,
                createdById: userId,
            });
            revalidatePath('/hr/payroll/salary-structures');
            revalidatePath(`/hr/payroll/salary-structures/${parsed.data.contactId}`);
            return { success: true, data: SuperJSON.serialize(structure) };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export async function getEmployees(search = ""): Promise<ActionResponse<SuperJSONResult>> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "payroll.view")) {
        return { success: false, error: "Forbidden: Insufficient permissions" };
    }
    try {
        const where: import('@/prisma/generated/prisma/client').Prisma.ContactWhereInput = {
            type: ContactType.EMPLOYEE,
            ...(search
                ? {
                    OR: [
                        { name: { contains: search, mode: "insensitive" } },
                        { email: { contains: search, mode: "insensitive" } },
                    ],
                }
                : {}),
        };

        const employees = await prisma.contact.findMany({
            where,
            orderBy: { name: "asc" },
            include: {
                salaryStructures: {
                    take: 1,
                    orderBy: { createdAt: "desc" },
                },
            },
        });

        return { success: true, data: SuperJSON.serialize(employees) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function getSalaryStructure(contactId: string): Promise<ActionResponse<SuperJSONResult>> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "payroll.view")) {
        return { success: false, error: "Forbidden: Insufficient permissions" };
    }
    try {
        const structure = await PayrollService.getSalaryStructure(contactId);
        return { success: true, data: SuperJSON.serialize(structure) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export const runPayroll = authorizedAction(
    "payroll.create",
    async (periodId: string): Promise<ActionResponse> => {
        const parsed = requiredIdSchema.safeParse(periodId);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
        }
        try {
            const result = await PayrollService.runPayroll(parsed.data);
            revalidatePath('/hr/payroll');
            revalidatePath(`/hr/payroll/${periodId}`);
            return { success: true, data: SuperJSON.serialize(result) };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const approvePayrollRun = authorizedAction(
    "payroll.approve",
    async (periodId: string, userId: string): Promise<ActionResponse> => {
        const parsedPeriod = requiredIdSchema.safeParse(periodId);
        if (!parsedPeriod.success) {
            return { success: false, error: parsedPeriod.error.issues[0]?.message ?? 'Invalid input' };
        }
        const parsedUser = z.string().min(1).safeParse(userId);
        if (!parsedUser.success) {
            return { success: false, error: parsedUser.error.issues[0]?.message ?? 'Invalid input' };
        }
        try {
            await PayrollService.approvePayrollRun(parsedPeriod.data, parsedUser.data);
            revalidatePath('/hr/payroll');
            revalidatePath(`/hr/payroll/${periodId}`);
            return { success: true, data: SuperJSON.serialize(null) };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export async function getPayrollPeriods(
    page = 1,
    pageSize = 10,
    status?: PayrollPeriodStatus,
): Promise<ActionResponse<SuperJSONResult>> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "payroll.view")) {
        return { success: false, error: "Forbidden: Insufficient permissions" };
    }
    try {
        const result = await PayrollService.getPayrollPeriods({ page, pageSize, status });
        return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function getPayrollPeriod(id: string): Promise<ActionResponse<SuperJSONResult>> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "payroll.view")) {
        return { success: false, error: "Forbidden: Insufficient permissions" };
    }
    try {
        const result = await PayrollService.getPayrollPeriod(id);
        return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function getSalaryComponents(): Promise<ActionResponse<SuperJSONResult>> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "payroll.view")) {
        return { success: false, error: "Forbidden: Insufficient permissions" };
    }
    try {
        const components = await SalaryComponentService.findAll();
        return { success: true, data: SuperJSON.serialize(components) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export const createSalaryComponent = authorizedAction(
    "payroll.configure",
    async (data: CreateSalaryComponentDTO): Promise<ActionResponse> => {
        const parsed = createSalaryComponentSchema.safeParse(data);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
        }
        try {
            const component = await SalaryComponentService.create(parsed.data);
            revalidatePath('/hr/payroll/components');
            return { success: true, data: SuperJSON.serialize(component) };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export async function getSalaryHistory(contactId: string): Promise<ActionResponse<SuperJSONResult>> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "payroll.view")) {
        return { success: false, error: "Forbidden: Insufficient permissions" };
    }
    try {
        const history = await PayrollService.getSalaryHistory(contactId);
        return { success: true, data: SuperJSON.serialize(history) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function getPayrollReadiness(): Promise<ActionResponse<SuperJSONResult>> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "payroll.view")) {
        return { success: false, error: "Forbidden: Insufficient permissions" };
    }
    try {
        const result = await PayrollService.getPayrollReadiness();
        return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export const markSlipsPaid = authorizedAction(
    "payroll.pay",
    async (periodId: string, slipIds?: string[]): Promise<ActionResponse> => {
        const parsedPeriod = requiredIdSchema.safeParse(periodId);
        if (!parsedPeriod.success) {
            return { success: false, error: parsedPeriod.error.issues[0]?.message ?? 'Invalid input' };
        }
        const parsedIds = slipIds ? z.array(z.string().min(1)).safeParse(slipIds) : { success: true as const, data: slipIds };
        if (!parsedIds.success) {
            return { success: false, error: parsedIds.error.issues[0]?.message ?? 'Invalid input' };
        }
        try {
            const result = await PayrollService.markSlipsPaid(parsedPeriod.data, parsedIds.data);
            revalidatePath(`/hr/payroll/${periodId}`);
            return { success: true, data: SuperJSON.serialize(result) };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export async function getSalarySlip(slipId: string): Promise<ActionResponse<SuperJSONResult>> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "payroll.view")) {
        return { success: false, error: "Forbidden: Insufficient permissions" };
    }
    try {
        const slip = await PayrollService.getSalarySlip(slipId);
        if (!slip) return { success: false, error: "Salary slip not found" };
        return { success: true, data: SuperJSON.serialize(slip) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function getBankTransferExport(periodId: string): Promise<ActionResponse<SuperJSONResult>> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "payroll.pay")) {
        return { success: false, error: "Forbidden: Insufficient permissions" };
    }
    try {
        const rows = await PayrollService.getBankTransferExport(periodId);
        return { success: true, data: SuperJSON.serialize(rows) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function getPayrollCostByDepartment(periodId?: string): Promise<ActionResponse> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "payroll.view")) {
        return { success: false, error: "Forbidden: Insufficient permissions" };
    }
    try {
        const rows = await PayrollService.getPayrollCostByDepartment(periodId);
        return { success: true, data: SuperJSON.serialize(rows) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function getStatutoryRules(): Promise<ActionResponse> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "payroll.configure")) {
        return { success: false, error: "Forbidden: Insufficient permissions" };
    }
    try {
        const rules = await StatutoryService.listRules();
        return { success: true, data: SuperJSON.serialize(rules) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export const seedStatutoryRules = authorizedAction(
    "payroll.configure",
    async (): Promise<ActionResponse> => {
        try {
            await StatutoryService.seedDefaults();
            revalidatePath('/hr/payroll/components');
            return { success: true, data: SuperJSON.serialize({ ok: true }) };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const upsertStatutoryRule = authorizedAction(
    "payroll.configure",
    async (data: {
        id?: string;
        name: string;
        type: StatutoryRuleType;
        config: Record<string, unknown>;
        description?: string;
        isActive?: boolean;
    }): Promise<ActionResponse> => {
        const parsed = upsertStatutoryRuleSchema.safeParse(data);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
        }
        try {
            const rule = await StatutoryService.upsertRule(parsed.data as any);
            return { success: true, data: SuperJSON.serialize(rule) };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);
