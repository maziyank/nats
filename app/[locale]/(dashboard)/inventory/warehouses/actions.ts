"use server";

import { prisma } from "@/services/lib/prisma";
import { revalidatePath } from "next/cache";
import { SuperJSON } from "@/services/lib/superjson";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

export async function getWarehouses(page: number = 1, limit: number = 10) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "inventory.view")) {
    return {
      warehouses: [],
      total: 0,
      totalPages: 0,
    };
  }

  const skip = (page - 1) * limit;

  const [warehouses, total] = await Promise.all([
    prisma.warehouse.findMany({
      include: {
        inventory: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.warehouse.count(),
  ]);

  return {
    warehouses: SuperJSON.serialize(warehouses),
    total,
    totalPages: Math.ceil(total / limit),
  };
}

import { authorizedAction } from "@/services/lib/permissions/protected-action";

import { WarehouseService, warehouseDataSchema } from "@/services/modules/inventory/services/warehouse.service";
import { requiredIdSchema } from "@/services/lib/validation/schemas";

export const createWarehouse = authorizedAction(
  "warehouses.create",
  async (data: { name: string; location?: string }) => {
    const result = warehouseDataSchema.safeParse(data);
    if (!result.success) {
      return { success: false, error: result.error.issues[0]?.message ?? "Invalid input" };
    }
    try {
      const warehouse = await prisma.$transaction(async (tx) => {
        return await WarehouseService.createWarehouse(tx, data);
      });
      revalidatePath("/inventory/warehouses");
      return { success: true, data: warehouse };
    } catch (error) {
      console.error("Failed to create warehouse:", error);
      return { success: false, error: "Failed to create warehouse" };
    }
  }
);

export const updateWarehouse = authorizedAction(
  "warehouses.edit",
  async (id: string, data: { name: string; location?: string }) => {
    const idResult = requiredIdSchema.safeParse(id);
    const dataResult = warehouseDataSchema.safeParse(data);
    if (!idResult.success || !dataResult.success) {
      return { success: false, error: dataResult.success ? "Invalid id" : (dataResult.error.issues[0]?.message ?? "Invalid input") };
    }
    try {
      const warehouse = await prisma.$transaction(async (tx) => {
        return await WarehouseService.updateWarehouse(tx, id, data);
      });
      revalidatePath("/inventory/warehouses");
      return { success: true, data: warehouse };
    } catch (error) {
      console.error("Failed to update warehouse:", error);
      return { success: false, error: "Failed to update warehouse" };
    }
  }
);

export const deleteWarehouse = authorizedAction(
  "warehouses.delete",
  async (id: string) => {
    if (!requiredIdSchema.safeParse(id).success) {
      return { success: false, error: "Invalid id" };
    }
    try {
      await prisma.$transaction(async (tx) => {
        await WarehouseService.deleteWarehouse(tx, id);
      });
      revalidatePath("/inventory/warehouses");
      return { success: true };
    } catch (error) {
      console.error("Failed to delete warehouse:", error);
      return { success: false, error: "Failed to delete warehouse" };
    }
  }
);

export async function getInventoryLevels(warehouseId?: string) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "inventory.view")) {
    return [];
  }

  const where = warehouseId ? { warehouseId } : {};

  const inventory = await prisma.inventory.findMany({
    where,
    include: {
      product: true,
      warehouse: true,
    },
    orderBy: {
      product: { name: "asc" },
    },
  });

  return SuperJSON.serialize(inventory);
}
