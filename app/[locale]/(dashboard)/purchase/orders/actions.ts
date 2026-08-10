"use server";

import { prisma } from "@/services/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/prisma/client";
import {
  purchaseOrderSchema,
  requiredIdSchema,
} from "@/services/lib/validation/schemas";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { getSession } from "@/services/lib/auth/auth";
import { PurchaseOrderInput } from "./types";
import { SuperJSON } from "@/services/lib/superjson";
import { hasPermission } from "@/services/lib/permissions/utils";
import { PurchaseOrderService } from "@/services/modules/purchase/services/purchase-order.service";
import { resolveUserNames, userNameRef } from "@/services/lib/status-tracking";

export async function getPurchaseOrders(
  page: number = 1,
  limit: number = 10,
  search?: string,
  status?: string,
  startDate?: string,
  endDate?: string,
) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return {
      orders: [],
      total: 0,
      totalPages: 0,
    };
  }

  const skip = (page - 1) * limit;
  const where: Prisma.PurchaseOrderWhereInput = {
    AND: [],
  };

  if (search) {
    (where.AND as unknown as Prisma.PurchaseOrderWhereInput[]).push({
      OR: [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { contact: { name: { contains: search, mode: "insensitive" } } },
      ],
    });
  }

  if (status && status !== "ALL") {
    (where.AND as unknown as Prisma.PurchaseOrderWhereInput[]).push({
      status: status as unknown as Prisma.EnumPurchaseOrderStatusFilter,
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
    (where.AND as unknown as Prisma.PurchaseOrderWhereInput[]).push({
      orderDate: dateFilter,
    });
  }

  const [orders, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      // List view only needs header fields — line items load on the detail page.
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
    prisma.purchaseOrder.count({ where }),
  ]);

  return {
    orders: SuperJSON.serialize(orders),
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getPurchaseOrder(id: string) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return null;
  }

  const order = await prisma.purchaseOrder.findUnique({
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
              purchaseUnit: true,
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
    order.issuedById,
    order.closedById,
    order.cancelledById,
  ]);

  return SuperJSON.serialize({
    ...order,
    createdBy: userNameRef(order.createdById, nameById),
    updatedBy: userNameRef(order.updatedById, nameById),
    issuedBy: userNameRef(order.issuedById, nameById),
    closedBy: userNameRef(order.closedById, nameById),
    cancelledBy: userNameRef(order.cancelledById, nameById),
  });
}



export const createPurchaseOrder = authorizedAction(
  "purchase.create",
  async (data: PurchaseOrderInput) => {
    const parsed = purchaseOrderSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    try {
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const result = await PurchaseOrderService.create(parsed.data, session.userId);

      revalidatePath("/purchase/orders");
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to create PO:", error);
      return { success: false, error: "Failed to create Purchase Order" };
    }
  },
);

export const updatePurchaseOrder = authorizedAction(
  "purchase.edit",
  async (id: string, data: PurchaseOrderInput) => {
    const parsed = purchaseOrderSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    try {
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const result = await PurchaseOrderService.update(id, parsed.data, session.userId);

      revalidatePath("/purchase/orders");
      revalidatePath(`/purchase/orders/${id}`);
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to update PO:", error);
      const message = error instanceof Error ? error.message : "Failed to update Purchase Order";
      return { success: false, error: message };
    }
  },
);

export const issuePurchaseOrder = authorizedAction(
  "purchase.edit",
  async (id: string) => {
    const idResult = requiredIdSchema.safeParse(id);
    if (!idResult.success) {
      return { success: false, error: "Invalid id" };
    }
    try {
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const result = await PurchaseOrderService.issue(id, session.userId);

      revalidatePath("/purchase/orders");
      revalidatePath(`/purchase/orders/${id}`);
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to issue PO:", error);
      const message = error instanceof Error ? error.message : "Failed to issue Purchase Order";
      return { success: false, error: message };
    }
  },
);

export const cancelPurchaseOrder = authorizedAction(
  "purchase.edit",
  async (id: string) => {
    const idResult = requiredIdSchema.safeParse(id);
    if (!idResult.success) {
      return { success: false, error: "Invalid id" };
    }
    try {
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const result = await PurchaseOrderService.cancel(id, session.userId);

      revalidatePath("/purchase/orders");
      revalidatePath(`/purchase/orders/${id}`);
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to cancel PO:", error);
      const message = error instanceof Error ? error.message : "Failed to cancel Purchase Order";
      return { success: false, error: message };
    }
  },
);

export const closePurchaseOrder = authorizedAction(
  "purchase.edit",
  async (id: string) => {
    const idResult = requiredIdSchema.safeParse(id);
    if (!idResult.success) {
      return { success: false, error: "Invalid id" };
    }
    try {
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const result = await PurchaseOrderService.close(id, session.userId);

      revalidatePath("/purchase/orders");
      revalidatePath(`/purchase/orders/${id}`);
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to close PO:", error);
      const message = error instanceof Error ? error.message : "Failed to close Purchase Order";
      return { success: false, error: message };
    }
  },
);

export const deletePurchaseOrder = authorizedAction(
  "purchase.delete",
  async (id: string) => {
    const idResult = requiredIdSchema.safeParse(id);
    if (!idResult.success) {
      return { success: false, error: "Invalid id" };
    }
    try {
      await PurchaseOrderService.delete(id);
      revalidatePath("/purchase/orders");
      return { success: true };
    } catch (error) {
      console.error("Failed to delete PO:", error);
      const message = error instanceof Error ? error.message : "Failed to delete Purchase Order";
      return { success: false, error: message };
    }
  },
);
