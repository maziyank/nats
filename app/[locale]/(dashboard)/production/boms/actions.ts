"use server";

import { prisma } from "@/services/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/prisma/client";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { getSession } from "@/services/lib/auth/auth";
import { BillOfMaterialInput } from "./types";
import { SuperJSON } from "@/services/lib/superjson";
import { hasPermission } from "@/services/lib/permissions/utils";
import { BillOfMaterialService } from "@/services/modules/production/services/bill-of-material.service";

export async function getBOMs(
    page: number = 1,
    limit: number = 10,
    search?: string,
) {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "inventory.view")) {
        return {
            data: [],
            total: 0,
            totalPages: 0,
        };
    }

    const skip = (page - 1) * limit;
    const where: Prisma.BillOfMaterialWhereInput = {
        AND: [],
    };

    if (search) {
        (where.AND as Prisma.BillOfMaterialWhereInput[]).push({
            OR: [
                { bomNumber: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
                { product: { name: { contains: search, mode: "insensitive" } } },
            ],
        });
    }

    const [boms, total] = await Promise.all([
        prisma.billOfMaterial.findMany({
            where,
            select: {
                id: true,
                bomNumber: true,
                name: true,
                quantity: true,
                isActive: true,
                product: {
                    select: { id: true, name: true },
                },
                _count: {
                    select: { items: true },
                },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
        prisma.billOfMaterial.count({ where }),
    ]);

    return {
        data: SuperJSON.serialize(boms),
        total,
        totalPages: Math.ceil(total / limit),
    };
}

export async function getBOM(id: string) {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "inventory.view")) {
        return null;
    }

    const bom = await prisma.billOfMaterial.findUnique({
        where: { id },
        include: {
            product: true,
            items: {
                include: {
                    product: true,
                },
            },
        },
    });

    if (!bom) return null;

    return SuperJSON.serialize(bom);
}

export const createBOM = authorizedAction(
    "inventory.create",
    async (data: BillOfMaterialInput) => {
        try {
            const result = await BillOfMaterialService.create(data);
            revalidatePath("/production/boms");
            return { success: true, data: SuperJSON.serialize(result) };
        } catch (error) {
            console.error("Failed to create BOM:", error);
            return { success: false, error: "Failed to create BOM" };
        }
    },
);

export const updateBOM = authorizedAction(
    "inventory.edit",
    async (id: string, data: BillOfMaterialInput) => {
        try {
            const result = await BillOfMaterialService.update(id, data);
            revalidatePath("/production/boms");
            revalidatePath(`/production/boms/${id}`);
            return { success: true, data: SuperJSON.serialize(result) };
        } catch (error) {
            console.error("Failed to update BOM:", error);
            return { success: false, error: "Failed to update BOM" };
        }
    },
);

export const deleteBOM = authorizedAction(
    "inventory.delete",
    async (id: string) => {
        try {
            await BillOfMaterialService.delete(id);
            revalidatePath("/production/boms");
            return { success: true };
        } catch (error) {
            console.error("Failed to delete BOM:", error);
            return { success: false, error: "Failed to delete BOM" };
        }
    },
);
