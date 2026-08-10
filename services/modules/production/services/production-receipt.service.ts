import { prisma } from "@/services/lib/prisma";
import { generateDocumentNumber } from "@/services/lib/document-numbering";
import { InventoryService } from "@/services/modules/inventory/services/inventory.service";
import { JournalService } from "@/services/modules/accounting/services/journal.service";
import { getRequiredDefaultAccount } from "@/services/lib/accounting/default-account.service";

export interface ProductionReceiptInput {
    productionOrderId: string;
    receiptDate: Date;
    notes?: string;
    items: {
        productId: string;
        quantity: number;
        notes?: string;
    }[];
}

const SYSTEM_USER_ID = "system";

export class ProductionReceiptService {
    static async create(data: ProductionReceiptInput) {
        const receiptNumber = await generateDocumentNumber("PRODUCTION_RECEIPT", "Production Receipt", "PR-");

        return await prisma.$transaction(async (tx) => {
            const receipt = await tx.productionReceipt.create({
                data: {
                    receiptNumber,
                    productionOrderId: data.productionOrderId,
                    receiptDate: data.receiptDate,
                    notes: data.notes,
                    status: "DRAFT",
                    items: {
                        create: data.items.map((item) => ({
                            productId: item.productId,
                            quantity: item.quantity,
                        })),
                    },
                },
                include: {
                    items: true,
                },
            });

            return receipt;
        });
    }

    static async receiveGoods(id: string) {
        return await prisma.$transaction(async (tx) => {
            const receipt = await tx.productionReceipt.findUniqueOrThrow({
                where: { id },
                include: {
                    items: true,
                    productionOrder: {
                        include: {
                            issues: {
                                where: { status: "ISSUED" },
                                include: { items: true },
                            },
                        },
                    },
                },
            });

            if (receipt.status !== "DRAFT") {
                throw new Error("Production Receipt is not in DRAFT state.");
            }

            // Calculate total cost from all issued materials for this order
            let totalMaterialCost = 0;
            for (const issue of receipt.productionOrder.issues) {
                for (const item of issue.items) {
                    totalMaterialCost += Number(item.totalCost);
                }
            }

            // Calculate total requested receipt quantity
            const totalReceiptQty = receipt.items.reduce((sum, item) => sum + item.quantity, 0);

            const unitCost = totalReceiptQty > 0 ? totalMaterialCost / totalReceiptQty : 0;

            let inventoryMovementId: string | null = null;

            // 1. Increase Inventory
            if (receipt.items.length > 0) {
                const movementData = {
                    type: "PRODUCTION_IN" as any,
                    reference: receipt.receiptNumber,
                    transactionDate: receipt.receiptDate,
                    notes: receipt.notes || `Production Receipt for ${receipt.productionOrder.orderNumber}`,
                    status: "COMPLETED" as const,
                    items: receipt.items.map((item) => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        unitCost,
                        notes: "Production Receipt",
                    })),
                };

                const movement = await InventoryService.createInventoryMovement(tx, movementData);
                inventoryMovementId = movement.id;
            }

            // 2. Update Production Receipt Items with actual cost
            const totalFinishedGoodsValue = unitCost * totalReceiptQty;
            for (const item of receipt.items) {
                const totalLineCost = unitCost * item.quantity;
                await tx.productionReceiptItem.update({
                    where: { id: item.id },
                    data: {
                        unitCost,
                        totalCost: totalLineCost,
                    },
                });
            }

            // 3. Create Journal Entry: Dr. Inventory Asset / Cr. WIP Inventory
            let journalEntryId: string | null = null;
            if (totalFinishedGoodsValue > 0) {
                try {
                    const inventoryAccount = await getRequiredDefaultAccount("INVENTORY_ASSET");
                    const wipAccount = await getRequiredDefaultAccount("WIP_INVENTORY");

                    const journalEntry = await JournalService.createJournalEntry(
                        {
                            transactionDate: receipt.receiptDate,
                            description: `Finished Goods Receipt ${receipt.receiptNumber}`,
                            lines: [
                                {
                                    accountId: inventoryAccount.accountId,
                                    debitAmount: totalFinishedGoodsValue,
                                    creditAmount: 0,
                                    description: `Finished goods received (${receipt.receiptNumber})`,
                                },
                                {
                                    accountId: wipAccount.accountId,
                                    debitAmount: 0,
                                    creditAmount: totalFinishedGoodsValue,
                                    description: `WIP consumed for finished goods (${receipt.receiptNumber})`,
                                },
                            ],
                        },
                        SYSTEM_USER_ID,
                        tx,
                    );

                    // Auto-post the journal entry
                    await JournalService.postJournalEntry(journalEntry.id, tx);
                    journalEntryId = journalEntry.id;
                } catch (error) {
                    // Default accounts may not be configured yet — log but don't block
                    console.warn("Skipping journal entry for Production Receipt (default accounts not configured):", error);
                }
            }

            // 4. Mark as Received
            const updatedReceipt = await tx.productionReceipt.update({
                where: { id },
                data: {
                    status: "RECEIVED",
                    inventoryMovementId,
                    journalEntryId,
                },
            });

            // 5. Update Production Order produced quantity
            const previouslyReceived = receipt.productionOrder.producedQuantity;
            await tx.productionOrder.update({
                where: { id: receipt.productionOrderId },
                data: {
                    producedQuantity: previouslyReceived + totalReceiptQty,
                },
            });

            return updatedReceipt;
        });
    }

    static async cancel(id: string) {
        return await prisma.$transaction(async (tx) => {
            const receipt = await tx.productionReceipt.findUniqueOrThrow({
                where: { id },
                include: {
                    items: true,
                    productionOrder: true,
                },
            });

            if (receipt.status !== "RECEIVED") {
                throw new Error("Only RECEIVED production receipts can be cancelled.");
            }

            const totalReceiptQty = receipt.items.reduce((sum, item) => sum + item.quantity, 0);

            // 1. Reverse Inventory: Create PRODUCTION_OUT movement to remove finished goods
            if (receipt.items.length > 0) {
                await InventoryService.createInventoryMovement(tx, {
                    type: "PRODUCTION_OUT" as any,
                    reference: `CANCEL-${receipt.receiptNumber}`,
                    transactionDate: new Date(),
                    notes: `Reversal of Production Receipt ${receipt.receiptNumber}`,
                    status: "COMPLETED" as const,
                    items: receipt.items.map((item) => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        unitCost: item.unitCost || 0,
                        notes: "Reversal - Production Receipt Cancelled",
                    })),
                });
            }

            // 2. Reverse Journal Entry: Cr. Inventory Asset / Dr. WIP
            const totalFinishedGoodsValue = receipt.items.reduce(
                (sum, item) => sum + Number(item.totalCost || 0), 0
            );

            if (totalFinishedGoodsValue > 0) {
                try {
                    const inventoryAccount = await getRequiredDefaultAccount("INVENTORY_ASSET");
                    const wipAccount = await getRequiredDefaultAccount("WIP_INVENTORY");

                    const journalEntry = await JournalService.createJournalEntry(
                        {
                            transactionDate: new Date(),
                            description: `Reversal of Finished Goods Receipt ${receipt.receiptNumber}`,
                            lines: [
                                {
                                    accountId: wipAccount.accountId,
                                    debitAmount: totalFinishedGoodsValue,
                                    creditAmount: 0,
                                    description: `Reversal - WIP restored (${receipt.receiptNumber})`,
                                },
                                {
                                    accountId: inventoryAccount.accountId,
                                    debitAmount: 0,
                                    creditAmount: totalFinishedGoodsValue,
                                    description: `Reversal - Finished goods removed (${receipt.receiptNumber})`,
                                },
                            ],
                        },
                        SYSTEM_USER_ID,
                        tx,
                    );

                    await JournalService.postJournalEntry(journalEntry.id, tx);
                } catch (error) {
                    console.warn("Skipping reversal journal entry (default accounts not configured):", error);
                }
            }

            // 3. Reduce production order produced quantity
            const currentProduced = receipt.productionOrder.producedQuantity;
            const newProduced = Math.max(0, currentProduced - totalReceiptQty);
            await tx.productionOrder.update({
                where: { id: receipt.productionOrderId },
                data: { producedQuantity: newProduced },
            });

            // 4. Mark as Cancelled
            return await tx.productionReceipt.update({
                where: { id },
                data: {
                    status: "CANCELLED",
                },
            });
        });
    }
}
