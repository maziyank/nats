import { Prisma } from "@/prisma/generated/prisma/client";
import { z } from "zod";
import { requiredIdSchema } from "@/services/lib/validation/schemas";

export const warehouseDataSchema = z.object({
  name: z.string().min(1, "Name is required"),
  location: z.string().optional(),
});

export class WarehouseService {
    static async createWarehouse(tx: Prisma.TransactionClient, data: { name: string; location?: string }) {
        warehouseDataSchema.parse(data);
        return await tx.warehouse.create({
            data,
        });
    }

    static async updateWarehouse(tx: Prisma.TransactionClient, id: string, data: { name: string; location?: string }) {
        requiredIdSchema.parse(id);
        warehouseDataSchema.parse(data);
        return await tx.warehouse.update({
            where: { id },
            data,
        });
    }

    static async deleteWarehouse(tx: Prisma.TransactionClient, id: string) {
        requiredIdSchema.parse(id);
        return await tx.warehouse.delete({
            where: { id },
        });
    }
}
