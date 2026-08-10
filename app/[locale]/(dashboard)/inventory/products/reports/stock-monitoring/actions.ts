"use server";

import { prisma } from "@/services/lib/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";
import { SuperJSON } from "@/services/lib/superjson";

const IN_TYPES = ["IN", "PRODUCTION_IN"] as const;
const OUT_TYPES = ["OUT", "PRODUCTION_OUT"] as const;

function buildDateFilter(
  dateFrom?: string,
  dateTo?: string,
): Prisma.InventoryMovementWhereInput {
  const filter: Prisma.InventoryMovementWhereInput = {};
  if (dateFrom || dateTo) {
    filter.transactionDate = {};
    if (dateFrom) filter.transactionDate.gte = new Date(dateFrom);
    if (dateTo) filter.transactionDate.lte = new Date(dateTo + "T23:59:59");
  }
  return filter;
}

/**
 * Categorize a movement detail as IN or OUT relative to a warehouse.
 * Returns { isIn, isOut }.
 */
function categorizeMovement(
  type: string,
  toWarehouseId: string | null,
  fromWarehouseId: string | null,
  warehouseId?: string,
): { isIn: boolean; isOut: boolean } {
  if (IN_TYPES.includes(type as (typeof IN_TYPES)[number])) {
    if (!warehouseId || toWarehouseId === warehouseId) {
      return { isIn: true, isOut: false };
    }
  } else if (OUT_TYPES.includes(type as (typeof OUT_TYPES)[number])) {
    if (!warehouseId || fromWarehouseId === warehouseId) {
      return { isIn: false, isOut: true };
    }
  } else if (type === "TRANSFER" && warehouseId) {
    return {
      isIn: toWarehouseId === warehouseId,
      isOut: fromWarehouseId === warehouseId,
    };
  }
  return { isIn: false, isOut: false };
}

export async function getWarehousesForFilter() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "inventory.view")) {
    return [];
  }

  return await prisma.warehouse.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export type StockMonitoringItem = {
  id: string;
  sku: string;
  name: string;
  unitSymbol: string;
  openingStock: number;
  stockIn: number;
  stockOut: number;
  closingStock: number;
};

export async function getStockMonitoring(params: {
  page?: number;
  limit?: number;
  search?: string;
  warehouseId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "inventory.view")) {
    return { items: [], total: 0, totalPages: 0 };
  }

  const {
    page = 1,
    limit = 10,
    search,
    warehouseId,
    dateFrom,
    dateTo,
  } = params;
  const skip = (page - 1) * limit;

  const productWhere: Prisma.ProductWhereInput = { AND: [] };
  if (search) {
    (productWhere.AND as Prisma.ProductWhereInput[]).push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where: productWhere,
      include: {
        baseUnit: true,
        inventory: warehouseId ? { where: { warehouseId } } : true,
      },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.product.count({ where: productWhere }),
  ]);

  const productIds = products.map((p) => p.id);

  const dateFilter = buildDateFilter(dateFrom, dateTo);

  // Get all movement details for these products in the period
  const movements = await prisma.inventoryMovementDetail.findMany({
    where: {
      productId: { in: productIds },
      inventoryMovement: {
        status: "COMPLETED",
        ...dateFilter,
      },
    },
    include: {
      inventoryMovement: true,
    },
  });

  // Aggregate per product
  const movementMap = new Map<
    string,
    { stockIn: number; stockOut: number }
  >();

  for (const m of movements) {
    const { isIn, isOut } = categorizeMovement(
      m.inventoryMovement.type,
      m.inventoryMovement.toWarehouseId,
      m.inventoryMovement.fromWarehouseId,
      warehouseId,
    );

    if (!isIn && !isOut) continue;

    const entry = movementMap.get(m.productId) || {
      stockIn: 0,
      stockOut: 0,
    };
    if (isIn) entry.stockIn += m.quantity;
    if (isOut) entry.stockOut += m.quantity;
    movementMap.set(m.productId, entry);
  }

  const items: StockMonitoringItem[] = products.map((p) => {
    const closingStock = p.inventory.reduce(
      (sum, inv) => sum + inv.quantity,
      0,
    );
    const { stockIn, stockOut } = movementMap.get(p.id) || {
      stockIn: 0,
      stockOut: 0,
    };
    const openingStock = closingStock - stockIn + stockOut;
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      unitSymbol: p.baseUnit?.symbol || "",
      openingStock,
      stockIn,
      stockOut,
      closingStock,
    };
  });

  return {
    items: SuperJSON.serialize(items),
    total,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Full unpaginated dataset for CSV/Excel export (capped at 50_000 rows).
 */
export async function getStockMonitoringForExport(params: {
  search?: string;
  warehouseId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const result = await getStockMonitoring({
    ...params,
    page: 1,
    limit: 50_000,
  });
  const items = SuperJSON.deserialize(
    result.items as import("superjson").SuperJSONResult,
  ) as StockMonitoringItem[];
  return { items, total: result.total };
}

export type StockMovementDetail = {
  id: string;
  date: Date;
  type: string;
  direction: "IN" | "OUT" | "ADJ" | "";
  reference: string | null;
  quantity: number;
  fromWarehouse: string;
  toWarehouse: string;
  notes: string;
  status: string;
};

export type StockMonitoringDetail = {
  product: {
    id: string;
    sku: string;
    name: string;
    category: string;
    unitSymbol: string;
    minStock: number;
  };
  summary: {
    openingStock: number;
    stockIn: number;
    stockOut: number;
    closingStock: number;
  };
  inventory: { warehouse: string; quantity: number }[];
  movements: StockMovementDetail[];
};

export async function getStockMonitoringDetail(params: {
  productId: string;
  warehouseId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "inventory.view")) {
    return null;
  }

  const { productId, warehouseId, dateFrom, dateTo } = params;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      baseUnit: true,
      category: true,
      inventory: warehouseId
        ? { where: { warehouseId }, include: { warehouse: true } }
        : { include: { warehouse: true } },
    },
  });

  if (!product) return null;

  const dateFilter = buildDateFilter(dateFrom, dateTo);

  const movements = await prisma.inventoryMovementDetail.findMany({
    where: {
      productId,
      inventoryMovement: {
        status: "COMPLETED",
        ...dateFilter,
      },
    },
    include: {
      inventoryMovement: {
        include: {
          fromWarehouse: true,
          toWarehouse: true,
        },
      },
    },
    orderBy: {
      inventoryMovement: { transactionDate: "desc" },
    },
  });

  let stockIn = 0;
  let stockOut = 0;

  const movementDetails: StockMovementDetail[] = [];

  for (const m of movements) {
    const type = m.inventoryMovement.type;
    const { isIn, isOut } = categorizeMovement(
      type,
      m.inventoryMovement.toWarehouseId,
      m.inventoryMovement.fromWarehouseId,
      warehouseId,
    );

    // Skip movements not relevant to the selected warehouse
    if (warehouseId && !isIn && !isOut && type !== "ADJUSTMENT") {
      continue;
    }

    let direction: StockMovementDetail["direction"] = "";
    if (isIn) {
      direction = "IN";
      stockIn += m.quantity;
    } else if (isOut) {
      direction = "OUT";
      stockOut += m.quantity;
    } else if (type === "ADJUSTMENT") {
      direction = "ADJ";
    }

    movementDetails.push({
      id: m.id,
      date: m.inventoryMovement.transactionDate,
      type,
      direction,
      reference: m.inventoryMovement.reference,
      quantity: m.quantity,
      fromWarehouse: m.inventoryMovement.fromWarehouse?.name || "-",
      toWarehouse: m.inventoryMovement.toWarehouse?.name || "-",
      notes: m.notes || m.inventoryMovement.notes || "",
      status: m.inventoryMovement.status,
    });
  }

  const closingStock = product.inventory.reduce(
    (sum, inv) => sum + inv.quantity,
    0,
  );
  const openingStock = closingStock - stockIn + stockOut;

  const result: StockMonitoringDetail = {
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category?.name || "-",
      unitSymbol: product.baseUnit?.symbol || "",
      minStock: product.minStock,
    },
    summary: {
      openingStock,
      stockIn,
      stockOut,
      closingStock,
    },
    inventory: product.inventory.map((inv) => ({
      warehouse: inv.warehouse.name,
      quantity: inv.quantity,
    })),
    movements: movementDetails,
  };

  return SuperJSON.serialize(result);
}
