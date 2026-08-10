"use server";

import { prisma } from "@/services/lib/prisma";
import { CashTransactionFormData } from "./types";
import { revalidatePath } from "next/cache";
import { verifySession } from "@/services/lib/auth/auth";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { Prisma } from "@/prisma/generated/prisma/client";
import {
  maybeProcessIntegrationOutboxEvent,
} from "@/services/modules/integration/outbox";
import type { ActionResponse } from "@/types/actions";
import { CashTransactionService } from "@/services/modules/cash-bank/services/cash-transaction.service";
import { cashTransactionSchema } from "@/services/lib/validation/schemas";

type CashTransactionOutboxResult = {
  transactionId: string;
  outboxId: string;
  processed: boolean;
  alreadyQueued?: boolean;
};

export async function createCashTransaction(
  data: CashTransactionFormData | SuperJSONResult,
): Promise<ActionResponse<CashTransactionOutboxResult>> {
  try {
    const session = await verifySession();

    const data2 = SuperJSON.deserialize(
      data as unknown as SuperJSONResult,
    ) as CashTransactionFormData;

    const validatedData = cashTransactionSchema.parse(data2);

    const result = await CashTransactionService.createTransactionRequest(
      validatedData,
      session.userId,
    );

    const processed = await maybeProcessIntegrationOutboxEvent(result.outboxId);

    revalidatePath("/cash-bank/transaction");
    revalidatePath("/accounting/journal-entries");
    return {
      success: true,
      data: {
        transactionId: result.transactionId,
        outboxId: result.outboxId,
        processed: processed.processed,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create transaction",
    };
  }
}

export async function getCashTransactions(
  page: number = 1,
  pageSize: number = 10,
  search: string = "",
) {
  const skip = (page - 1) * pageSize;

  const where: Prisma.CashTransactionWhereInput = search
    ? {
      OR: [
        { description: { contains: search, mode: "insensitive" } },
        { reference: { contains: search, mode: "insensitive" } },
        { contact: { name: { contains: search, mode: "insensitive" } } },
        { cashAccount: { name: { contains: search, mode: "insensitive" } } },
      ],
    }
    : {};

  const [transactions, total] = await Promise.all([
    prisma.cashTransaction.findMany({
      where,
      include: {
        cashAccount: true,
        journalEntry: {
          include: {
            attachments: true,
          },
        },
        allocations: {
          include: {
            account: true,
          },
        },
        contact: true,
        department: true,
        project: true,
      },
      orderBy: {
        date: "desc",
      },
      skip,
      take: pageSize,
    }),
    prisma.cashTransaction.count({ where }),
  ]);

  return {
    transactions: SuperJSON.serialize(transactions),
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getCashTransaction(id: string) {
  const transaction = await prisma.cashTransaction.findUnique({
    where: { id },
    include: {
      cashAccount: true,
      contact: true,
      journalEntry: {
        include: {
          attachments: true,
        },
      },
      allocations: {
        include: {
          account: true,
        },
      },
      department: true,
      project: true,
    },
  });
  return SuperJSON.serialize(transaction);
}

export async function updateCashTransaction(
  id: string,
  data: CashTransactionFormData | SuperJSONResult,
) {
  // const session = await verifySession(); // Not strictly needed for update if we don't track updatedBy, but good practice if we did.

  const data2 = SuperJSON.deserialize(
    data as unknown as SuperJSONResult,
  ) as CashTransactionFormData;

  // Zod Validation
  const validatedData = cashTransactionSchema.parse(data2);

  const result = await CashTransactionService.updateTransaction(
    id,
    validatedData,
  );

  revalidatePath("/cash-bank/transaction");
  revalidatePath("/accounting/journal-entries");
  return SuperJSON.serialize(result);
}

export async function approveCashTransaction(id: string) {
  try {
    const session = await verifySession();

    const result = await CashTransactionService.approveTransaction(
      id,
      session.userId,
    );

    if (result.alreadyQueued) {
      return {
        success: true,
        data: { transactionId: id, outboxId: result.outboxId, processed: false, alreadyQueued: true },
      };
    }

    const processed = await maybeProcessIntegrationOutboxEvent(result.outboxId);

    revalidatePath("/cash-bank/transaction");
    revalidatePath("/accounting/journal-entries");
    revalidatePath("/cash-bank");
    return {
      success: true,
      data: { transactionId: id, outboxId: result.outboxId, processed: processed.processed },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to approve transaction",
    };
  }
}

export async function deleteCashTransaction(id: string) {
  await CashTransactionService.deleteTransaction(id);

  revalidatePath("/cash-bank/transaction");
  revalidatePath("/accounting/journal-entries");
}
