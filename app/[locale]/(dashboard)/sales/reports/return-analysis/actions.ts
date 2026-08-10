"use server";

import { prisma } from "@/services/lib/prisma";
import {
  SalesInvoiceStatus,
  SalesReturnStatus,
} from "@/prisma/generated/prisma/client";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

export interface SalesReturnAnalysisEntry {
  contactId: string;
  contactName: string;
  returnCount: number;
  returnAmount: number;
  totalQtyReturned: number;
  salesAmount: number; // gross sales for the period (for return-rate calc)
  returnRate: number; // returnAmount / salesAmount * 100
  topReason: string | null;
  reasons: { reason: string; count: number; amount: number }[];
}

interface Accumulator {
  contactId: string;
  contactName: string;
  returnCount: number;
  returnAmount: number;
  totalQtyReturned: number;
  salesAmount: number;
  reasons: Map<string, { count: number; amount: number }>;
}

export async function getSalesReturnAnalysis(
  startDate: Date,
  endDate: Date
): Promise<SalesReturnAnalysisEntry[]> {
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

  const [returns, invoices] = await Promise.all([
    prisma.salesReturn.findMany({
      where: {
        returnDate: { gte: startDate, lte: endOfDay },
        status: { in: validReturnStatuses },
      },
      select: {
        contactId: true,
        totalAmount: true,
        reason: true,
        items: { select: { quantity: true } },
        contact: { select: { name: true } },
      },
      orderBy: { returnDate: "desc" },
    }),
    prisma.salesInvoice.findMany({
      where: {
        invoiceDate: { gte: startDate, lte: endOfDay },
        status: { in: validInvoiceStatuses },
      },
      select: { contactId: true, totalAmount: true },
    }),
  ]);

  const map = new Map<string, Accumulator>();

  const getOrCreate = (contactId: string): Accumulator => {
    let e = map.get(contactId);
    if (!e) {
      e = {
        contactId,
        contactName: "Unknown",
        returnCount: 0,
        returnAmount: 0,
        totalQtyReturned: 0,
        salesAmount: 0,
        reasons: new Map(),
      };
      map.set(contactId, e);
    }
    return e;
  };

  // Seed sales amounts
  for (const inv of invoices) {
    getOrCreate(inv.contactId).salesAmount += inv.totalAmount.toNumber();
  }

  // Accumulate returns
  for (const ret of returns) {
    const e = getOrCreate(ret.contactId);
    e.contactName = ret.contact?.name || e.contactName;
    e.returnCount += 1;
    e.returnAmount += ret.totalAmount.toNumber();
    e.totalQtyReturned += ret.items.reduce((s, i) => s + i.quantity, 0);

    const reasonText = ret.reason || "Unspecified";
    let r = e.reasons.get(reasonText);
    if (!r) {
      r = { count: 0, amount: 0 };
      e.reasons.set(reasonText, r);
    }
    r.count += 1;
    r.amount += ret.totalAmount.toNumber();
  }

  // Ensure contact names for invoice-only contacts
  const contactIds = Array.from(map.keys());
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
    select: { id: true, name: true },
  });
  const contactMap = new Map(contacts.map((c) => [c.id, c.name]));

  return Array.from(map.values())
    .map((e) => {
      const reasonsArr = Array.from(e.reasons.entries())
        .map(([reason, v]) => ({ reason, count: v.count, amount: v.amount }))
        .sort((a, b) => b.count - a.count);
      const topReason = reasonsArr.length > 0 ? reasonsArr[0].reason : null;
      const returnRate =
        e.salesAmount > 0 ? (e.returnAmount / e.salesAmount) * 100 : 0;
      return {
        contactId: e.contactId,
        contactName: contactMap.get(e.contactId) || e.contactName,
        returnCount: e.returnCount,
        returnAmount: e.returnAmount,
        totalQtyReturned: e.totalQtyReturned,
        salesAmount: e.salesAmount,
        returnRate,
        topReason,
        reasons: reasonsArr,
      };
    })
    .sort((a, b) => b.returnAmount - a.returnAmount);
}
