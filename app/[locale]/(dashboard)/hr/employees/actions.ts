'use server';

import { revalidatePath } from 'next/cache';
import { EmployeeService } from '@/modules/hr/services/employee.service';
import { CreateEmployeeDTO, UpdateEmployeeDTO } from '@/modules/hr/types';
import type { ActionResponse } from '@/types/actions';
import { SuperJSON } from "@/lib/superjson";
import type { SuperJSONResult } from "superjson";
import { authorizedAction } from "@/lib/permissions/protected-action";
import { getSession } from "@/lib/auth/auth";
import { hasPermission } from "@/lib/permissions/utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { requiredIdSchema, dateSchema } from "@/lib/validation/schemas";
import { EmploymentStatus, Gender, MaritalStatus, TaxFilingStatus } from "@/prisma/generated/prisma/client";

const createEmployeeSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email").optional().or(z.literal("")),
    phone: z.string().optional(),
    address: z.string().optional(),
    taxId: z.string().optional(),
    employeeNumber: z.string().optional(),
    joinDate: dateSchema,
    terminationDate: dateSchema.optional(),
    employmentStatus: z.nativeEnum(EmploymentStatus),
    jobTitle: z.string().min(1, "Job title is required"),
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

const updateEmployeeSchema = z.object({ ...createEmployeeSchema.shape, isActive: z.boolean().optional() }).partial();

export async function getEmployees(
    page = 1,
    pageSize = 10,
    search = "",
    departmentId?: string,
    isActive?: boolean,
): Promise<ActionResponse<SuperJSONResult>> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "hr.employees.view")) {
        return { success: false, error: "Forbidden: Insufficient permissions" };
    }
    try {
        const result = await EmployeeService.getEmployees({ page, pageSize, search, departmentId, isActive });
        return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function getEmployee(id: string): Promise<ActionResponse<SuperJSONResult>> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "hr.employees.view")) {
        return { success: false, error: "Forbidden: Insufficient permissions" };
    }
    try {
        const employee = await EmployeeService.getEmployee(id);
        if (!employee) {
            return { success: false, error: "Employee not found" };
        }
        return { success: true, data: SuperJSON.serialize(employee) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export const createEmployee = authorizedAction(
    "hr.employees.create",
    async (data: CreateEmployeeDTO): Promise<ActionResponse> => {
        const parsed = createEmployeeSchema.safeParse(data);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
        }
        try {
            const employee = await EmployeeService.createEmployee(parsed.data);
            revalidatePath('/hr/employees');
            return { success: true, data: SuperJSON.serialize(employee) };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const updateEmployee = authorizedAction(
    "hr.employees.edit",
    async (id: string, data: UpdateEmployeeDTO): Promise<ActionResponse> => {
        const parsedId = requiredIdSchema.safeParse(id);
        if (!parsedId.success) {
            return { success: false, error: parsedId.error.issues[0]?.message ?? "Invalid input" };
        }
        const parsed = updateEmployeeSchema.safeParse(data);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
        }
        try {
            const session = await getSession();
            const employee = await EmployeeService.updateEmployee(
                parsedId.data,
                parsed.data,
                session?.userId || 'system',
            );
            revalidatePath('/hr/employees');
            revalidatePath(`/hr/employees/${id}`);
            return { success: true, data: SuperJSON.serialize(employee) };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export async function getEmployeeOptions(search = ""): Promise<ActionResponse> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "hr.employees.view")) {
        return { success: false, error: "Forbidden: Insufficient permissions" };
    }
    try {
        const employees = await prisma.contact.findMany({
            where: {
                type: "EMPLOYEE",
                isActive: true,
                ...(search
                    ? {
                        OR: [
                            { name: { contains: search, mode: "insensitive" } },
                            { email: { contains: search, mode: "insensitive" } },
                        ],
                    }
                    : {}),
            },
            select: {
                id: true,
                name: true,
                employeeDetail: { select: { id: true, jobTitle: true, department: true } },
            },
            orderBy: { name: "asc" },
            take: 50,
        });
        return { success: true, data: SuperJSON.serialize(employees) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function getHrDashboardStats(): Promise<ActionResponse> {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "hr.employees.view")) {
        return { success: false, error: "Forbidden: Insufficient permissions" };
    }
    try {
        const stats = await EmployeeService.getDashboardStats();
        return { success: true, data: SuperJSON.serialize(stats) };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}
