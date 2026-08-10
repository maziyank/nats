"use server";

import { prisma } from "@/services/lib/prisma";
import { SalesInvoiceStatus } from "@/prisma/generated/prisma/client";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

export interface SalesByProductEntry {
  productId: string;
  productSku: string;
  productName: string;
  categoryName: string | null;
  quantitySold: number;
  grossAmount: number; // sum of totalPrice before discount
  discountAmount: number;
  taxAmount: number;
  netAmount: number; // totalPrice - discount + tax
  avgUnitPrice: number;
  invoiceCount: number;
}

export async function getSalesByProductReport(
  startDate: Date,
  endDate: Date
): Promise<SalesByProductEntry[]> {
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

  // Fetch invoice items in period with linked product + invoice (for date filter)
  const items = await prisma.salesInvoiceItem.findMany({
    where: {
      salesInvoice: {
        invoiceDate: { gte: startDate, lte: endOfDay },
        status: { in: validInvoiceStatuses },
      },
    },
    select: {
      productId: true,
      description: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      discount: true,
      tax: true,
      salesInvoiceId: true,
    },
  });

  // Aggregate by productId (fall back to description when productId is null)
  const summary = new Map<
    string,
    {
      productId: string | null;
      description: string;
      quantitySold: number;
      grossAmount: number;
      discountAmount: number;
      taxAmount: number;
      netAmount: number;
      unitPriceSum: number;
      lineCount: number;
      invoiceSet: Set<string>;
    }
  >();

  for (const item of items) {
    const key = item.productId ?? `desc:${item.description}`;
    let entry = summary.get(key);
    if (!entry) {
      entry = {
        productId: item.productId,
        description: item.description,
        quantitySold: 0,
        grossAmount: 0,
        discountAmount: 0,
        taxAmount: 0,
        netAmount: 0,
        unitPriceSum: 0,
        lineCount: 0,
        invoiceSet: new Set(),
      };
      summary.set(key, entry);
    }
    entry.quantitySold += item.quantity;
    entry.grossAmount += item.totalPrice.toNumber();
    entry.discountAmount += item.discount.toNumber();
    entry.taxAmount += item.tax.toNumber();
    entry.netAmount +=
      item.totalPrice.toNumber() -
      item.discount.toNumber() +
      item.tax.toNumber();
    entry.unitPriceSum += item.unitPrice.toNumber();
    entry.lineCount += 1;
    entry.invoiceSet.add(item.salesInvoiceId);
  }

  // Fetch products + categories for linked items
  const productIds = Array.from(summary.values())
    .map((e) => e.productId)
    .filter((id): id is string => id !== null);

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

  const result: SalesByProductEntry[] = [];
  for (const entry of summary.values()) {
    const product = entry.productId ? productMap.get(entry.productId) : null;
    const lineCount = entry.lineCount || 1;
    result.push({
      productId: entry.productId ?? `desc:${entry.description}`,
      productSku: product?.sku ?? "—",
      productName: product?.name ?? entry.description,
      categoryName: product?.category?.name ?? null,
      quantitySold: entry.quantitySold,
      grossAmount: entry.grossAmount,
      discountAmount: entry.discountAmount,
      taxAmount: entry.taxAmount,
      netAmount: entry.netAmount,
      avgUnitPrice: entry.unitPriceSum / lineCount,
      invoiceCount: entry.invoiceSet.size,
    });
  }

  return result.sort((a, b) => b.netAmount - a.netAmount);
}
