"use server";

import { prisma } from "@/services/lib/prisma";
import { SalesInvoiceStatus } from "@/prisma/generated/prisma/client";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

export interface SalesTaxSummaryEntry {
  taxRateId: string | null;
  taxRateName: string; // "No Tax" if null
  taxRateCode: string | null;
  rate: number; // percentage, 0 if no tax
  taxableAmount: number; // net-of-tax base (totalPrice - discount)
  taxAmount: number; // tax charged
  invoiceCount: number;
}

export async function getSalesTaxSummary(
  startDate: Date,
  endDate: Date
): Promise<SalesTaxSummaryEntry[]> {
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

  const items = await prisma.salesInvoiceItem.findMany({
    where: {
      salesInvoice: {
        invoiceDate: { gte: startDate, lte: endOfDay },
        status: { in: validInvoiceStatuses },
      },
    },
    select: {
      totalPrice: true,
      discount: true,
      tax: true,
      taxRateId: true,
      taxRateSnapshot: true,
      taxRule: { select: { id: true, name: true, code: true, rate: true } },
    },
  });

  const summary = new Map<string, SalesTaxSummaryEntry>();

  for (const item of items) {
    const key = item.taxRateId ?? "__no_tax__";
    let entry = summary.get(key);
    if (!entry) {
      entry = {
        taxRateId: item.taxRateId,
        taxRateName: item.taxRule ? item.taxRule.name : "No Tax",
        taxRateCode: item.taxRule ? item.taxRule.code : null,
        rate: item.taxRule
          ? item.taxRule.rate.toNumber()
          : item.taxRateSnapshot
            ? item.taxRateSnapshot.toNumber()
            : 0,
        taxableAmount: 0,
        taxAmount: 0,
        invoiceCount: 0,
      };
      summary.set(key, entry);
    }
    const taxable = Math.max(
      0,
      item.totalPrice.toNumber() - item.discount.toNumber()
    );
    entry.taxableAmount += taxable;
    entry.taxAmount += item.tax.toNumber();
    entry.invoiceCount += 1;
  }

  return Array.from(summary.values()).sort(
    (a, b) => b.taxAmount - a.taxAmount
  );
}
