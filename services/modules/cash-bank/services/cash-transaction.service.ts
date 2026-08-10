import { prisma } from "@/services/lib/prisma";
import {
  CashTransactionStatus,
  CashTransactionType,
} from "@/prisma/generated/prisma/enums";
import { Prisma } from "@/prisma/generated/prisma/client";
import { Decimal } from "decimal.js";
import {
  enqueueIntegrationEvent,
  enqueueIntegrationEventOnce,
  maybeProcessIntegrationOutboxEvent,
} from "@/services/modules/integration/outbox";
import { z } from "zod";
import { cashTransactionSchema } from "@/services/lib/validation/schemas";
import { generateDocumentNumber } from "@/services/lib/document-numbering";

export type CreateCashTransactionInput = z.infer<typeof cashTransactionSchema>;

export class CashTransactionService {
  static async createTransactionRequest(
    data: CreateCashTransactionInput,
    userId: string,
  ) {
    const transactionId = crypto.randomUUID();
    const journalEntryId = crypto.randomUUID();
    const entryNumber = await generateDocumentNumber(
      "CASH_TRANSACTION",
      "Cash Transaction",
      "CT",
    );

    const outbox = await prisma.$transaction(async (tx) => {
      return enqueueIntegrationEvent(tx, {
        topic: "cash_bank",
        type: "CASH_TRANSACTION_CREATE_REQUESTED",
        aggregateType: "CashTransaction",
        aggregateId: transactionId,
        payload: {
          transactionId,
          journalEntryId,
          entryNumber,
          cashAccountId: data.cashAccountId,
          contactId: data.contactId,
          departmentId: data.departmentId,
          projectId: data.projectId,
          type: data.type,
          date: data.date.toISOString(),
          reference: data.reference,
          description: data.description,
          notes: data.notes,
          allocations: data.allocations.map((a) => ({
            accountId: a.accountId,
            amount: String(a.amount),
            description: a.description,
          })),
          attachmentIds: data.attachmentIds, // Note: types.ts might need update if this is Attachment[] vs string[]
          userId,
        },
      });
    });

    return {
      transactionId,
      outboxId: outbox.id,
    };
  }

  static async approveTransaction(id: string, userId: string) {
    const transaction = await prisma.cashTransaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    if (transaction.status === CashTransactionStatus.APPROVED) {
      throw new Error("Transaction already approved");
    }

    const outbox = await prisma.$transaction(async (tx) => {
      return enqueueIntegrationEventOnce(tx, {
        topic: "cash_bank",
        type: "CASH_TRANSACTION_APPROVED",
        aggregateType: "CashTransaction",
        aggregateId: id,
        payload: {
          transactionId: id,
          userId,
        },
      });
    });

    return {
      transactionId: id,
      outboxId: outbox.id,
      alreadyQueued: outbox.alreadyQueued,
    };
  }

  static async updateTransaction(id: string, data: CreateCashTransactionInput) {
    const totalAmount = data.allocations.reduce(
      (sum, a) => sum.plus(new Decimal(a.amount)),
      new Decimal(0),
    );

    const cashAccount = await prisma.cashAccount.findUnique({
      where: { id: data.cashAccountId },
    });
    if (!cashAccount) throw new Error("Cash account not found");

    const lines: Prisma.JournalEntryLineUncheckedCreateWithoutJournalEntryInput[] =
      [];
    let lineNumber = 1;

    // 1. Cash Line
    lines.push({
      accountId: cashAccount.glAccountId,
      debitAmount:
        data.type === CashTransactionType.INCOME ? totalAmount : new Decimal(0),
      creditAmount:
        data.type === CashTransactionType.EXPENSE
          ? totalAmount
          : new Decimal(0),
      description: data.description || "Cash Transaction",
      lineNumber: lineNumber++,
    });

    // 2. Allocation Lines
    for (const alloc of data.allocations) {
      lines.push({
        accountId: alloc.accountId,
        debitAmount:
          data.type === CashTransactionType.EXPENSE
            ? new Decimal(alloc.amount)
            : new Decimal(0),
        creditAmount:
          data.type === CashTransactionType.INCOME
            ? new Decimal(alloc.amount)
            : new Decimal(0),
        description: alloc.description || data.description,
        lineNumber: lineNumber++,
        departmentId: data.departmentId,
        projectId: data.projectId,
      });
    }

    const existingTransaction = await prisma.cashTransaction.findUnique({
      where: { id },
      include: { journalEntry: { include: { attachments: true } } },
    });

    if (!existingTransaction) throw new Error("Transaction not found");

    if (existingTransaction.status === CashTransactionStatus.APPROVED) {
      throw new Error("Cannot edit approved transaction");
    }

    return await prisma.$transaction(async (tx) => {
      // Update Journal Entry
      await tx.journalEntry.update({
        where: { id: existingTransaction.journalEntryId },
        data: {
          transactionDate: data.date,
          description: data.description,
          notes: data.notes,
          attachments: {
            set: data.attachmentIds?.map((id) => ({ id })) || [],
          },
          lines: {
            deleteMany: {},
            create: lines,
          },
        },
      });

      // Update Cash Transaction
      return await tx.cashTransaction.update({
        where: { id },
        data: {
          cashAccountId: data.cashAccountId,
          contactId: data.contactId,
          departmentId: data.departmentId,
          projectId: data.projectId,
          type: data.type,
          date: data.date,
          reference: data.reference,
          description: data.description,
          note: data.notes,
          allocations: {
            deleteMany: {},
            create: data.allocations.map((a) => ({
              accountId: a.accountId,
              amount: new Decimal(a.amount),
              description: a.description,
            })),
          },
        },
      });
    });
  }

  static async deleteTransaction(id: string) {
    const transaction = await prisma.cashTransaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    if (transaction.status === CashTransactionStatus.APPROVED) {
      throw new Error("Cannot delete approved transaction");
    }

    await prisma.$transaction(async (tx) => {
      await tx.cashTransaction.delete({
        where: { id },
      });

      await tx.journalEntry.delete({
        where: { id: transaction.journalEntryId },
      });
    });
  }
}
