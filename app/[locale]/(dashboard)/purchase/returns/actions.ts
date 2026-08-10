"use server";

import { InventoryService } from "@/services/modules/inventory/services/inventory.service";

import { prisma } from "@/services/lib/prisma";
import { SuperJSON } from "@/services/lib/superjson";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/prisma/client";
import {
  purchaseReturnSchema,
  requiredIdSchema,
} from "@/services/lib/validation/schemas";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { PurchaseReturnInput } from "./types";
import { getPurchaseOrder } from "../orders/actions";
import { getPurchaseInvoice } from "../invoices/actions";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";
import { PurchaseReturnService } from "@/services/modules/purchase/services/purchase-return.service";
import { resolveUserNames, userNameRef } from "@/services/lib/status-tracking";

export { getPurchaseOrder, getPurchaseInvoice };

export async function getPurchaseReturns(
  page: number = 1,
  limit: number = 10,
  search?: string,
) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return {
      returns: [],
      total: 0,
      totalPages: 0,
    };
  }

  const skip = (page - 1) * limit;
  const where: Prisma.PurchaseReturnWhereInput = {
    AND: [],
  };

  if (search) {
    (where.AND as Prisma.PurchaseReturnWhereInput[]).push({
      OR: [
        { returnNumber: { contains: search, mode: "insensitive" } },
        { contact: { name: { contains: search, mode: "insensitive" } } },
        {
          purchaseOrder: {
            orderNumber: { contains: search, mode: "insensitive" },
          },
        },
        {
          purchaseInvoice: {
            invoiceNumber: { contains: search, mode: "insensitive" },
          },
        },
      ],
    });
  }

  const [returns, total] = await Promise.all([
    prisma.purchaseReturn.findMany({
      where,
      select: {
        id: true,
        returnNumber: true,
        returnDate: true,
        status: true,
        totalAmount: true,
        contactId: true,
        purchaseOrderId: true,
        purchaseInvoiceId: true,
        contact: {
          select: { id: true, name: true },
        },
        purchaseOrder: {
          select: { id: true, orderNumber: true },
        },
        purchaseInvoice: {
          select: { id: true, invoiceNumber: true },
        },
        department: {
          select: { id: true, name: true },
        },
        project: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.purchaseReturn.count({ where }),
  ]);

  return {
    returns: SuperJSON.serialize(returns),
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getPurchaseReturn(id: string) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return null;
  }

  const purchaseReturn = await prisma.purchaseReturn.findUnique({
    where: { id },
    include: {
      contact: true,
      purchaseOrder: true,
      purchaseInvoice: true,
      department: true,
      project: true,
      items: {
        include: {
          product: {
            include: {
              baseUnit: true,
              purchaseUnit: true,
            },
          },
        },
      },
      attachments: true,
    },
  });

  if (!purchaseReturn) return null;

  const nameById = await resolveUserNames([
    purchaseReturn.createdById,
    purchaseReturn.updatedById,
    purchaseReturn.approvedById,
    purchaseReturn.completedById,
    purchaseReturn.cancelledById,
  ]);

  return SuperJSON.serialize({
    ...purchaseReturn,
    createdBy: userNameRef(purchaseReturn.createdById, nameById),
    updatedBy: userNameRef(purchaseReturn.updatedById, nameById),
    approvedBy: userNameRef(purchaseReturn.approvedById, nameById),
    completedBy: userNameRef(purchaseReturn.completedById, nameById),
    cancelledBy: userNameRef(purchaseReturn.cancelledById, nameById),
  });
}

export async function getPurchaseOrdersForReturn() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return [];
  }

  const orders = await prisma.purchaseOrder.findMany({
    where: { status: { in: ["ISSUED", "PARTIALLY_RECEIVED", "CLOSED"] } },
    orderBy: { createdAt: "desc" },
    include: {
      contact: true,
      items: {
        include: {
          product: {
            include: {
              baseUnit: true,
              purchaseUnit: true,
            },
          },
        },
      },
    },
  });
  return SuperJSON.serialize(orders);
}

export async function getPurchaseInvoicesForReturn() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return [];
  }

  const invoices = await prisma.purchaseInvoice.findMany({
    where: { status: { in: ["BILLED", "PAID", "PARTIALLY_PAID"] } },
    orderBy: { createdAt: "desc" },
    include: {
      contact: true,
      items: {
        // Invoice items don't have direct product link in schema?
        // Wait, PurchaseInvoiceItem has `description` but no `productId`.
        // Ah, PurchaseInvoiceItem in my implementation of `06_purchasing.prisma` does NOT have `productId`.
        // It only has description.
        // BUT PurchaseReturnItem DOES have `productId`.
        // This is a discrepancy. If we return from Invoice, we might not know the product ID if Invoice doesn't track it.
        // However, PurchaseOrder tracks ProductId.
        // If Invoice is linked to PO, we can trace it.
        // But PurchaseReturnItem requires `productId`.
        // So we should probably return based on Purchase Order mostly, or if Invoice, we assume we know the product?
        // Or maybe I should check if PurchaseInvoiceItem can link to Product.
        // Let's check `06_purchasing.prisma`.
      },
    },
  });
  return SuperJSON.serialize(invoices);
}

// Let's check the schema again for PurchaseInvoiceItem.
// If it doesn't have productId, we can't easily create PurchaseReturnItem with productId from Invoice alone.
// Unless we manually select product.
// For now, I'll rely on Purchase Order for auto-population of Products.

export const createPurchaseReturn = authorizedAction(
  "purchase.create",
  async (data: PurchaseReturnInput) => {
    const parsed = purchaseReturnSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    try {
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const result = await PurchaseReturnService.create(parsed.data, session.userId);

      revalidatePath("/purchase/returns");
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to create Return:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create Purchase Return",
      };
    }
  },
);

export const updatePurchaseReturn = authorizedAction(
  "purchase.edit",
  async (id: string, data: PurchaseReturnInput) => {
    const parsed = purchaseReturnSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    try {
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const currentReturn = await prisma.purchaseReturn.findUnique({
        where: { id },
      });

      if (!currentReturn) throw new Error("Return not found");

      const previousStatus = currentReturn.status;
      if (previousStatus === "APPROVED" || previousStatus === "COMPLETED") {
        return {
          success: false,
          error: "Cannot edit approved or completed return",
        };
      }

      if (data.returnNumber !== currentReturn.returnNumber) {
        const existing = await prisma.purchaseReturn.findUnique({
          where: { returnNumber: data.returnNumber },
        });
        if (existing && existing.id !== id) {
          return { success: false, error: "Return number already exists" };
        }
      }

      let totalAmount = 0;
      data.items.forEach((item) => {
        totalAmount += item.quantity * item.unitPrice;
      });

      const nextStatus = data.status || previousStatus;
      const statusTracking: {
        updatedById: string;
        approvedAt?: Date;
        approvedById?: string;
        completedAt?: Date;
        completedById?: string;
        cancelledAt?: Date;
        cancelledById?: string;
      } = {
        updatedById: session.userId,
      };

      // previousStatus is DRAFT | CANCELLED after the guard above
      if (nextStatus === "APPROVED") {
        statusTracking.approvedAt = new Date();
        statusTracking.approvedById = session.userId;
      }
      if (nextStatus === "COMPLETED") {
        statusTracking.completedAt = new Date();
        statusTracking.completedById = session.userId;
      }
      if (nextStatus === "CANCELLED" && previousStatus !== "CANCELLED") {
        statusTracking.cancelledAt = new Date();
        statusTracking.cancelledById = session.userId;
      }

      const result = await prisma.$transaction(async (tx) => {
        await tx.purchaseReturnItem.deleteMany({
          where: { purchaseReturnId: id },
        });

        const updatedReturn = await tx.purchaseReturn.update({
          where: { id },
          data: {
            returnNumber: data.returnNumber,
            contactId: data.contactId,
            purchaseOrderId: data.purchaseOrderId || undefined,
            purchaseInvoiceId: data.purchaseInvoiceId || undefined,
            departmentId: data.departmentId,
            projectId: data.projectId,
            returnDate: data.returnDate,
            notes: data.notes,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            status: nextStatus as any,
            totalAmount,
            ...statusTracking,
            items: {
              create: data.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.quantity * item.unitPrice,
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

        // Inventory Movement (OUT) if COMPLETED
        if (
          data.status === "COMPLETED" &&
          currentReturn.status !== "COMPLETED"
        ) {
          await InventoryService.createInventoryMovement(tx, {
            type: "OUT",
            reference: updatedReturn.returnNumber,
            notes: data.notes || "Purchase Return Completed",
            items: data.items.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              notes: "Purchase Return"
            })),
            transactionDate: data.returnDate
          });
        }

        return updatedReturn;
      });

      revalidatePath("/purchase/returns");
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to update Return:", error);
      return { success: false, error: "Failed to update Purchase Return" };
    }
  },
);

export const deletePurchaseReturn = authorizedAction(
  "purchase.delete",
  async (id: string) => {
    const idResult = requiredIdSchema.safeParse(id);
    if (!idResult.success) {
      return { success: false, error: "Invalid id" };
    }
    try {
      const currentReturn = await prisma.purchaseReturn.findUnique({
        where: { id },
      });

      if (!currentReturn) throw new Error("Return not found");

      if (currentReturn.status !== "DRAFT") {
        return { success: false, error: "Can only delete draft returns" };
      }

      await prisma.purchaseReturn.delete({
        where: { id },
      });

      revalidatePath("/purchase/returns");
      return { success: true };
    } catch (error) {
      console.error("Failed to delete Return:", error);
      return { success: false, error: "Failed to delete Purchase Return" };
    }
  },
);
