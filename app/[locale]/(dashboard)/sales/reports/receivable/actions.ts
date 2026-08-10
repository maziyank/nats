"use server";

import { prisma } from "@/services/lib/prisma";
import {
  SalesInvoiceStatus,
  SalesReturnStatus,
} from "@/prisma/generated/prisma/client";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

export interface ReceivableReportEntry {
  contactId: string;
  contactName: string;
  email: string | null;
  openingBalance: number;
  // Mutations during period
  invoiceAmount: number; // additions
  returnAmount: number; // reductions (returns)
  paymentAmount: number; // reductions (payments)
  closingBalance: number;
}

export async function getReceivableReport(
  startDate: Date,
  endDate: Date
): Promise<ReceivableReportEntry[]> {
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

  const validReturnStatuses = [
    SalesReturnStatus.APPROVED,
    SalesReturnStatus.COMPLETED,
  ];

  // 1. Opening balance: invoices issued before startDate - payments before startDate
  const openingInvoices = await prisma.salesInvoice.findMany({
    where: {
      invoiceDate: { lt: startDate },
      status: { in: validInvoiceStatuses },
    },
    select: { contactId: true, totalAmount: true },
  });

  const openingPayments = await prisma.salesPayment.findMany({
    where: {
      paymentDate: { lt: startDate },
    },
    select: { contactId: true, amount: true },
  });

  const openingReturns = await prisma.salesReturn.findMany({
    where: {
      returnDate: { lt: startDate },
      status: { in: validReturnStatuses },
    },
    select: { contactId: true, totalAmount: true },
  });

  // 2. Mutations during period
  const periodInvoices = await prisma.salesInvoice.findMany({
    where: {
      invoiceDate: { gte: startDate, lte: endOfDay },
      status: { in: validInvoiceStatuses },
    },
    select: { contactId: true, totalAmount: true },
  });

  const periodPayments = await prisma.salesPayment.findMany({
    where: {
      paymentDate: { gte: startDate, lte: endOfDay },
    },
    select: { contactId: true, amount: true },
  });

  const periodReturns = await prisma.salesReturn.findMany({
    where: {
      returnDate: { gte: startDate, lte: endOfDay },
      status: { in: validReturnStatuses },
    },
    select: { contactId: true, totalAmount: true },
  });

  const summary = new Map<
    string,
    {
      openingBalance: number;
      invoiceAmount: number;
      paymentAmount: number;
      returnAmount: number;
    }
  >();

  const getOrCreate = (contactId: string) => {
    if (!summary.has(contactId)) {
      summary.set(contactId, {
        openingBalance: 0,
        invoiceAmount: 0,
        paymentAmount: 0,
        returnAmount: 0,
      });
    }
    return summary.get(contactId)!;
  };

  // Opening balance = invoices before start - payments before start - returns before start
  for (const inv of openingInvoices) {
    getOrCreate(inv.contactId).openingBalance += inv.totalAmount.toNumber();
  }
  for (const pay of openingPayments) {
    getOrCreate(pay.contactId).openingBalance -= pay.amount.toNumber();
  }
  for (const ret of openingReturns) {
    getOrCreate(ret.contactId).openingBalance -= ret.totalAmount.toNumber();
  }

  // Period mutations
  for (const inv of periodInvoices) {
    getOrCreate(inv.contactId).invoiceAmount += inv.totalAmount.toNumber();
  }
  for (const pay of periodPayments) {
    getOrCreate(pay.contactId).paymentAmount += pay.amount.toNumber();
  }
  for (const ret of periodReturns) {
    getOrCreate(ret.contactId).returnAmount += ret.totalAmount.toNumber();
  }

  const contactIds = Array.from(summary.keys());
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
    select: { id: true, name: true, email: true },
  });
  const contactMap = new Map(contacts.map((c) => [c.id, c]));

  const result: ReceivableReportEntry[] = [];
  for (const [contactId, entry] of summary.entries()) {
    const contact = contactMap.get(contactId);
    const closingBalance =
      entry.openingBalance + entry.invoiceAmount - entry.paymentAmount - entry.returnAmount;
    result.push({
      contactId,
      contactName: contact?.name || "Unknown",
      email: contact?.email || null,
      openingBalance: entry.openingBalance,
      invoiceAmount: entry.invoiceAmount,
      returnAmount: entry.returnAmount,
      paymentAmount: entry.paymentAmount,
      closingBalance,
    });
  }

  return result.sort((a, b) => b.closingBalance - a.closingBalance);
}
