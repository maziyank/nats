"use server";

import { prisma } from "@/services/lib/prisma";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";
import {
  MovementStatus,
  MovementType,
} from "@/prisma/generated/prisma/enums";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function requireInventoryAccess() {
  const session = await getSession();
  if (
    !session ||
    !(
      hasPermission(session.permissions, "inventory.view") ||
      hasPermission(session.permissions, "products.view")
    )
  ) {
    throw new Error("Unauthorized");
  }
  return session;
}

function unitCostOf(product: {
  averageCost: { toNumber(): number };
  cost: { toNumber(): number };
}): number {
  const avg = product.averageCost.toNumber();
  return avg > 0 ? avg : product.cost.toNumber();
}

// ---------------------------------------------------------------------------
// 1. Stock Valuation Report
// ---------------------------------------------------------------------------

export interface StockValuationEntry {
  productId: string;
  productSku: string;
  productName: string;
  categoryName: string | null;
  unitSymbol: string | null;
  quantity: number;
  unitCost: number;
  totalValue: number;
  sellingPrice: number;
  potentialRevenue: number;
}

export async function getStockValuationReport(params?: {
  warehouseId?: string;
  categoryId?: string;
}): Promise<StockValuationEntry[]> {
  await requireInventoryAccess();

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(params?.categoryId ? { categoryId: params.categoryId } : {}),
    },
    select: {
      id: true,
      sku: true,
      name: true,
      price: true,
      cost: true,
      averageCost: true,
      category: { select: { name: true } },
      baseUnit: { select: { symbol: true } },
      inventory: {
        where: params?.warehouseId
          ? { warehouseId: params.warehouseId }
          : undefined,
        select: { quantity: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const result: StockValuationEntry[] = [];

  for (const product of products) {
    const quantity = product.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
    if (quantity === 0) continue;

    const unitCost = unitCostOf(product);
    const sellingPrice = product.price.toNumber();

    result.push({
      productId: product.id,
      productSku: product.sku,
      productName: product.name,
      categoryName: product.category?.name ?? null,
      unitSymbol: product.baseUnit?.symbol ?? null,
      quantity,
      unitCost,
      totalValue: quantity * unitCost,
      sellingPrice,
      potentialRevenue: quantity * sellingPrice,
    });
  }

  return result.sort((a, b) => b.totalValue - a.totalValue);
}

// ---------------------------------------------------------------------------
// 2. Low Stock / Reorder Alert Report
// ---------------------------------------------------------------------------

export interface LowStockEntry {
  productId: string;
  productSku: string;
  productName: string;
  categoryName: string | null;
  unitSymbol: string | null;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  quantityAllocated: number;
  availableQty: number;
  reorderPoint: number;
  minStock: number;
  deficit: number;
  status: "out_of_stock" | "below_min" | "below_reorder";
}

export async function getLowStockReport(params?: {
  warehouseId?: string;
}): Promise<LowStockEntry[]> {
  await requireInventoryAccess();

  const inventoryItems = await prisma.inventory.findMany({
    where: {
      ...(params?.warehouseId ? { warehouseId: params.warehouseId } : {}),
      product: { isActive: true },
    },
    select: {
      quantity: true,
      quantityAllocated: true,
      reorderPoint: true,
      warehouse: { select: { id: true, name: true } },
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          minStock: true,
          category: { select: { name: true } },
          baseUnit: { select: { symbol: true } },
        },
      },
    },
  });

  const result: LowStockEntry[] = [];

  for (const item of inventoryItems) {
    const availableQty = item.quantity - item.quantityAllocated;
    const threshold = Math.max(item.reorderPoint, item.product.minStock);

    if (availableQty > threshold) continue;

    let status: LowStockEntry["status"] = "below_reorder";
    if (availableQty <= 0) {
      status = "out_of_stock";
    } else if (availableQty <= item.product.minStock) {
      status = "below_min";
    }

    result.push({
      productId: item.product.id,
      productSku: item.product.sku,
      productName: item.product.name,
      categoryName: item.product.category?.name ?? null,
      unitSymbol: item.product.baseUnit?.symbol ?? null,
      warehouseId: item.warehouse.id,
      warehouseName: item.warehouse.name,
      quantity: item.quantity,
      quantityAllocated: item.quantityAllocated,
      availableQty,
      reorderPoint: item.reorderPoint,
      minStock: item.product.minStock,
      deficit: Math.max(0, threshold - availableQty),
      status,
    });
  }

  // Also include active products with zero inventory records
  if (!params?.warehouseId) {
    const productsWithNoStock = await prisma.product.findMany({
      where: {
        isActive: true,
        inventory: { none: {} },
        minStock: { gt: 0 },
      },
      select: {
        id: true,
        sku: true,
        name: true,
        minStock: true,
        category: { select: { name: true } },
        baseUnit: { select: { symbol: true } },
      },
    });

    for (const product of productsWithNoStock) {
      result.push({
        productId: product.id,
        productSku: product.sku,
        productName: product.name,
        categoryName: product.category?.name ?? null,
        unitSymbol: product.baseUnit?.symbol ?? null,
        warehouseId: "",
        warehouseName: "—",
        quantity: 0,
        quantityAllocated: 0,
        availableQty: 0,
        reorderPoint: product.minStock,
        minStock: product.minStock,
        deficit: product.minStock,
        status: "out_of_stock",
      });
    }
  }

  const statusOrder = { out_of_stock: 0, below_min: 1, below_reorder: 2 };
  return result.sort(
    (a, b) =>
      statusOrder[a.status] - statusOrder[b.status] || b.deficit - a.deficit,
  );
}

// ---------------------------------------------------------------------------
// 3. Stock by Warehouse Report
// ---------------------------------------------------------------------------

export interface StockByWarehouseEntry {
  productId: string;
  productSku: string;
  productName: string;
  categoryName: string | null;
  unitSymbol: string | null;
  warehouses: {
    warehouseId: string;
    warehouseName: string;
    quantity: number;
    quantityAllocated: number;
    availableQty: number;
  }[];
  totalQuantity: number;
  totalAllocated: number;
  totalAvailable: number;
  unitCost: number;
  totalValue: number;
}

export async function getStockByWarehouseReport(params?: {
  categoryId?: string;
  search?: string;
}): Promise<StockByWarehouseEntry[]> {
  await requireInventoryAccess();

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(params?.categoryId ? { categoryId: params.categoryId } : {}),
      ...(params?.search
        ? {
            OR: [
              { name: { contains: params.search, mode: "insensitive" } },
              { sku: { contains: params.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      sku: true,
      name: true,
      cost: true,
      averageCost: true,
      category: { select: { name: true } },
      baseUnit: { select: { symbol: true } },
      inventory: {
        select: {
          quantity: true,
          quantityAllocated: true,
          warehouse: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return products
    .map((product) => {
      const warehouses = product.inventory.map((inv) => ({
        warehouseId: inv.warehouse.id,
        warehouseName: inv.warehouse.name,
        quantity: inv.quantity,
        quantityAllocated: inv.quantityAllocated,
        availableQty: inv.quantity - inv.quantityAllocated,
      }));

      const totalQuantity = warehouses.reduce((s, w) => s + w.quantity, 0);
      const totalAllocated = warehouses.reduce(
        (s, w) => s + w.quantityAllocated,
        0,
      );
      const unitCost = unitCostOf(product);

      return {
        productId: product.id,
        productSku: product.sku,
        productName: product.name,
        categoryName: product.category?.name ?? null,
        unitSymbol: product.baseUnit?.symbol ?? null,
        warehouses,
        totalQuantity,
        totalAllocated,
        totalAvailable: totalQuantity - totalAllocated,
        unitCost,
        totalValue: totalQuantity * unitCost,
      };
    })
    .filter((p) => p.totalQuantity > 0 || p.warehouses.length > 0);
}

// ---------------------------------------------------------------------------
// 4. Inventory Movement Summary Report
// ---------------------------------------------------------------------------

export interface MovementSummaryEntry {
  productId: string;
  productSku: string;
  productName: string;
  categoryName: string | null;
  unitSymbol: string | null;
  qtyIn: number;
  qtyOut: number;
  qtyTransfer: number;
  qtyAdjustment: number;
  qtyProductionIn: number;
  qtyProductionOut: number;
  netChange: number;
  movementCount: number;
  totalCostIn: number;
  totalCostOut: number;
}

export async function getMovementSummaryReport(
  startDate: Date,
  endDate: Date,
  params?: { warehouseId?: string; categoryId?: string },
): Promise<MovementSummaryEntry[]> {
  await requireInventoryAccess();

  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);

  const movementWhere: {
    status: MovementStatus;
    transactionDate: { gte: Date; lte: Date };
    OR?: Array<{ fromWarehouseId?: string; toWarehouseId?: string }>;
  } = {
    status: MovementStatus.COMPLETED,
    transactionDate: { gte: startDate, lte: endOfDay },
  };

  if (params?.warehouseId) {
    movementWhere.OR = [
      { fromWarehouseId: params.warehouseId },
      { toWarehouseId: params.warehouseId },
    ];
  }

  const details = await prisma.inventoryMovementDetail.findMany({
    where: {
      inventoryMovement: movementWhere,
      ...(params?.categoryId
        ? { product: { categoryId: params.categoryId } }
        : {}),
    },
    select: {
      quantity: true,
      unitCost: true,
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          category: { select: { name: true } },
          baseUnit: { select: { symbol: true } },
        },
      },
      inventoryMovement: {
        select: {
          type: true,
          fromWarehouseId: true,
          toWarehouseId: true,
        },
      },
    },
  });

  const summary = new Map<
    string,
    {
      productSku: string;
      productName: string;
      categoryName: string | null;
      unitSymbol: string | null;
      qtyIn: number;
      qtyOut: number;
      qtyTransfer: number;
      qtyAdjustment: number;
      qtyProductionIn: number;
      qtyProductionOut: number;
      movementCount: number;
      totalCostIn: number;
      totalCostOut: number;
    }
  >();

  for (const detail of details) {
    const product = detail.product;
    let entry = summary.get(product.id);
    if (!entry) {
      entry = {
        productSku: product.sku,
        productName: product.name,
        categoryName: product.category?.name ?? null,
        unitSymbol: product.baseUnit?.symbol ?? null,
        qtyIn: 0,
        qtyOut: 0,
        qtyTransfer: 0,
        qtyAdjustment: 0,
        qtyProductionIn: 0,
        qtyProductionOut: 0,
        movementCount: 0,
        totalCostIn: 0,
        totalCostOut: 0,
      };
      summary.set(product.id, entry);
    }

    const qty = detail.quantity;
    const cost = detail.unitCost.toNumber() * qty;
    const type = detail.inventoryMovement.type;
    entry.movementCount += 1;

    switch (type) {
      case MovementType.IN:
        entry.qtyIn += qty;
        entry.totalCostIn += cost;
        break;
      case MovementType.OUT:
        entry.qtyOut += qty;
        entry.totalCostOut += cost;
        break;
      case MovementType.TRANSFER:
        entry.qtyTransfer += qty;
        break;
      case MovementType.ADJUSTMENT:
        entry.qtyAdjustment += qty;
        break;
      case MovementType.PRODUCTION_IN:
        entry.qtyProductionIn += qty;
        entry.totalCostIn += cost;
        break;
      case MovementType.PRODUCTION_OUT:
        entry.qtyProductionOut += qty;
        entry.totalCostOut += cost;
        break;
    }
  }

  const result: MovementSummaryEntry[] = [];
  for (const [productId, entry] of summary.entries()) {
    result.push({
      productId,
      ...entry,
      netChange:
        entry.qtyIn +
        entry.qtyProductionIn -
        entry.qtyOut -
        entry.qtyProductionOut +
        entry.qtyAdjustment,
    });
  }

  return result.sort(
    (a, b) =>
      Math.abs(b.netChange) - Math.abs(a.netChange) ||
      b.movementCount - a.movementCount,
  );
}

// ---------------------------------------------------------------------------
// 5. Product Margin / Catalog Report
// ---------------------------------------------------------------------------

export interface ProductMarginEntry {
  productId: string;
  productSku: string;
  productName: string;
  categoryName: string | null;
  unitSymbol: string | null;
  cost: number;
  averageCost: number;
  sellingPrice: number;
  marginAmount: number;
  marginPct: number;
  stockQty: number;
  stockValue: number;
  isActive: boolean;
}

export async function getProductMarginReport(params?: {
  categoryId?: string;
  activeOnly?: boolean;
}): Promise<ProductMarginEntry[]> {
  await requireInventoryAccess();

  const products = await prisma.product.findMany({
    where: {
      ...(params?.activeOnly !== false ? { isActive: true } : {}),
      ...(params?.categoryId ? { categoryId: params.categoryId } : {}),
    },
    select: {
      id: true,
      sku: true,
      name: true,
      price: true,
      cost: true,
      averageCost: true,
      isActive: true,
      category: { select: { name: true } },
      baseUnit: { select: { symbol: true } },
      inventory: { select: { quantity: true } },
    },
    orderBy: { name: "asc" },
  });

  return products
    .map((product) => {
      const cost = product.cost.toNumber();
      const averageCost = product.averageCost.toNumber();
      const effectiveCost = averageCost > 0 ? averageCost : cost;
      const sellingPrice = product.price.toNumber();
      const marginAmount = sellingPrice - effectiveCost;
      const marginPct =
        sellingPrice > 0 ? (marginAmount / sellingPrice) * 100 : 0;
      const stockQty = product.inventory.reduce(
        (sum, inv) => sum + inv.quantity,
        0,
      );

      return {
        productId: product.id,
        productSku: product.sku,
        productName: product.name,
        categoryName: product.category?.name ?? null,
        unitSymbol: product.baseUnit?.symbol ?? null,
        cost,
        averageCost,
        sellingPrice,
        marginAmount,
        marginPct,
        stockQty,
        stockValue: stockQty * effectiveCost,
        isActive: product.isActive,
      };
    })
    .sort((a, b) => b.marginPct - a.marginPct);
}

// ---------------------------------------------------------------------------
// 6. Slow / Dead Moving Stock Report
// ---------------------------------------------------------------------------

export interface SlowMovingEntry {
  productId: string;
  productSku: string;
  productName: string;
  categoryName: string | null;
  unitSymbol: string | null;
  quantity: number;
  unitCost: number;
  stockValue: number;
  lastMovementDate: string | null;
  daysSinceMovement: number | null;
  movementCountInPeriod: number;
  status: "dead" | "slow" | "no_movement";
}

export async function getSlowMovingReport(
  asOfDate: Date,
  inactiveDays: number = 90,
): Promise<SlowMovingEntry[]> {
  await requireInventoryAccess();

  const cutoff = new Date(asOfDate);
  cutoff.setDate(cutoff.getDate() - inactiveDays);
  cutoff.setHours(0, 0, 0, 0);

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      sku: true,
      name: true,
      cost: true,
      averageCost: true,
      category: { select: { name: true } },
      baseUnit: { select: { symbol: true } },
      inventory: { select: { quantity: true } },
    },
    orderBy: { name: "asc" },
  });

  const productIds = products.map((p) => p.id);

  // Last movement date per product
  const lastMovements = await prisma.inventoryMovementDetail.groupBy({
    by: ["productId"],
    where: {
      productId: { in: productIds },
      inventoryMovement: { status: MovementStatus.COMPLETED },
    },
    _max: { createdAt: true },
    _count: { id: true },
  });

  // Movements within lookback period
  const recentCounts = await prisma.inventoryMovementDetail.groupBy({
    by: ["productId"],
    where: {
      productId: { in: productIds },
      inventoryMovement: {
        status: MovementStatus.COMPLETED,
        transactionDate: { gte: cutoff },
      },
    },
    _count: { id: true },
  });

  const lastMap = new Map(
    lastMovements.map((m) => [
      m.productId,
      { lastDate: m._max.createdAt, totalCount: m._count.id },
    ]),
  );
  const recentMap = new Map(
    recentCounts.map((m) => [m.productId, m._count.id]),
  );

  const asOf = asOfDate.getTime();
  const result: SlowMovingEntry[] = [];

  for (const product of products) {
    const quantity = product.inventory.reduce(
      (sum, inv) => sum + inv.quantity,
      0,
    );
    if (quantity <= 0) continue;

    const last = lastMap.get(product.id);
    const recentCount = recentMap.get(product.id) ?? 0;
    const lastDate = last?.lastDate ?? null;
    const daysSinceMovement = lastDate
      ? Math.floor((asOf - lastDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Only include if no recent movement or never moved
    if (recentCount > 0 && daysSinceMovement !== null && daysSinceMovement < inactiveDays) {
      continue;
    }

    let status: SlowMovingEntry["status"] = "slow";
    if (!lastDate) {
      status = "no_movement";
    } else if (daysSinceMovement !== null && daysSinceMovement >= inactiveDays * 2) {
      status = "dead";
    }

    const unitCost = unitCostOf(product);

    result.push({
      productId: product.id,
      productSku: product.sku,
      productName: product.name,
      categoryName: product.category?.name ?? null,
      unitSymbol: product.baseUnit?.symbol ?? null,
      quantity,
      unitCost,
      stockValue: quantity * unitCost,
      lastMovementDate: lastDate ? lastDate.toISOString() : null,
      daysSinceMovement,
      movementCountInPeriod: recentCount,
      status,
    });
  }

  const statusOrder = { dead: 0, no_movement: 1, slow: 2 };
  return result.sort(
    (a, b) =>
      statusOrder[a.status] - statusOrder[b.status] ||
      b.stockValue - a.stockValue,
  );
}

// ---------------------------------------------------------------------------
// Shared filter helpers
// ---------------------------------------------------------------------------

export async function getReportFilterOptions() {
  await requireInventoryAccess();

  const [warehouses, categories] = await Promise.all([
    prisma.warehouse.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return { warehouses, categories };
}
