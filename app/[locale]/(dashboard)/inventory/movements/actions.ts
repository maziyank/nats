"use server";

import { prisma } from "@/lib/prisma";
import { MovementType } from "@/prisma/generated/prisma/enums";
import { revalidatePath } from "next/cache";
import { authorizedAction } from "@/lib/permissions/protected-action";
import { SuperJSON } from "@/lib/superjson";

import { getSession } from "@/lib/auth/auth";
import { hasPermission } from "@/lib/permissions/utils";
import { z } from "zod";
import { requiredIdSchema } from "@/lib/validation/schemas";

const rejectMovementSchema = z.object({
  movementId: requiredIdSchema,
  reason: z.string().min(1, "Reason is required"),
});

export async function getCompanyProfile() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "inventory.view")) {
    return null;
  }

  const companyProfile = await prisma.companyProfile.findFirst();
  return SuperJSON.serialize(companyProfile);
}

export async function getMovementBatches(page: number = 1, limit: number = 10) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "inventory.view")) {
    return {
      batches: [],
      total: 0,
      totalPages: 0,
    };
  }

  const skip = (page - 1) * limit;

  const [batches, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        details: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { transactionDate: "desc" },
      skip,
      take: limit,
    }),
    prisma.inventoryMovement.count(),
  ]);

  return {
    batches: SuperJSON.serialize(batches),
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getMovementBatchById(id: string) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "inventory.view")) {
    return null;
  }

  const batch = await prisma.inventoryMovement.findUnique({
    where: { id },
    include: {
      fromWarehouse: true,
      toWarehouse: true,
      details: {
        include: {
          product: {
            include: {
              baseUnit: true,
            },
          },
        },
      },
    },
  });

  if (!batch) return null;

  return SuperJSON.serialize(batch);
}

export async function getMovements(
  page: number = 1,
  limit: number = 50,
  startDate?: string,
  endDate?: string,
) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "inventory.view")) {
    return {
      movements: SuperJSON.serialize([]),
      total: 0,
      totalPages: 0,
    };
  }

  const take = Math.min(Math.max(limit, 1), 200);
  const skip = (Math.max(page, 1) - 1) * take;

  const movementDateFilter: { gte?: Date; lte?: Date } = {};
  if (startDate) movementDateFilter.gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    movementDateFilter.lte = end;
  }

  const where = {
    ...(Object.keys(movementDateFilter).length > 0
      ? {
          inventoryMovement: {
            transactionDate: movementDateFilter,
          },
        }
      : {}),
  };

  const [movements, total] = await Promise.all([
    prisma.inventoryMovementDetail.findMany({
      where,
      select: {
        id: true,
        quantity: true,
        unitCost: true,
        batchNumber: true,
        createdAt: true,
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
          },
        },
        inventoryMovement: {
          select: {
            id: true,
            type: true,
            reference: true,
            transactionDate: true,
            status: true,
            fromWarehouse: {
              select: { id: true, name: true },
            },
            toWarehouse: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.inventoryMovementDetail.count({ where }),
  ]);

  return {
    movements: SuperJSON.serialize(movements),
    total,
    totalPages: Math.ceil(total / take),
  };
}

import { inventoryMovementSchema } from "@/lib/validation/schemas";
import { InventoryService } from "@/modules/inventory/services/inventory.service";

export const createBatchMovement = authorizedAction(
  "inventory_movements.create",
  async (rawData: unknown) => {
    const parseResult = inventoryMovementSchema.safeParse(rawData);
    if (!parseResult.success) {
      return { success: false, error: parseResult.error.message };
    }
    const data = parseResult.data;

    const { type, fromWarehouseId, toWarehouseId, items, reference, notes } =
      data;

    try {
      await prisma.$transaction(async (tx) => {
        await InventoryService.createInventoryMovement(tx, {
          type,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
            batchNumber: item.batchNumber,
            notes: item.notes,
          })),
          warehouseId: type === "IN" ? toWarehouseId : fromWarehouseId, // Use appropriate warehouse based on type or let service resolve
          reference,
          notes,
          status: "PENDING", // Create as PENDING initially
        });
      });

      revalidatePath("/inventory/movements");
      revalidatePath("/inventory/warehouses");
      revalidatePath("/inventory/products");
      return { success: true };
    } catch (error) {
      console.error("Failed to create batch movement:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to create batch movement",
      };
    }
  },
);

export const approveMovement = authorizedAction(
  "inventory_movements.create", // TODO: Add specific permission for approval?
  async (movementId: string) => {
    if (!requiredIdSchema.safeParse(movementId).success) {
      return { success: false, error: "Invalid movement id" };
    }
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    try {
      await prisma.$transaction(async (tx) => {
        await InventoryService.approveMovement(tx, movementId, session.userId);
      });

      revalidatePath("/inventory/movements");
      revalidatePath("/inventory/warehouses");
      revalidatePath("/inventory/products");
      return { success: true };
    } catch (error) {
      console.error("Failed to approve movement:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to approve movement",
      };
    }
  },
);

export const rejectMovement = authorizedAction(
  "inventory_movements.create",
  async ({ movementId, reason }: { movementId: string; reason: string }) => {
    const validation = rejectMovementSchema.safeParse({ movementId, reason });
    if (!validation.success) {
      return { success: false, error: validation.error.issues[0]?.message ?? "Invalid input" };
    }
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    try {
      await prisma.inventoryMovement.update({
        where: { id: movementId },
        data: {
          status: "REJECTED",
          rejectionReason: reason,
          // approvedBy is not set for rejection, maybe add rejectedBy?
        },
      });

      revalidatePath("/inventory/movements");
      return { success: true };
    } catch (error) {
      console.error("Failed to reject movement:", error);
      return { success: false, error: "Failed to reject movement" };
    }
  },
);
