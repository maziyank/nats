"use server";

import { prisma } from "@/services/lib/prisma";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { LocationType } from "@/prisma/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { SuperJSON } from "@/services/lib/superjson";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";
import { z } from "zod";
import { requiredIdSchema } from "@/services/lib/validation/schemas";

const locationDataSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required"),
  type: z.nativeEnum(LocationType),
});

const createLocationDataSchema = locationDataSchema.extend({
  warehouseId: requiredIdSchema,
});

export async function getLocations(
  warehouseId: string,
  page: number = 1,
  limit: number = 10
) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "inventory.view")) {
    return {
      locations: [],
      total: 0,
    };
  }

  const skip = (page - 1) * limit;

  const [locations, total] = await Promise.all([
    prisma.location.findMany({
      where: { warehouseId },
      orderBy: { code: "asc" },
      skip,
      take: limit,
    }),
    prisma.location.count({
      where: { warehouseId },
    }),
  ]);

  return {
    locations: SuperJSON.serialize(locations),
    total,
  };
}

export async function getWarehouse(warehouseId: string) {
    const warehouse = await prisma.warehouse.findUnique({
        where: { id: warehouseId }
    });
    return SuperJSON.serialize(warehouse);
}

export const createLocation = authorizedAction(
  "warehouses.edit",
  async (data: { warehouseId: string; name: string; code: string; type: LocationType }) => {
    const result = createLocationDataSchema.safeParse(data);
    if (!result.success) {
      return { success: false, error: result.error.issues[0]?.message ?? "Invalid input" };
    }
    try {
      const location = await prisma.location.create({
        data,
      });
      revalidatePath(`/inventory/warehouses/${data.warehouseId}/locations`);
      return { success: true, data: location };
    } catch (error) {
      console.error("Failed to create location:", error);
      return { success: false, error: "Failed to create location" };
    }
  }
);

export const updateLocation = authorizedAction(
  "warehouses.edit",
  async (id: string, data: { name: string; code: string; type: LocationType }) => {
    const idResult = requiredIdSchema.safeParse(id);
    const dataResult = locationDataSchema.safeParse(data);
    if (!idResult.success || !dataResult.success) {
      return { success: false, error: dataResult.success ? "Invalid id" : (dataResult.error.issues[0]?.message ?? "Invalid input") };
    }
    try {
      const location = await prisma.location.update({
        where: { id },
        data,
      });
      revalidatePath(`/inventory/warehouses/${location.warehouseId}/locations`);
      return { success: true, data: location };
    } catch (error) {
      console.error("Failed to update location:", error);
      return { success: false, error: "Failed to update location" };
    }
  }
);

export const deleteLocation = authorizedAction(
  "warehouses.edit",
  async (id: string) => {
    if (!requiredIdSchema.safeParse(id).success) {
      return { success: false, error: "Invalid id" };
    }
    try {
      const location = await prisma.location.delete({
        where: { id },
      });
      revalidatePath(`/inventory/warehouses/${location.warehouseId}/locations`);
      return { success: true };
    } catch (error) {
      console.error("Failed to delete location:", error);
      return { success: false, error: "Failed to delete location" };
    }
  }
);
