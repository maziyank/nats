"use server";

import { prisma } from "@/services/lib/prisma";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";
import { ProductionOrderStatus } from "@/prisma/generated/prisma/enums";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function requireProductionAccess() {
  const session = await getSession();
  if (
    !session ||
    !(
      hasPermission(session.permissions, "production.view") ||
      hasPermission(session.permissions, "inventory.view")
    )
  ) {
    throw new Error("Unauthorized");
  }
  return session;
}

function toNumber(value: { toNumber(): number } | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return value.toNumber();
}

// ---------------------------------------------------------------------------
// 1. Production Order Status / Progress Report
// ---------------------------------------------------------------------------

export interface OrderStatusEntry {
  orderId: string;
  orderNumber: string;
  productSku: string;
  productName: string;
  bomName: string | null;
  status: string;
  plannedQuantity: number;
  producedQuantity: number;
  remainingQuantity: number;
  completionPct: number;
  startDate: string | null;
  endDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  materialCost: number;
  finishedGoodsValue: number;
  issueCount: number;
  receiptCount: number;
  createdAt: string;
}

export async function getOrderStatusReport(params?: {
  status?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<OrderStatusEntry[]> {
  await requireProductionAccess();

  const endOfDay = params?.endDate ? new Date(params.endDate) : undefined;
  if (endOfDay) endOfDay.setHours(23, 59, 59, 999);

  const orders = await prisma.productionOrder.findMany({
    where: {
      ...(params?.status && params.status !== "ALL"
        ? { status: params.status as ProductionOrderStatus }
        : {}),
      ...(params?.startDate || endOfDay
        ? {
            createdAt: {
              ...(params?.startDate ? { gte: params.startDate } : {}),
              ...(endOfDay ? { lte: endOfDay } : {}),
            },
          }
        : {}),
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      plannedQuantity: true,
      producedQuantity: true,
      startDate: true,
      endDate: true,
      actualStartDate: true,
      actualEndDate: true,
      createdAt: true,
      product: { select: { sku: true, name: true } },
      billOfMaterial: { select: { name: true } },
      issues: {
        where: { status: "ISSUED" },
        select: {
          items: { select: { totalCost: true } },
        },
      },
      receipts: {
        where: { status: "RECEIVED" },
        select: {
          items: { select: { totalCost: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return orders.map((order) => {
    const materialCost = order.issues.reduce(
      (sum, issue) =>
        sum +
        issue.items.reduce((s, item) => s + toNumber(item.totalCost), 0),
      0,
    );
    const finishedGoodsValue = order.receipts.reduce(
      (sum, receipt) =>
        sum +
        receipt.items.reduce((s, item) => s + toNumber(item.totalCost), 0),
      0,
    );
    const remaining = Math.max(0, order.plannedQuantity - order.producedQuantity);
    const completionPct =
      order.plannedQuantity > 0
        ? Math.min(100, (order.producedQuantity / order.plannedQuantity) * 100)
        : 0;

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      productSku: order.product.sku,
      productName: order.product.name,
      bomName: order.billOfMaterial?.name ?? null,
      status: order.status,
      plannedQuantity: order.plannedQuantity,
      producedQuantity: order.producedQuantity,
      remainingQuantity: remaining,
      completionPct,
      startDate: order.startDate?.toISOString() ?? null,
      endDate: order.endDate?.toISOString() ?? null,
      actualStartDate: order.actualStartDate?.toISOString() ?? null,
      actualEndDate: order.actualEndDate?.toISOString() ?? null,
      materialCost,
      finishedGoodsValue,
      issueCount: order.issues.length,
      receiptCount: order.receipts.length,
      createdAt: order.createdAt.toISOString(),
    };
  });
}

// ---------------------------------------------------------------------------
// 2. Material Consumption Report
// ---------------------------------------------------------------------------

export interface MaterialConsumptionEntry {
  productId: string;
  productSku: string;
  productName: string;
  categoryName: string | null;
  unitSymbol: string | null;
  totalQuantity: number;
  totalCost: number;
  avgUnitCost: number;
  issueCount: number;
  orderCount: number;
}

export async function getMaterialConsumptionReport(
  startDate: Date,
  endDate: Date,
  params?: { productId?: string },
): Promise<MaterialConsumptionEntry[]> {
  await requireProductionAccess();

  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);

  const items = await prisma.productionIssueItem.findMany({
    where: {
      productionIssue: {
        status: "ISSUED",
        issueDate: { gte: startDate, lte: endOfDay },
      },
      ...(params?.productId ? { productId: params.productId } : {}),
    },
    select: {
      quantity: true,
      unitCost: true,
      totalCost: true,
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          category: { select: { name: true } },
          baseUnit: { select: { symbol: true } },
        },
      },
      productionIssue: {
        select: { id: true, productionOrderId: true },
      },
    },
  });

  const map = new Map<
    string,
    {
      productSku: string;
      productName: string;
      categoryName: string | null;
      unitSymbol: string | null;
      totalQuantity: number;
      totalCost: number;
      issueIds: Set<string>;
      orderIds: Set<string>;
    }
  >();

  for (const item of items) {
    const product = item.product;
    let entry = map.get(product.id);
    if (!entry) {
      entry = {
        productSku: product.sku,
        productName: product.name,
        categoryName: product.category?.name ?? null,
        unitSymbol: product.baseUnit?.symbol ?? null,
        totalQuantity: 0,
        totalCost: 0,
        issueIds: new Set(),
        orderIds: new Set(),
      };
      map.set(product.id, entry);
    }
    entry.totalQuantity += item.quantity;
    entry.totalCost += toNumber(item.totalCost);
    entry.issueIds.add(item.productionIssue.id);
    entry.orderIds.add(item.productionIssue.productionOrderId);
  }

  const result: MaterialConsumptionEntry[] = [];
  for (const [productId, entry] of map.entries()) {
    result.push({
      productId,
      productSku: entry.productSku,
      productName: entry.productName,
      categoryName: entry.categoryName,
      unitSymbol: entry.unitSymbol,
      totalQuantity: entry.totalQuantity,
      totalCost: entry.totalCost,
      avgUnitCost:
        entry.totalQuantity > 0 ? entry.totalCost / entry.totalQuantity : 0,
      issueCount: entry.issueIds.size,
      orderCount: entry.orderIds.size,
    });
  }

  return result.sort((a, b) => b.totalCost - a.totalCost);
}

// ---------------------------------------------------------------------------
// 3. Production Output / Yield Report
// ---------------------------------------------------------------------------

export interface ProductionOutputEntry {
  orderId: string;
  orderNumber: string;
  productSku: string;
  productName: string;
  status: string;
  plannedQuantity: number;
  producedQuantity: number;
  yieldPct: number;
  varianceQty: number;
  finishedGoodsValue: number;
  unitCost: number;
  receiptCount: number;
  startDate: string | null;
  completedDate: string | null;
  daysToComplete: number | null;
}

export async function getProductionOutputReport(
  startDate: Date,
  endDate: Date,
  params?: { status?: string },
): Promise<ProductionOutputEntry[]> {
  await requireProductionAccess();

  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);

  const orders = await prisma.productionOrder.findMany({
    where: {
      OR: [
        { actualEndDate: { gte: startDate, lte: endOfDay } },
        {
          actualEndDate: null,
          createdAt: { gte: startDate, lte: endOfDay },
        },
      ],
      ...(params?.status && params.status !== "ALL"
        ? { status: params.status as ProductionOrderStatus }
        : {}),
      producedQuantity: { gt: 0 },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      plannedQuantity: true,
      producedQuantity: true,
      startDate: true,
      actualStartDate: true,
      actualEndDate: true,
      product: { select: { sku: true, name: true } },
      receipts: {
        where: { status: "RECEIVED" },
        select: {
          receiptDate: true,
          items: { select: { totalCost: true, quantity: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return orders.map((order) => {
    const finishedGoodsValue = order.receipts.reduce(
      (sum, receipt) =>
        sum +
        receipt.items.reduce((s, item) => s + toNumber(item.totalCost), 0),
      0,
    );
    const producedQty = order.producedQuantity;
    const yieldPct =
      order.plannedQuantity > 0
        ? (producedQty / order.plannedQuantity) * 100
        : 0;
    const start =
      order.actualStartDate ?? order.startDate ?? null;
    const end = order.actualEndDate;
    let daysToComplete: number | null = null;
    if (start && end) {
      daysToComplete = Math.max(
        0,
        Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
      );
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      productSku: order.product.sku,
      productName: order.product.name,
      status: order.status,
      plannedQuantity: order.plannedQuantity,
      producedQuantity: producedQty,
      yieldPct,
      varianceQty: producedQty - order.plannedQuantity,
      finishedGoodsValue,
      unitCost: producedQty > 0 ? finishedGoodsValue / producedQty : 0,
      receiptCount: order.receipts.length,
      startDate: start?.toISOString() ?? null,
      completedDate: end?.toISOString() ?? null,
      daysToComplete,
    };
  });
}

// ---------------------------------------------------------------------------
// 4. Production Cost Analysis Report
// ---------------------------------------------------------------------------

export interface ProductionCostEntry {
  orderId: string;
  orderNumber: string;
  productSku: string;
  productName: string;
  status: string;
  plannedQuantity: number;
  producedQuantity: number;
  materialCost: number;
  finishedGoodsValue: number;
  wipBalance: number;
  unitMaterialCost: number;
  unitFinishedCost: number;
  costVariance: number;
}

export async function getProductionCostReport(
  startDate: Date,
  endDate: Date,
): Promise<ProductionCostEntry[]> {
  await requireProductionAccess();

  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);

  const orders = await prisma.productionOrder.findMany({
    where: {
      createdAt: { gte: startDate, lte: endOfDay },
      status: { not: "CANCELLED" },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      plannedQuantity: true,
      producedQuantity: true,
      product: { select: { sku: true, name: true } },
      issues: {
        where: { status: "ISSUED" },
        select: {
          items: { select: { totalCost: true } },
        },
      },
      receipts: {
        where: { status: "RECEIVED" },
        select: {
          items: { select: { totalCost: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return orders
    .map((order) => {
      const materialCost = order.issues.reduce(
        (sum, issue) =>
          sum +
          issue.items.reduce((s, item) => s + toNumber(item.totalCost), 0),
        0,
      );
      const finishedGoodsValue = order.receipts.reduce(
        (sum, receipt) =>
          sum +
          receipt.items.reduce((s, item) => s + toNumber(item.totalCost), 0),
        0,
      );
      const qtyBase =
        order.producedQuantity > 0
          ? order.producedQuantity
          : order.plannedQuantity;

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        productSku: order.product.sku,
        productName: order.product.name,
        status: order.status,
        plannedQuantity: order.plannedQuantity,
        producedQuantity: order.producedQuantity,
        materialCost,
        finishedGoodsValue,
        wipBalance: materialCost - finishedGoodsValue,
        unitMaterialCost: qtyBase > 0 ? materialCost / qtyBase : 0,
        unitFinishedCost:
          order.producedQuantity > 0
            ? finishedGoodsValue / order.producedQuantity
            : 0,
        costVariance: materialCost - finishedGoodsValue,
      };
    })
    .filter((o) => o.materialCost > 0 || o.finishedGoodsValue > 0)
    .sort((a, b) => b.materialCost - a.materialCost);
}

// ---------------------------------------------------------------------------
// 5. BOM Cost Rollup Report
// ---------------------------------------------------------------------------

export interface BomCostEntry {
  bomId: string;
  bomNumber: string;
  bomName: string;
  productSku: string;
  productName: string;
  outputQty: number;
  isActive: boolean;
  materialCount: number;
  estimatedUnitCost: number;
  estimatedTotalCost: number;
  actualAvgUnitCost: number | null;
  costVariance: number | null;
  items: {
    productSku: string;
    productName: string;
    quantity: number;
    estimatedUnitCost: number;
    currentAvgCost: number;
    lineCost: number;
  }[];
}

export async function getBomCostReport(params?: {
  activeOnly?: boolean;
}): Promise<BomCostEntry[]> {
  await requireProductionAccess();

  const boms = await prisma.billOfMaterial.findMany({
    where: {
      ...(params?.activeOnly !== false ? { isActive: true } : {}),
    },
    select: {
      id: true,
      bomNumber: true,
      name: true,
      quantity: true,
      isActive: true,
      product: { select: { sku: true, name: true, averageCost: true, cost: true } },
      items: {
        select: {
          quantity: true,
          unitCost: true,
          product: {
            select: {
              sku: true,
              name: true,
              averageCost: true,
              cost: true,
            },
          },
        },
      },
      productionOrders: {
        where: { status: "COMPLETED", producedQuantity: { gt: 0 } },
        select: {
          producedQuantity: true,
          receipts: {
            where: { status: "RECEIVED" },
            select: {
              items: { select: { totalCost: true } },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return boms.map((bom) => {
    const items = bom.items.map((item) => {
      const currentAvg = toNumber(item.product.averageCost);
      const fallback = toNumber(item.product.cost);
      const currentCost = currentAvg > 0 ? currentAvg : fallback;
      const estimated =
        item.unitCost != null && toNumber(item.unitCost) > 0
          ? toNumber(item.unitCost)
          : currentCost;
      const qty = toNumber(item.quantity);

      return {
        productSku: item.product.sku,
        productName: item.product.name,
        quantity: qty,
        estimatedUnitCost: estimated,
        currentAvgCost: currentCost,
        lineCost: qty * currentCost,
      };
    });

    const estimatedTotalCost = items.reduce((s, i) => s + i.lineCost, 0);
    const outputQty = bom.quantity || 1;
    const estimatedUnitCost = estimatedTotalCost / outputQty;

    // Actual average unit cost from completed production orders
    let totalActualValue = 0;
    let totalProduced = 0;
    for (const order of bom.productionOrders) {
      const value = order.receipts.reduce(
        (sum, r) =>
          sum + r.items.reduce((s, i) => s + toNumber(i.totalCost), 0),
        0,
      );
      totalActualValue += value;
      totalProduced += order.producedQuantity;
    }
    const actualAvgUnitCost =
      totalProduced > 0 ? totalActualValue / totalProduced : null;

    return {
      bomId: bom.id,
      bomNumber: bom.bomNumber,
      bomName: bom.name,
      productSku: bom.product.sku,
      productName: bom.product.name,
      outputQty,
      isActive: bom.isActive,
      materialCount: items.length,
      estimatedUnitCost,
      estimatedTotalCost,
      actualAvgUnitCost,
      costVariance:
        actualAvgUnitCost != null
          ? actualAvgUnitCost - estimatedUnitCost
          : null,
      items,
    };
  });
}

// ---------------------------------------------------------------------------
// 6. WIP (Work in Progress) Report
// ---------------------------------------------------------------------------

export interface WipEntry {
  orderId: string;
  orderNumber: string;
  productSku: string;
  productName: string;
  status: string;
  plannedQuantity: number;
  producedQuantity: number;
  remainingQuantity: number;
  materialCost: number;
  finishedGoodsValue: number;
  wipBalance: number;
  daysOpen: number;
  startDate: string | null;
  issueCount: number;
  receiptCount: number;
}

export async function getWipReport(): Promise<WipEntry[]> {
  await requireProductionAccess();

  const orders = await prisma.productionOrder.findMany({
    where: {
      status: { in: ["RELEASED", "IN_PROGRESS"] },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      plannedQuantity: true,
      producedQuantity: true,
      actualStartDate: true,
      startDate: true,
      createdAt: true,
      product: { select: { sku: true, name: true } },
      issues: {
        where: { status: "ISSUED" },
        select: {
          items: { select: { totalCost: true } },
        },
      },
      receipts: {
        where: { status: "RECEIVED" },
        select: {
          items: { select: { totalCost: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const now = Date.now();

  return orders
    .map((order) => {
      const materialCost = order.issues.reduce(
        (sum, issue) =>
          sum +
          issue.items.reduce((s, item) => s + toNumber(item.totalCost), 0),
        0,
      );
      const finishedGoodsValue = order.receipts.reduce(
        (sum, receipt) =>
          sum +
          receipt.items.reduce((s, item) => s + toNumber(item.totalCost), 0),
        0,
      );
      const openDate =
        order.actualStartDate ?? order.startDate ?? order.createdAt;
      const daysOpen = Math.floor(
        (now - openDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        productSku: order.product.sku,
        productName: order.product.name,
        status: order.status,
        plannedQuantity: order.plannedQuantity,
        producedQuantity: order.producedQuantity,
        remainingQuantity: Math.max(
          0,
          order.plannedQuantity - order.producedQuantity,
        ),
        materialCost,
        finishedGoodsValue,
        wipBalance: materialCost - finishedGoodsValue,
        daysOpen,
        startDate: openDate.toISOString(),
        issueCount: order.issues.length,
        receiptCount: order.receipts.length,
      };
    })
    .sort((a, b) => b.wipBalance - a.wipBalance || b.daysOpen - a.daysOpen);
}

// ---------------------------------------------------------------------------
// Shared filter helpers
// ---------------------------------------------------------------------------

export async function getProductionReportFilterOptions() {
  await requireProductionAccess();

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { productionOrders: { some: {} } },
        { productionIssueItems: { some: {} } },
        { boms: { some: {} } },
      ],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, sku: true },
    take: 500,
  });

  return { products };
}
