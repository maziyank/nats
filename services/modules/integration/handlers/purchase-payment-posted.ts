import { Decimal } from "decimal.js";
import { getRequiredDefaultAccount } from "@/services/modules/accounting/services/default-account.service";
import { JournalService } from "@/services/modules/accounting/services/journal.service";
import { CashTransactionType } from "@/prisma/generated/prisma/client";
import { purchasePaymentPostedPayloadSchema } from "@/services/modules/integration/events";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { generateDocumentNumber } from "@/services/lib/document-numbering";

type Tx = Prisma.TransactionClient;

export async function handlePurchasePaymentPostedAccounting(
  tx: Tx,
  payloadInput: unknown,
) {
  const payload = purchasePaymentPostedPayloadSchema.parse(payloadInput);

  const payment = await tx.purchasePayment.findUnique({
    where: { id: payload.paymentId },
    include: {
      purchaseInvoice: { select: { invoiceNumber: true } },
      cashAccount: { select: { name: true, glAccountId: true } },
    },
  });

  if (!payment) {
    throw new Error("Payment not found");
  }

  if (payment.journalEntryId) {
    return;
  }

  const apAccount = await getRequiredDefaultAccount("ACCOUNTS_PAYABLE");

  const entryNumber = await generateDocumentNumber(
    "PURCHASE_PAYMENT_JOURNAL",
    "Purchase Payment Journal",
    "PAY-OUT",
  );
  const journalEntry = await JournalService.createJournalEntry(
    {
      entryNumber,
      transactionDate: payment.paymentDate,
      description: `Payment for Purchase Invoice #${payment.purchaseInvoice.invoiceNumber}`,
      lines: [
        {
          accountId: apAccount.accountId,
          debitAmount: new Decimal(payload.amount).toNumber(),
          creditAmount: 0,
          description: `Payment for Purchase Invoice #${payment.purchaseInvoice.invoiceNumber}`,
          contactId: payment.contactId,
        },
        {
          accountId: payment.cashAccount.glAccountId,
          debitAmount: 0,
          creditAmount: new Decimal(payload.amount).toNumber(),
          description: `Payment from ${payment.cashAccount.name}`,
        },
      ],
    },
    payload.userId,
    tx,
  );

  await JournalService.postJournalEntry(journalEntry.id, tx);

  await tx.purchasePayment.update({
    where: { id: payment.id },
    data: {
      journalEntryId: journalEntry.id,
      postedAt: new Date(),
      postedById: payload.userId,
    },
  });
}

export async function handlePurchasePaymentPostedCashBank(
  tx: Tx,
  payloadInput: unknown,
) {
  const payload = purchasePaymentPostedPayloadSchema.parse(payloadInput);

  const payment = await tx.purchasePayment.findUnique({
    where: { id: payload.paymentId },
    include: {
      purchaseInvoice: { select: { invoiceNumber: true } },
    },
  });

  if (!payment) {
    throw new Error("Payment not found");
  }

  if (!payment.journalEntryId) {
    throw new Error("Payment journal entry not created");
  }

  const existingCashTx = await tx.cashTransaction.findUnique({
    where: { journalEntryId: payment.journalEntryId },
    select: { id: true },
  });

  if (existingCashTx) {
    return;
  }

  const apAccount = await getRequiredDefaultAccount("ACCOUNTS_PAYABLE");

  await tx.cashTransaction.create({
    data: {
      cashAccountId: payment.cashAccountId,
      type: CashTransactionType.EXPENSE,
      date: payment.paymentDate,
      reference: payload.reference ?? null,
      description: `Payment for Purchase Invoice #${payment.purchaseInvoice.invoiceNumber}`,
      note: payload.notes ?? null,
      journalEntryId: payment.journalEntryId,
      status: "APPROVED",
      approvedById: payload.userId,
      approvedAt: new Date(),
      allocations: {
        create: {
          accountId: apAccount.accountId,
          amount: new Decimal(payload.amount),
          description: `Payment for Purchase Invoice #${payment.purchaseInvoice.invoiceNumber}`,
        },
      },
    },
  });
}
