"use server";

import { z } from "zod";
import { prisma } from "@/services/lib/prisma";
import { SuperJSON } from "@/services/lib/superjson";
import { revalidatePath } from "next/cache";
import { Prisma, SalesInvoiceStatus } from "@/prisma/generated/prisma/client";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { SalesInvoiceInput } from "./types";
import { getSalesOrder } from "../orders/actions";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";
import { CalculationService } from "@/services/lib/calculation-service";
import {
  enqueueIntegrationEventOnce,
  maybeProcessIntegrationOutboxEvent,
} from "@/services/modules/integration/outbox";
import { resolveUserNames, userNameRef } from "@/services/lib/status-tracking";

type PostSalesInvoiceResult = {
  processed: boolean;
  alreadyQueued?: boolean;
  outboxId?: string;
};

export { getSalesOrder };

export async function getSalesInvoices(
  page: number = 1,
  limit: number = 10,
  search?: string,
  status?: string,
) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return {
      invoices: [],
      total: 0,
      totalPages: 0,
    };
  }

  const skip = (page - 1) * limit;
  const where: Prisma.SalesInvoiceWhereInput = {
    AND: [],
  };

  if (status && status !== "ALL") {
    (where.AND as unknown as Prisma.SalesInvoiceWhereInput[]).push({
      status: status as unknown as SalesInvoiceStatus,
    });
  }

  if (search) {
    (where.AND as unknown as Prisma.SalesInvoiceWhereInput[]).push({
      OR: [
        { invoiceNumber: { contains: search, mode: "insensitive" } },
        { contact: { name: { contains: search, mode: "insensitive" } } },
        {
          salesOrder: {
            orderNumber: { contains: search, mode: "insensitive" },
          },
        },
      ],
    });
  }

  const [invoices, total] = await Promise.all([
    prisma.salesInvoice.findMany({
      where,
      // List view: header columns + payments for paid amount only.
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        status: true,
        totalAmount: true,
        balanceDue: true,
        salesOrderId: true,
        contactId: true,
        contact: {
          select: { id: true, name: true },
        },
        salesOrder: {
          select: { id: true, orderNumber: true },
        },
        department: {
          select: { id: true, name: true },
        },
        project: {
          select: { id: true, name: true },
        },
        payments: {
          select: { amount: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.salesInvoice.count({ where }),
  ]);

  return {
    invoices: SuperJSON.serialize(invoices),
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getSalesInvoice(id: string) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return null;
  }

  const invoice = await prisma.salesInvoice.findUnique({
    where: { id },
    include: {
      contact: true,
      salesOrder: true,
      department: true,
      project: true,
      items: true,
      attachments: true,
    },
  });

  if (!invoice) return null;

  const nameById = await resolveUserNames([
    invoice.createdById,
    invoice.updatedById,
    invoice.issuedById,
    invoice.cancelledById,
  ]);

  return SuperJSON.serialize({
    ...invoice,
    createdBy: userNameRef(invoice.createdById, nameById),
    updatedBy: userNameRef(invoice.updatedById, nameById),
    issuedBy: userNameRef(invoice.issuedById, nameById),
    cancelledBy: userNameRef(invoice.cancelledById, nameById),
  });
}

export async function getSalesOrdersForSelect() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return SuperJSON.serialize([]);
  }

  const orders = await prisma.salesOrder.findMany({
    where: {
      status: { in: ["CONFIRMED", "SHIPPED", "PARTIALLY_SHIPPED", "CLOSED"] },
    },
    orderBy: { createdAt: "desc" },
    include: {
      contact: true,
      items: {
        include: {
          product: true,
        },
      },
    },
  });
  return SuperJSON.serialize(orders);
}

import { salesInvoiceSchema } from "@/services/lib/validation/schemas";
import { SalesInvoiceService } from "@/services/modules/sales/services/sales-invoice.service";

export const createSalesInvoice = authorizedAction(
  "sales.create",
  async (rawData: SalesInvoiceInput) => {
    try {
      const parseResult = salesInvoiceSchema.safeParse(rawData);
      if (!parseResult.success) {
        return { success: false, error: parseResult.error.message };
      }
      const data = parseResult.data;

      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const result = await SalesInvoiceService.create(data, session.userId);

      revalidatePath("/sales/invoices");
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to create Invoice:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create Sales Invoice";
      return { success: false, error: message };
    }
  },
);

export const updateSalesInvoice = authorizedAction(
  "sales.edit",
  async (id: string, rawData: SalesInvoiceInput) => {
    try {
      const parseResult = salesInvoiceSchema.safeParse(rawData);
      if (!parseResult.success) {
        return { success: false, error: parseResult.error.message };
      }
      const data = parseResult.data;

      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const result = await SalesInvoiceService.update(id, data, session.userId);

      revalidatePath("/sales/invoices");
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to update Invoice:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update Sales Invoice";
      return { success: false, error: message };
    }
  },
);

export const deleteSalesInvoice = authorizedAction(
  "sales.delete",
  async (id: string) => {
    try {
      const idResult = z.string().cuid().safeParse(id);
      if (!idResult.success) return { success: false, error: "Invalid invoice id" };
      await SalesInvoiceService.delete(id);

      revalidatePath("/sales/invoices");
      return { success: true };
    } catch (error) {
      console.error("Failed to delete Invoice:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete Sales Invoice";
      return { success: false, error: message };
    }
  },
);

export const postSalesInvoice = authorizedAction<
  PostSalesInvoiceResult,
  [string]
>("sales.edit", async (id: string) => {
  try {
    const idResult = z.string().cuid().safeParse(id);
    if (!idResult.success) return { success: false, error: "Invalid invoice id" };
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    const invoice = await prisma.salesInvoice.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status !== "DRAFT")
      throw new Error("Only draft invoices can be posted");
    if (invoice.journalEntryId) throw new Error("Invoice already posted");
    const payload = {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate.toISOString(),
      contactId: invoice.contactId,
      userId: session.userId,
      totalAmount: invoice.totalAmount.toString(),
      globalDiscount: invoice.globalDiscount?.toString(),
      shippingCost: invoice.shippingCost?.toString(),
      items: invoice.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        discount: item.discount?.toString(),
        tax: item.tax?.toString(),
        accountId: item.accountId ?? undefined,
      })),
    };

    const outbox = await prisma.$transaction(async (tx) => {
      return enqueueIntegrationEventOnce(tx, {
        topic: "SALES",
        type: "SALES_INVOICE_ISSUED",
        aggregateType: "SalesInvoice",
        aggregateId: invoice.id,
        payload,
      });
    });

    if (outbox.alreadyQueued) {
      return {
        success: true,
        data: {
          processed: false as const,
          alreadyQueued: true as const,
          outboxId: outbox.id,
        },
      };
    }

    const processed = await maybeProcessIntegrationOutboxEvent(outbox.id);

    revalidatePath("/sales/invoices");
    revalidatePath(`/sales/invoices/${id}`);
    return { success: true, data: { outboxId: outbox.id, ...processed } };
  } catch (error) {
    console.error("Failed to post Invoice:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to post Sales Invoice",
    };
  }
});
