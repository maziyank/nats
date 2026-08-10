"use server";

import { prisma } from "@/services/lib/prisma";
import {
  PurchaseInvoiceStatus,
  PurchaseReturnStatus,
} from "@/prisma/generated/prisma/client";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

export interface VendorRecapEntry {
  contactId: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  invoiceCount: number;
  totalInvoiceAmount: number;
  returnCount: number;
  totalReturnAmount: number;
  totalPaymentAmount: number;
  netPurchases: number;
  outstanding: number;
}

export async function getVendorRecapReport(
  startDate: Date,
  endDate: Date
): Promise<VendorRecapEntry[]> {
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

  const validReturnStatuses = [
    PurchaseReturnStatus.APPROVED,
    PurchaseReturnStatus.COMPLETED,
  ];

  // Fetch invoices in period
  const invoices = await prisma.purchaseInvoice.findMany({
    where: {
      invoiceDate: { gte: startDate, lte: endOfDay },
      status: { in: validInvoiceStatuses },
    },
    select: {
      contactId: true,
      totalAmount: true,
    },
  });

  // Fetch returns in period
  const returns = await prisma.purchaseReturn.findMany({
    where: {
      returnDate: { gte: startDate, lte: endOfDay },
      status: { in: validReturnStatuses },
    },
    select: {
      contactId: true,
      totalAmount: true,
    },
  });

  // Fetch payments in period
  const payments = await prisma.purchasePayment.findMany({
    where: {
      paymentDate: { gte: startDate, lte: endOfDay },
    },
    select: {
      contactId: true,
      amount: true,
    },
  });

  const summary = new Map<
    string,
    {
      contactId: string;
      invoiceCount: number;
      totalInvoiceAmount: number;
      returnCount: number;
      totalReturnAmount: number;
      totalPaymentAmount: number;
    }
  >();

  const getOrCreate = (contactId: string) => {
    if (!summary.has(contactId)) {
      summary.set(contactId, {
        contactId,
        invoiceCount: 0,
        totalInvoiceAmount: 0,
        returnCount: 0,
        totalReturnAmount: 0,
        totalPaymentAmount: 0,
      });
    }
    return summary.get(contactId)!;
  };

  for (const inv of invoices) {
    const entry = getOrCreate(inv.contactId);
    entry.invoiceCount += 1;
    entry.totalInvoiceAmount += inv.totalAmount.toNumber();
  }

  for (const ret of returns) {
    const entry = getOrCreate(ret.contactId);
    entry.returnCount += 1;
    entry.totalReturnAmount += ret.totalAmount.toNumber();
  }

  for (const pay of payments) {
    const entry = getOrCreate(pay.contactId);
    entry.totalPaymentAmount += pay.amount.toNumber();
  }

  const contactIds = Array.from(summary.keys());
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
    select: { id: true, name: true, email: true, phone: true },
  });
  const contactMap = new Map(contacts.map((c) => [c.id, c]));

  const result: VendorRecapEntry[] = [];
  for (const entry of summary.values()) {
    const contact = contactMap.get(entry.contactId);
    const netPurchases = entry.totalInvoiceAmount - entry.totalReturnAmount;
    const outstanding = netPurchases - entry.totalPaymentAmount;
    result.push({
      contactId: entry.contactId,
      contactName: contact?.name || "Unknown",
      email: contact?.email || null,
      phone: contact?.phone || null,
      invoiceCount: entry.invoiceCount,
      totalInvoiceAmount: entry.totalInvoiceAmount,
      returnCount: entry.returnCount,
      totalReturnAmount: entry.totalReturnAmount,
      totalPaymentAmount: entry.totalPaymentAmount,
      netPurchases,
      outstanding,
    });
  }

  return result.sort((a, b) => b.netPurchases - a.netPurchases);
}
