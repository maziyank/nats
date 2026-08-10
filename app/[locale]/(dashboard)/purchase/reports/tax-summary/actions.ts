"use server";

import { prisma } from "@/services/lib/prisma";
import { PurchaseInvoiceStatus } from "@/prisma/generated/prisma/client";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

export interface PurchaseTaxSummaryEntry {
  taxRateId: string | null;
  taxRateName: string; // "No Tax" if null
  taxRateCode: string | null;
  rate: number; // percentage, 0 if no tax
  taxableAmount: number; // net-of-tax base (totalPrice - discount)
  taxAmount: number; // tax paid (recoverable input tax)
  invoiceCount: number;
}

export async function getPurchaseTaxSummary(
  startDate: Date,
  endDate: Date
): Promise<PurchaseTaxSummaryEntry[]> {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    throw new Error("Unauthorized");
  }

  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);

  const validInvoiceStatuses = [
    PurchaseInvoiceStatus.BILLED,
    PurchaseInvoiceStatus.PARTIALLY_PAID,
    PurchaseInvoiceStatus.PAID,
  ];

  const items = await prisma.purchaseInvoiceItem.findMany({
    where: {
      purchaseInvoice: {
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
      taxRate: { select: { id: true, name: true, code: true, rate: true } },
      purchaseInvoice: { select: { id: true } },
    },
  });

  const summary = new Map<string, PurchaseTaxSummaryEntry>();

  for (const item of items) {
    const key = item.taxRateId ?? "__no_tax__";
    let entry = summary.get(key);
    if (!entry) {
      entry = {
        taxRateId: item.taxRateId,
        taxRateName: item.taxRate ? item.taxRate.name : "No Tax",
        taxRateCode: item.taxRate ? item.taxRate.code : null,
        rate: item.taxRate
          ? item.taxRate.rate.toNumber()
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
  }

  // Count distinct invoices per tax rate
  const invoiceCountsByTaxRate = new Map<string, Set<string>>();
  for (const item of items) {
    const key = item.taxRateId ?? "__no_tax__";
    if (!invoiceCountsByTaxRate.has(key)) {
      invoiceCountsByTaxRate.set(key, new Set());
    }
    invoiceCountsByTaxRate.get(key)!.add(item.purchaseInvoice.id);
  }
  for (const entry of summary.values()) {
    const key = entry.taxRateId ?? "__no_tax__";
    entry.invoiceCount = invoiceCountsByTaxRate.get(key)?.size ?? 0;
  }

  return Array.from(summary.values()).sort((a, b) => b.taxAmount - a.taxAmount);
}
