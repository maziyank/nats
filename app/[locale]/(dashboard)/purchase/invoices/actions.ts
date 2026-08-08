"use server";

import { prisma } from "@/lib/prisma";
import { SuperJSON } from "@/lib/superjson";
import { revalidatePath } from "next/cache";
import {
  Prisma,
  PurchaseInvoiceStatus,
} from "@/prisma/generated/prisma/client";
import { authorizedAction } from "@/lib/permissions/protected-action";
import { PurchaseInvoiceInput } from "./types";
import { getPurchaseOrder } from "../orders/actions";
import { getSession } from "@/lib/auth/auth";
import { hasPermission } from "@/lib/permissions/utils";
import { CalculationService } from "@/lib/utils/calculation-service";
import {
  enqueueIntegrationEventOnce,
  maybeProcessIntegrationOutboxEvent,
} from "@/modules/integration/outbox";
import { PurchaseInvoiceService } from "@/modules/purchase/services/purchase-invoice.service";
import { resolveUserNames, userNameRef } from "@/lib/status-tracking";

type PostPurchaseInvoiceResult = {
  processed: boolean;
  alreadyQueued?: boolean;
  outboxId?: string;
};

export { getPurchaseOrder };

export async function getPurchaseInvoices(
  page: number = 1,
  limit: number = 10,
  search?: string,
  status?: string,
) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return {
      invoices: [],
      total: 0,
      totalPages: 0,
    };
  }

  const skip = (page - 1) * limit;
  const where: Prisma.PurchaseInvoiceWhereInput = {
    AND: [],
  };

  if (status && status !== "ALL") {
    (where.AND as unknown as Prisma.PurchaseInvoiceWhereInput[]).push({
      status: status as unknown as PurchaseInvoiceStatus,
    });
  }

  if (search) {
    (where.AND as unknown as Prisma.PurchaseInvoiceWhereInput[]).push({
      OR: [
        { invoiceNumber: { contains: search, mode: "insensitive" } },
        { contact: { name: { contains: search, mode: "insensitive" } } },
        {
          purchaseOrder: {
            orderNumber: { contains: search, mode: "insensitive" },
          },
        },
      ],
    });
  }

  const [invoices, total] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where,
      // List view: header + payment amounts only (line items load on detail).
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        status: true,
        totalAmount: true,
        purchaseOrderId: true,
        contactId: true,
        contact: {
          select: { id: true, name: true },
        },
        purchaseOrder: {
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
    prisma.purchaseInvoice.count({ where }),
  ]);

  return {
    invoices: SuperJSON.serialize(invoices),
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getPurchaseInvoice(id: string) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return null;
  }

  const invoice = await prisma.purchaseInvoice.findUnique({
    where: { id },
    include: {
      contact: true,
      purchaseOrder: true,
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
    invoice.billedById,
    invoice.cancelledById,
  ]);

  return SuperJSON.serialize({
    ...invoice,
    createdBy: userNameRef(invoice.createdById, nameById),
    updatedBy: userNameRef(invoice.updatedById, nameById),
    billedBy: userNameRef(invoice.billedById, nameById),
    cancelledBy: userNameRef(invoice.cancelledById, nameById),
  });
}

export async function getPurchaseOrdersForSelect() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return SuperJSON.serialize([]);
  }

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      // Invoices can be created for any active PO ideally, but usually Issued/Received.
      status: { in: ["ISSUED", "PARTIALLY_RECEIVED", "CLOSED"] },
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

import { purchaseInvoiceSchema, requiredIdSchema } from "@/lib/validation/schemas";

export const createPurchaseInvoice = authorizedAction(
  "purchase.create",
  async (rawData: PurchaseInvoiceInput) => {
    try {
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const parseResult = purchaseInvoiceSchema.safeParse(rawData);
      if (!parseResult.success) {
        return { success: false, error: parseResult.error.message };
      }

      const result = await PurchaseInvoiceService.create(
        parseResult.data,
        session.userId,
      );

      revalidatePath("/purchase/invoices");
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to create Invoice:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to create Purchase Invoice",
      };
    }
  },
);

export const updatePurchaseInvoice = authorizedAction(
  "purchase.edit",
  async (id: string, rawData: PurchaseInvoiceInput) => {
    try {
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const parseResult = purchaseInvoiceSchema.safeParse(rawData);
      if (!parseResult.success) {
        return { success: false, error: parseResult.error.message };
      }
      const data = parseResult.data;

      const currentInvoice = await prisma.purchaseInvoice.findUnique({
        where: { id },
      });

      if (!currentInvoice) throw new Error("Invoice not found");

      if (
        currentInvoice.status === "PAID" ||
        currentInvoice.status === "CANCELED"
      ) {
        return {
          success: false,
          error: "Cannot edit paid or canceled invoice",
        };
      }

      // Check for duplicate if invoice number changed
      if (
        data.invoiceNumber !== currentInvoice.invoiceNumber ||
        data.contactId !== currentInvoice.contactId
      ) {
        const existing = await prisma.purchaseInvoice.findUnique({
          where: {
            contactId_invoiceNumber: {
              contactId: data.contactId,
              invoiceNumber: data.invoiceNumber,
            },
          },
        });
        if (existing && existing.id !== id) {
          return {
            success: false,
            error: "Invoice number already exists for this vendor",
          };
        }
      }

      // Fetch tax rates
      const taxRates = await prisma.taxRate.findMany();

      const itemsToCreate = data.items.map((item) => {
        let taxRateSnapshot: number | undefined = undefined;
        const taxAmount = item.tax || 0;

        if (item.taxRateId) {
          const rateObj = taxRates.find((r) => r.id === item.taxRateId);
          if (rateObj) {
            taxRateSnapshot = Number(rateObj.rate);
          }
        }

        const calculated = CalculationService.calculateLineItem(
          {
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            tax: taxAmount,
          },
          taxRateSnapshot,
        );

        return {
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: calculated.total.toNumber(),
          discount: item.discount,
          tax: calculated.taxAmount.toNumber(),
          taxRateId: item.taxRateId,
          taxRateSnapshot: taxRateSnapshot,
          productId: item.productId,
          accountId: item.accountId,
          purchaseOrderItemId: item.purchaseOrderItemId,
          _calculated: calculated,
        };
      });

      const totals = CalculationService.calculateInvoiceTotals(
        itemsToCreate.map((i) => i._calculated),
        data.globalDiscount,
        data.shippingCost,
        data.handlingCost,
      );

      // Remove internal field before creating
      const itemsData = itemsToCreate.map(({ _calculated, ...rest }) => rest);

      const result = await prisma.$transaction(async (tx) => {
        // Delete existing items
        await tx.purchaseInvoiceItem.deleteMany({
          where: { purchaseInvoiceId: id },
        });

        // Update Invoice and create new items
        return await tx.purchaseInvoice.update({
          where: { id },
          data: {
            invoiceNumber: data.invoiceNumber,
            contactId: data.contactId,
            purchaseOrderId: data.purchaseOrderId,
            invoiceDate: data.invoiceDate,
            dueDate: data.dueDate,
            notes: data.notes,
            status: currentInvoice.status,
            totalAmount: totals.totalAmount.toNumber(),
            globalDiscount: data.globalDiscount,
            totalTax: totals.totalTax.toNumber(),
            shippingCost: data.shippingCost,
            handlingCost: data.handlingCost,
            departmentId: data.departmentId,
            projectId: data.projectId,
            updatedById: session.userId,
            items: {
              create: itemsData,
            },
            attachments: {
              set: data.attachmentIds?.map((id) => ({ id })) || [],
            },
          },
          include: {
            items: true,
          },
        });
      });

      revalidatePath("/purchase/invoices");
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to update Invoice:", error);
      return { success: false, error: "Failed to update Purchase Invoice" };
    }
  },
);

export const deletePurchaseInvoice = authorizedAction(
  "purchase.delete",
  async (id: string) => {
    const idResult = requiredIdSchema.safeParse(id);
    if (!idResult.success) {
      return { success: false, error: "Invalid id" };
    }
    try {
      const currentInvoice = await prisma.purchaseInvoice.findUnique({
        where: { id },
      });

      if (!currentInvoice) throw new Error("Invoice not found");

      if (currentInvoice.status !== "DRAFT") {
        return { success: false, error: "Can only delete draft invoices" };
      }

      await prisma.purchaseInvoice.delete({
        where: { id },
      });

      revalidatePath("/purchase/invoices");
      return { success: true };
    } catch (error) {
      console.error("Failed to delete Invoice:", error);
      return { success: false, error: "Failed to delete Purchase Invoice" };
    }
  },
);

export const postPurchaseInvoice = authorizedAction<
  PostPurchaseInvoiceResult,
  [string]
>("purchase.edit", async (id: string) => {
  const idResult = requiredIdSchema.safeParse(id);
  if (!idResult.success) {
    return { success: false, error: "Invalid id" };
  }
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    const invoice = await prisma.purchaseInvoice.findUnique({
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
      handlingCost: invoice.handlingCost?.toString(),
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
        topic: "PURCHASE",
        type: "PURCHASE_INVOICE_BILLED",
        aggregateType: "PurchaseInvoice",
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

    revalidatePath("/purchase/invoices");
    revalidatePath(`/purchase/invoices/${id}`);
    return { success: true, data: { outboxId: outbox.id, ...processed } };
  } catch (error) {
    console.error("Failed to post Invoice:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to post Purchase Invoice",
    };
  }
});
