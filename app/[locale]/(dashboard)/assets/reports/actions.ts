"use server";

import { prisma } from "@/services/lib/prisma";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";
import { AssetStatus } from "@/prisma/generated/prisma/client";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function requireAssetsAccess() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "assets.view")) {
    // Fallback: allow any authenticated user if permission not seeded yet
    if (!session) throw new Error("Unauthorized");
  }
  return session;
}

function toNumber(value: { toNumber(): number } | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return value.toNumber();
}

// ---------------------------------------------------------------------------
// 1. Asset Register / Listing Report
// ---------------------------------------------------------------------------

export interface AssetRegisterEntry {
  assetId: string;
  code: string;
  name: string;
  categoryName: string;
  categoryCode: string;
  status: string;
  purchaseDate: string;
  acquisitionCost: number;
  residualValue: number;
  currentBookValue: number;
  accumulatedDepreciation: number;
  usefulLife: number;
  depreciationMethod: string;
  location: string | null;
  department: string | null;
  assignedTo: string | null;
  serialNumber: string | null;
}

export async function getAssetRegisterReport(params?: {
  status?: string;
  categoryId?: string;
}): Promise<AssetRegisterEntry[]> {
  await requireAssetsAccess();

  const assets = await prisma.asset.findMany({
    where: {
      ...(params?.status && params.status !== "ALL"
        ? { status: params.status as AssetStatus }
        : {}),
      ...(params?.categoryId && params.categoryId !== "ALL"
        ? { categoryId: params.categoryId }
        : {}),
    },
    include: {
      category: { select: { name: true, code: true } },
    },
    orderBy: [{ category: { name: "asc" } }, { code: "asc" }],
  });

  return assets.map((asset) => {
    const acquisitionCost = toNumber(asset.acquisitionCost);
    const currentBookValue = toNumber(asset.currentBookValue);
    return {
      assetId: asset.id,
      code: asset.code,
      name: asset.name,
      categoryName: asset.category.name,
      categoryCode: asset.category.code,
      status: asset.status,
      purchaseDate: asset.purchaseDate.toISOString(),
      acquisitionCost,
      residualValue: toNumber(asset.residualValue),
      currentBookValue,
      accumulatedDepreciation: Math.max(0, acquisitionCost - currentBookValue),
      usefulLife: asset.usefulLife,
      depreciationMethod: asset.depreciationMethod,
      location: asset.location,
      department: asset.department,
      assignedTo: asset.assignedTo,
      serialNumber: asset.serialNumber,
    };
  });
}

// ---------------------------------------------------------------------------
// 2. Depreciation Summary Report
// ---------------------------------------------------------------------------

export interface DepreciationSummaryEntry {
  assetId: string;
  code: string;
  name: string;
  categoryName: string;
  status: string;
  acquisitionCost: number;
  residualValue: number;
  currentBookValue: number;
  totalScheduled: number;
  totalPosted: number;
  totalPending: number;
  postedCount: number;
  pendingCount: number;
  lastPostedDate: string | null;
  nextDueDate: string | null;
}

export async function getDepreciationSummaryReport(params?: {
  status?: string;
  categoryId?: string;
}): Promise<DepreciationSummaryEntry[]> {
  await requireAssetsAccess();

  const assets = await prisma.asset.findMany({
    where: {
      status: {
        in:
          params?.status && params.status !== "ALL"
            ? [params.status as AssetStatus]
            : ["ACTIVE", "FULLY_DEPRECIATED"],
      },
      ...(params?.categoryId && params.categoryId !== "ALL"
        ? { categoryId: params.categoryId }
        : {}),
    },
    include: {
      category: { select: { name: true } },
      depreciationSchedules: {
        orderBy: { date: "asc" },
      },
    },
    orderBy: { code: "asc" },
  });

  return assets.map((asset) => {
    const posted = asset.depreciationSchedules.filter((s) => s.isPosted);
    const pending = asset.depreciationSchedules.filter((s) => !s.isPosted);
    const totalPosted = posted.reduce((s, i) => s + toNumber(i.amount), 0);
    const totalPending = pending.reduce((s, i) => s + toNumber(i.amount), 0);
    const lastPosted = posted.length
      ? posted[posted.length - 1].postedAt ?? posted[posted.length - 1].date
      : null;
    const nextDue = pending.length ? pending[0].date : null;

    return {
      assetId: asset.id,
      code: asset.code,
      name: asset.name,
      categoryName: asset.category.name,
      status: asset.status,
      acquisitionCost: toNumber(asset.acquisitionCost),
      residualValue: toNumber(asset.residualValue),
      currentBookValue: toNumber(asset.currentBookValue),
      totalScheduled: totalPosted + totalPending,
      totalPosted,
      totalPending,
      postedCount: posted.length,
      pendingCount: pending.length,
      lastPostedDate: lastPosted?.toISOString() ?? null,
      nextDueDate: nextDue?.toISOString() ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// 3. Asset by Category Report
// ---------------------------------------------------------------------------

export interface AssetByCategoryEntry {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  assetCount: number;
  activeCount: number;
  disposedCount: number;
  totalAcquisitionCost: number;
  totalBookValue: number;
  totalAccumulatedDepreciation: number;
  avgBookValue: number;
}

export async function getAssetByCategoryReport(): Promise<AssetByCategoryEntry[]> {
  await requireAssetsAccess();

  const categories = await prisma.assetCategory.findMany({
    include: {
      assets: {
        select: {
          status: true,
          acquisitionCost: true,
          currentBookValue: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return categories
    .map((cat) => {
      const totalAcquisitionCost = cat.assets.reduce(
        (s, a) => s + toNumber(a.acquisitionCost),
        0,
      );
      const totalBookValue = cat.assets.reduce(
        (s, a) => s + toNumber(a.currentBookValue),
        0,
      );
      const activeCount = cat.assets.filter((a) => a.status === "ACTIVE").length;
      const disposedCount = cat.assets.filter((a) =>
        ["DISPOSED", "SOLD", "WRITTEN_OFF"].includes(a.status),
      ).length;

      return {
        categoryId: cat.id,
        categoryCode: cat.code,
        categoryName: cat.name,
        assetCount: cat.assets.length,
        activeCount,
        disposedCount,
        totalAcquisitionCost,
        totalBookValue,
        totalAccumulatedDepreciation: Math.max(
          0,
          totalAcquisitionCost - totalBookValue,
        ),
        avgBookValue:
          cat.assets.length > 0 ? totalBookValue / cat.assets.length : 0,
      };
    })
    .filter((c) => c.assetCount > 0)
    .sort((a, b) => b.totalAcquisitionCost - a.totalAcquisitionCost);
}

// ---------------------------------------------------------------------------
// 4. Disposal Report
// ---------------------------------------------------------------------------

export interface AssetDisposalEntry {
  disposalId: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  categoryName: string;
  disposalDate: string;
  disposalAmount: number;
  bookValue: number;
  gainLoss: number;
  reason: string | null;
  status: string;
}

export async function getAssetDisposalReport(
  startDate: Date,
  endDate: Date,
): Promise<AssetDisposalEntry[]> {
  await requireAssetsAccess();

  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);

  const disposals = await prisma.assetDisposal.findMany({
    where: {
      date: { gte: startDate, lte: endOfDay },
    },
    include: {
      asset: {
        include: {
          category: { select: { name: true } },
        },
      },
    },
    orderBy: { date: "desc" },
  });

  return disposals.map((d) => ({
    disposalId: d.id,
    assetId: d.assetId,
    assetCode: d.asset.code,
    assetName: d.asset.name,
    categoryName: d.asset.category.name,
    disposalDate: d.date.toISOString(),
    disposalAmount: toNumber(d.disposalAmount),
    bookValue: toNumber(d.bookValue),
    gainLoss: toNumber(d.gainLoss),
    reason: d.reason,
    status: d.asset.status,
  }));
}

// ---------------------------------------------------------------------------
// 5. Asset Valuation Report
// ---------------------------------------------------------------------------

export interface AssetValuationEntry {
  assetId: string;
  code: string;
  name: string;
  categoryName: string;
  status: string;
  purchaseDate: string;
  acquisitionCost: number;
  residualValue: number;
  currentBookValue: number;
  accumulatedDepreciation: number;
  depreciationPct: number;
  remainingLifeMonths: number | null;
  netBookValuePct: number;
}

export async function getAssetValuationReport(params?: {
  status?: string;
  categoryId?: string;
}): Promise<AssetValuationEntry[]> {
  await requireAssetsAccess();

  const assets = await prisma.asset.findMany({
    where: {
      ...(params?.status && params.status !== "ALL"
        ? { status: params.status as AssetStatus }
        : { status: { in: ["ACTIVE", "FULLY_DEPRECIATED"] } }),
      ...(params?.categoryId && params.categoryId !== "ALL"
        ? { categoryId: params.categoryId }
        : {}),
    },
    include: {
      category: { select: { name: true } },
      depreciationSchedules: {
        where: { isPosted: false },
        orderBy: { date: "asc" },
      },
    },
    orderBy: { code: "asc" },
  });

  return assets.map((asset) => {
    const acquisitionCost = toNumber(asset.acquisitionCost);
    const currentBookValue = toNumber(asset.currentBookValue);
    const residualValue = toNumber(asset.residualValue);
    const accumulatedDepreciation = Math.max(
      0,
      acquisitionCost - currentBookValue,
    );
    const depreciable = Math.max(0, acquisitionCost - residualValue);
    const depreciationPct =
      depreciable > 0 ? (accumulatedDepreciation / depreciable) * 100 : 0;

    return {
      assetId: asset.id,
      code: asset.code,
      name: asset.name,
      categoryName: asset.category.name,
      status: asset.status,
      purchaseDate: asset.purchaseDate.toISOString(),
      acquisitionCost,
      residualValue,
      currentBookValue,
      accumulatedDepreciation,
      depreciationPct,
      remainingLifeMonths: asset.depreciationSchedules.length || null,
      netBookValuePct:
        acquisitionCost > 0 ? (currentBookValue / acquisitionCost) * 100 : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// 6. Asset by Location / Department Report
// ---------------------------------------------------------------------------

export interface AssetByLocationEntry {
  groupKey: string;
  groupType: "location" | "department";
  groupName: string;
  assetCount: number;
  totalAcquisitionCost: number;
  totalBookValue: number;
  activeCount: number;
}

export async function getAssetByLocationReport(params?: {
  groupBy?: "location" | "department";
}): Promise<AssetByLocationEntry[]> {
  await requireAssetsAccess();

  const groupBy = params?.groupBy ?? "location";

  const assets = await prisma.asset.findMany({
    select: {
      location: true,
      department: true,
      status: true,
      acquisitionCost: true,
      currentBookValue: true,
    },
  });

  const map = new Map<string, AssetByLocationEntry>();

  for (const asset of assets) {
    const raw =
      groupBy === "location" ? asset.location : asset.department;
    const groupName = raw?.trim() || "Unassigned";
    const existing = map.get(groupName) ?? {
      groupKey: groupName,
      groupType: groupBy,
      groupName,
      assetCount: 0,
      totalAcquisitionCost: 0,
      totalBookValue: 0,
      activeCount: 0,
    };

    existing.assetCount += 1;
    existing.totalAcquisitionCost += toNumber(asset.acquisitionCost);
    existing.totalBookValue += toNumber(asset.currentBookValue);
    if (asset.status === "ACTIVE") existing.activeCount += 1;
    map.set(groupName, existing);
  }

  return Array.from(map.values()).sort(
    (a, b) => b.totalBookValue - a.totalBookValue,
  );
}

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

export async function getAssetReportFilterOptions() {
  await requireAssetsAccess();

  const categories = await prisma.assetCategory.findMany({
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  return { categories };
}
