"use server";

import { prisma } from "@/services/lib/prisma";
import { getSession } from "@/services/lib/auth/auth";
import { getBudgetVariance } from "../actions";
import { SuperJSON } from "@/services/lib/superjson";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function requireBudgetAccess() {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

function toNumber(value: { toNumber(): number } | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return value.toNumber();
}

const MONTH_KEYS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

// ---------------------------------------------------------------------------
// 1. Budget Variance / Tracking Report
// ---------------------------------------------------------------------------

export interface BudgetVarianceEntry {
  budgetId: string;
  budgetName: string;
  fiscalYear: number;
  status: string;
  department: string | null;
  project: string | null;
  isDefault: boolean;
  totalBudget: number;
  totalActual: number;
  variance: number;
  utilizationPct: number;
  itemCount: number;
  overBudgetItems: number;
}

export async function getBudgetVarianceReport(params?: {
  fiscalYear?: number;
  status?: string;
}): Promise<BudgetVarianceEntry[]> {
  await requireBudgetAccess();

  const fiscalYear = params?.fiscalYear || new Date().getFullYear();

  const budgets = await prisma.budget.findMany({
    where: {
      fiscalYear,
      ...(params?.status && params.status !== "ALL"
        ? { status: params.status as any }
        : {}),
    },
    include: {
      department: true,
      project: true,
      items: true,
    },
    orderBy: { name: "asc" },
  });

  const results: BudgetVarianceEntry[] = [];

  for (const budget of budgets) {
    const varianceResponse = await getBudgetVariance(budget.id);
    const varianceItems =
      varianceResponse.success && varianceResponse.data
        ? SuperJSON.deserialize<
            {
              budgeted: number;
              actual: number;
              variance: number;
            }[]
          >(varianceResponse.data)
        : [];

    const itemsTotal = varianceItems.reduce(
      (sum, item) => sum + Number(item.budgeted),
      0,
    );
    const totalBudget =
      toNumber(budget.totalAmount) > 0
        ? toNumber(budget.totalAmount)
        : itemsTotal;
    const totalActual = varianceItems.reduce(
      (sum, item) => sum + Number(item.actual),
      0,
    );
    const variance = totalBudget - totalActual;
    const utilizationPct =
      totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
    const overBudgetItems = varianceItems.filter(
      (item) => Number(item.actual) > Number(item.budgeted),
    ).length;

    results.push({
      budgetId: budget.id,
      budgetName: budget.name,
      fiscalYear: budget.fiscalYear,
      status: budget.status,
      department: budget.department?.name ?? null,
      project: budget.project?.name ?? null,
      isDefault: budget.isDefault,
      totalBudget,
      totalActual,
      variance,
      utilizationPct,
      itemCount: varianceItems.length || budget.items.length,
      overBudgetItems,
    });
  }

  return results.sort((a, b) => b.utilizationPct - a.utilizationPct);
}

// ---------------------------------------------------------------------------
// 2. Budget by Department Report
// ---------------------------------------------------------------------------

export interface BudgetByDepartmentEntry {
  departmentId: string | null;
  departmentName: string;
  departmentCode: string | null;
  budgetCount: number;
  totalBudget: number;
  totalActual: number;
  variance: number;
  utilizationPct: number;
  overBudgetCount: number;
}

export async function getBudgetByDepartmentReport(params?: {
  fiscalYear?: number;
}): Promise<BudgetByDepartmentEntry[]> {
  await requireBudgetAccess();

  const fiscalYear = params?.fiscalYear || new Date().getFullYear();
  const varianceReport = await getBudgetVarianceReport({
    fiscalYear,
    status: "APPROVED",
  });

  const map = new Map<string, BudgetByDepartmentEntry>();

  for (const row of varianceReport) {
    const key = row.department ?? "__unassigned__";
    const existing = map.get(key) ?? {
      departmentId: null,
      departmentName: row.department ?? "Unassigned / Global",
      departmentCode: null,
      budgetCount: 0,
      totalBudget: 0,
      totalActual: 0,
      variance: 0,
      utilizationPct: 0,
      overBudgetCount: 0,
    };

    existing.budgetCount += 1;
    existing.totalBudget += row.totalBudget;
    existing.totalActual += row.totalActual;
    existing.variance += row.variance;
    if (row.totalActual > row.totalBudget) existing.overBudgetCount += 1;

    map.set(key, existing);
  }

  // Enrich with department codes
  const departments = await prisma.department.findMany({
    select: { id: true, name: true, code: true },
  });
  const byName = new Map(departments.map((d) => [d.name, d]));

  return Array.from(map.values())
    .map((entry) => {
      const dept = byName.get(entry.departmentName);
      return {
        ...entry,
        departmentId: dept?.id ?? null,
        departmentCode: dept?.code ?? null,
        utilizationPct:
          entry.totalBudget > 0
            ? (entry.totalActual / entry.totalBudget) * 100
            : 0,
      };
    })
    .sort((a, b) => b.totalBudget - a.totalBudget);
}

// ---------------------------------------------------------------------------
// 3. Budget by Project Report
// ---------------------------------------------------------------------------

export interface BudgetByProjectEntry {
  projectId: string | null;
  projectName: string;
  projectCode: string | null;
  projectStatus: string | null;
  budgetCount: number;
  totalBudget: number;
  totalActual: number;
  variance: number;
  utilizationPct: number;
}

export async function getBudgetByProjectReport(params?: {
  fiscalYear?: number;
}): Promise<BudgetByProjectEntry[]> {
  await requireBudgetAccess();

  const fiscalYear = params?.fiscalYear || new Date().getFullYear();

  const budgets = await prisma.budget.findMany({
    where: {
      fiscalYear,
      status: "APPROVED",
      projectId: { not: null },
    },
    include: {
      project: true,
      items: true,
    },
  });

  const map = new Map<string, BudgetByProjectEntry & { _ids: string[] }>();

  for (const budget of budgets) {
    const key = budget.projectId!;
    const existing = map.get(key) ?? {
      projectId: budget.projectId,
      projectName: budget.project?.name ?? "Unknown",
      projectCode: budget.project?.code ?? null,
      projectStatus: budget.project?.status ?? null,
      budgetCount: 0,
      totalBudget: 0,
      totalActual: 0,
      variance: 0,
      utilizationPct: 0,
      _ids: [],
    };

    existing.budgetCount += 1;
    existing._ids.push(budget.id);
    map.set(key, existing);
  }

  const results: BudgetByProjectEntry[] = [];

  for (const entry of map.values()) {
    let totalBudget = 0;
    let totalActual = 0;

    for (const budgetId of entry._ids) {
      const varianceResponse = await getBudgetVariance(budgetId);
      const items =
        varianceResponse.success && varianceResponse.data
          ? SuperJSON.deserialize<{ budgeted: number; actual: number }[]>(
              varianceResponse.data,
            )
          : [];
      totalBudget += items.reduce((s, i) => s + Number(i.budgeted), 0);
      totalActual += items.reduce((s, i) => s + Number(i.actual), 0);
    }

    results.push({
      projectId: entry.projectId,
      projectName: entry.projectName,
      projectCode: entry.projectCode,
      projectStatus: entry.projectStatus,
      budgetCount: entry.budgetCount,
      totalBudget,
      totalActual,
      variance: totalBudget - totalActual,
      utilizationPct:
        totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0,
    });
  }

  return results.sort((a, b) => b.totalBudget - a.totalBudget);
}

// ---------------------------------------------------------------------------
// 4. Overspending / Utilization Alert Report
// ---------------------------------------------------------------------------

export interface OverspendingEntry {
  budgetId: string;
  budgetName: string;
  accountCode: string;
  accountName: string;
  department: string | null;
  project: string | null;
  budgeted: number;
  actual: number;
  variance: number;
  utilizationPct: number;
  severity: "OVER" | "WARNING" | "OK";
}

export async function getOverspendingReport(params?: {
  fiscalYear?: number;
  thresholdPct?: number;
}): Promise<OverspendingEntry[]> {
  await requireBudgetAccess();

  const fiscalYear = params?.fiscalYear || new Date().getFullYear();
  const thresholdPct = params?.thresholdPct ?? 80;

  const budgets = await prisma.budget.findMany({
    where: { fiscalYear, status: "APPROVED" },
    include: {
      department: true,
      project: true,
    },
  });

  const results: OverspendingEntry[] = [];

  for (const budget of budgets) {
    const varianceResponse = await getBudgetVariance(budget.id);
    const items =
      varianceResponse.success && varianceResponse.data
        ? SuperJSON.deserialize<
            {
              accountCode: string;
              accountName: string;
              budgeted: number;
              actual: number;
              variance: number;
              percentage: number;
            }[]
          >(varianceResponse.data)
        : [];

    for (const item of items) {
      const utilizationPct = Number(item.percentage) || 0;
      if (utilizationPct < thresholdPct && Number(item.actual) <= Number(item.budgeted)) {
        continue;
      }

      let severity: OverspendingEntry["severity"] = "OK";
      if (Number(item.actual) > Number(item.budgeted)) {
        severity = "OVER";
      } else if (utilizationPct >= thresholdPct) {
        severity = "WARNING";
      }

      if (severity === "OK") continue;

      results.push({
        budgetId: budget.id,
        budgetName: budget.name,
        accountCode: item.accountCode,
        accountName: item.accountName,
        department: budget.department?.name ?? null,
        project: budget.project?.name ?? null,
        budgeted: Number(item.budgeted),
        actual: Number(item.actual),
        variance: Number(item.variance),
        utilizationPct,
        severity,
      });
    }
  }

  return results.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === "OVER" ? -1 : 1;
    }
    return b.utilizationPct - a.utilizationPct;
  });
}

// ---------------------------------------------------------------------------
// 5. Monthly Budget vs Actual
// ---------------------------------------------------------------------------

export interface MonthlyBudgetEntry {
  month: number;
  monthName: string;
  budgeted: number;
  actual: number;
  variance: number;
  utilizationPct: number;
}

export async function getMonthlyBudgetReport(params?: {
  fiscalYear?: number;
  budgetId?: string;
}): Promise<MonthlyBudgetEntry[]> {
  await requireBudgetAccess();

  const fiscalYear = params?.fiscalYear || new Date().getFullYear();
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const budgets = await prisma.budget.findMany({
    where: {
      fiscalYear,
      status: "APPROVED",
      ...(params?.budgetId ? { id: params.budgetId } : {}),
    },
    include: {
      items: { include: { account: true } },
      department: true,
      project: true,
    },
  });

  const monthlyBudgeted = Array.from({ length: 12 }, () => 0);
  const monthlyActual = Array.from({ length: 12 }, () => 0);

  for (const budget of budgets) {
    for (const item of budget.items) {
      MONTH_KEYS.forEach((key, idx) => {
        monthlyBudgeted[idx] += toNumber((item as any)[key]);
      });
    }

    // Actuals from journal lines by month
    const startDate = new Date(fiscalYear, 0, 1);
    const endDate = new Date(fiscalYear, 11, 31, 23, 59, 59, 999);

    const accountIds = budget.items.map((i) => i.accountId);
    if (accountIds.length === 0) continue;

    const whereClause: any = {
      accountId: { in: accountIds },
      journalEntry: {
        transactionDate: { gte: startDate, lte: endDate },
        status: "posted",
      },
    };

    if (budget.departmentId) whereClause.departmentId = budget.departmentId;
    if (budget.projectId) whereClause.projectId = budget.projectId;
    if (!budget.departmentId && !budget.projectId) {
      whereClause.departmentId = null;
      whereClause.projectId = null;
    }

    const lines = await prisma.journalEntryLine.findMany({
      where: whereClause,
      include: {
        journalEntry: { select: { transactionDate: true } },
        account: { select: { type: true } },
      },
    });

    for (const line of lines) {
      const month = line.journalEntry.transactionDate.getMonth();
      const debit = toNumber(line.debitAmount);
      const credit = toNumber(line.creditAmount);
      const type = line.account.type.toString().toLowerCase();
      const actual = ["expense", "asset", "cost_of_goods_sold"].includes(type)
        ? debit - credit
        : credit - debit;
      monthlyActual[month] += actual;
    }
  }

  return monthNames.map((name, idx) => {
    const budgeted = monthlyBudgeted[idx];
    const actual = monthlyActual[idx];
    return {
      month: idx + 1,
      monthName: name,
      budgeted,
      actual,
      variance: budgeted - actual,
      utilizationPct: budgeted > 0 ? (actual / budgeted) * 100 : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// 6. Budget Status Summary
// ---------------------------------------------------------------------------

export interface BudgetStatusEntry {
  status: string;
  count: number;
  totalAmount: number;
}

export interface BudgetStatusSummary {
  fiscalYear: number;
  byStatus: BudgetStatusEntry[];
  totalBudgets: number;
  totalAmount: number;
  pendingApprovals: number;
  recentBudgets: {
    id: string;
    name: string;
    status: string;
    fiscalYear: number;
    totalAmount: number;
    department: string | null;
    project: string | null;
    createdAt: string;
  }[];
}

export async function getBudgetStatusReport(params?: {
  fiscalYear?: number;
}): Promise<BudgetStatusSummary> {
  await requireBudgetAccess();

  const fiscalYear = params?.fiscalYear || new Date().getFullYear();

  const budgets = await prisma.budget.findMany({
    where: { fiscalYear },
    include: {
      department: true,
      project: true,
      items: true,
      approvals: {
        where: { status: "PENDING" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const statusMap = new Map<string, BudgetStatusEntry>();

  for (const budget of budgets) {
    const itemsTotal = budget.items.reduce(
      (s, i) => s + toNumber(i.totalAmount),
      0,
    );
    const amount =
      toNumber(budget.totalAmount) > 0
        ? toNumber(budget.totalAmount)
        : itemsTotal;

    const existing = statusMap.get(budget.status) ?? {
      status: budget.status,
      count: 0,
      totalAmount: 0,
    };
    existing.count += 1;
    existing.totalAmount += amount;
    statusMap.set(budget.status, existing);
  }

  const pendingApprovals = budgets.reduce(
    (s, b) => s + b.approvals.length,
    0,
  );

  const byStatus = Array.from(statusMap.values()).sort(
    (a, b) => b.count - a.count,
  );
  const totalAmount = byStatus.reduce((s, r) => s + r.totalAmount, 0);

  return {
    fiscalYear,
    byStatus,
    totalBudgets: budgets.length,
    totalAmount,
    pendingApprovals,
    recentBudgets: budgets.slice(0, 20).map((b) => {
      const itemsTotal = b.items.reduce(
        (s, i) => s + toNumber(i.totalAmount),
        0,
      );
      return {
        id: b.id,
        name: b.name,
        status: b.status,
        fiscalYear: b.fiscalYear,
        totalAmount:
          toNumber(b.totalAmount) > 0 ? toNumber(b.totalAmount) : itemsTotal,
        department: b.department?.name ?? null,
        project: b.project?.name ?? null,
        createdAt: b.createdAt.toISOString(),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

export async function getBudgetReportFilterOptions() {
  await requireBudgetAccess();

  const [years, budgets, departments, projects] = await Promise.all([
    prisma.budget.findMany({
      select: { fiscalYear: true },
      distinct: ["fiscalYear"],
      orderBy: { fiscalYear: "desc" },
    }),
    prisma.budget.findMany({
      where: { status: "APPROVED" },
      select: { id: true, name: true, fiscalYear: true },
      orderBy: [{ fiscalYear: "desc" }, { name: "asc" }],
      take: 200,
    }),
    prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      select: { id: true, name: true, code: true, status: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  return {
    fiscalYears: years.map((y) => y.fiscalYear),
    budgets,
    departments,
    projects,
  };
}
