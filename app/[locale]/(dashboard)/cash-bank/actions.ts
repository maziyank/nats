"use server";

import { prisma } from "@/services/lib/prisma";
import {
  CashAccountFormData,
  CashTransferFormData,
  UpdateCashAccountFormData,
} from "./types";
import { revalidatePath } from "next/cache";
import { SuperJSON } from "@/services/lib/superjson";
import {
  CashAccountType,
  EntryStatus,
  TransferStatus,
} from "@/prisma/generated/prisma/enums";
import {
  JournalEntryLine,
  JournalEntry,
  Prisma,
} from "@/prisma/generated/prisma/client";
import { saveFile } from "@/services/lib/file-service";
import { verifySession } from "@/services/lib/auth/auth";
import { SuperJSONResult } from "superjson";
import { cashTransferSchema } from "@/services/lib/validation/schemas";
import {
  maybeProcessIntegrationOutboxEvent,
} from "@/services/modules/integration/outbox";
import type { ActionResponse } from "@/types/actions";
import { CashAccountService } from "@/services/modules/cash-bank/services/cash-account.service";
import { CashTransferService } from "@/services/modules/cash-bank/services/cash-transfer.service";
import { CashAccountSyncService } from "@/services/modules/cash-bank/services/cash-account-sync.service";
import { Decimal } from "decimal.js";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

const CASH_GL_CODE_PREFIX = "111";

type CashTransferOutboxResult = {
  transferId: string;
  outboxId: string;
  processed: boolean;
  alreadyQueued?: boolean;
};

export async function syncCashAccounts() {
  const result = await CashAccountSyncService.sync();
  revalidatePath("/accounting/cash-bank");
  return result;
}


export async function uploadTransferAttachment(formData: FormData) {
  const session = await verifySession();
  const file = formData.get("file") as File;

  if (!file) {
    throw new Error("No file provided");
  }

  const { url } = await saveFile(file);

  const dbFile = await prisma.file.create({
    data: {
      id: crypto.randomUUID(),
      name: file.name,
      url: url,
      mimeType: file.type,
      size: file.size,
      uploadedById: session.userId,
    },
  });

  return {
    success: true,
    file: {
      id: dbFile.id,
      name: dbFile.name,
      url: dbFile.url,
    },
  };
}

// --- Cash Account Actions ---

export async function getDashboardStats() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "cash_bank.view")) {
    return {
      accounts: [],
      summary: {
        totalBalance: 0,
        totalCash: 0,
        totalBank: 0,
      },
      recentTransactions: SuperJSON.serialize([]),
    };
  }
  await syncCashAccounts();
  const accounts = await prisma.cashAccount.findMany({
    include: { glAccount: true },
    where: { isActive: true },
  });

  const glAccountIds = accounts.map((a) => a.glAccountId);

  const balances = await prisma.journalEntryLine.groupBy({
    by: ["accountId"],
    where: {
      accountId: { in: glAccountIds },
      journalEntry: { status: EntryStatus.posted },
    },
    _sum: {
      debitAmount: true,
      creditAmount: true,
    },
  });

  const balanceMap = new Map<string, number>();
  balances.forEach((b) => {
    const debit = new Decimal(b._sum.debitAmount || 0);
    const credit = new Decimal(b._sum.creditAmount || 0);
    const balance = debit.minus(credit).toNumber();
    balanceMap.set(b.accountId, balance);
  });

  const accountsWithBalance = accounts.map((a) => ({
    ...a,
    balance: balanceMap.get(a.glAccountId) || 0,
  }));

  const totalCash = accountsWithBalance
    .filter((a) => a.type === CashAccountType.CASH)
    .reduce((sum, a) => sum + a.balance, 0);

  const totalBank = accountsWithBalance
    .filter((a) => a.type === CashAccountType.BANK)
    .reduce((sum, a) => sum + a.balance, 0);

  // Recent Transactions (Limit 10)
  const recentTransactions = await prisma.journalEntryLine.findMany({
    where: {
      accountId: { in: glAccountIds },
      journalEntry: { status: EntryStatus.posted },
    },
    include: {
      journalEntry: {
        include: {
          cashTransaction: {
            include: {
              contact: true,
            },
          },
        },
      },
      account: true,
    },
    orderBy: {
      journalEntry: { transactionDate: "desc" },
    },
    take: 10,
  });

  return {
    accounts: accountsWithBalance,
    summary: {
      totalBalance: totalCash + totalBank,
      totalCash,
      totalBank,
    },
    recentTransactions: SuperJSON.serialize(recentTransactions),
  };
}

export async function getCashAccounts() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "cash_bank.view")) {
    return [];
  }
  const accounts = await prisma.cashAccount.findMany({
    include: {
      glAccount: true,
    },
    orderBy: {
      name: "asc",
    },
  });
  return accounts;
}

export async function getCashAccount(id: string) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "cash_bank.view")) {
    return null;
  }
  const account = await prisma.cashAccount.findUnique({
    where: { id },
    include: {
      glAccount: true,
    },
  });
  return account;
}

export async function createCashAccount(data: CashAccountFormData) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "cash_bank.create")) {
    throw new Error("Unauthorized");
  }
  const account = await CashAccountService.createAccount(data);
  revalidatePath("/accounting/cash-bank");
  return account;
}

export async function updateCashAccount(
  id: string,
  data: UpdateCashAccountFormData,
): Promise<ActionResponse<{}>> {
  try {
    const session = await getSession();
    if (!session || !hasPermission(session.permissions, "cash_bank.edit")) {
      return { success: false, error: "Unauthorized" };
    }
    await prisma.cashAccount.update({
      where: { id },
      data,
    });
    revalidatePath("/accounting/cash-bank");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function deleteCashAccount(id: string) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "cash_bank.delete")) {
    throw new Error("Unauthorized");
  }
  await CashAccountService.deleteAccount(id);
  revalidatePath("/accounting/cash-bank");
}

// --- Transfer Actions ---

export async function createCashTransfer(
  data: CashTransferFormData | SuperJSONResult,
) {
  const sessionPerm = await getSession();
  if (!sessionPerm || !hasPermission(sessionPerm.permissions, "cash_bank.create")) {
    throw new Error("Unauthorized");
  }
  const session = await verifySession();
  const userId = session.userId;

  const data2 = SuperJSON.deserialize(
    data as unknown as SuperJSONResult,
  ) as CashTransferFormData;

  // Validate with Zod
  const validatedData = cashTransferSchema.parse(data2);

  const transfer = await CashTransferService.createTransfer(validatedData);

  revalidatePath("/accounting/cash-bank");
  revalidatePath("/accounting/transfer");
  return transfer;
}

export async function updateCashTransfer(
  id: string,
  data: CashTransferFormData | SuperJSONResult,
) {
  const sessionPerm = await getSession();
  if (!sessionPerm || !hasPermission(sessionPerm.permissions, "cash_bank.edit")) {
    throw new Error("Unauthorized");
  }
  const data2 = SuperJSON.deserialize(
    data as unknown as SuperJSONResult,
  ) as CashTransferFormData;

  // Validate with Zod
  const validatedData = cashTransferSchema.parse(data2);

  const updatedTransfer = await CashTransferService.updateTransfer(
    id,
    validatedData,
  );

  revalidatePath("/accounting/cash-bank");
  revalidatePath("/accounting/transfer");
  return updatedTransfer;
}

export async function approveCashTransfer(
  id: string,
): Promise<ActionResponse<CashTransferOutboxResult>> {
  try {
    const session = await verifySession();
    const userId = session.userId;

    const result = await CashTransferService.approveTransfer(id, userId);

    if (result.alreadyQueued) {
      return {
        success: true,
        data: { transferId: id, outboxId: result.outboxId, processed: false, alreadyQueued: true },
      };
    }

    const processed = await maybeProcessIntegrationOutboxEvent(result.outboxId);

    revalidatePath("/accounting/cash-bank");
    revalidatePath("/accounting/transfer");
    return {
      success: true,
      data: { transferId: id, outboxId: result.outboxId, processed: processed.processed },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to approve transfer",
    };
  }
}

export async function deleteCashTransfer(id: string) {
  await CashTransferService.deleteTransfer(id);

  revalidatePath("/accounting/cash-bank");
  revalidatePath("/accounting/transfer");
}

export async function getTransfers(search: string = "") {
  const where: Prisma.CashTransferWhereInput = search
    ? {
      OR: [
        { description: { contains: search, mode: "insensitive" } },
        { fromAccount: { name: { contains: search, mode: "insensitive" } } },
        { toAccount: { name: { contains: search, mode: "insensitive" } } },
      ],
    }
    : {};

  const transfers = await prisma.cashTransfer.findMany({
    where,
    include: {
      fromAccount: true,
      toAccount: true,
      journalEntry: {
        include: {
          attachments: true,
        },
      },
    },
    orderBy: {
      date: "desc",
    },
  });
  return SuperJSON.serialize(transfers);
}

export async function getCashTransfers(accountId?: string) {
  const where = accountId
    ? {
      OR: [{ fromAccountId: accountId }, { toAccountId: accountId }],
    }
    : {};

  const transfers = await prisma.cashTransfer.findMany({
    where,
    include: {
      fromAccount: true,
      toAccount: true,
      journalEntry: {
        include: {
          attachments: true,
        },
      },
    },
    orderBy: {
      date: "desc",
    },
  });
  return transfers;
}

export async function getCashAccountDetails(
  id: string,
  params?: {
    page?: number;
    pageSize?: number;
    startDate?: Date;
    endDate?: Date;
  },
) {
  const { page = 1, pageSize = 20, startDate, endDate } = params || {};
  const skip = (page - 1) * pageSize;

  const account = await prisma.cashAccount.findUnique({
    where: { id },
    include: {
      glAccount: true,
    },
  });

  if (!account) return null;

  const where: Prisma.JournalEntryLineWhereInput = {
    accountId: account.glAccountId,
    journalEntry: {
      status: EntryStatus.posted,
      transactionDate: {
        gte: startDate,
        lte: endDate,
      },
    },
  };

  // Get total count for pagination
  const totalCount = await prisma.journalEntryLine.count({ where });

  // Fetch paginated lines
  const lines = await prisma.journalEntryLine.findMany({
    where,
    include: {
      journalEntry: {
        include: {
          attachments: true,
        },
      },
    },
    orderBy: [
      {
        journalEntry: {
          transactionDate: "desc",
        },
      },
      {
        id: "desc",
      },
    ],
    take: pageSize,
    skip,
  });

  let linesWithBalance: (Omit<JournalEntryLine, "runningBalance"> & {
    journalEntry: JournalEntry;
    runningBalance: number;
  })[] = [];

  if (lines.length > 0) {
    const lastLine = lines[lines.length - 1];

    // Calculate base balance (sum of all OLDER transactions)
    // Older means: date < lastLine.date OR (date = lastLine.date AND id < lastLine.id)
    const olderWhere: Prisma.JournalEntryLineWhereInput = {
      accountId: account.glAccountId,
      journalEntry: {
        status: EntryStatus.posted,
      },
      OR: [
        {
          journalEntry: {
            transactionDate: {
              lt: lastLine.journalEntry.transactionDate,
            },
          },
        },
        {
          journalEntry: {
            transactionDate: lastLine.journalEntry.transactionDate,
            id: {
              lt: lastLine.id,
            },
          },
        },
      ],
    };

    const aggregations = await prisma.journalEntryLine.aggregate({
      where: olderWhere,
      _sum: {
        debitAmount: true,
        creditAmount: true,
      },
    });

    let currentRunningBalance =
      Number(aggregations._sum?.debitAmount ?? 0) -
      Number(aggregations._sum?.creditAmount ?? 0);

    // Now iterate lines in reverse (oldest to newest) to calculate running balance
    linesWithBalance = lines.reverse().map((line) => {
      const debit = Number(line.debitAmount);
      const credit = Number(line.creditAmount);
      currentRunningBalance += debit - credit;

      const { runningBalance, ...rest } = line as any;
      return {
        ...rest,
        runningBalance: currentRunningBalance,
      };
    });

    // Reverse back to DESC for display
    linesWithBalance.reverse();
  }

  // Calculate total current balance for the account (all time)
  const totalBalanceAgg = await prisma.journalEntryLine.aggregate({
    where: {
      accountId: account.glAccountId,
      journalEntry: { status: EntryStatus.posted },
    },
    _sum: { debitAmount: true, creditAmount: true },
  });

  const totalBalance =
    Number(totalBalanceAgg._sum.debitAmount ?? 0) -
    Number(totalBalanceAgg._sum.creditAmount ?? 0);

  // Calculate period totals (filtered)
  const periodAgg = await prisma.journalEntryLine.aggregate({
    where,
    _sum: { debitAmount: true, creditAmount: true },
  });

  const periodTotals = {
    debit: Number(periodAgg._sum.debitAmount ?? 0),
    credit: Number(periodAgg._sum.creditAmount ?? 0),
  };

  return {
    account,
    lines: linesWithBalance,
    totalCount,
    totalBalance,
    periodTotals,
  };
}
