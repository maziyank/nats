import { prisma } from "@/lib/prisma";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { requiredIdSchema } from "@/lib/validation/schemas";

const SESSION_NUMBER_PREFIX = "SES";

const openSessionSchema = z.object({
    openingCash: z.number().nonnegative(),
    warehouseId: requiredIdSchema,
    departmentId: z.string().nullable().optional(),
});

const closeSessionSchema = z.object({
    sessionId: requiredIdSchema,
    actualCash: z.number(),
    notes: z.string().optional(),
});

export interface OpenSessionInput {
    userId: string;
    openingCash: number;
    warehouseId: string;
    /**
     * Optional department tag to associate with the session. When provided it
     * must reference a valid, active Department record; otherwise the session
     * is opened without a department tag. The warehouse attachment is always
     * preserved regardless of whether a department tag is supplied.
     */
    departmentId?: string | null;
}

export class POSSessionService {
    /**
     * Validates that the given departmentId refers to a valid, active
     * Department. Returns `null` when no departmentId is supplied so callers
     * can treat "no tag" and "validated tag" uniformly.
     *
     * @throws Error when departmentId is provided but does not match an active
     *         Department.
     */
    static async validateDepartmentId(
        departmentId?: string | null,
    ): Promise<string | null> {
        if (!departmentId) return null;

        const department = await prisma.department.findUnique({
            where: { id: departmentId },
            select: { id: true, isActive: true },
        });

        if (!department || !department.isActive) {
            throw new Error(
                "Invalid department tag: department does not exist or is inactive",
            );
        }

        return department.id;
    }

    static async open(
        userId: string,
        openingCash: number,
        warehouseId: string,
        departmentId?: string | null,
    ) {
        const parsed = openSessionSchema.parse({
            openingCash,
            warehouseId,
            departmentId,
        });
        openingCash = parsed.openingCash;
        warehouseId = parsed.warehouseId;
        departmentId = parsed.departmentId;

        // Close any existing open sessions for this user
        await prisma.pOSSession.updateMany({
            where: { cashierId: userId, status: "OPEN" },
            data: { status: "CLOSED", endTime: new Date() },
        });

        const sessionNumber = `${SESSION_NUMBER_PREFIX}-${Date.now()}`;

        // Validate the department tag (if any) before creating the session.
        // The warehouse association is intentionally not validated here to
        // preserve the existing behavior/contract of the warehouse attachment.
        const validDepartmentId = await POSSessionService.validateDepartmentId(
            departmentId,
        );

        return await prisma.pOSSession.create({
            data: {
                sessionNumber,
                cashierId: userId,
                openingCash: new Decimal(openingCash),
                status: "OPEN",
                startTime: new Date(),
                warehouseId,
                departmentId: validDepartmentId,
            },
        });
    }

    /**
     * Updates the department tag associated with a POS session. Pass `null` or
     * `undefined` to clear the existing tag. The warehouse attachment is left
     * untouched.
     */
    static async updateDepartment(
        sessionId: string,
        departmentId?: string | null,
    ) {
        const validDepartmentId = await POSSessionService.validateDepartmentId(
            departmentId,
        );

        const session = await prisma.pOSSession.findUnique({
            where: { id: sessionId },
            select: { id: true, warehouseId: true },
        });

        if (!session) throw new Error("Session not found");

        return await prisma.pOSSession.update({
            where: { id: sessionId },
            // Only touch the department tag; warehouseId is preserved verbatim.
            data: { departmentId: validDepartmentId },
        });
    }

    static async close(sessionId: string, actualCash: number, notes?: string) {
        const parsed = closeSessionSchema.parse({
            sessionId,
            actualCash,
            notes,
        });
        sessionId = parsed.sessionId;
        actualCash = parsed.actualCash;
        notes = parsed.notes;

        const payments = await prisma.salesPayment.findMany({
            where: {
                posSessionId: sessionId,
                method: "CASH",
            },
        });

        const session = await prisma.pOSSession.findUnique({
            where: { id: sessionId },
        });

        if (!session) throw new Error("Session not found");

        const cashSales = payments.reduce(
            (acc, p) => acc.add(p.amount),
            new Decimal(0),
        );
        const systemCash = new Decimal(session.openingCash).add(cashSales);

        await prisma.pOSSession.update({
            where: { id: sessionId },
            data: {
                status: "CLOSED",
                endTime: new Date(),
                actualCash: new Decimal(actualCash),
                closingCash: systemCash,
                difference: new Decimal(actualCash).sub(systemCash),
                notes,
            },
        });
    }
}
