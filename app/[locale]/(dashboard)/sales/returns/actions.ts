"use server";

import { z } from "zod";
import { InventoryService } from "@/modules/inventory/services/inventory.service";

import { prisma } from "@/lib/prisma";
import { SuperJSON } from "@/lib/superjson";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/prisma/client";
import { authorizedAction } from "@/lib/permissions/protected-action";
import { SalesReturnInput } from "./types";
import { getSalesOrder } from "../orders/actions";
import { getSalesInvoice } from "../invoices/actions";
import { getSession } from "@/lib/auth/auth";
import { hasPermission } from "@/lib/permissions/utils";
import { resolveUserNames, userNameRef } from "@/lib/status-tracking";

const decimalSchema = z.union([z.number(), z.string()]).transform((val) => Number(val));
const nonNegativeDecimalSchema = decimalSchema.refine((val) => val >= 0, "Must be non-negative");
const requiredIdSchema = z.string().cuid();
const dateSchema = z.coerce.date();

const salesReturnItemSchema = z.object({
  productId: requiredIdSchema,
  quantity: decimalSchema.refine((val) => val > 0, "Quantity must be greater than 0"),
  unitPrice: nonNegativeDecimalSchema,
});

const salesReturnSchema = z.object({
  returnNumber: z.string(),
  contactId: requiredIdSchema,
  salesOrderId: z.string().optional(),
  salesInvoiceId: z.string().optional(),
  departmentId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  returnDate: dateSchema,
  reason: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["DRAFT", "APPROVED", "COMPLETED", "CANCELLED"]).optional(),
  items: z.array(salesReturnItemSchema).min(1, "At least 1 item required"),
  attachmentIds: z.array(z.string()).optional(),
});

export { getSalesOrder, getSalesInvoice };

export async function getSalesReturns(
  page: number = 1,
  limit: number = 10,
  search?: string,
) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return {
      returns: [],
      total: 0,
      totalPages: 0,
    };
  }

  const skip = (page - 1) * limit;
  const where: Prisma.SalesReturnWhereInput = {
    AND: [],
  };

  if (search) {
    (where.AND as Prisma.SalesReturnWhereInput[]).push({
      OR: [
        { returnNumber: { contains: search, mode: "insensitive" } },
        { contact: { name: { contains: search, mode: "insensitive" } } },
        {
          salesOrder: {
            orderNumber: { contains: search, mode: "insensitive" },
          },
        },
        {
          salesInvoice: {
            invoiceNumber: { contains: search, mode: "insensitive" },
          },
        },
      ],
    });
  }

  const [returns, total] = await Promise.all([
    prisma.salesReturn.findMany({
      where,
      select: {
        id: true,
        returnNumber: true,
        returnDate: true,
        status: true,
        totalAmount: true,
        contactId: true,
        salesOrderId: true,
        salesInvoiceId: true,
        contact: {
          select: { id: true, name: true },
        },
        salesOrder: {
          select: { id: true, orderNumber: true },
        },
        salesInvoice: {
          select: { id: true, invoiceNumber: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.salesReturn.count({ where }),
  ]);

  return {
    returns: SuperJSON.serialize(returns),
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getSalesReturn(id: string) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return null;
  }

  const salesReturn = await prisma.salesReturn.findUnique({
    where: { id },
    include: {
      contact: true,
      salesOrder: true,
      salesInvoice: true,
      items: {
        include: {
          product: {
            include: {
              baseUnit: true,
              salesUnit: true,
            },
          },
        },
      },
      attachments: true,
    },
  });

  if (!salesReturn) return null;

  const nameById = await resolveUserNames([
    salesReturn.createdById,
    salesReturn.updatedById,
    salesReturn.approvedById,
    salesReturn.completedById,
    salesReturn.cancelledById,
  ]);

  return SuperJSON.serialize({
    ...salesReturn,
    createdBy: userNameRef(salesReturn.createdById, nameById),
    updatedBy: userNameRef(salesReturn.updatedById, nameById),
    approvedBy: userNameRef(salesReturn.approvedById, nameById),
    completedBy: userNameRef(salesReturn.completedById, nameById),
    cancelledBy: userNameRef(salesReturn.cancelledById, nameById),
  });
}

export async function getSalesOrdersForReturn() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return [];
  }

  const orders = await prisma.salesOrder.findMany({
    where: { status: { in: ["CONFIRMED", "SHIPPED", "PARTIALLY_SHIPPED", "CLOSED"] } },
    orderBy: { createdAt: "desc" },
    include: {
      contact: true,
      items: {
        include: {
          product: {
            include: {
              baseUnit: true,
              salesUnit: true,
            },
          },
        },
      },
    },
  });
  return SuperJSON.serialize(orders);
}

export async function getSalesInvoicesForReturn() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return [];
  }

  const invoices = await prisma.salesInvoice.findMany({
    where: { status: { in: ["ISSUED", "PAID", "PARTIALLY_PAID"] } },
    orderBy: { createdAt: "desc" },
    include: {
      contact: true,
      items: {
        // Sales Invoice Item has productId in schema 08_sales.prisma
        include: {
          product: true
        },
      },
    },
  });
  return SuperJSON.serialize(invoices);
}

import { SalesReturnService } from "@/modules/sales/services/sales-return.service";

export const createSalesReturn = authorizedAction(
  "sales.create",
  async (data: SalesReturnInput) => {
    try {
      const parseResult = salesReturnSchema.safeParse(data);
      if (!parseResult.success) {
        return { success: false, error: parseResult.error.issues[0]?.message ?? "Invalid input" };
      }
      data = parseResult.data;
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const result = await SalesReturnService.create(data, session.userId);

      revalidatePath("/sales/returns");
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to create Return:", error);
      const message = error instanceof Error ? error.message : "Failed to create Sales Return";
      return { success: false, error: message };
    }
  },
);

export const updateSalesReturn = authorizedAction(
  "sales.edit",
  async (id: string, data: SalesReturnInput) => {
    try {
      const idResult = requiredIdSchema.safeParse(id);
      if (!idResult.success) return { success: false, error: "Invalid return id" };
      const parseResult = salesReturnSchema.safeParse(data);
      if (!parseResult.success) {
        return { success: false, error: parseResult.error.issues[0]?.message ?? "Invalid input" };
      }
      data = parseResult.data;
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const currentReturn = await prisma.salesReturn.findUnique({
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
        const existing = await prisma.salesReturn.findUnique({
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
        await tx.salesReturnItem.deleteMany({
          where: { salesReturnId: id },
        });

        const updatedReturn = await tx.salesReturn.update({
          where: { id },
          data: {
            returnNumber: data.returnNumber,
            contactId: data.contactId,
            salesOrderId: data.salesOrderId || undefined,
            salesInvoiceId: data.salesInvoiceId || undefined,
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
            attachments: data.attachmentIds
              ? {
                set: data.attachmentIds.map((id) => ({ id })),
              }
              : undefined,
          },
          include: {
            items: true,
          },
        });

        // Inventory Movement (IN) if COMPLETED
        if (
          data.status === "COMPLETED" &&
          currentReturn.status !== "COMPLETED"
        ) {
          await InventoryService.createInventoryMovement(tx, {
            type: "IN",
            reference: updatedReturn.returnNumber,
            notes: data.notes || "Sales Return Completed",
            items: data.items.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              notes: "Sales Return"
            })),
            transactionDate: data.returnDate
          });
        }

        return updatedReturn;
      });

      revalidatePath("/sales/returns");
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to update Return:", error);
      return { success: false, error: "Failed to update Sales Return" };
    }
  },
);

export const deleteSalesReturn = authorizedAction(
  "sales.delete",
  async (id: string) => {
    try {
      const idResult = requiredIdSchema.safeParse(id);
      if (!idResult.success) return { success: false, error: "Invalid return id" };
      const currentReturn = await prisma.salesReturn.findUnique({
        where: { id },
      });

      if (!currentReturn) throw new Error("Return not found");

      if (currentReturn.status !== "DRAFT") {
        return { success: false, error: "Can only delete draft returns" };
      }

      await prisma.salesReturn.delete({
        where: { id },
      });

      revalidatePath("/sales/returns");
      return { success: true };
    } catch (error) {
      console.error("Failed to delete Return:", error);
      return { success: false, error: "Failed to delete Sales Return" };
    }
  },
);
