import { Decimal } from "decimal.js";
import { getRequiredDefaultAccount } from "@/services/lib/accounting/default-account.service";
import { JournalService } from "@/services/modules/accounting/services/journal.service";
import { CashTransactionType } from "@/prisma/generated/prisma/client";
import { salesPaymentPostedPayloadSchema } from "@/services/modules/integration/events";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { generateDocumentNumber } from "@/services/lib/document-numbering";

type Tx = Prisma.TransactionClient;

export async function handleSalesPaymentPostedAccounting(
  tx: Tx,
  payloadInput: unknown,
) {
  const payload = salesPaymentPostedPayloadSchema.parse(payloadInput);

  const payment = await tx.salesPayment.findUnique({
    where: { id: payload.paymentId },
    include: {
      salesInvoice: { select: { invoiceNumber: true } },
      cashAccount: { select: { name: true, glAccountId: true } },
    },
  });

  if (!payment) {
    throw new Error("Payment not found");
  }

  if (payment.journalEntryId) {
    return;
  }

  const arAccount = await getRequiredDefaultAccount("ACCOUNTS_RECEIVABLE");

  const entryNumber = await generateDocumentNumber(
    "SALES_PAYMENT_JOURNAL",
    "Sales Payment Journal",
    "PAY-IN",
  );
  const journalEntry = await JournalService.createJournalEntry(
    {
      entryNumber,
      transactionDate: payment.paymentDate,
      description: `Payment for Invoice #${payment.salesInvoice.invoiceNumber}`,
      lines: [
        {
          accountId: payment.cashAccount.glAccountId,
          debitAmount: new Decimal(payload.amount).toNumber(),
          creditAmount: 0,
          description: `Payment to ${payment.cashAccount.name}`,
        },
        {
          accountId: arAccount.accountId,
          debitAmount: 0,
          creditAmount: new Decimal(payload.amount).toNumber(),
          description: `Payment for Invoice #${payment.salesInvoice.invoiceNumber}`,
          contactId: payment.contactId,
        },
      ],
    },
    payload.userId,
    tx,
  );

  await JournalService.postJournalEntry(journalEntry.id, tx);

  await tx.salesPayment.update({
    where: { id: payment.id },
    data: {
      journalEntryId: journalEntry.id,
      postedAt: new Date(),
      postedById: payload.userId,
    },
  });
}

export async function handleSalesPaymentPostedCashBank(
  tx: Tx,
  payloadInput: unknown,
) {
  const payload = salesPaymentPostedPayloadSchema.parse(payloadInput);

  const payment = await tx.salesPayment.findUnique({
    where: { id: payload.paymentId },
    include: {
      salesInvoice: { select: { invoiceNumber: true } },
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

  const arAccount = await getRequiredDefaultAccount("ACCOUNTS_RECEIVABLE");

  await tx.cashTransaction.create({
    data: {
      cashAccountId: payment.cashAccountId,
      type: CashTransactionType.INCOME,
      date: payment.paymentDate,
      reference: payload.reference ?? null,
      description: `Payment for Invoice #${payment.salesInvoice.invoiceNumber}`,
      note: payload.notes ?? null,
      journalEntryId: payment.journalEntryId,
      status: "APPROVED",
      approvedById: payload.userId,
      approvedAt: new Date(),
      allocations: {
        create: {
          accountId: arAccount.accountId,
          amount: new Decimal(payload.amount),
          description: `Payment for Invoice #${payment.salesInvoice.invoiceNumber}`,
        },
      },
    },
  });
}
