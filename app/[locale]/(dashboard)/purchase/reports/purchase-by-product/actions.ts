"use server";

import { prisma } from "@/services/lib/prisma";
import { PurchaseOrderStatus } from "@/prisma/generated/prisma/client";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

export interface PurchaseByProductEntry {
  productId: string;
  productSku: string;
  productName: string;
  categoryName: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  grossCost: number; // sum of totalCost
  avgUnitCost: number;
  orderCount: number;
  vendorCount: number;
}

export async function getPurchaseByProductReport(
  startDate: Date,
  endDate: Date
): Promise<PurchaseByProductEntry[]> {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    throw new Error("Unauthorized");
  }

  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);

  const validStatuses = [
    PurchaseOrderStatus.ISSUED,
    PurchaseOrderStatus.PARTIALLY_RECEIVED,
    PurchaseOrderStatus.CLOSED,
  ];

  // Fetch PO items in period
  const items = await prisma.purchaseOrderItem.findMany({
    where: {
      purchaseOrder: {
        orderDate: { gte: startDate, lte: endOfDay },
        status: { in: validStatuses },
      },
    },
    select: {
      productId: true,
      quantity: true,
      receivedQuantity: true,
      unitCost: true,
      totalCost: true,
      purchaseOrder: {
        select: { contactId: true },
      },
    },
  });

  // Aggregate by product, tracking unique vendors per product
  const summary = new Map<
    string,
    {
      productId: string;
      quantityOrdered: number;
      quantityReceived: number;
      grossCost: number;
      unitCostSum: number; // for weighted average
      unitCostCount: number;
      orderCount: number;
      vendorSet: Set<string>;
    }
  >();

  for (const item of items) {
    let entry = summary.get(item.productId);
    if (!entry) {
      entry = {
        productId: item.productId,
        quantityOrdered: 0,
        quantityReceived: 0,
        grossCost: 0,
        unitCostSum: 0,
        unitCostCount: 0,
        orderCount: 0,
        vendorSet: new Set<string>(),
      };
      summary.set(item.productId, entry);
    }
    entry.quantityOrdered += item.quantity;
    entry.quantityReceived += item.receivedQuantity;
    entry.grossCost += item.totalCost.toNumber();
    entry.unitCostSum += item.unitCost.toNumber();
    entry.unitCostCount += 1;
    entry.orderCount += 1;
    entry.vendorSet.add(item.purchaseOrder.contactId);
  }

  const productIds = Array.from(summary.keys());
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      sku: true,
      name: true,
      category: { select: { name: true } },
    },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const result: PurchaseByProductEntry[] = [];
  for (const entry of summary.values()) {
    const product = productMap.get(entry.productId);
    result.push({
      productId: entry.productId,
      productSku: product?.sku || "N/A",
      productName: product?.name || "Unknown",
      categoryName: product?.category?.name || null,
      quantityOrdered: entry.quantityOrdered,
      quantityReceived: entry.quantityReceived,
      grossCost: entry.grossCost,
      avgUnitCost:
        entry.unitCostCount > 0
          ? entry.unitCostSum / entry.unitCostCount
          : 0,
      orderCount: entry.orderCount,
      vendorCount: entry.vendorSet.size,
    });
  }

  return result.sort((a, b) => b.grossCost - a.grossCost);
}
