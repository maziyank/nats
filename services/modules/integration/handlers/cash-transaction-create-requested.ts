import { Decimal } from "decimal.js";
import { JournalService } from "@/services/modules/accounting/services/journal.service";
import { cashTransactionCreateRequestedPayloadSchema } from "@/services/modules/integration/events";
import { CashTransactionStatus, CashTransactionType, EntryStatus } from "@/prisma/generated/prisma/enums";
import type { Prisma } from "@/prisma/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export async function handleCashTransactionCreateRequestedAccounting(
  tx: Tx,
  payloadInput: unknown
) {
  const payload = cashTransactionCreateRequestedPayloadSchema.parse(payloadInput);

  const existing = await tx.journalEntry.findUnique({
    where: { id: payload.journalEntryId },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  const cashAccount = await tx.cashAccount.findUnique({
    where: { id: payload.cashAccountId },
    select: { id: true, name: true, glAccountId: true },
  });

  if (!cashAccount) {
    throw new Error("Cash account not found");
  }

  const totalAmount = payload.allocations.reduce(
    (sum, a) => sum.plus(new Decimal(a.amount)),
    new Decimal(0)
  );

  const lines: any[] = [];

  lines.push({
    accountId: cashAccount.glAccountId,
    debitAmount: payload.type === CashTransactionType.INCOME ? totalAmount.toNumber() : 0,
    creditAmount: payload.type === CashTransactionType.EXPENSE ? totalAmount.toNumber() : 0,
    description: payload.description || "Cash Transaction",
  });

  for (const alloc of payload.allocations) {
    lines.push({
      accountId: alloc.accountId,
      debitAmount:
        payload.type === CashTransactionType.EXPENSE ? new Decimal(alloc.amount).toNumber() : 0,
      creditAmount:
        payload.type === CashTransactionType.INCOME ? new Decimal(alloc.amount).toNumber() : 0,
      description: alloc.description || payload.description,
      departmentId: payload.departmentId ?? undefined,
      projectId: payload.projectId ?? undefined,
    });
  }

  // Create Journal Entry via Service (this will also emit JOURNAL_ENTRY_CREATED)
  await JournalService.createJournalEntry({
    entryNumber: payload.entryNumber,
    transactionDate: new Date(payload.date),
    description: payload.description,
    notes: payload.notes,
    lines: lines,
    attachments: payload.attachmentIds?.map((id) => ({ id })),
  }, payload.userId, tx);
}

export async function handleCashTransactionCreateRequestedCashBank(
  tx: Tx,
  payloadInput: unknown
) {
  const payload = cashTransactionCreateRequestedPayloadSchema.parse(payloadInput);

  const existing = await tx.cashTransaction.findUnique({
    where: { id: payload.transactionId },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  await tx.cashTransaction.create({
    data: {
      id: payload.transactionId,
      cashAccountId: payload.cashAccountId,
      contactId: payload.contactId,
      departmentId: payload.departmentId,
      projectId: payload.projectId,
      type: payload.type as CashTransactionType,
      date: new Date(payload.date),
      reference: payload.reference,
      description: payload.description,
      note: payload.notes,
      journalEntryId: payload.journalEntryId,
      status: CashTransactionStatus.PENDING,
      allocations: {
        create: payload.allocations.map((a) => ({
          accountId: a.accountId,
          amount: new Decimal(a.amount),
          description: a.description,
        })),
      },
    },
    select: { id: true },
  });
}
