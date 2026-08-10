"use server";

import { prisma } from "@/services/lib/prisma";
import { SuperJSON } from "@/services/lib/superjson";
import { revalidatePath } from "next/cache";
import { Prisma, SalesInvoiceStatus } from "@/prisma/generated/prisma/client";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { SalesPaymentInput } from "./types";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";
import {
  enqueueIntegrationEventOnce,
  maybeProcessIntegrationOutboxEvent,
} from "@/services/modules/integration/outbox";
import { resolveUserNames, userNameRef } from "@/services/lib/status-tracking";

type PostSalesPaymentResult = {
  processed: boolean;
  alreadyQueued?: boolean;
  outboxId?: string;
};

export async function getSalesPayments(
  page: number = 1,
  limit: number = 10,
  search?: string,
) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return {
      payments: [],
      total: 0,
      totalPages: 0,
    };
  }

  const skip = (page - 1) * limit;
  const where: Prisma.SalesPaymentWhereInput = {
    AND: [],
  };

  if (search) {
    (where.AND as Prisma.SalesPaymentWhereInput[]).push({
      OR: [
        { paymentNumber: { contains: search, mode: "insensitive" } },
        { contact: { name: { contains: search, mode: "insensitive" } } },
        {
          salesInvoice: {
            invoiceNumber: { contains: search, mode: "insensitive" },
          },
        },
      ],
    });
  }

  const [payments, total] = await Promise.all([
    prisma.salesPayment.findMany({
      where,
      select: {
        id: true,
        paymentNumber: true,
        paymentDate: true,
        amount: true,
        journalEntryId: true,
        salesInvoiceId: true,
        contactId: true,
        contact: {
          select: { id: true, name: true },
        },
        salesInvoice: {
          select: { id: true, invoiceNumber: true },
        },
        cashAccount: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.salesPayment.count({ where }),
  ]);

  return {
    payments: SuperJSON.serialize(payments),
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getSalesPayment(id: string) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return null;
  }

  const payment = await prisma.salesPayment.findUnique({
    where: { id },
    include: {
      contact: true,
      salesInvoice: true,
      cashAccount: true,
      journalEntry: {
        include: {
          lines: {
            include: { account: true },
          },
        },
      },
      attachments: true,
    },
  });
  return SuperJSON.serialize(payment);
}

export async function getUnpaidSalesInvoices() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return [];
  }

  const invoices = await prisma.salesInvoice.findMany({
    where: {
      status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
    },
    include: {
      contact: true,
      salesOrder: true,
      payments: true,
    },
    orderBy: { dueDate: "asc" },
  });
  return SuperJSON.serialize(invoices);
}

export async function getCashAccounts() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return [];
  }

  const accounts = await prisma.cashAccount.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  return SuperJSON.serialize(accounts);
}

import { salesPaymentSchema } from "@/services/lib/validation/schemas";
import { SalesPaymentService } from "@/services/modules/sales/services/sales-payment.service";

export const createSalesPayment = authorizedAction(
  "sales.payments",
  async (rawData: SalesPaymentInput) => {
    try {
      const parseResult = salesPaymentSchema.safeParse(rawData);
      if (!parseResult.success) {
        return { success: false, error: parseResult.error.message };
      }
      const data = parseResult.data;

      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const result = await SalesPaymentService.create(data, session.userId);

      revalidatePath("/sales/payments");
      revalidatePath("/sales/invoices");
      return { success: true, data: SuperJSON.serialize(result) };
    } catch (error) {
      console.error("Failed to create Payment:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create Payment",
      };
    }
  },
);

export const postSalesPayment = authorizedAction<
  PostSalesPaymentResult,
  [string]
>("sales.payments", async (id: string) => {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    const payment = await prisma.salesPayment.findUnique({
      where: { id },
      include: {
        salesInvoice: true,
        cashAccount: true,
      },
    });

    if (!payment) throw new Error("Payment not found");
    if (payment.journalEntryId) throw new Error("Payment already posted");
    const payload = {
      paymentId: payment.id,
      paymentNumber: payment.paymentNumber,
      paymentDate: payment.paymentDate.toISOString(),
      amount: payment.amount.toString(),
      reference: payment.reference ?? undefined,
      notes: payment.notes ?? undefined,
      cashAccountId: payment.cashAccountId,
      contactId: payment.contactId,
      salesInvoiceId: payment.salesInvoiceId,
      userId: session.userId,
    };

    const outbox = await prisma.$transaction(async (tx) => {
      return enqueueIntegrationEventOnce(tx, {
        topic: "SALES",
        type: "SALES_PAYMENT_POSTED",
        aggregateType: "SalesPayment",
        aggregateId: payment.id,
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

    revalidatePath("/sales/payments");
    revalidatePath("/sales/invoices");
    revalidatePath(`/sales/payments/${id}`);
    return { success: true, data: { outboxId: outbox.id, ...processed } };
  } catch (error) {
    console.error("Failed to post Payment:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to post Payment",
    };
  }
});

export const deleteSalesPayment = authorizedAction(
  "sales.payments",
  async (id: string) => {
    try {
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const payment = await prisma.salesPayment.findUnique({
        where: { id },
        include: {
          salesInvoice: {
            include: { payments: true },
          },
        },
      });

      if (!payment) throw new Error("Payment not found");

      if (payment.journalEntryId) {
        throw new Error("Cannot delete a posted payment.");
      }

      const invoice = payment.salesInvoice;

      await prisma.$transaction(async (tx) => {
        // 1. Delete Sales Payment
        await tx.salesPayment.delete({
          where: { id },
        });

        // 2. Update Invoice Status
        const currentTotalPaid = invoice.payments.reduce(
          (sum, p) => sum + Number(p.amount),
          0,
        );
        const newTotalPaid = currentTotalPaid - Number(payment.amount);

        const newStatus =
          newTotalPaid >= Number(invoice.totalAmount) - 0.01
            ? "PAID"
            : newTotalPaid > 0
              ? "PARTIALLY_PAID"
              : "ISSUED";

        await tx.salesInvoice.update({
          where: { id: invoice.id },
          data: {
            status: newStatus as SalesInvoiceStatus,
          },
        });
      });

      revalidatePath("/sales/payments");
      revalidatePath("/sales/invoices");
      return { success: true };
    } catch (error) {
      console.error("Failed to delete Payment:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to delete Payment",
      };
    }
  },
);

export const updateSalesPayment = authorizedAction(
  "sales.payments",
  async (id: string, rawData: SalesPaymentInput) => {
    try {
      const parseResult = salesPaymentSchema.safeParse(rawData);
      if (!parseResult.success) {
        return { success: false, error: parseResult.error.message };
      }
      const data = parseResult.data;

      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const existingPayment = await prisma.salesPayment.findUnique({
        where: { id },
        include: { salesInvoice: { include: { payments: true } } },
      });

      if (!existingPayment) throw new Error("Payment not found");
      if (existingPayment.journalEntryId)
        throw new Error("Cannot edit a posted payment");

      // Check if invoice is changing (usually not allowed in UI but good to check)
      if (data.salesInvoiceId !== existingPayment.salesInvoiceId) {
        throw new Error("Cannot change invoice for existing payment");
      }

      const invoice = existingPayment.salesInvoice;

      // Calculate new totals
      // Remove old amount from invoice payments calculation
      const otherPaymentsTotal = invoice.payments
        .filter((p) => p.id !== id)
        .reduce((sum, p) => sum + Number(p.amount), 0);

      const remaining = Number(invoice.totalAmount) - otherPaymentsTotal;

      if (data.amount > remaining + 0.01) {
        throw new Error(`Amount exceeds remaining balance of ${remaining}`);
      }

      await prisma.$transaction(async (tx) => {
        // Update Payment
        await tx.salesPayment.update({
          where: { id },
          data: {
            paymentDate: data.paymentDate,
            amount: data.amount,
            reference: data.reference,
            notes: data.notes,
            method: data.method,
            cashAccountId: data.cashAccountId,
            attachments: {
              set: data.attachmentIds?.map((id) => ({ id })),
            },
          },
        });

        // Update Invoice Status
        const newTotalPaid = otherPaymentsTotal + Number(data.amount);
        const newStatus =
          newTotalPaid >= Number(invoice.totalAmount) - 0.01
            ? "PAID"
            : "PARTIALLY_PAID";

        await tx.salesInvoice.update({
          where: { id: invoice.id },
          data: {
            status: newStatus,
          },
        });
      });

      revalidatePath("/sales/payments");
      revalidatePath("/sales/invoices");
      revalidatePath(`/sales/payments/${id}`);
      return { success: true };
    } catch (error) {
      console.error("Failed to update Payment:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update Payment",
      };
    }
  },
);
