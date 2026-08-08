"use server";

import { InventoryService } from "@/modules/inventory/services/inventory.service";
import { getRequiredDefaultAccount } from "@/lib/accounting/default-account.service";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma, ContactType } from "@/prisma/generated/prisma/client";
import {
  purchaseReceiveSchema,
  requiredIdSchema,
} from "@/lib/validation/schemas";
import { authorizedAction } from "@/lib/permissions/protected-action";
import { PurchaseReceiveInput } from "./types";
import { getPurchaseOrder } from "../orders/actions";
import { SuperJSON } from "@/lib/superjson";
import { getSession } from "@/lib/auth/auth";
import { hasPermission } from "@/lib/permissions/utils";
import { JournalService } from "@/modules/accounting/services/journal.service";
import { Decimal } from "decimal.js";
import { PurchaseReceiveService } from "@/modules/purchase/services/purchase-receive.service";
import { resolveUserNames, userNameRef } from "@/lib/status-tracking";

export { getPurchaseOrder };

export async function getPurchaseReceives(
  page: number = 1,
  limit: number = 10,
  search?: string,
) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return {
      receives: [],
      total: 0,
      totalPages: 0,
    };
  }

  const skip = (page - 1) * limit;
  const where: Prisma.PurchaseReceiveWhereInput = {
    AND: [],
  };

  if (search) {
    (where.AND as Prisma.PurchaseReceiveWhereInput[]).push({
      OR: [
        { receiveNumber: { contains: search, mode: "insensitive" } },
        { contact: { name: { contains: search, mode: "insensitive" } } },
        {
          purchaseOrder: {
            orderNumber: { contains: search, mode: "insensitive" },
          },
        },
      ],
    });
  }

  const [receives, total] = await Promise.all([
    prisma.purchaseReceive.findMany({
      where,
      select: {
        id: true,
        receiveNumber: true,
        receiveDate: true,
        status: true,
        contactId: true,
        purchaseOrderId: true,
        contact: {
          select: { id: true, name: true },
        },
        purchaseOrder: {
          select: { id: true, orderNumber: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.purchaseReceive.count({ where }),
  ]);

  return {
    receives: SuperJSON.serialize(receives),
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getPurchaseReceive(id: string) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return null;
  }

  const receive = await prisma.purchaseReceive.findUnique({
    where: { id },
    include: {
      contact: true,
      purchaseOrder: true,
      items: {
        include: {
          product: true,
        },
      },
      department: true,
      project: true,
      attachments: true,
    },
  });

  if (!receive) return null;

  const nameById = await resolveUserNames([
    receive.createdById,
    receive.updatedById,
    receive.completedById,
    receive.cancelledById,
  ]);

  return SuperJSON.serialize({
    ...receive,
    createdBy: userNameRef(receive.createdById, nameById),
    updatedBy: userNameRef(receive.updatedById, nameById),
    completedBy: userNameRef(receive.completedById, nameById),
    cancelledBy: userNameRef(receive.cancelledById, nameById),
  });
}

export async function getProducts() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return [];
  }

  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      sku: true,
      baseUnit: {
        select: {
          symbol: true,
        },
      },
      purchaseUnit: {
        select: {
          symbol: true,
        },
      },
    },
  });
  return SuperJSON.serialize(products);
}

export async function getPurchaseOrdersForSelect() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return [];
  }

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] },
    },
    orderBy: { createdAt: "desc" },
    include: {
      contact: true,
      items: true,
    },
  });
  return SuperJSON.serialize(orders);
}

export const createPurchaseReceive = authorizedAction(
  "purchase.create",
  async (data: PurchaseReceiveInput) => {
    const parsed = purchaseReceiveSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    try {
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const result = await PurchaseReceiveService.create(parsed.data, session.userId);

      revalidatePath("/purchase/receives");
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to create Receive:", error);
      return { success: false, error: "Failed to create Purchase Receive" };
    }
  },
);

export const updatePurchaseReceive = authorizedAction(
  "purchase.edit",
  async (
    id: string,
    data: PurchaseReceiveInput & {
      status?: "DRAFT" | "COMPLETED" | "CANCELLED";
    },
  ) => {
    const parsed = purchaseReceiveSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    try {
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const currentReceive = await prisma.purchaseReceive.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!currentReceive) throw new Error("Receive not found");

      const previousStatus = currentReceive.status;
      if (previousStatus === "COMPLETED") {
        return { success: false, error: "Cannot edit completed receive" };
      }

      const nextStatus = data.status || previousStatus;
      const statusTracking: {
        updatedById: string;
        completedAt?: Date;
        completedById?: string;
        cancelledAt?: Date;
        cancelledById?: string;
      } = {
        updatedById: session.userId,
      };

      // previousStatus is DRAFT | CANCELLED after the guard above
      if (nextStatus === "COMPLETED") {
        statusTracking.completedAt = new Date();
        statusTracking.completedById = session.userId;
      }

      if (nextStatus === "CANCELLED" && previousStatus !== "CANCELLED") {
        statusTracking.cancelledAt = new Date();
        statusTracking.cancelledById = session.userId;
      }

      const result = await prisma.$transaction(async (tx) => {
        // Delete existing items
        await tx.purchaseReceiveItem.deleteMany({
          where: { purchaseReceiveId: id },
        });

        // Update Receive and create new items
        const updatedReceive = await tx.purchaseReceive.update({
          where: { id },
          data: {
            contactId: data.contactId,
            purchaseOrderId: data.purchaseOrderId,
            departmentId: data.departmentId,
            projectId: data.projectId,
            receiveDate: data.receiveDate,
            notes: data.notes,
            status: nextStatus,
            ...statusTracking,
            items: {
              create: data.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                purchaseOrderItemId: item.purchaseOrderItemId,
              })),
            },
            attachments: {
              set: data.attachmentIds?.map((id) => ({ id })) || [],
            },
          },
          include: {
            items: true,
          },
        });

        // If status changed to COMPLETED, update PO items and Inventory
        if (
          data.status === "COMPLETED" &&
          currentReceive.status !== "COMPLETED"
        ) {
          for (const item of data.items) {
            if (item.purchaseOrderItemId) {
              await tx.purchaseOrderItem.update({
                where: { id: item.purchaseOrderItemId },
                data: {
                  receivedQuantity: {
                    increment: item.quantity,
                  },
                },
              });
            }
          }

          // Check PO status
          if (data.purchaseOrderId) {
            const po = await tx.purchaseOrder.findUnique({
              where: { id: data.purchaseOrderId },
              include: { items: true },
            });

            if (po) {
              const allReceived = po.items.every(
                (item) => item.receivedQuantity >= item.quantity,
              );
              const anyReceived = po.items.some(
                (item) => item.receivedQuantity > 0,
              );

              let newStatus = po.status;
              if (allReceived) {
                newStatus = "CLOSED";
              } else if (anyReceived) {
                newStatus = "PARTIALLY_RECEIVED";
              }

              if (newStatus !== po.status) {
                await tx.purchaseOrder.update({
                  where: { id: po.id },
                  data: { status: newStatus },
                });
              }
            }
          }

          // Create InventoryMovement (IN)
          const movementItems = [];
          let totalValue = 0;

          for (const item of data.items) {
            let unitCost = 0;
            if (item.purchaseOrderItemId) {
              const poItem = await tx.purchaseOrderItem.findUnique({
                where: { id: item.purchaseOrderItemId }
              });
              unitCost = poItem ? Number(poItem.unitCost) : 0;
            } else {
              const product = await tx.product.findUnique({ where: { id: item.productId } });
              unitCost = product ? Number(product.cost) : 0;
            }

            movementItems.push({
              productId: item.productId,
              quantity: item.quantity,
              unitCost,
              notes: "Purchase Receive Completed"
            });

            totalValue += item.quantity * unitCost;
          }

          await InventoryService.createInventoryMovement(tx, {
            type: "IN",
            reference: currentReceive.receiveNumber,
            notes: data.notes || "Purchase Receive Completed",
            items: movementItems,
            transactionDate: data.receiveDate
          });

          // Create Journal Entry
          if (totalValue > 0) {
            const session = await getSession();
            if (!session) throw new Error("Unauthorized");

            const inventoryAccount = await getRequiredDefaultAccount("INVENTORY_ASSET");
            const grniAccount = await getRequiredDefaultAccount("GOODS_RECEIVED_NOT_INVOICED");

            const je = await JournalService.createJournalEntry({
              entryNumber: `JE-${updatedReceive.receiveNumber}`,
              transactionDate: updatedReceive.receiveDate,
              description: `Inventory Asset for Receive #${updatedReceive.receiveNumber}`,
              lines: [
                {
                  accountId: inventoryAccount.accountId,
                  debitAmount: new Decimal(totalValue).toNumber(),
                  creditAmount: 0,
                  description: "Inventory Asset",
                  departmentId: data.departmentId,
                  projectId: data.projectId,
                },
                {
                  accountId: grniAccount.accountId,
                  debitAmount: 0,
                  creditAmount: new Decimal(totalValue).toNumber(),
                  description: "Goods Received Not Invoiced",
                  departmentId: data.departmentId,
                  projectId: data.projectId,
                },
              ],
            }, session.userId, tx);

            await JournalService.postJournalEntry(je.id, tx);
          }
        }

        return updatedReceive;
      });

      revalidatePath("/purchase/receives");
      revalidatePath("/purchase/orders");
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to update Receive:", error);
      return { success: false, error: "Failed to update Purchase Receive" };
    }
  },
);

export const deletePurchaseReceive = authorizedAction(
  "purchase.delete",
  async (id: string) => {
    const idResult = requiredIdSchema.safeParse(id);
    if (!idResult.success) {
      return { success: false, error: "Invalid id" };
    }
    try {
      const currentReceive = await prisma.purchaseReceive.findUnique({
        where: { id },
      });

      if (!currentReceive) throw new Error("Receive not found");

      if (currentReceive.status === "COMPLETED") {
        return { success: false, error: "Cannot delete completed receive" };
      }

      await prisma.purchaseReceive.delete({
        where: { id },
      });

      revalidatePath("/purchase/receives");
      return { success: true };
    } catch (error) {
      console.error("Failed to delete Receive:", error);
      return { success: false, error: "Failed to delete Purchase Receive" };
    }
  },
);
