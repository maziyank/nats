"use server";

import { prisma } from "@/services/lib/prisma";
import { SuperJSON } from "@/services/lib/superjson";
import { revalidatePath } from "next/cache";
import {
  Prisma,
  PurchaseInvoiceStatus,
} from "@/prisma/generated/prisma/client";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { PurchasePaymentInput } from "./types";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";
import {
  enqueueIntegrationEventOnce,
  maybeProcessIntegrationOutboxEvent,
} from "@/services/modules/integration/outbox";
import { PurchasePaymentService } from "@/services/modules/purchase/services/purchase-payment.service";
import { resolveUserNames, userNameRef } from "@/services/lib/status-tracking";

type PostPurchasePaymentResult = {
  processed: boolean;
  alreadyQueued?: boolean;
  outboxId?: string;
};

export async function getPurchasePayments(
  page: number = 1,
  limit: number = 10,
  search?: string,
) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return {
      payments: [],
      total: 0,
      totalPages: 0,
    };
  }

  const skip = (page - 1) * limit;
  const where: Prisma.PurchasePaymentWhereInput = {
    AND: [],
  };

  if (search) {
    (where.AND as Prisma.PurchasePaymentWhereInput[]).push({
      OR: [
        { paymentNumber: { contains: search, mode: "insensitive" } },
        { contact: { name: { contains: search, mode: "insensitive" } } },
        {
          purchaseInvoice: {
            invoiceNumber: { contains: search, mode: "insensitive" },
          },
        },
      ],
    });
  }

  const [payments, total] = await Promise.all([
    prisma.purchasePayment.findMany({
      where,
      select: {
        id: true,
        paymentNumber: true,
        paymentDate: true,
        amount: true,
        journalEntryId: true,
        purchaseInvoiceId: true,
        contactId: true,
        contact: {
          select: { id: true, name: true },
        },
        purchaseInvoice: {
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
    prisma.purchasePayment.count({ where }),
  ]);

  return {
    payments: SuperJSON.serialize(payments),
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getPurchasePayment(id: string) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return null;
  }

  const payment = await prisma.purchasePayment.findUnique({
    where: { id },
    include: {
      contact: true,
      purchaseInvoice: true,
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

  if (!payment) return null;

  const nameById = await resolveUserNames([
    payment.createdById,
    payment.updatedById,
    payment.postedById,
  ]);

  return SuperJSON.serialize({
    ...payment,
    createdBy: userNameRef(payment.createdById, nameById),
    updatedBy: userNameRef(payment.updatedById, nameById),
    postedBy: userNameRef(payment.postedById, nameById),
  });
}

export async function getUnpaidInvoices() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return [];
  }

  const invoices = await prisma.purchaseInvoice.findMany({
    where: {
      status: { in: ["BILLED", "PARTIALLY_PAID"] },
    },
    include: {
      contact: true,
      purchaseOrder: true,
      payments: true,
    },
    orderBy: { dueDate: "asc" },
  });
  return SuperJSON.serialize(invoices);
}

export async function getCashAccounts() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return [];
  }

  const accounts = await prisma.cashAccount.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  return SuperJSON.serialize(accounts);
}

import { purchasePaymentSchema } from "@/services/lib/validation/schemas";

export const createPurchasePayment = authorizedAction(
  "purchase.payments",
  async (rawData: PurchasePaymentInput) => {
    try {
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const parseResult = purchasePaymentSchema.safeParse(rawData);
      if (!parseResult.success) {
        return { success: false, error: parseResult.error.message };
      }

      const result = await PurchasePaymentService.create(
        parseResult.data,
        session.userId,
      );

      revalidatePath("/purchase/payments");
      revalidatePath("/purchase/invoices");
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

export const postPurchasePayment = authorizedAction<
  PostPurchasePaymentResult,
  [string]
>("purchase.create", async (id: string) => {
  try {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    const payment = await prisma.purchasePayment.findUnique({
      where: { id },
      include: {
        purchaseInvoice: true,
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
      purchaseInvoiceId: payment.purchaseInvoiceId,
      userId: session.userId,
    };

    const outbox = await prisma.$transaction(async (tx) => {
      return enqueueIntegrationEventOnce(tx, {
        topic: "PURCHASE",
        type: "PURCHASE_PAYMENT_POSTED",
        aggregateType: "PurchasePayment",
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

    revalidatePath("/purchase/payments");
    revalidatePath("/purchase/invoices");
    revalidatePath(`/purchase/payments/${id}`);
    return { success: true, data: { outboxId: outbox.id, ...processed } };
  } catch (error) {
    console.error("Failed to post Payment:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to post Payment",
    };
  }
});

export const deletePurchasePayment = authorizedAction(
  "purchase.delete",
  async (id: string) => {
    try {
      const session = await getSession();
      if (!session) throw new Error("Unauthorized");

      const payment = await prisma.purchasePayment.findUnique({
        where: { id },
        include: {
          purchaseInvoice: {
            include: { payments: true },
          },
        },
      });

      if (!payment) throw new Error("Payment not found");

      if (payment.journalEntryId) {
        throw new Error("Cannot delete a posted payment.");
      }

      const invoice = payment.purchaseInvoice;

      await prisma.$transaction(async (tx) => {
        // 1. Delete Purchase Payment
        await tx.purchasePayment.delete({
          where: { id },
        });

        // 2. Update Invoice Status
        // Calculate new total paid (excluding the deleted payment)
        // Since we already fetched invoice.payments which includes the current payment,
        // we subtract the current payment amount.
        const currentTotalPaid = invoice.payments.reduce(
          (sum, p) => sum + Number(p.amount),
          0,
        );
        const newTotalPaid = currentTotalPaid - Number(payment.amount);

        // Allow small float error
        const newStatus =
          newTotalPaid >= Number(invoice.totalAmount) - 0.01
            ? "PAID"
            : newTotalPaid > 0
              ? "PARTIALLY_PAID"
              : "BILLED"; // Revert to BILLED if 0 paid

        // If newTotalPaid is 0 and it was previously draft? No, it must be BILLED to have payments.
        // But verify if it could be DRAFT? Unlikely.

        await tx.purchaseInvoice.update({
          where: { id: invoice.id },
          data: {
            status: newStatus as PurchaseInvoiceStatus,
          },
        });
      });

      revalidatePath("/purchase/payments");
      revalidatePath("/purchase/invoices");
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
