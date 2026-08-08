import { Prisma } from "@/prisma/generated/prisma/client";
import { z } from "zod";
import { enqueueIntegrationEventOnce } from "@/modules/integration/outbox";
import { ProductInput } from "@/app/[locale]/(dashboard)/inventory/types";
import {
  decimalSchema,
  nonNegativeDecimalSchema,
  requiredIdSchema,
} from "@/lib/validation/schemas";

export const productInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  description: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  price: nonNegativeDecimalSchema,
  cost: nonNegativeDecimalSchema,
  minStock: nonNegativeDecimalSchema,
  isActive: z.boolean(),
  baseUnitId: z.string().nullable().optional(),
  purchaseUnitId: z.string().nullable().optional(),
  purchaseConversionFactor: decimalSchema.optional(),
  salesUnitId: z.string().nullable().optional(),
  salesConversionFactor: decimalSchema.optional(),
  taxRateId: z.string().nullable().optional(),
});

export class ProductService {
    static async createProduct(tx: Prisma.TransactionClient, data: ProductInput) {
        productInputSchema.parse(data);
        const product = await tx.product.create({
            data: {
                name: data.name,
                sku: data.sku,
                description: data.description,
                image: data.image,
                categoryId: data.categoryId,
                price: data.price,
                cost: data.cost,
                minStock: data.minStock,
                isActive: data.isActive,
                baseUnitId: data.baseUnitId,
                purchaseUnitId: data.purchaseUnitId,
                purchaseConversionFactor: data.purchaseConversionFactor,
                salesUnitId: data.salesUnitId,
                salesConversionFactor: data.salesConversionFactor,
                taxRateId: data.taxRateId,
            },
        });

        // Add initial price history
        await tx.priceHistory.create({
            data: {
                productId: product.id,
                price: data.price,
                effectiveDate: new Date(),
            },
        });

        // Emit Integration Event
        await enqueueIntegrationEventOnce(tx, {
            topic: "INVENTORY",
            type: "PRODUCT_CREATED",
            aggregateType: "PRODUCT",
            aggregateId: product.id,
            payload: {
                productId: product.id,
                name: product.name,
                sku: product.sku,
            },
        });

        return product;
    }

    static async updateProduct(tx: Prisma.TransactionClient, id: string, data: ProductInput) {
        requiredIdSchema.parse(id);
        productInputSchema.parse(data);
        const currentProduct = await tx.product.findUnique({
            where: { id },
            select: { price: true },
        });

        if (!currentProduct) {
            throw new Error("Product not found");
        }

        const newPrice = data.price;
        const oldPrice = currentProduct.price;

        const updated = await tx.product.update({
            where: { id },
            data: {
                name: data.name,
                sku: data.sku,
                description: data.description,
                categoryId: data.categoryId,
                price: newPrice,
                cost: data.cost,
                minStock: data.minStock,
                isActive: data.isActive,
                baseUnitId: data.baseUnitId,
                purchaseUnitId: data.purchaseUnitId,
                purchaseConversionFactor: data.purchaseConversionFactor,
                salesUnitId: data.salesUnitId,
                salesConversionFactor: data.salesConversionFactor,
                taxRateId: data.taxRateId,
            },
        });

        if (!oldPrice.equals(newPrice)) {
            await tx.priceHistory.create({
                data: {
                    productId: id,
                    price: newPrice,
                    effectiveDate: new Date(),
                },
            });
        }

        return updated;
    }

    static async deleteProduct(tx: Prisma.TransactionClient, id: string) {
        requiredIdSchema.parse(id);
        await tx.product.delete({
            where: { id },
        });
    }
}
