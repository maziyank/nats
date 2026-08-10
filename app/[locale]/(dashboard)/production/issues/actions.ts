"use server";

import { prisma } from "@/services/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/prisma/client";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { getSession } from "@/services/lib/auth/auth";
import { ProductionIssueInput } from "./types";
import { SuperJSON } from "@/services/lib/superjson";
import { hasPermission } from "@/services/lib/permissions/utils";
import { ProductionIssueService } from "@/services/modules/production/services/production-issue.service";

export async function getProductionIssues(
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
    const where: Prisma.ProductionIssueWhereInput = {
        AND: [],
    };

    if (search) {
        (where.AND as Prisma.ProductionIssueWhereInput[]).push({
            OR: [
                { issueNumber: { contains: search, mode: "insensitive" } },
                { productionOrder: { orderNumber: { contains: search, mode: "insensitive" } } },
            ],
        });
    }

    const [issues, total] = await Promise.all([
        prisma.productionIssue.findMany({
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
        prisma.productionIssue.count({ where }),
    ]);

    return {
        data: SuperJSON.serialize(issues),
        total,
        totalPages: Math.ceil(total / limit),
    };
}

export async function getProductionIssue(id: string) {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "inventory.view")) {
        return null;
    }

    const issue = await prisma.productionIssue.findUnique({
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

    if (!issue) return null;

    return SuperJSON.serialize(issue);
}

export const createProductionIssue = authorizedAction(
    "inventory.create",
    async (data: ProductionIssueInput) => {
        try {
            const result = await ProductionIssueService.create(data);
            revalidatePath("/production/issues");
            return { success: true, data: SuperJSON.serialize(result) };
        } catch (error) {
            console.error("Failed to create Production Issue:", error);
            return { success: false, error: "Failed to create Production Issue" };
        }
    },
);

export const issueMaterials = authorizedAction(
    "inventory.edit",
    async (id: string) => {
        try {
            const result = await ProductionIssueService.issueMaterials(id);
            revalidatePath("/production/issues");
            revalidatePath(`/production/issues/${id}`);
            return { success: true, data: SuperJSON.serialize(result) };
        } catch (error) {
            console.error("Failed to confirm Production Issue:", error);
            return { success: false, error: "Failed to confirm Production Issue" };
        }
    },
);

export const cancelProductionIssue = authorizedAction(
    "inventory.edit",
    async (id: string) => {
        try {
            const result = await ProductionIssueService.cancel(id);
            revalidatePath("/production/issues");
            revalidatePath(`/production/issues/${id}`);
            return { success: true, data: SuperJSON.serialize(result) };
        } catch (error) {
            console.error("Failed to cancel Production Issue:", error);
            return { success: false, error: "Failed to cancel Production Issue" };
        }
    },
);
