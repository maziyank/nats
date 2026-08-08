import { MovementType, Prisma } from "@/prisma/generated/prisma/client";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { enqueueIntegrationEventOnce } from "@/modules/integration/outbox";
import {
  requiredIdSchema,
  dateSchema,
  nonNegativeDecimalSchema,
} from "@/lib/validation/schemas";

export interface CreateInventoryMovementData {
    type: MovementType;
    items: {
        productId: string;
        quantity: number;
        unitCost?: number | Decimal; // For IN movements
        batchNumber?: string;
        notes?: string;
    }[];
    warehouseId?: string;
    reference?: string; // e.g. PO-001, SHP-001
    notes?: string;
    transactionDate?: Date;
    status?: "PENDING" | "COMPLETED";
}

const movementItemSchema = z.object({
    productId: requiredIdSchema,
    quantity: nonNegativeDecimalSchema,
    unitCost: nonNegativeDecimalSchema.optional(),
    batchNumber: z.string().optional(),
    notes: z.string().optional(),
});

const createInventoryMovementSchema = z.object({
    type: z.nativeEnum(MovementType),
    items: z.array(movementItemSchema).min(1, "At least 1 item required"),
    warehouseId: z.string().optional(),
    reference: z.string().optional(),
    notes: z.string().optional(),
    transactionDate: dateSchema.optional(),
    status: z.enum(["PENDING", "COMPLETED"]).optional(),
});

const updateInventoryParamsSchema = z.object({
    productId: requiredIdSchema,
    warehouseId: requiredIdSchema,
    quantity: z.number(),
    type: z.nativeEnum(MovementType),
    unitCost: nonNegativeDecimalSchema.optional(),
    batchNumber: z.string().optional(),
});

type ProductCache = {
    id: string;
    name: string;
    sku: string;
    averageCost: Decimal;
};

type InventoryCache = {
    id: string;
    productId: string;
    warehouseId: string;
    batchNumber: string | null;
    quantity: number;
    unitCost: Decimal;
};

function inventoryKey(productId: string, warehouseId: string, batchNumber?: string | null) {
    return `${productId}::${warehouseId}::${batchNumber ?? ""}`;
}

export class InventoryService {
    /**
     * Create an inventory movement and update related stock levels and costs.
     * This must be run within a transaction.
     */
    static async createInventoryMovement(
        tx: Prisma.TransactionClient,
        data: CreateInventoryMovementData
    ) {
        createInventoryMovementSchema.parse(data);
        const {
            type,
            items,
            warehouseId: providedWarehouseId,
            reference,
            notes,
            transactionDate = new Date(),
        } = data;
        const status = data.status || "COMPLETED";

        // 1. Resolve Warehouse
        let warehouseId = providedWarehouseId;
        if (!warehouseId) {
            const defaultWarehouse = await tx.warehouse.findFirst({
                orderBy: { createdAt: "asc" },
            });
            if (!defaultWarehouse) {
                throw new Error("No warehouse found. Please create a warehouse first.");
            }
            warehouseId = defaultWarehouse.id;
        }

        // 2. Create Movement Header
        const movement = await tx.inventoryMovement.create({
            data: {
                type,
                reference,
                notes,
                status,
                transactionDate,
                // Depending on type, set from/to warehouse
                // IN / PRODUCTION_IN: External -> To Warehouse
                // OUT / PRODUCTION_OUT: From Warehouse -> External
                toWarehouseId: (type === "IN" || type === "PRODUCTION_IN") ? warehouseId : undefined,
                fromWarehouseId: (type === "OUT" || type === "PRODUCTION_OUT") ? warehouseId : undefined,
            },
        });

        // 3. Create all movement details in one write
        if (items.length > 0) {
            await tx.inventoryMovementDetail.createMany({
                data: items.map((item) => ({
                    inventoryMovementId: movement.id,
                    productId: item.productId,
                    quantity: item.quantity,
                    unitCost: item.unitCost ?? 0,
                    batchNumber: item.batchNumber,
                    notes: item.notes,
                })),
            });
        }

        // 4. Update stock for completed movements (batch-preload, no per-line full-table scans)
        if (status === "COMPLETED" && items.length > 0) {
            await this.applyInventoryUpdates(tx, {
                type,
                warehouseId: warehouseId!,
                items: items.map((item) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    unitCost: item.unitCost !== undefined ? new Decimal(item.unitCost) : undefined,
                    batchNumber: item.batchNumber,
                })),
            });
        }

        // 5. Emit Context Integration Event (Outbox) ONLY if COMPLETED
        if (status === "COMPLETED") {
            await enqueueIntegrationEventOnce(tx, {
                topic: "INVENTORY",
                type: "INVENTORY_MOVEMENT_CREATED",
                aggregateType: "INVENTORY_MOVEMENT",
                aggregateId: movement.id,
                payload: {
                    movementId: movement.id,
                    type: movement.type,
                    transactionDate: movement.transactionDate,
                },
            });
        }

        return movement;
    }

    static async approveMovement(tx: Prisma.TransactionClient, movementId: string, approvedById: string) {
        requiredIdSchema.parse(movementId);
        requiredIdSchema.parse(approvedById);
        const movement = await tx.inventoryMovement.findUniqueOrThrow({
            where: { id: movementId },
            include: { details: true },
        });

        if (movement.status !== "PENDING") {
            throw new Error("Movement is not pending");
        }

        const warehouseId = movement.type === "IN" || movement.type === "PRODUCTION_IN"
            ? movement.toWarehouseId
            : movement.fromWarehouseId;
        if (!warehouseId) throw new Error("Warehouse ID missing on movement");

        if (movement.details.length > 0) {
            await this.applyInventoryUpdates(tx, {
                type: movement.type,
                warehouseId,
                items: movement.details.map((detail) => ({
                    productId: detail.productId,
                    quantity: detail.quantity,
                    unitCost: detail.unitCost,
                    batchNumber: detail.batchNumber || undefined,
                })),
            });
        }

        // Update status
        const updated = await tx.inventoryMovement.update({
            where: { id: movementId },
            data: {
                status: "COMPLETED",
                approvedById,
                approvedAt: new Date(),
            },
        });

        // Emit Event
        await enqueueIntegrationEventOnce(tx, {
            topic: "INVENTORY",
            type: "INVENTORY_MOVEMENT_CREATED",
            aggregateType: "INVENTORY_MOVEMENT",
            aggregateId: movement.id,
            payload: {
                movementId: movement.id,
                type: movement.type,
                transactionDate: movement.transactionDate,
            },
        });

        return updated;
    }

    /**
     * Batch-apply stock + average cost updates for many line items.
     * Preloads products/inventory once and tracks in-memory deltas within the transaction.
     */
    private static async applyInventoryUpdates(
        tx: Prisma.TransactionClient,
        params: {
            type: MovementType;
            warehouseId: string;
            items: {
                productId: string;
                quantity: number;
                unitCost?: Decimal;
                batchNumber?: string;
            }[];
        }
    ) {
        const { type, warehouseId, items } = params;
        const productIds = [...new Set(items.map((i) => i.productId))];

        const [products, inventoryRows, stockTotals] = await Promise.all([
            tx.product.findMany({
                where: { id: { in: productIds } },
                select: { id: true, name: true, sku: true, averageCost: true },
            }),
            tx.inventory.findMany({
                where: {
                    productId: { in: productIds },
                    warehouseId,
                },
            }),
            // Global on-hand qty per product (for moving average), one aggregate query
            tx.inventory.groupBy({
                by: ["productId"],
                where: { productId: { in: productIds } },
                _sum: { quantity: true },
            }),
        ]);

        const productMap = new Map<string, ProductCache>(
            products.map((p) => [
                p.id,
                {
                    id: p.id,
                    name: p.name,
                    sku: p.sku,
                    averageCost: new Decimal(p.averageCost ?? 0),
                },
            ])
        );

        const inventoryMap = new Map<string, InventoryCache>();
        for (const row of inventoryRows) {
            inventoryMap.set(inventoryKey(row.productId, row.warehouseId, row.batchNumber), {
                id: row.id,
                productId: row.productId,
                warehouseId: row.warehouseId,
                batchNumber: row.batchNumber,
                quantity: row.quantity,
                unitCost: new Decimal(row.unitCost ?? 0),
            });
        }

        // Running global qty / avg cost per product within this batch
        const globalQty = new Map<string, number>();
        for (const row of stockTotals) {
            globalQty.set(row.productId, row._sum.quantity ?? 0);
        }
        for (const id of productIds) {
            if (!globalQty.has(id)) globalQty.set(id, 0);
        }

        for (const item of items) {
            const product = productMap.get(item.productId);
            if (!product) {
                throw new Error(`Product not found: ${item.productId}`);
            }

            const key = inventoryKey(item.productId, warehouseId, item.batchNumber);
            let inventory = inventoryMap.get(key);
            const currentQty = inventory?.quantity ?? 0;
            const currentCost = inventory?.unitCost ?? new Decimal(0);
            let productAvgCost = product.averageCost;
            let currentTotalQty = globalQty.get(item.productId) ?? 0;

            if (type === "IN" || type === "PRODUCTION_IN") {
                if (item.unitCost !== undefined) {
                    const currentTotalValue = productAvgCost.mul(currentTotalQty);
                    const incomingValue = item.unitCost.mul(item.quantity);
                    const newTotalStock = currentTotalQty + item.quantity;

                    if (newTotalStock > 0) {
                        productAvgCost = currentTotalValue.plus(incomingValue).div(newTotalStock);
                    }

                    await tx.product.update({
                        where: { id: item.productId },
                        data: { averageCost: productAvgCost },
                    });
                    product.averageCost = productAvgCost;
                }

                if (inventory) {
                    await tx.inventory.update({
                        where: { id: inventory.id },
                        data: {
                            quantity: { increment: item.quantity },
                            unitCost: item.unitCost ?? currentCost,
                        },
                    });
                    inventory.quantity += item.quantity;
                    if (item.unitCost !== undefined) {
                        inventory.unitCost = item.unitCost;
                    }
                } else {
                    const created = await tx.inventory.create({
                        data: {
                            productId: item.productId,
                            warehouseId,
                            quantity: item.quantity,
                            unitCost: item.unitCost ?? productAvgCost,
                            batchNumber: item.batchNumber,
                        },
                    });
                    inventory = {
                        id: created.id,
                        productId: item.productId,
                        warehouseId,
                        batchNumber: item.batchNumber ?? null,
                        quantity: item.quantity,
                        unitCost: new Decimal(created.unitCost ?? 0),
                    };
                    inventoryMap.set(key, inventory);
                }

                globalQty.set(item.productId, currentTotalQty + item.quantity);
            } else if (type === "OUT" || type === "PRODUCTION_OUT") {
                if (currentQty < item.quantity) {
                    throw new Error(
                        `Insufficient stock for product ${product.name} (SKU: ${product.sku}). Available: ${currentQty}, Requested: ${item.quantity}`
                    );
                }

                if (!inventory) {
                    throw new Error(`Inventory record not found for product ${product.name}`);
                }

                await tx.inventory.update({
                    where: { id: inventory.id },
                    data: {
                        quantity: { decrement: item.quantity },
                    },
                });
                inventory.quantity -= item.quantity;
                globalQty.set(item.productId, Math.max(0, currentTotalQty - item.quantity));
            }
        }
    }

    /**
     * Update inventory quantity and average cost for a single line.
     * Prefer applyInventoryUpdates for multi-line movements.
     */
    public static async updateInventory(
        tx: Prisma.TransactionClient,
        params: {
            productId: string;
            warehouseId: string;
            quantity: number;
            type: MovementType;
            unitCost?: Decimal;
            batchNumber?: string;
        }
    ) {
        updateInventoryParamsSchema.parse(params);
        await this.applyInventoryUpdates(tx, {
            type: params.type,
            warehouseId: params.warehouseId,
            items: [
                {
                    productId: params.productId,
                    quantity: params.quantity,
                    unitCost: params.unitCost,
                    batchNumber: params.batchNumber,
                },
            ],
        });
    }
}
