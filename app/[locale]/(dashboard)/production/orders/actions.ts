"use server";

import { prisma } from "@/services/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/prisma/client";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { getSession } from "@/services/lib/auth/auth";
import { ProductionOrderInput } from "./types";
import { SuperJSON } from "@/services/lib/superjson";
import { hasPermission } from "@/services/lib/permissions/utils";
import { ProductionOrderService } from "@/services/modules/production/services/production-order.service";

export async function getProductionOrders(
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: string,
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
    const where: Prisma.ProductionOrderWhereInput = {
        AND: [],
    };

    if (search) {
        (where.AND as Prisma.ProductionOrderWhereInput[]).push({
            OR: [
                { orderNumber: { contains: search, mode: "insensitive" } },
                { product: { name: { contains: search, mode: "insensitive" } } },
            ],
        });
    }

    if (status && status !== "ALL") {
        (where.AND as Prisma.ProductionOrderWhereInput[]).push({
            status: status as Prisma.EnumProductionOrderStatusFilter,
        });
    }

    const [orders, total] = await Promise.all([
        prisma.productionOrder.findMany({
            where,
            select: {
                id: true,
                orderNumber: true,
                plannedQuantity: true,
                producedQuantity: true,
                status: true,
                startDate: true,
                product: {
                    select: { id: true, name: true },
                },
                billOfMaterial: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
        prisma.productionOrder.count({ where }),
    ]);

    return {
        data: SuperJSON.serialize(orders),
        total,
        totalPages: Math.ceil(total / limit),
    };
}

export async function getProductionOrder(id: string) {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "inventory.view")) {
        return null;
    }

    const order = await prisma.productionOrder.findUnique({
        where: { id },
        include: {
            product: true,
            billOfMaterial: {
                include: {
                    items: {
                        include: {
                            product: true,
                        },
                    },
                },
            },
            issues: {
                include: {
                    items: {
                        include: {
                            product: true,
                        },
                    },
                },
            },
            receipts: {
                include: {
                    items: {
                        include: {
                            product: true,
                        },
                    },
                },
            },
        },
    });

    if (!order) return null;

    return SuperJSON.serialize(order);
}

export const createProductionOrder = authorizedAction(
    "inventory.create",
    async (data: ProductionOrderInput) => {
        try {
            const result = await ProductionOrderService.create(data);
            revalidatePath("/production/orders");
            return { success: true, data: SuperJSON.serialize(result) };
        } catch (error) {
            console.error("Failed to create Production Order:", error);
            return { success: false, error: "Failed to create Production Order" };
        }
    },
);

export const updateProductionOrder = authorizedAction(
    "inventory.edit",
    async (id: string, data: ProductionOrderInput) => {
        try {
            const result = await ProductionOrderService.update(id, data);
            revalidatePath("/production/orders");
            revalidatePath(`/production/orders/${id}`);
            return { success: true, data: SuperJSON.serialize(result) };
        } catch (error) {
            console.error("Failed to update Production Order:", error);
            return { success: false, error: "Failed to update Production Order" };
        }
    },
);

export const releaseProductionOrder = authorizedAction(
    "inventory.edit",
    async (id: string) => {
        try {
            const result = await ProductionOrderService.release(id);
            revalidatePath("/production/orders");
            revalidatePath(`/production/orders/${id}`);
            return { success: true, data: SuperJSON.serialize(result) };
        } catch (error) {
            console.error("Failed to release Production Order:", error);
            return { success: false, error: "Failed to release Production Order" };
        }
    },
);

export const closeProductionOrder = authorizedAction(
    "inventory.edit",
    async (id: string) => {
        try {
            const result = await ProductionOrderService.close(id);
            revalidatePath("/production/orders");
            revalidatePath(`/production/orders/${id}`);
            return { success: true, data: SuperJSON.serialize(result) };
        } catch (error) {
            console.error("Failed to close Production Order:", error);
            return { success: false, error: "Failed to close Production Order" };
        }
    },
);

export const cancelProductionOrder = authorizedAction(
    "inventory.edit",
    async (id: string) => {
        try {
            const result = await ProductionOrderService.cancel(id);
            revalidatePath("/production/orders");
            revalidatePath(`/production/orders/${id}`);
            return { success: true, data: SuperJSON.serialize(result) };
        } catch (error) {
            console.error("Failed to cancel Production Order:", error);
            return { success: false, error: "Failed to cancel Production Order" };
        }
    },
);
