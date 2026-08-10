"use server";

import { prisma } from "@/services/lib/prisma";
import {
  getCumulativeBalancesAsOf,
  getPeriodBalances,
} from "@/services/modules/accounting/services/period-balance.service";
import { Account, ContactType } from "@/prisma/generated/prisma/client";
import { AccountType } from "@/prisma/generated/prisma/enums";
import { cache } from "react";

// --- Types ---

export type ReportDateRange = {
  startDate: string;
  endDate: string;
};

export type ReportAccountLine = {
  accountId: string;
  code: string;
  name: string;
  amount: number; // Positive for normal balance
  previousAmount?: number;
  change?: number;
  changePercentage?: number;
  level: number;
  type: string;
  children?: ReportAccountLine[];
};

export type ProfitLossReport = {
  revenue: ReportAccountLine[];
  expenses: ReportAccountLine[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  previousTotalRevenue?: number;
  previousTotalExpenses?: number;
  previousNetIncome?: number;
};

export type BalanceSheetReport = {
  assets: ReportAccountLine[];
  liabilities: ReportAccountLine[];
  equity: ReportAccountLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  previousTotalAssets?: number;
  previousTotalLiabilities?: number;
  previousTotalEquity?: number;
  previousTotalLiabilitiesAndEquity?: number;
};

export type CashFlowReport = {
  operatingActivities: ReportAccountLine[];
  investingActivities: ReportAccountLine[];
  financingActivities: ReportAccountLine[];
  netCashProvidedByOperating: number;
  netCashProvidedByInvesting: number;
  netCashProvidedByFinancing: number;
  netIncreaseInCash: number;
  cashAtBeginning: number;
  cashAtEnd: number;
  previousNetCashProvidedByOperating?: number;
  previousNetCashProvidedByInvesting?: number;
  previousNetCashProvidedByFinancing?: number;
  previousNetIncreaseInCash?: number;
  previousCashAtBeginning?: number;
  previousCashAtEnd?: number;
};

export type EquityChangeLine = {
  name: string;
  balanceBeginning: number;
  netIncome: number;
  additions: number;
  deductions: number;
  balanceEnding: number;
  // Comparative fields (optional)
  previousBalanceEnding?: number;
  change?: number;
  changePercentage?: number;
};

export type EquityChangeReport = {
  items: EquityChangeLine[];
  totalBeginning: number;
  totalNetIncome: number;
  totalAdditions: number;
  totalDeductions: number;
  totalEnding: number;
  previousTotalEnding?: number;
  change?: number;
  changePercentage?: number;
};

type AccountNode = Account & {
  amount: number;
  totalAmount: number;
  previousAmount: number;
  previousTotalAmount: number;
  children: AccountNode[];
};

// --- Helper Functions ---

// Nested reports (BS / Cash Flow / Equity) call this many times with the same
// windows; React.cache collapses duplicate work within a single request.
const getAccountBalancesCached = cache(
  async (
    startKey: string,
    endKey: string,
    typesKey: string,
  ): Promise<{
    accounts: Account[];
    balanceMap: Map<string, { debit: number; credit: number }>;
  }> => {
    const startDate = startKey === "null" ? null : new Date(startKey);
    const endDate = new Date(endKey);
    const accountTypes = typesKey
      ? (typesKey.split(",") as AccountType[])
      : undefined;

    const whereClause = accountTypes ? { type: { in: accountTypes } } : {};
    const accounts = await prisma.account.findMany({
      where: {
        isActive: true,
        ...whereClause,
      },
      orderBy: { code: "asc" },
    });

    // Prefer monthly AccountPeriodBalance snapshots + residual live scan
    // over a full journalEntryLine.groupBy over the entire history.
    const accountIds = accountTypes
      ? accounts.map((a) => a.id)
      : undefined;
    const options = accountIds ? { accountIds } : undefined;

    const balanceMap = startDate
      ? await getPeriodBalances(startDate, endDate, options)
      : await getCumulativeBalancesAsOf(endDate, options);

    return { accounts, balanceMap };
  },
);

async function getAccountBalances(
  startDate: Date | null,
  endDate: Date,
  accountTypes?: AccountType[],
) {
  const typesKey = accountTypes ? [...accountTypes].sort().join(",") : "";
  return getAccountBalancesCached(
    startDate ? startDate.toISOString() : "null",
    endDate.toISOString(),
    typesKey,
  );
}

function buildAccountHierarchy(
  accounts: Account[],
  balanceMap: Map<string, { debit: number; credit: number }>,
  previousBalanceMap: Map<string, { debit: number; credit: number }> | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  accountTypeMultiplier: (type: string) => number
) {
  const nodeMap = new Map<string, AccountNode>();

  // Initialize
  accounts.forEach((acc) => {
    const bal = balanceMap.get(acc.id) || { debit: 0, credit: 0 };
    const prevBal = previousBalanceMap?.get(acc.id) || { debit: 0, credit: 0 };

    let amount = 0;
    let previousAmount = 0;

    // Standard Accounting Logic:
    // Assets, Expenses: Debit is positive
    // Liabilities, Equity, Revenue: Credit is positive
    if (acc.type === "asset" || acc.type === "expense") {
      amount = bal.debit - bal.credit;
      previousAmount = prevBal.debit - prevBal.credit;
    } else {
      amount = bal.credit - bal.debit;
      previousAmount = prevBal.credit - prevBal.debit;
    }

    nodeMap.set(acc.id, {
      ...acc,
      amount,
      totalAmount: 0,
      previousAmount,
      previousTotalAmount: 0,
      children: [],
    });
  });

  // Build Tree
  const roots: AccountNode[] = [];

  accounts.forEach((acc) => {
    if (acc.parentId && nodeMap.has(acc.parentId)) {
      nodeMap.get(acc.parentId)!.children.push(nodeMap.get(acc.id)!);
    } else {
      roots.push(nodeMap.get(acc.id)!);
    }
  });

  // Calculate Totals
  function calculateTotal(node: AccountNode) {
    let sum = node.amount;
    let prevSum = node.previousAmount;

    for (const child of node.children) {
      calculateTotal(child);
      sum += child.totalAmount;
      prevSum += child.previousTotalAmount;
    }
    node.totalAmount = sum;
    node.previousTotalAmount = prevSum;
  }

  roots.forEach((root) => calculateTotal(root));

  // Map to ReportAccountLine
  function mapToLine(node: AccountNode): ReportAccountLine {
    const change = previousBalanceMap
      ? node.totalAmount - node.previousTotalAmount
      : undefined;
    const changePercentage =
      previousBalanceMap && node.previousTotalAmount !== 0
        ? (change! / Math.abs(node.previousTotalAmount)) * 100
        : 0;

    return {
      accountId: node.id,
      code: node.code,
      name: node.name,
      amount: node.totalAmount,
      previousAmount: previousBalanceMap ? node.previousTotalAmount : undefined,
      change,
      changePercentage,
      level: node.level,
      type: node.type,
      children: node.children.map(mapToLine),
    };
  }

  return roots.map(mapToLine);
}

// --- Log Helper ---
async function logReportGeneration(
  userId: string,
  reportName: string,
  format: string,
  status: "SUCCESS" | "FAILED",
  parameters?: any,
  executionTimeMs?: number,
  errorMessage?: string
) {
  try {
    // Find or create a template for tracking
    const template = await prisma.reportTemplate.upsert({
      where: { code: reportName },
      update: {},
      create: {
        code: reportName,
        name: reportName,
        module: "ACCOUNTING",
        isSystem: true,
      },
    });

    await prisma.reportLog.create({
      data: {
        userId,
        templateId: template.id,
        status,
        format,
        parameters: parameters ? JSON.stringify(parameters) : undefined,
        executionTimeMs,
        errorMessage,
      },
    });
  } catch (e) {
    console.error("Failed to log report generation:", e);
  }
}

import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { getSession } from "@/services/lib/auth/auth";

/**
 * Generate Profit & Loss (Income Statement) report.
 * Shows Revenue, Expenses, and Net Income for a specific period.
 * Supports comparative analysis with a previous period.
 * Permission: "reports.view"
 *
 * @param startDate            - Start date of the period
 * @param endDate              - End date of the period
 * @param comparativeStartDate - Optional start date for comparison
 * @param comparativeEndDate   - Optional end date for comparison
 * @returns                    - Hierarchical report data
 */
export async function getProfitAndLoss(
  startDate: string,
  endDate: string,
  comparativeStartDate?: string,
  comparativeEndDate?: string
) {
  const start = Date.now();
  const session = await getSession();

  return authorizedAction(
    "reports.view",
    async (
      startDate: string,
      endDate: string,
      comparativeStartDate?: string,
      comparativeEndDate?: string
    ) => {
      try {
        const data = await _getProfitAndLoss(
          startDate,
          endDate,
          comparativeStartDate,
          comparativeEndDate
        );

        if (session) {
          await logReportGeneration(
            session.userId,
            "PROFIT_AND_LOSS",
            "JSON",
            "SUCCESS",
            { startDate, endDate, comparativeStartDate, comparativeEndDate },
            Date.now() - start
          );
        }

        return { success: true, data };
      } catch (error) {
        console.error(error);
        if (session) {
          await logReportGeneration(
            session.userId,
            "PROFIT_AND_LOSS",
            "JSON",
            "FAILED",
            { startDate, endDate },
            Date.now() - start,
            error instanceof Error ? error.message : "Unknown error"
          );
        }
        return {
          success: false,
          error: "Failed to generate Profit & Loss report",
        };
      }
    }
  )(startDate, endDate, comparativeStartDate, comparativeEndDate);
}

async function _getProfitAndLoss(
  startDate: string,
  endDate: string,
  comparativeStartDate?: string,
  comparativeEndDate?: string
): Promise<ProfitLossReport> {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const [currentBalances, previousBalances] = await Promise.all([
    getAccountBalances(start, end, ["revenue", "expense"]),
    comparativeStartDate && comparativeEndDate
      ? getAccountBalances(
          new Date(comparativeStartDate),
          new Date(comparativeEndDate),
          ["revenue", "expense"],
        )
      : Promise.resolve(null),
  ]);
  const { accounts, balanceMap } = currentBalances;
  const previousBalanceMap = previousBalances?.balanceMap ?? null;

  const revenueAccounts = accounts.filter((a) => a.type === "revenue");
  const expenseAccounts = accounts.filter((a) => a.type === "expense");

  const revenueTree = buildAccountHierarchy(
    revenueAccounts,
    balanceMap,
    previousBalanceMap,
    () => 1
  );
  const expenseTree = buildAccountHierarchy(
    expenseAccounts,
    balanceMap,
    previousBalanceMap,
    () => 1
  );

  const totalRevenue = revenueTree.reduce((sum, node) => sum + node.amount, 0);
  const totalExpenses = expenseTree.reduce((sum, node) => sum + node.amount, 0);
  const netIncome = totalRevenue - totalExpenses;

  let previousTotalRevenue: number | undefined;
  let previousTotalExpenses: number | undefined;
  let previousNetIncome: number | undefined;

  if (previousBalanceMap) {
    previousTotalRevenue = revenueTree.reduce(
      (sum, node) => sum + (node.previousAmount || 0),
      0
    );
    previousTotalExpenses = expenseTree.reduce(
      (sum, node) => sum + (node.previousAmount || 0),
      0
    );
    previousNetIncome = previousTotalRevenue - previousTotalExpenses;
  }

  return {
    revenue: revenueTree,
    expenses: expenseTree,
    totalRevenue,
    totalExpenses,
    netIncome,
    previousTotalRevenue,
    previousTotalExpenses,
    previousNetIncome,
  };
}

export async function getBalanceSheet(date: string, comparativeDate?: string) {
  const start = Date.now();
  const session = await getSession();

  return authorizedAction(
    "reports.view",
    async (date: string, comparativeDate?: string) => {
      try {
        const data = await _getBalanceSheet(date, comparativeDate);
        if (session) {
          await logReportGeneration(
            session.userId,
            "BALANCE_SHEET",
            "JSON",
            "SUCCESS",
            { date, comparativeDate },
            Date.now() - start
          );
        }
        return { success: true, data };
      } catch (error) {
        console.error(error);
        if (session) {
          await logReportGeneration(
            session.userId,
            "BALANCE_SHEET",
            "JSON",
            "FAILED",
            { date },
            Date.now() - start,
            error instanceof Error ? error.message : "Unknown error"
          );
        }
        return { success: false, error: "Failed to generate Balance Sheet" };
      }
    }
  )(date, comparativeDate);
}

async function _getBalanceSheet(
  date: string,
  comparativeDate?: string
): Promise<BalanceSheetReport> {
  const asOf = new Date(date);
  const prevAsOf = comparativeDate ? new Date(comparativeDate) : null;

  // Fetch BS + P&L (retained earnings) windows in parallel; comparative too.
  const [mainResult, plResult, prevMainResult, prevPlResult] =
    await Promise.all([
      getAccountBalances(null, asOf, ["asset", "liability", "equity"]),
      getAccountBalances(null, asOf, ["revenue", "expense"]),
      prevAsOf
        ? getAccountBalances(null, prevAsOf, ["asset", "liability", "equity"])
        : Promise.resolve(null),
      prevAsOf
        ? getAccountBalances(null, prevAsOf, ["revenue", "expense"])
        : Promise.resolve(null),
    ]);

  const { accounts, balanceMap } = mainResult;
  const previousBalanceMap = prevMainResult?.balanceMap ?? null;
  const { accounts: plAccounts, balanceMap: plBalanceMap } = plResult;
  const prevPlBalanceMap = prevPlResult?.balanceMap ?? null;

  function calculateRE(
    accounts: Account[],
    balMap: Map<string, { debit: number; credit: number }>
  ) {
    let re = 0;
    accounts.forEach((acc) => {
      const bal = balMap.get(acc.id) || { debit: 0, credit: 0 };
      if (acc.type === "revenue") {
        re += bal.credit - bal.debit;
      } else {
        re -= bal.debit - bal.credit;
      }
    });
    return re;
  }

  const retainedEarnings = calculateRE(plAccounts, plBalanceMap);
  const previousRetainedEarnings = prevPlBalanceMap
    ? calculateRE(plAccounts, prevPlBalanceMap)
    : 0;

  const assetTree = buildAccountHierarchy(
    accounts.filter((a) => a.type === "asset"),
    balanceMap,
    previousBalanceMap,
    () => 1
  );
  const liabilityTree = buildAccountHierarchy(
    accounts.filter((a) => a.type === "liability"),
    balanceMap,
    previousBalanceMap,
    () => 1
  );
  const equityTree = buildAccountHierarchy(
    accounts.filter((a) => a.type === "equity"),
    balanceMap,
    previousBalanceMap,
    () => 1
  );

  const totalAssets = assetTree.reduce((sum, node) => sum + node.amount, 0);
  const totalLiabilities = liabilityTree.reduce(
    (sum, node) => sum + node.amount,
    0
  );
  let totalEquity = equityTree.reduce((sum, node) => sum + node.amount, 0);

  const previousTotalAssets = previousBalanceMap
    ? assetTree.reduce((sum, node) => sum + (node.previousAmount || 0), 0)
    : undefined;
  const previousTotalLiabilities = previousBalanceMap
    ? liabilityTree.reduce((sum, node) => sum + (node.previousAmount || 0), 0)
    : undefined;
  let previousTotalEquity = previousBalanceMap
    ? equityTree.reduce((sum, node) => sum + (node.previousAmount || 0), 0)
    : undefined;

  const retainedEarningsLine: ReportAccountLine = {
    accountId: "calculated-retained-earnings",
    code: "99999",
    name: "Retained Earnings / Net Income",
    amount: retainedEarnings,
    previousAmount: previousBalanceMap ? previousRetainedEarnings : undefined,
    level: 0,
    type: "equity",
    children: [],
  };

  // Add change fields for RE
  if (previousBalanceMap) {
    retainedEarningsLine.change = retainedEarnings - previousRetainedEarnings;
    retainedEarningsLine.changePercentage =
      previousRetainedEarnings !== 0
        ? (retainedEarningsLine.change / Math.abs(previousRetainedEarnings)) *
        100
        : 0;
  }

  equityTree.push(retainedEarningsLine);
  totalEquity += retainedEarnings;
  if (previousTotalEquity !== undefined) {
    previousTotalEquity += previousRetainedEarnings;
  }

  return {
    assets: assetTree,
    liabilities: liabilityTree,
    equity: equityTree,
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
    previousTotalAssets,
    previousTotalLiabilities,
    previousTotalEquity,
    previousTotalLiabilitiesAndEquity:
      previousTotalLiabilities !== undefined &&
        previousTotalEquity !== undefined
        ? previousTotalLiabilities + previousTotalEquity
        : undefined,
  };
}

export async function getCashFlowStatement(
  startDate: string,
  endDate: string,
  comparativeStartDate?: string,
  comparativeEndDate?: string
) {
  const start = Date.now();
  const session = await getSession();

  return authorizedAction(
    "reports.view",
    async (
      startDate: string,
      endDate: string,
      comparativeStartDate?: string,
      comparativeEndDate?: string
    ) => {
      try {
        const data = await _getCashFlowStatement(
          startDate,
          endDate,
          comparativeStartDate,
          comparativeEndDate
        );
        if (session) {
          await logReportGeneration(
            session.userId,
            "CASH_FLOW",
            "JSON",
            "SUCCESS",
            { startDate, endDate, comparativeStartDate, comparativeEndDate },
            Date.now() - start
          );
        }
        return { success: true, data };
      } catch (error) {
        console.error(error);
        if (session) {
          await logReportGeneration(
            session.userId,
            "CASH_FLOW",
            "JSON",
            "FAILED",
            { startDate, endDate },
            Date.now() - start,
            error instanceof Error ? error.message : "Unknown error"
          );
        }
        return {
          success: false,
          error: "Failed to generate Cash Flow Statement",
        };
      }
    }
  )(startDate, endDate, comparativeStartDate, comparativeEndDate);
}

async function _getCashFlowStatement(
  startDate: string,
  endDate: string,
  comparativeStartDate?: string,
  comparativeEndDate?: string
): Promise<CashFlowReport> {
  // Current + comparative periods in parallel when comparative is requested.
  const [current, previousResult] = await Promise.all([
    calculateCashFlowForPeriod(startDate, endDate),
    comparativeStartDate && comparativeEndDate
      ? calculateCashFlowForPeriod(comparativeStartDate, comparativeEndDate)
      : Promise.resolve(null),
  ]);
  const previous: Partial<CashFlowReport> = previousResult ?? {};

  // Merge (Operating Activities mostly)
  // For Cash Flow, row-by-row comparison is tricky because rows are dynamic (e.g. "Change in AR").
  // However, we can map them by name or ID.

  const mergeLines = (
    curr: ReportAccountLine[],
    prev: ReportAccountLine[]
  ): ReportAccountLine[] => {
    return curr.map((line) => {
      const prevLine = prev.find((p) => p.name === line.name); // Using name as key for dynamic rows
      const prevAmount = prevLine ? prevLine.amount : 0;
      const change = line.amount - prevAmount;
      const changePercentage =
        prevAmount !== 0 ? (change / Math.abs(prevAmount)) * 100 : 0;

      return {
        ...line,
        previousAmount: comparativeStartDate ? prevAmount : undefined,
        change: comparativeStartDate ? change : undefined,
        changePercentage: comparativeStartDate ? changePercentage : undefined,
      };
    });
  };

  return {
    ...current,
    operatingActivities: mergeLines(
      current.operatingActivities,
      previous.operatingActivities || []
    ),
    investingActivities: mergeLines(
      current.investingActivities,
      previous.investingActivities || []
    ),
    financingActivities: mergeLines(
      current.financingActivities,
      previous.financingActivities || []
    ),

    previousNetCashProvidedByOperating: previous.netCashProvidedByOperating,
    previousNetCashProvidedByInvesting: previous.netCashProvidedByInvesting,
    previousNetCashProvidedByFinancing: previous.netCashProvidedByFinancing,
    previousNetIncreaseInCash: previous.netIncreaseInCash,
    previousCashAtBeginning: previous.cashAtBeginning,
    previousCashAtEnd: previous.cashAtEnd,
  };
}

async function calculateCashFlowForPeriod(
  startDate: string,
  endDate: string
): Promise<CashFlowReport> {
  const start = new Date(startDate);
  const dayBeforeStart = new Date(start.getTime() - 86400000)
    .toISOString()
    .split("T")[0];

  // PL + opening/closing BS are independent — run in parallel (shared cache helps).
  const [pl, balanceSheetStart, balanceSheetEnd] = await Promise.all([
    _getProfitAndLoss(startDate, endDate),
    _getBalanceSheet(dayBeforeStart),
    _getBalanceSheet(endDate),
  ]);
  const netIncome = pl.netIncome;

  const operatingActivities: ReportAccountLine[] = [
    {
      accountId: "net-income",
      code: "",
      name: "Net Income",
      amount: netIncome,
      level: 0,
      type: "operating",
    },
  ];

  // Depreciation Add-back
  function findDepreciation(nodes: ReportAccountLine[]): number {
    let sum = 0;
    for (const node of nodes) {
      if (node.name.toLowerCase().includes("depreciation")) {
        sum += node.amount;
      }
      if (node.children) sum += findDepreciation(node.children);
    }
    return sum;
  }
  const depreciationAddBack = findDepreciation(pl.expenses);
  if (depreciationAddBack !== 0) {
    operatingActivities.push({
      accountId: "depreciation-add-back",
      code: "",
      name: "Depreciation & Amortization",
      amount: depreciationAddBack,
      level: 0,
      type: "operating",
    });
  }

  // Changes in Working Capital

  let changeInReceivables = 0;
  let changeInPayables = 0;

  function flatten(nodes: ReportAccountLine[]): ReportAccountLine[] {
    let res: ReportAccountLine[] = [];
    for (const node of nodes) {
      res.push(node);
      if (node.children) res = res.concat(flatten(node.children));
    }
    return res;
  }

  const startAssets = flatten(balanceSheetStart.assets);
  const endAssets = flatten(balanceSheetEnd.assets);
  const startLiabilities = flatten(balanceSheetStart.liabilities);
  const endLiabilities = flatten(balanceSheetEnd.liabilities);
  const startEquity = flatten(balanceSheetStart.equity);
  const endEquity = flatten(balanceSheetEnd.equity);

  // Receivables
  const arAccounts = endAssets.filter((a) =>
    a.name.toLowerCase().includes("receivable")
  );
  arAccounts.forEach((endAcc) => {
    const startAcc = startAssets.find((a) => a.accountId === endAcc.accountId);
    const startVal = startAcc ? startAcc.amount : 0;
    const change = endAcc.amount - startVal;
    changeInReceivables -= change;
  });

  if (changeInReceivables !== 0) {
    operatingActivities.push({
      accountId: "change-ar",
      code: "",
      name: "Change in Accounts Receivable",
      amount: changeInReceivables,
      level: 0,
      type: "operating",
    });
  }

  // Payables
  const apAccounts = endLiabilities.filter((a) =>
    a.name.toLowerCase().includes("payable") || a.code.startsWith("2")
  );
  apAccounts.forEach((endAcc) => {
    const startAcc = startLiabilities.find(
      (a) => a.accountId === endAcc.accountId
    );
    const startVal = startAcc ? startAcc.amount : 0;
    const change = endAcc.amount - startVal;

    // Check if it is a current liability (starts with 20-24)
    if (endAcc.code.startsWith("20") || endAcc.code.startsWith("21") || endAcc.code.startsWith("22") || endAcc.code.startsWith("23") || endAcc.code.startsWith("24")) {
      changeInPayables += change;
    }
  });

  if (changeInPayables !== 0) {
    operatingActivities.push({
      accountId: "change-ap",
      code: "",
      name: "Change in Accounts Payable & Accruals",
      amount: changeInPayables,
      level: 0,
      type: "operating",
    });
  }

  // Inventory (Current Assets 113xx)
  let changeInInventory = 0;
  const inventoryAccounts = endAssets.filter(a => a.code.startsWith("113"));
  inventoryAccounts.forEach((endAcc) => {
    const startAcc = startAssets.find(a => a.accountId === endAcc.accountId);
    const startVal = startAcc ? startAcc.amount : 0;
    // Increase in inventory is a use of cash (negative)
    const change = endAcc.amount - startVal;
    changeInInventory -= change;
  });

  if (changeInInventory !== 0) {
    operatingActivities.push({
      accountId: "change-inventory",
      code: "",
      name: "Change in Inventory",
      amount: changeInInventory,
      level: 0,
      type: "operating",
    });
  }

  // Investing Activities (Fixed Assets 15xxx - 19xxx)
  // Increase in Fixed Assets = Purchase (Negative Cash)
  // Decrease = Sale (Positive Cash - simplified)
  const investingActivities: ReportAccountLine[] = [];
  let netCashProvidedByInvesting = 0;

  const fixedAssetAccounts = endAssets.filter(a =>
    a.code.startsWith("15") || a.code.startsWith("16") || a.code.startsWith("17") || a.code.startsWith("18") || a.code.startsWith("19")
  );

  let changeInFixedAssets = 0;
  fixedAssetAccounts.forEach((endAcc) => {
    const startAcc = startAssets.find(a => a.accountId === endAcc.accountId);
    const startVal = startAcc ? startAcc.amount : 0;
    // Increase in assets is use of cash
    const change = endAcc.amount - startVal;
    changeInFixedAssets -= change;
  });

  if (changeInFixedAssets !== 0) {
    investingActivities.push({
      accountId: "capex",
      code: "",
      name: "Net Purchase of Fixed Assets",
      amount: changeInFixedAssets,
      level: 0,
      type: "investing",
    });
    netCashProvidedByInvesting += changeInFixedAssets;
  }

  // Financing Activities
  // Long Term Liabilities (25xxx+)
  // Equity (3xxxx) excluding Retained Earnings
  const financingActivities: ReportAccountLine[] = [];
  let netCashProvidedByFinancing = 0;

  // Long Term Debt
  let changeInDebt = 0;
  const debtAccounts = endLiabilities.filter(a =>
    a.code.startsWith("25") || a.code.startsWith("26") || a.code.startsWith("27") || a.code.startsWith("28") || a.code.startsWith("29")
  );
  debtAccounts.forEach((endAcc) => {
    const startAcc = startLiabilities.find(a => a.accountId === endAcc.accountId);
    const startVal = startAcc ? startAcc.amount : 0;
    const change = endAcc.amount - startVal;
    changeInDebt += change;
  });

  if (changeInDebt !== 0) {
    financingActivities.push({
      accountId: "change-debt",
      code: "",
      name: "Change in Long-Term Debt",
      amount: changeInDebt,
      level: 0,
      type: "financing",
    });
    netCashProvidedByFinancing += changeInDebt;
  }

  // Equity Capital (excluding RE)
  let changeInCapital = 0;
  // Exclude RE (99999 or code starting with 3 but not RE if identified differently)
  // Our calculated RE has code 99999
  const capitalAccounts = endEquity.filter(a => a.code.startsWith("3") && !a.name.toLowerCase().includes("retained earnings"));
  capitalAccounts.forEach((endAcc) => {
    const startAcc = flatten(balanceSheetStart.equity).find(a => a.accountId === endAcc.accountId); // Use flatten from BS logic if accessible, but here we flatten below or use what we have
    // Actually we flattened above into endEquity? No, we need to flatten startEquity too properly.
    // Re-flatten logic for equity
    const startEquityFlat = flatten(balanceSheetStart.equity);
    const startAccFound = startEquityFlat.find(a => a.accountId === endAcc.accountId);
    const startVal = startAccFound ? startAccFound.amount : 0;
    const change = endAcc.amount - startVal;
    changeInCapital += change;
  });

  if (changeInCapital !== 0) {
    financingActivities.push({
      accountId: "change-capital",
      code: "",
      name: "Change in Share Capital",
      amount: changeInCapital,
      level: 0,
      type: "financing",
    });
    netCashProvidedByFinancing += changeInCapital;
  }

  const netCashProvidedByOperating = operatingActivities.reduce(
    (s, i) => s + i.amount,
    0
  );

  // Cash at Beginning and End
  const cashStartNodes = startAssets.filter((a) =>
    a.name.toLowerCase().includes("cash")
  );
  const cashEndNodes = endAssets.filter((a) =>
    a.name.toLowerCase().includes("cash")
  );

  const cashAtBeginning = cashStartNodes.reduce((s, a) => s + a.amount, 0);
  const cashAtEnd = cashEndNodes.reduce((s, a) => s + a.amount, 0);

  return {
    operatingActivities,
    investingActivities,
    financingActivities,
    netCashProvidedByOperating,
    netCashProvidedByInvesting,
    netCashProvidedByFinancing,
    netIncreaseInCash: netCashProvidedByOperating + netCashProvidedByInvesting + netCashProvidedByFinancing,
    cashAtBeginning,
    cashAtEnd,
  };
}

/**
 * Generate Statement of Changes in Equity.
 * Shows movement in equity accounts over a period.
 * Permission: "reports.view"
 *
 * @param startDate            - Start date of the period
 * @param endDate              - End date of the period
 * @param comparativeStartDate - Optional start date for comparison
 * @param comparativeEndDate   - Optional end date for comparison
 * @returns                    - Equity change report data
 */
export async function getStatementOfChangesInEquity(
  startDate: string,
  endDate: string,
  comparativeStartDate?: string,
  comparativeEndDate?: string
) {
  const start = Date.now();
  const session = await getSession();

  return authorizedAction(
    "reports.view",
    async (
      startDate: string,
      endDate: string,
      comparativeStartDate?: string,
      comparativeEndDate?: string
    ) => {
      try {
        const data = await _getStatementOfChangesInEquity(
          startDate,
          endDate,
          comparativeStartDate,
          comparativeEndDate
        );
        if (session) {
          await logReportGeneration(
            session.userId,
            "EQUITY_CHANGE",
            "JSON",
            "SUCCESS",
            { startDate, endDate, comparativeStartDate, comparativeEndDate },
            Date.now() - start
          );
        }
        return { success: true, data };
      } catch (error) {
        console.error(error);
        if (session) {
          await logReportGeneration(
            session.userId,
            "EQUITY_CHANGE",
            "JSON",
            "FAILED",
            { startDate, endDate },
            Date.now() - start,
            error instanceof Error ? error.message : "Unknown error"
          );
        }
        return {
          success: false,
          error: "Failed to generate Statement of Changes in Equity",
        };
      }
    }
  )(startDate, endDate, comparativeStartDate, comparativeEndDate);
}

// --- Validation & Ratios ---

export type FinancialRatios = {
  currentRatio: number;
  quickRatio: number;
  debtToEquity: number;
  grossProfitMargin: number;
  netProfitMargin: number;
  returnOnAssets: number;
  returnOnEquity: number;
};

export async function getFinancialRatios(date: string): Promise<{ success: boolean; data?: FinancialRatios; error?: string }> {
  const start = Date.now();
  const session = await getSession();

  return authorizedAction("reports.view", async (date: string) => {
    try {
      const bs = await _getBalanceSheet(date);
      // Need P&L for a period. Ratios usually use TTM (Trailing Twelve Months) or YTD.
      // Let's use YTD for simplicity or allow passing a period. 
      // For now, let's assume YTD (Jan 1 to date)
      const yearStart = new Date(date).getFullYear();
      const pl = await _getProfitAndLoss(`${yearStart}-01-01`, date);

      // Flatten helpers
      const flatten = (nodes: ReportAccountLine[]): ReportAccountLine[] => {
        let res: ReportAccountLine[] = [];
        for (const node of nodes) {
          res.push(node);
          if (node.children) res = res.concat(flatten(node.children));
        }
        return res;
      };

      const assets = flatten(bs.assets);
      const liabilities = flatten(bs.liabilities);

      // 1. Current Ratio = Current Assets / Current Liabilities
      // Approx Current Assets: Cash (111xx), AR (112xx), Inventory (113xx), Prepaids (114xx) -> Code starts with 11, 12, 13, 14
      const currentAssets = assets
        .filter(a => a.code.startsWith("11") || a.code.startsWith("12") || a.code.startsWith("13") || a.code.startsWith("14"))
        .reduce((sum, a) => sum + a.amount, 0);

      const currentLiabilities = liabilities
        .filter(a => a.code.startsWith("20") || a.code.startsWith("21") || a.code.startsWith("22") || a.code.startsWith("23") || a.code.startsWith("24"))
        .reduce((sum, a) => sum + a.amount, 0);

      const currentRatio = currentLiabilities !== 0 ? currentAssets / currentLiabilities : 0;

      // 2. Quick Ratio = (Cash + AR) / Current Liabilities
      const cash = assets.filter(a => a.code.startsWith("111")).reduce((sum, a) => sum + a.amount, 0);
      const ar = assets.filter(a => a.code.startsWith("112")).reduce((sum, a) => sum + a.amount, 0);
      const quickRatio = currentLiabilities !== 0 ? (cash + ar) / currentLiabilities : 0;

      // 3. Debt to Equity = Total Liabilities / Total Equity
      const debtToEquity = bs.totalEquity !== 0 ? bs.totalLiabilities / bs.totalEquity : 0;

      // 4. Gross Profit Margin = (Revenue - COGS) / Revenue
      const revenue = pl.totalRevenue;
      const cogs = pl.expenses.filter(a => a.code.startsWith("51") || a.code.startsWith("52")).reduce((sum, a) => sum + a.amount, 0); // Assuming 51/52 are COGS-like
      // Better way: Look for specific COGS account type or name if possible. 
      // Seed says COGS is 52000.
      const grossProfit = revenue - cogs;
      const grossProfitMargin = revenue !== 0 ? (grossProfit / revenue) * 100 : 0;

      // 5. Net Profit Margin = Net Income / Revenue
      const netProfitMargin = revenue !== 0 ? (pl.netIncome / revenue) * 100 : 0;

      // 6. Return on Assets = Net Income / Total Assets
      const returnOnAssets = bs.totalAssets !== 0 ? (pl.netIncome / bs.totalAssets) * 100 : 0;

      // 7. Return on Equity = Net Income / Total Equity
      const returnOnEquity = bs.totalEquity !== 0 ? (pl.netIncome / bs.totalEquity) * 100 : 0;

      const ratios: FinancialRatios = {
        currentRatio,
        quickRatio,
        debtToEquity,
        grossProfitMargin,
        netProfitMargin,
        returnOnAssets,
        returnOnEquity,
      };

      if (session) {
        await logReportGeneration(session.userId, "FINANCIAL_RATIOS", "JSON", "SUCCESS", { date }, Date.now() - start);
      }

      return { success: true, data: ratios };
    } catch (error) {
      console.error(error);
      if (session) {
        await logReportGeneration(session.userId, "FINANCIAL_RATIOS", "JSON", "FAILED", { date }, Date.now() - start, error instanceof Error ? error.message : "Unknown error");
      }
      return { success: false, error: "Failed to calculate ratios" };
    }
  })(date);
}

export async function validateJournalEntries(startDate: string, endDate: string) {
  const session = await getSession();
  return authorizedAction("reports.view", async (startDate: string, endDate: string) => {
    // Aggregate in SQL instead of loading every line into memory.
    const sums = await prisma.journalEntryLine.groupBy({
      by: ["journalEntryId"],
      where: {
        journalEntry: {
          transactionDate: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
          status: "posted",
        },
      },
      _sum: {
        debitAmount: true,
        creditAmount: true,
      },
    });

    const unbalancedIds = sums
      .map((row) => {
        const debit = Number(row._sum.debitAmount || 0);
        const credit = Number(row._sum.creditAmount || 0);
        return {
          id: row.journalEntryId,
          difference: debit - credit,
        };
      })
      .filter((row) => Math.abs(row.difference) > 0.01);

    const entries =
      unbalancedIds.length === 0
        ? []
        : await prisma.journalEntry.findMany({
            where: { id: { in: unbalancedIds.map((u) => u.id) } },
            select: {
              id: true,
              entryNumber: true,
              transactionDate: true,
            },
          });

    const diffById = new Map(unbalancedIds.map((u) => [u.id, u.difference]));
    const unbalancedEntries = entries.map((entry) => ({
      id: entry.id,
      entryNumber: entry.entryNumber,
      date: entry.transactionDate,
      difference: diffById.get(entry.id) ?? 0,
    }));

    if (session) {
      await logReportGeneration(session.userId, "VALIDATION_REPORT", "JSON", "SUCCESS", { startDate, endDate, unbalancedCount: unbalancedEntries.length });
    }

    return { success: true, data: { unbalancedEntries } };
  })(startDate, endDate);
}


async function _getStatementOfChangesInEquity(
  startDate: string,
  endDate: string,
  comparativeStartDate?: string,
  comparativeEndDate?: string
): Promise<EquityChangeReport> {
  const start = new Date(startDate);
  const dayBeforeStart = new Date(start.getTime() - 86400000)
    .toISOString()
    .split("T")[0];

  const [bsStart, pl, bsEnd, bsPrevEnd] = await Promise.all([
    _getBalanceSheet(dayBeforeStart),
    _getProfitAndLoss(startDate, endDate),
    _getBalanceSheet(endDate),
    comparativeEndDate
      ? _getBalanceSheet(comparativeEndDate)
      : Promise.resolve(null),
  ]);

  function flatten(nodes: ReportAccountLine[]): ReportAccountLine[] {
    let res: ReportAccountLine[] = [];
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        res = res.concat(flatten(node.children));
      } else {
        res.push(node);
      }
    }
    return res;
  }

  const startEquity = flatten(bsStart.equity);
  const endEquity = flatten(bsEnd.equity);
  const prevEndEquity = bsPrevEnd ? flatten(bsPrevEnd.equity) : [];

  const map = new Map<string, EquityChangeLine>();

  startEquity.forEach((acc) => {
    if (acc.accountId === "calculated-retained-earnings") return;
    map.set(acc.accountId, {
      name: acc.name,
      balanceBeginning: acc.amount,
      netIncome: 0,
      additions: 0,
      deductions: 0,
      balanceEnding: 0,
    });
  });

  endEquity.forEach((acc) => {
    if (acc.accountId === "calculated-retained-earnings") return;

    // Find previous ending balance
    const prevAcc = prevEndEquity.find((a) => a.accountId === acc.accountId);
    const previousBalanceEnding = prevAcc ? prevAcc.amount : undefined;

    let line = map.get(acc.accountId);
    if (!line) {
      line = {
        name: acc.name,
        balanceBeginning: 0,
        netIncome: 0,
        additions: 0,
        deductions: 0,
        balanceEnding: acc.amount,
        previousBalanceEnding,
      };
      map.set(acc.accountId, line);
    } else {
      line.balanceEnding = acc.amount;
      line.previousBalanceEnding = previousBalanceEnding;
      const diff = line.balanceEnding - line.balanceBeginning;
      if (diff > 0) line.additions = diff;
      else line.deductions = -diff;
    }

    if (bsPrevEnd) {
      const change = line.balanceEnding - (line.previousBalanceEnding || 0);
      const changePercentage =
        line.previousBalanceEnding && line.previousBalanceEnding !== 0
          ? (change / Math.abs(line.previousBalanceEnding)) * 100
          : 0;
      line.change = change;
      line.changePercentage = changePercentage;
    }
  });

  const startRE =
    startEquity.find((a) => a.accountId === "calculated-retained-earnings")
      ?.amount || 0;
  const endRE =
    endEquity.find((a) => a.accountId === "calculated-retained-earnings")
      ?.amount || 0;

  const prevEndRE = bsPrevEnd
    ? prevEndEquity.find((a) => a.accountId === "calculated-retained-earnings")
      ?.amount
    : undefined;

  const netIncome = pl.netIncome;

  const reDiff = endRE - (startRE + netIncome);

  const reLine: EquityChangeLine = {
    name: "Retained Earnings",
    balanceBeginning: startRE,
    netIncome: netIncome,
    additions: reDiff > 0 ? reDiff : 0,
    deductions: reDiff < 0 ? -reDiff : 0,
    balanceEnding: endRE,
    previousBalanceEnding: prevEndRE,
  };

  if (bsPrevEnd) {
    const change = reLine.balanceEnding - (reLine.previousBalanceEnding || 0);
    const changePercentage =
      reLine.previousBalanceEnding && reLine.previousBalanceEnding !== 0
        ? (change / Math.abs(reLine.previousBalanceEnding)) * 100
        : 0;
    reLine.change = change;
    reLine.changePercentage = changePercentage;
  }

  map.set("retained-earnings", reLine);

  const items = Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const totalEnding = items.reduce((s, i) => s + i.balanceEnding, 0);
  const previousTotalEnding = bsPrevEnd
    ? items.reduce((s, i) => s + (i.previousBalanceEnding || 0), 0)
    : undefined;

  let change: number | undefined;
  let changePercentage: number | undefined;

  if (bsPrevEnd && previousTotalEnding !== undefined) {
    change = totalEnding - previousTotalEnding;
    changePercentage =
      previousTotalEnding !== 0
        ? (change / Math.abs(previousTotalEnding)) * 100
        : 0;
  }

  return {
    items,
    totalBeginning: items.reduce((s, i) => s + i.balanceBeginning, 0),
    totalNetIncome: items.reduce((s, i) => s + i.netIncome, 0),
    totalAdditions: items.reduce((s, i) => s + i.additions, 0),
    totalDeductions: items.reduce((s, i) => s + i.deductions, 0),
    totalEnding,
    previousTotalEnding,
    change,
    changePercentage,
  };
}
