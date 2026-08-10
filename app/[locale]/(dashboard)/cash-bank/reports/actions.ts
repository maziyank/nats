"use server";

import { prisma } from "@/services/lib/prisma";
import { EntryStatus } from "@/prisma/generated/prisma/enums";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";
import { Decimal } from "decimal.js";

export interface CashBalanceReportEntry {
  accountId: string;
  accountName: string;
  accountType: string;
  accountNumber: string | null;
  bankName: string | null;
  glAccountId: string;
  beginningBalance: number;
  totalIn: number;
  totalOut: number;
  endingBalance: number;
}

export interface CashBalanceReportResult {
  entries: CashBalanceReportEntry[];
  totals: {
    beginningBalance: number;
    totalIn: number;
    totalOut: number;
    endingBalance: number;
  };
}

/**
 * Cash Balance Report filtered by period.
 * For each cash/bank account, computes:
 *   - beginning balance (sum of all posted journal lines before startDate)
 *   - in  (debit movements within the period — cash received)
 *   - out (credit movements within the period — cash paid out)
 *   - ending balance (beginning + in - out)
 */
export async function getCashBalanceReport(
  startDate: Date,
  endDate: Date,
): Promise<CashBalanceReportResult> {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "cash_bank.view")) {
    throw new Error("Unauthorized");
  }

  const accounts = await prisma.cashAccount.findMany({
    where: { isActive: true },
    include: { glAccount: true },
    orderBy: { name: "asc" },
  });

  if (accounts.length === 0) {
    return {
      entries: [],
      totals: {
        beginningBalance: 0,
        totalIn: 0,
        totalOut: 0,
        endingBalance: 0,
      },
    };
  }

  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);

  const entries: CashBalanceReportEntry[] = await Promise.all(
    accounts.map(async (account) => {
      const glAccountId = account.glAccountId;

      // Beginning balance = sum of all posted lines with transactionDate < startDate
      const beginningAgg = await prisma.journalEntryLine.aggregate({
        where: {
          accountId: glAccountId,
          journalEntry: {
            status: EntryStatus.posted,
            transactionDate: { lt: startDate },
          },
        },
        _sum: { debitAmount: true, creditAmount: true },
      });

      const beginningBalance = new Decimal(
        beginningAgg._sum.debitAmount ?? 0,
      ).minus(new Decimal(beginningAgg._sum.creditAmount ?? 0)).toNumber();

      // Period movements
      const periodAgg = await prisma.journalEntryLine.aggregate({
        where: {
          accountId: glAccountId,
          journalEntry: {
            status: EntryStatus.posted,
            transactionDate: { gte: startDate, lte: endOfDay },
          },
        },
        _sum: { debitAmount: true, creditAmount: true },
      });

      const totalIn = new Decimal(
        periodAgg._sum.debitAmount ?? 0,
      ).toNumber();
      const totalOut = new Decimal(
        periodAgg._sum.creditAmount ?? 0,
      ).toNumber();

      const endingBalance = beginningBalance + totalIn - totalOut;

      return {
        accountId: account.id,
        accountName: account.name,
        accountType: account.type,
        accountNumber: account.accountNumber,
        bankName: account.bankName,
        glAccountId,
        beginningBalance,
        totalIn,
        totalOut,
        endingBalance,
      };
    }),
  );

  const totals = entries.reduce(
    (acc, e) => {
      acc.beginningBalance += e.beginningBalance;
      acc.totalIn += e.totalIn;
      acc.totalOut += e.totalOut;
      acc.endingBalance += e.endingBalance;
      return acc;
    },
    {
      beginningBalance: 0,
      totalIn: 0,
      totalOut: 0,
      endingBalance: 0,
    },
  );

  return { entries, totals };
}

export interface CashAccountPeriodBalancePoint {
  period: string; // e.g. "2026-01"
  periodLabel: string; // e.g. "Jan 2026"
  balance: number;
}

export interface CashAccountPeriodBalanceSeries {
  accountId: string;
  accountName: string;
  accountType: string;
  data: CashAccountPeriodBalancePoint[];
}

export interface CashAccountPeriodBalanceReportResult {
  series: CashAccountPeriodBalanceSeries[];
  periods: { period: string; periodLabel: string }[];
  totals: CashAccountPeriodBalancePoint[];
}

/**
 * Cash Account Balance per Period report.
 * For each cash/bank account, computes the ending balance for each month
 * in the [startDate, endDate] range. Also produces a combined total series.
 *
 * The balance for a given month-end is the cumulative sum of all posted
 * journal lines (debit - credit) up to and including the last day of that month.
 */
export async function getCashAccountBalancePerPeriod(
  startDate: Date,
  endDate: Date,
): Promise<CashAccountPeriodBalanceReportResult> {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "cash_bank.view")) {
    throw new Error("Unauthorized");
  }

  const accounts = await prisma.cashAccount.findMany({
    where: { isActive: true },
    include: { glAccount: true },
    orderBy: { name: "asc" },
  });

  // Build the list of month-end boundaries in the range
  const periods: { period: string; periodLabel: string; boundary: Date }[] = [];
  const cursor = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );
  const endLimit = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (cursor <= endLimit) {
    // Last day of the cursor month
    const boundary = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const period = `${cursor.getFullYear()}-${String(
      cursor.getMonth() + 1,
    ).padStart(2, "0")}`;
    const periodLabel = cursor.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
    periods.push({ period, periodLabel, boundary });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  if (accounts.length === 0 || periods.length === 0) {
    return { series: [], periods: [], totals: [] };
  }

  const series: CashAccountPeriodBalanceSeries[] = await Promise.all(
    accounts.map(async (account) => {
      // Cumulative balance up to each month boundary
      const data = await Promise.all(
        periods.map(async (p) => {
          const agg = await prisma.journalEntryLine.aggregate({
            where: {
              accountId: account.glAccountId,
              journalEntry: {
                status: EntryStatus.posted,
                transactionDate: { lte: p.boundary },
              },
            },
            _sum: { debitAmount: true, creditAmount: true },
          });
          const balance = new Decimal(
            agg._sum.debitAmount ?? 0,
          ).minus(new Decimal(agg._sum.creditAmount ?? 0)).toNumber();
          return {
            period: p.period,
            periodLabel: p.periodLabel,
            balance,
          };
        }),
      );

      return {
        accountId: account.id,
        accountName: account.name,
        accountType: account.type,
        data,
      };
    }),
  );

  // Combined total across all accounts per period
  const totals: CashAccountPeriodBalancePoint[] = periods.map((p, idx) => {
    const total = series.reduce(
      (sum, s) => sum + (s.data[idx]?.balance ?? 0),
      0,
    );
    return {
      period: p.period,
      periodLabel: p.periodLabel,
      balance: total,
    };
  });

  return {
    series,
    periods: periods.map(({ period, periodLabel }) => ({
      period,
      periodLabel,
    })),
    totals,
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

async function assertCashBankView() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "cash_bank.view")) {
    throw new Error("Unauthorized");
  }
}

// ---------------------------------------------------------------------------
// Cash Flow Summary (monthly in / out / net)
// ---------------------------------------------------------------------------

export interface CashFlowSummaryPoint {
  period: string;
  periodLabel: string;
  cashIn: number;
  cashOut: number;
  net: number;
}

export interface CashFlowSummaryResult {
  points: CashFlowSummaryPoint[];
  totals: { cashIn: number; cashOut: number; net: number };
}

/**
 * Monthly cash-in / cash-out / net across all active cash/bank accounts.
 * Cash in  = total debits  to cash GL accounts in the month
 * Cash out = total credits to cash GL accounts in the month
 */
export async function getCashFlowSummaryReport(
  startDate: Date,
  endDate: Date,
): Promise<CashFlowSummaryResult> {
  await assertCashBankView();

  const accounts = await prisma.cashAccount.findMany({
    where: { isActive: true },
    select: { glAccountId: true },
  });
  const glIds = accounts.map((a) => a.glAccountId);

  if (glIds.length === 0) {
    return { points: [], totals: { cashIn: 0, cashOut: 0, net: 0 } };
  }

  // Build month list
  const months: { period: string; periodLabel: string; start: Date; end: Date }[] = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const endLimit = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  while (cursor <= endLimit) {
    const mStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const mEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    const period = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const periodLabel = cursor.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
    months.push({ period, periodLabel, start: mStart, end: mEnd });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Clamp first/last month to the requested range
  if (months.length > 0) {
    if (months[0].start < startDate) months[0].start = startDate;
    const last = months[months.length - 1];
    const eod = endOfDay(endDate);
    if (last.end > eod) last.end = eod;
  }

  const points: CashFlowSummaryPoint[] = await Promise.all(
    months.map(async (m) => {
      const agg = await prisma.journalEntryLine.aggregate({
        where: {
          accountId: { in: glIds },
          journalEntry: {
            status: EntryStatus.posted,
            transactionDate: { gte: m.start, lte: m.end },
          },
        },
        _sum: { debitAmount: true, creditAmount: true },
      });
      const cashIn = new Decimal(agg._sum.debitAmount ?? 0).toNumber();
      const cashOut = new Decimal(agg._sum.creditAmount ?? 0).toNumber();
      return {
        period: m.period,
        periodLabel: m.periodLabel,
        cashIn,
        cashOut,
        net: cashIn - cashOut,
      };
    }),
  );

  const totals = points.reduce(
    (acc, p) => {
      acc.cashIn += p.cashIn;
      acc.cashOut += p.cashOut;
      acc.net += p.net;
      return acc;
    },
    { cashIn: 0, cashOut: 0, net: 0 },
  );

  return { points, totals };
}

// ---------------------------------------------------------------------------
// Expense / Income by Allocation Account
// ---------------------------------------------------------------------------

export interface AllocationByAccountEntry {
  accountId: string;
  accountCode: string;
  accountName: string;
  transactionCount: number;
  totalAmount: number;
}

export interface AllocationByAccountResult {
  entries: AllocationByAccountEntry[];
  totalAmount: number;
}

/**
 * Groups cash transaction allocations by the GL account they hit.
 * type = "EXPENSE" → cash out allocations; type = "INCOME" → cash in allocations.
 * Only includes APPROVED transactions within the date range.
 */
export async function getAllocationByAccountReport(
  startDate: Date,
  endDate: Date,
  type: "EXPENSE" | "INCOME",
): Promise<AllocationByAccountResult> {
  await assertCashBankView();

  const eod = endOfDay(endDate);

  const allocations = await prisma.cashTransactionAllocation.findMany({
    where: {
      transaction: {
        type,
        status: "APPROVED",
        date: { gte: startDate, lte: eod },
      },
    },
    include: {
      account: { select: { id: true, code: true, name: true } },
    },
  });

  const map = new Map<
    string,
    { accountCode: string; accountName: string; count: number; total: Decimal }
  >();

  for (const alloc of allocations) {
    const existing = map.get(alloc.accountId);
    if (existing) {
      existing.count += 1;
      existing.total = existing.total.plus(new Decimal(alloc.amount));
    } else {
      map.set(alloc.accountId, {
        accountCode: alloc.account.code,
        accountName: alloc.account.name,
        count: 1,
        total: new Decimal(alloc.amount),
      });
    }
  }

  const entries: AllocationByAccountEntry[] = Array.from(map.entries())
    .map(([accountId, v]) => ({
      accountId,
      accountCode: v.accountCode,
      accountName: v.accountName,
      transactionCount: v.count,
      totalAmount: v.total.toNumber(),
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const totalAmount = entries.reduce((s, e) => s + e.totalAmount, 0);
  return { entries, totalAmount };
}

// ---------------------------------------------------------------------------
// Transfer Report
// ---------------------------------------------------------------------------

export interface TransferReportEntry {
  id: string;
  date: Date;
  fromAccountName: string;
  toAccountName: string;
  amount: number;
  reference: string | null;
  description: string | null;
  status: string;
}

export interface TransferReportResult {
  entries: TransferReportEntry[];
  totals: {
    totalAmount: number;
    approvedAmount: number;
    pendingAmount: number;
    count: number;
  };
}

/**
 * Lists all cash transfers within a date range, with amount totals by status.
 */
export async function getTransferReport(
  startDate: Date,
  endDate: Date,
): Promise<TransferReportResult> {
  await assertCashBankView();

  const eod = endOfDay(endDate);

  const transfers = await prisma.cashTransfer.findMany({
    where: {
      date: { gte: startDate, lte: eod },
    },
    include: {
      fromAccount: { select: { name: true } },
      toAccount: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });

  const entries: TransferReportEntry[] = transfers.map((t) => ({
    id: t.id,
    date: t.date,
    fromAccountName: t.fromAccount.name,
    toAccountName: t.toAccount.name,
    amount: new Decimal(t.amount).toNumber(),
    reference: t.reference,
    description: t.description,
    status: t.status,
  }));

  const totals = entries.reduce(
    (acc, e) => {
      acc.totalAmount += e.amount;
      acc.count += 1;
      if (e.status === "APPROVED") acc.approvedAmount += e.amount;
      if (e.status === "PENDING") acc.pendingAmount += e.amount;
      return acc;
    },
    { totalAmount: 0, approvedAmount: 0, pendingAmount: 0, count: 0 },
  );

  return { entries, totals };
}

// ---------------------------------------------------------------------------
// Cash by Contact
// ---------------------------------------------------------------------------

export interface CashByContactEntry {
  contactId: string | null;
  contactName: string;
  incomeAmount: number;
  expenseAmount: number;
  netAmount: number;
  transactionCount: number;
}

export interface CashByContactResult {
  entries: CashByContactEntry[];
  totals: {
    incomeAmount: number;
    expenseAmount: number;
    netAmount: number;
    transactionCount: number;
  };
}

/**
 * Aggregates approved cash transactions by contact (INCOME vs EXPENSE).
 * Transactions without a contact are grouped under a "No Contact" row.
 */
export async function getCashByContactReport(
  startDate: Date,
  endDate: Date,
): Promise<CashByContactResult> {
  await assertCashBankView();

  const eod = endOfDay(endDate);

  const transactions = await prisma.cashTransaction.findMany({
    where: {
      status: "APPROVED",
      date: { gte: startDate, lte: eod },
    },
    include: {
      contact: { select: { id: true, name: true } },
      allocations: { select: { amount: true } },
    },
  });

  const map = new Map<
    string,
    {
      contactId: string | null;
      contactName: string;
      income: Decimal;
      expense: Decimal;
      count: number;
    }
  >();

  for (const tx of transactions) {
    const key = tx.contactId ?? "__none__";
    const amount = tx.allocations.reduce(
      (s, a) => s.plus(new Decimal(a.amount)),
      new Decimal(0),
    );
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (tx.type === "INCOME") existing.income = existing.income.plus(amount);
      else existing.expense = existing.expense.plus(amount);
    } else {
      map.set(key, {
        contactId: tx.contactId,
        contactName: tx.contact?.name ?? "—",
        income: tx.type === "INCOME" ? amount : new Decimal(0),
        expense: tx.type === "EXPENSE" ? amount : new Decimal(0),
        count: 1,
      });
    }
  }

  const entries: CashByContactEntry[] = Array.from(map.values())
    .map((v) => ({
      contactId: v.contactId,
      contactName: v.contactName,
      incomeAmount: v.income.toNumber(),
      expenseAmount: v.expense.toNumber(),
      netAmount: v.income.minus(v.expense).toNumber(),
      transactionCount: v.count,
    }))
    .sort(
      (a, b) =>
        Math.abs(b.incomeAmount) +
        Math.abs(b.expenseAmount) -
        (Math.abs(a.incomeAmount) + Math.abs(a.expenseAmount)),
    );

  const totals = entries.reduce(
    (acc, e) => {
      acc.incomeAmount += e.incomeAmount;
      acc.expenseAmount += e.expenseAmount;
      acc.netAmount += e.netAmount;
      acc.transactionCount += e.transactionCount;
      return acc;
    },
    { incomeAmount: 0, expenseAmount: 0, netAmount: 0, transactionCount: 0 },
  );

  return { entries, totals };
}

// ---------------------------------------------------------------------------
// Daily Cash Movement
// ---------------------------------------------------------------------------

export interface DailyMovementEntry {
  date: string; // YYYY-MM-DD
  cashIn: number;
  cashOut: number;
  net: number;
  transactionCount: number;
}

export interface DailyMovementResult {
  entries: DailyMovementEntry[];
  totals: {
    cashIn: number;
    cashOut: number;
    net: number;
    transactionCount: number;
  };
}

/**
 * Daily cash in / out / net from posted journal lines on cash/bank GL accounts.
 */
export async function getDailyCashMovementReport(
  startDate: Date,
  endDate: Date,
): Promise<DailyMovementResult> {
  await assertCashBankView();

  const accounts = await prisma.cashAccount.findMany({
    where: { isActive: true },
    select: { glAccountId: true },
  });
  const glIds = accounts.map((a) => a.glAccountId);

  if (glIds.length === 0) {
    return {
      entries: [],
      totals: { cashIn: 0, cashOut: 0, net: 0, transactionCount: 0 },
    };
  }

  const eod = endOfDay(endDate);

  const lines = await prisma.journalEntryLine.findMany({
    where: {
      accountId: { in: glIds },
      journalEntry: {
        status: EntryStatus.posted,
        transactionDate: { gte: startDate, lte: eod },
      },
    },
    select: {
      debitAmount: true,
      creditAmount: true,
      journalEntry: { select: { transactionDate: true } },
    },
  });

  const map = new Map<
    string,
    { cashIn: Decimal; cashOut: Decimal; count: number }
  >();

  for (const line of lines) {
    const d = line.journalEntry.transactionDate;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const existing = map.get(key);
    const debit = new Decimal(line.debitAmount ?? 0);
    const credit = new Decimal(line.creditAmount ?? 0);
    if (existing) {
      existing.cashIn = existing.cashIn.plus(debit);
      existing.cashOut = existing.cashOut.plus(credit);
      existing.count += 1;
    } else {
      map.set(key, { cashIn: debit, cashOut: credit, count: 1 });
    }
  }

  const entries: DailyMovementEntry[] = Array.from(map.entries())
    .map(([date, v]) => ({
      date,
      cashIn: v.cashIn.toNumber(),
      cashOut: v.cashOut.toNumber(),
      net: v.cashIn.minus(v.cashOut).toNumber(),
      transactionCount: v.count,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const totals = entries.reduce(
    (acc, e) => {
      acc.cashIn += e.cashIn;
      acc.cashOut += e.cashOut;
      acc.net += e.net;
      acc.transactionCount += e.transactionCount;
      return acc;
    },
    { cashIn: 0, cashOut: 0, net: 0, transactionCount: 0 },
  );

  return { entries, totals };
}

// ---------------------------------------------------------------------------
// Cash by Department / Project
// ---------------------------------------------------------------------------

export interface CashByDimensionEntry {
  dimensionId: string | null;
  dimensionName: string;
  incomeAmount: number;
  expenseAmount: number;
  netAmount: number;
  transactionCount: number;
}

export interface CashByDimensionResult {
  entries: CashByDimensionEntry[];
  totals: {
    incomeAmount: number;
    expenseAmount: number;
    netAmount: number;
    transactionCount: number;
  };
}

/**
 * Aggregates approved cash transactions by department or project.
 */
export async function getCashByDimensionReport(
  startDate: Date,
  endDate: Date,
  dimension: "department" | "project",
): Promise<CashByDimensionResult> {
  await assertCashBankView();

  const eod = endOfDay(endDate);

  const transactions = await prisma.cashTransaction.findMany({
    where: {
      status: "APPROVED",
      date: { gte: startDate, lte: eod },
    },
    include: {
      department: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      allocations: { select: { amount: true } },
    },
  });

  const map = new Map<
    string,
    {
      dimensionId: string | null;
      dimensionName: string;
      income: Decimal;
      expense: Decimal;
      count: number;
    }
  >();

  for (const tx of transactions) {
    const dim =
      dimension === "department"
        ? { id: tx.departmentId, name: tx.department?.name }
        : { id: tx.projectId, name: tx.project?.name };
    const key = dim.id ?? "__none__";
    const amount = tx.allocations.reduce(
      (s, a) => s.plus(new Decimal(a.amount)),
      new Decimal(0),
    );
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (tx.type === "INCOME") existing.income = existing.income.plus(amount);
      else existing.expense = existing.expense.plus(amount);
    } else {
      map.set(key, {
        dimensionId: dim.id,
        dimensionName: dim.name ?? "—",
        income: tx.type === "INCOME" ? amount : new Decimal(0),
        expense: tx.type === "EXPENSE" ? amount : new Decimal(0),
        count: 1,
      });
    }
  }

  const entries: CashByDimensionEntry[] = Array.from(map.values())
    .map((v) => ({
      dimensionId: v.dimensionId,
      dimensionName: v.dimensionName,
      incomeAmount: v.income.toNumber(),
      expenseAmount: v.expense.toNumber(),
      netAmount: v.income.minus(v.expense).toNumber(),
      transactionCount: v.count,
    }))
    .sort(
      (a, b) =>
        Math.abs(b.incomeAmount) +
        Math.abs(b.expenseAmount) -
        (Math.abs(a.incomeAmount) + Math.abs(a.expenseAmount)),
    );

  const totals = entries.reduce(
    (acc, e) => {
      acc.incomeAmount += e.incomeAmount;
      acc.expenseAmount += e.expenseAmount;
      acc.netAmount += e.netAmount;
      acc.transactionCount += e.transactionCount;
      return acc;
    },
    { incomeAmount: 0, expenseAmount: 0, netAmount: 0, transactionCount: 0 },
  );

  return { entries, totals };
}
