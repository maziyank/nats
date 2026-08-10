"use server";

import { z } from "zod";
import { prisma } from "@/services/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma, SalesOrderStatus } from "@/prisma/generated/prisma/client";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { getSession } from "@/services/lib/auth/auth";
import { SalesOrderInput } from "./types";
import { SuperJSON } from "@/services/lib/superjson";
import { hasPermission } from "@/services/lib/permissions/utils";
import { SalesOrderService } from "@/services/modules/sales/services/sales-order.service";
import { generateDocumentNumber } from "@/services/lib/document-numbering";
import { resolveUserNames, userNameRef } from "@/services/lib/status-tracking";

const decimalSchema = z.union([z.number(), z.string()]).transform((val) => Number(val));
const nonNegativeDecimalSchema = decimalSchema.refine((val) => val >= 0, "Must be non-negative");
const requiredIdSchema = z.string().cuid();
const dateSchema = z.coerce.date();

const salesOrderItemSchema = z.object({
  productId: requiredIdSchema,
  quantity: decimalSchema.refine((val) => val > 0, "Quantity must be greater than 0"),
  unitPrice: nonNegativeDecimalSchema,
  taxRate: decimalSchema.optional(),
  discountRate: decimalSchema.optional(),
});

const salesOrderSchema = z.object({
  contactId: requiredIdSchema,
  orderDate: dateSchema,
  expectedDate: dateSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.nativeEnum(SalesOrderStatus).optional(),
  items: z.array(salesOrderItemSchema).min(1, "At least 1 item required"),
  attachmentIds: z.array(z.string()).optional(),
  departmentId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
});

export async function getSalesOrders(
  page: number = 1,
  limit: number = 10,
  search?: string,
  status?: string,
  startDate?: string,
  endDate?: string,
) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return {
      orders: [],
      total: 0,
      totalPages: 0,
    };
  }

  const skip = (page - 1) * limit;
  const where: Prisma.SalesOrderWhereInput = {
    AND: [],
  };

  if (search) {
    (where.AND as unknown as Prisma.SalesOrderWhereInput[]).push({
      OR: [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { contact: { name: { contains: search, mode: "insensitive" } } },
      ],
    });
  }

  if (status && status !== "ALL") {
    (where.AND as unknown as Prisma.SalesOrderWhereInput[]).push({
      status: status as unknown as Prisma.EnumSalesOrderStatusFilter,
    });
  }

  if (startDate || endDate) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    if (endDate) {
      // Set end date to end of day
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    (where.AND as unknown as Prisma.SalesOrderWhereInput[]).push({
      orderDate: dateFilter,
    });
  }

  const [orders, total] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      // List view only needs header fields — details load on the order page.
      select: {
        id: true,
        orderNumber: true,
        orderDate: true,
        expectedDate: true,
        status: true,
        totalAmount: true,
        contactId: true,
        contact: {
          select: { id: true, name: true },
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
    prisma.salesOrder.count({ where }),
  ]);

  return {
    orders: SuperJSON.serialize(orders),
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getSalesOrder(id: string) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return null;
  }

  const order = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      contact: true,
      department: true,
      project: true,
      attachments: true,
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

  if (!order) return null;

  const nameById = await resolveUserNames([
    order.createdById,
    order.updatedById,
    order.confirmedById,
    order.closedById,
    order.cancelledById,
  ]);

  return SuperJSON.serialize({
    ...order,
    createdBy: userNameRef(order.createdById, nameById),
    updatedBy: userNameRef(order.updatedById, nameById),
    confirmedBy: userNameRef(order.confirmedById, nameById),
    closedBy: userNameRef(order.closedById, nameById),
    cancelledBy: userNameRef(order.cancelledById, nameById),
  });
}

// Helper to generate SO Number
async function generateSONumber() {
  return await generateDocumentNumber("SALES_ORDER", "Sales Order", "SO-");
}

export const createSalesOrder = authorizedAction(
  "sales.create",
  async (data: SalesOrderInput) => {
    try {
      const parseResult = salesOrderSchema.safeParse(data);
      if (!parseResult.success) {
        return { success: false, error: parseResult.error.issues[0]?.message ?? "Invalid input" };
      }
      data = parseResult.data;
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const result = await SalesOrderService.create(data, session.userId);

      revalidatePath("/sales/orders");
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to create SO:", error);
      return { success: false, error: "Failed to create Sales Order" };
    }
  },
);

export const updateSalesOrder = authorizedAction(
  "sales.edit",
  async (id: string, data: SalesOrderInput) => {
    try {
      const idResult = requiredIdSchema.safeParse(id);
      if (!idResult.success) return { success: false, error: "Invalid order id" };
      const parseResult = salesOrderSchema.safeParse(data);
      if (!parseResult.success) {
        return { success: false, error: parseResult.error.issues[0]?.message ?? "Invalid input" };
      }
      data = parseResult.data;
      const session = await getSession();
      const currentOrder = await prisma.salesOrder.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!currentOrder) throw new Error("Order not found");

      // Strict check: Only allow updates if DRAFT
      if (currentOrder.status !== "DRAFT") {
        return {
          success: false,
          error:
            "Only Draft orders can be modified. Please Cancel or create a new order.",
        };
      }

      // Calculate totals
      let totalAmount = 0;
      let subtotal = 0;
      const taxAmount = 0;
      const discountAmount = 0;

      data.items.forEach((item) => {
        const lineTotal = item.quantity * item.unitPrice;
        subtotal += lineTotal;
        totalAmount += lineTotal;
      });

      const result = await prisma.$transaction(async (tx) => {
        // Delete existing items
        await tx.salesOrderItem.deleteMany({
          where: { salesOrderId: id },
        });

        // Update SO and create new items
        return await tx.salesOrder.update({
          where: { id },
          data: {
            contactId: data.contactId,
            orderDate: data.orderDate,
            expectedDate: data.expectedDate,
            notes: data.notes,
            status: "DRAFT", // Ensure it stays DRAFT during update
            totalAmount,
            subtotal,
            departmentId: data.departmentId,
            projectId: data.projectId,
            updatedById: session?.userId,
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
        });
      });

      revalidatePath("/sales/orders");
      revalidatePath(`/sales/orders/${id}`);
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to update SO:", error);
      return { success: false, error: "Failed to update Sales Order" };
    }
  },
);

export const confirmSalesOrder = authorizedAction(
  "sales.edit",
  async (id: string) => {
    try {
      const idResult = requiredIdSchema.safeParse(id);
      if (!idResult.success) return { success: false, error: "Invalid order id" };
      const session = await getSession();
      const currentOrder = await prisma.salesOrder.findUnique({
        where: { id },
      });

      if (!currentOrder) throw new Error("Order not found");
      if (currentOrder.status !== "DRAFT") {
        return { success: false, error: "Only Draft orders can be confirmed" };
      }

      const orderNumber = await generateSONumber();

      const result = await prisma.salesOrder.update({
        where: { id },
        data: {
          status: "CONFIRMED",
          orderNumber, // Assign real SO number
          confirmedAt: new Date(),
          confirmedById: session?.userId,
        },
      });

      revalidatePath("/sales/orders");
      revalidatePath(`/sales/orders/${id}`);
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to confirm SO:", error);
      return { success: false, error: "Failed to confirm Sales Order" };
    }
  },
);

export const cancelSalesOrder = authorizedAction(
  "sales.edit",
  async (id: string) => {
    try {
      const idResult = requiredIdSchema.safeParse(id);
      if (!idResult.success) return { success: false, error: "Invalid order id" };
      const session = await getSession();
      const currentOrder = await prisma.salesOrder.findUnique({
        where: { id },
      });

      if (!currentOrder) throw new Error("Order not found");

      // Can cancel DRAFT or CONFIRMED
      if (!["DRAFT", "CONFIRMED"].includes(currentOrder.status)) {
        return { success: false, error: "Cannot cancel this order" };
      }

      const result = await prisma.salesOrder.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: session?.userId,
        },
      });

      revalidatePath("/sales/orders");
      revalidatePath(`/sales/orders/${id}`);
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to cancel SO:", error);
      return { success: false, error: "Failed to cancel Sales Order" };
    }
  },
);

export const closeSalesOrder = authorizedAction(
  "sales.edit",
  async (id: string) => {
    try {
      const idResult = requiredIdSchema.safeParse(id);
      if (!idResult.success) return { success: false, error: "Invalid order id" };
      const session = await getSession();
      const currentOrder = await prisma.salesOrder.findUnique({
        where: { id },
      });

      if (!currentOrder) throw new Error("Order not found");

      // Can close CONFIRMED or SHIPPED
      if (!["CONFIRMED", "SHIPPED", "PARTIALLY_SHIPPED"].includes(currentOrder.status)) {
        return { success: false, error: "Cannot close this order" };
      }

      const result = await prisma.salesOrder.update({
        where: { id },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closedById: session?.userId,
        },
      });

      revalidatePath("/sales/orders");
      revalidatePath(`/sales/orders/${id}`);
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to close SO:", error);
      return { success: false, error: "Failed to close Sales Order" };
    }
  },
);

export const deleteSalesOrder = authorizedAction(
  "sales.delete",
  async (id: string) => {
    try {
      const idResult = requiredIdSchema.safeParse(id);
      if (!idResult.success) return { success: false, error: "Invalid order id" };
      const currentOrder = await prisma.salesOrder.findUnique({
        where: { id },
      });

      if (!currentOrder) {
        return { success: false, error: "Order not found" };
      }

      if (currentOrder.status !== "DRAFT") {
        return { success: false, error: "Can only delete draft orders" };
      }

      await prisma.salesOrder.delete({
        where: { id },
      });
      revalidatePath("/sales/orders");
      return { success: true };
    } catch (error) {
      console.error("Failed to delete SO:", error);
      return { success: false, error: "Failed to delete Sales Order" };
    }
  },
);
