"use server";

import { prisma } from "@/services/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/prisma/client";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { getSession } from "@/services/lib/auth/auth";
import { ProductionReceiptInput } from "./types";
import { SuperJSON } from "@/services/lib/superjson";
import { hasPermission } from "@/services/lib/permissions/utils";
import { ProductionReceiptService } from "@/services/modules/production/services/production-receipt.service";

export async function getProductionReceipts(
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
    const where: Prisma.ProductionReceiptWhereInput = {
        AND: [],
    };

    if (search) {
        (where.AND as Prisma.ProductionReceiptWhereInput[]).push({
            OR: [
                { receiptNumber: { contains: search, mode: "insensitive" } },
                { productionOrder: { orderNumber: { contains: search, mode: "insensitive" } } },
            ],
        });
    }

    const [receipts, total] = await Promise.all([
        prisma.productionReceipt.findMany({
            where,
            include: {
                productionOrder: true,
                items: {
                    include: {
                        product: true,
                    }
                },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
        prisma.productionReceipt.count({ where }),
    ]);

    return {
        data: SuperJSON.serialize(receipts),
        total,
        totalPages: Math.ceil(total / limit),
    };
}

export async function getProductionReceipt(id: string) {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "inventory.view")) {
        return null;
    }

    const receipt = await prisma.productionReceipt.findUnique({
        where: { id },
        include: {
            productionOrder: true,
            items: {
                include: {
                    product: true,
                }
            },
        },
    });

    if (!receipt) return null;

    return SuperJSON.serialize(receipt);
}

export const createProductionReceipt = authorizedAction(
    "inventory.create",
    async (data: ProductionReceiptInput) => {
        try {
            const result = await ProductionReceiptService.create(data);
            revalidatePath("/production/receipts");
            return { success: true, data: SuperJSON.serialize(result) };
        } catch (error) {
            console.error("Failed to create Production Receipt:", error);
            return { success: false, error: "Failed to create Production Receipt" };
        }
    },
);

export const receiveGoods = authorizedAction(
    "inventory.edit",
    async (id: string) => {
        try {
            const result = await ProductionReceiptService.receiveGoods(id);
            revalidatePath("/production/receipts");
            revalidatePath(`/production/receipts/${id}`);
            return { success: true, data: SuperJSON.serialize(result) };
        } catch (error) {
            console.error("Failed to receive Production Goods:", error);
            return { success: false, error: "Failed to receive Production Goods" };
        }
    },
);

export const cancelProductionReceipt = authorizedAction(
    "inventory.edit",
    async (id: string) => {
        try {
            const result = await ProductionReceiptService.cancel(id);
            revalidatePath("/production/receipts");
            revalidatePath(`/production/receipts/${id}`);
            return { success: true, data: SuperJSON.serialize(result) };
        } catch (error) {
            console.error("Failed to cancel Production Receipt:", error);
            return { success: false, error: "Failed to cancel Production Receipt" };
        }
    },
);
