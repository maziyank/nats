import { JournalService } from "@/services/modules/accounting/services/journal.service";
import { CashTransactionStatus } from "@/prisma/generated/prisma/client";
import { cashTransactionApprovedPayloadSchema } from "@/services/modules/integration/events";
import type { Prisma } from "@/prisma/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export async function handleCashTransactionApprovedAccounting(
  tx: Tx,
  payloadInput: unknown
) {
  const payload = cashTransactionApprovedPayloadSchema.parse(payloadInput);

  const transaction = await tx.cashTransaction.findUnique({
    where: { id: payload.transactionId },
    select: { id: true, journalEntryId: true },
  });

  if (!transaction) {
    throw new Error("Transaction not found");
  }

  await JournalService.postJournalEntry(transaction.journalEntryId, tx);
}

export async function handleCashTransactionApprovedCashBank(
  tx: Tx,
  payloadInput: unknown
) {
  const payload = cashTransactionApprovedPayloadSchema.parse(payloadInput);

  const transaction = await tx.cashTransaction.findUnique({
    where: { id: payload.transactionId },
    select: { id: true, status: true, approvedAt: true },
  });

  if (!transaction) {
    throw new Error("Transaction not found");
  }

  if (transaction.status === CashTransactionStatus.APPROVED) {
    return;
  }

  await tx.cashTransaction.update({
    where: { id: payload.transactionId },
    data: {
      status: CashTransactionStatus.APPROVED,
      approvedById: payload.userId,
      approvedAt: new Date(),
    },
  });
}

