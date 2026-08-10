"use server";

import { prisma } from "@/services/lib/prisma";
import { SalesInvoiceStatus } from "@/prisma/generated/prisma/client";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

export interface ProfitabilityEntry {
  productId: string;
  productSku: string;
  productName: string;
  categoryName: string | null;
  quantitySold: number;
  revenue: number; // totalPrice - discount
  cogs: number; // quantity * averageCost (fallback to cost)
  grossProfit: number; // revenue - cogs
  marginPct: number; // grossProfit / revenue * 100
}

export async function getProfitabilityReport(
  startDate: Date,
  endDate: Date
): Promise<ProfitabilityEntry[]> {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    throw new Error("Unauthorized");
  }

  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);

  const validInvoiceStatuses = [
    SalesInvoiceStatus.ISSUED,
    SalesInvoiceStatus.PARTIALLY_PAID,
    SalesInvoiceStatus.PAID,
    SalesInvoiceStatus.OVERDUE,
  ];

  // Fetch invoice items with their product (for COGS) in the period
  const items = await prisma.salesInvoiceItem.findMany({
    where: {
      salesInvoice: {
        invoiceDate: { gte: startDate, lte: endOfDay },
        status: { in: validInvoiceStatuses },
      },
      productId: { not: null },
    },
    select: {
      quantity: true,
      totalPrice: true,
      discount: true,
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          cost: true,
          averageCost: true,
          category: { select: { name: true } },
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
      quantitySold: number;
      revenue: number;
      cogs: number;
    }
  >();

  for (const item of items) {
    const product = item.product;
    if (!product) continue;

    const revenue = item.totalPrice.toNumber() - item.discount.toNumber();
    const unitCost =
      product.averageCost.toNumber() > 0
        ? product.averageCost.toNumber()
        : product.cost.toNumber();
    const cogs = item.quantity * unitCost;

    let entry = summary.get(product.id);
    if (!entry) {
      entry = {
        productSku: product.sku,
        productName: product.name,
        categoryName: product.category?.name || null,
        quantitySold: 0,
        revenue: 0,
        cogs: 0,
      };
      summary.set(product.id, entry);
    }
    entry.quantitySold += item.quantity;
    entry.revenue += revenue;
    entry.cogs += cogs;
  }

  const result: ProfitabilityEntry[] = [];
  for (const [productId, entry] of summary.entries()) {
    const grossProfit = entry.revenue - entry.cogs;
    const marginPct = entry.revenue > 0 ? (grossProfit / entry.revenue) * 100 : 0;
    result.push({
      productId,
      productSku: entry.productSku,
      productName: entry.productName,
      categoryName: entry.categoryName,
      quantitySold: entry.quantitySold,
      revenue: entry.revenue,
      cogs: entry.cogs,
      grossProfit,
      marginPct,
    });
  }

  return result.sort((a, b) => b.grossProfit - a.grossProfit);
}
