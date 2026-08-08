"use server";

import { prisma } from "@/lib/prisma";
import { authorizedAction } from "@/lib/permissions/protected-action";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requiredIdSchema } from "@/lib/validation/schemas";

const unitDataSchema = z.object({
  name: z.string().min(1, "Name is required"),
  symbol: z.string().min(1, "Symbol is required"),
});

/**
 * Retrieves a paginated list of units of measurement.
 *
 * @param page - The page number to retrieve (default: 1)
 * @param limit - The number of items per page (default: 10)
 * @returns An object containing the list of units, total count, and total pages
 */
export async function getUnits(page: number = 1, limit: number = 10) {
  const skip = (page - 1) * limit;

  const [units, total] = await Promise.all([
    prisma.unit.findMany({
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.unit.count(),
  ]);

  return {
    data: units,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export const createUnit = authorizedAction(
  "products.create", // Reusing product permission for now
  async (data: { name: string; symbol: string }) => {
    const result = unitDataSchema.safeParse(data);
    if (!result.success) {
      return { success: false, error: result.error.issues[0]?.message ?? "Invalid input" };
    }
    try {
      const unit = await prisma.unit.create({
        data,
      });
      revalidatePath("/inventory/uom");
      return { success: true, data: unit };
    } catch (error) {
      console.error("Failed to create unit:", error);
      return {
        success: false,
        error: "Failed to create unit. Symbol or Name might already exist.",
      };
    }
  }
);

export const updateUnit = authorizedAction(
  "inventory_products.edit",
  async (id: string, data: { name: string; symbol: string }) => {
    const idResult = requiredIdSchema.safeParse(id);
    const dataResult = unitDataSchema.safeParse(data);
    if (!idResult.success || !dataResult.success) {
      return { success: false, error: dataResult.success ? "Invalid id" : (dataResult.error.issues[0]?.message ?? "Invalid input") };
    }
    try {
      const unit = await prisma.unit.update({
        where: { id },
        data,
      });
      revalidatePath("/inventory/uom");
      return { success: true, data: unit };
    } catch (error) {
      console.error("Failed to update unit:", error);
      return { success: false, error: "Failed to update unit" };
    }
  }
);

/**
 * Deletes a unit of measurement.
 * Requires 'inventory_products.delete' permission.
 * Checks for usage in products before deletion.
 *
 * @param id - The ID of the unit to delete
 * @returns Result object with success status or error message if in use/failed
 */
export const deleteUnit = authorizedAction(
  "inventory_products.delete",
  async (id: string) => {
    if (!requiredIdSchema.safeParse(id).success) {
      return { success: false, error: "Invalid id" };
    }
    try {
      // Check usage first
      const usageCount = await prisma.product.count({
        where: {
          OR: [{ baseUnitId: id }, { purchaseUnitId: id }, { salesUnitId: id }],
        },
      });

      if (usageCount > 0) {
        return {
          success: false,
          error: "Cannot delete unit because it is used by products.",
        };
      }

      await prisma.unit.delete({
        where: { id },
      });
      revalidatePath("/inventory/uom");
      return { success: true };
    } catch (error) {
      console.error("Failed to delete unit:", error);
      return { success: false, error: "Failed to delete unit" };
    }
  }
);
