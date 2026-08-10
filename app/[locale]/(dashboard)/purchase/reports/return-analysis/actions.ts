"use server";

import { prisma } from "@/services/lib/prisma";
import {
  PurchaseInvoiceStatus,
  PurchaseReturnStatus,
} from "@/prisma/generated/prisma/client";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

export interface PurchaseReturnAnalysisEntry {
  contactId: string;
  contactName: string;
  returnCount: number;
  returnAmount: number;
  totalQtyReturned: number;
  purchaseAmount: number; // gross purchases for the period (for return-rate calc)
  returnRate: number; // returnAmount / purchaseAmount * 100
  topReason: string | null;
  reasons: { reason: string; count: number; amount: number }[];
}

interface Accumulator {
  contactId: string;
  contactName: string;
  returnCount: number;
  returnAmount: number;
  totalQtyReturned: number;
  purchaseAmount: number;
  reasons: Map<string, { count: number; amount: number }>;
}

export async function getPurchaseReturnAnalysis(
  startDate: Date,
  endDate: Date
): Promise<PurchaseReturnAnalysisEntry[]> {
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

  const [returns, invoices] = await Promise.all([
    prisma.purchaseReturn.findMany({
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
    prisma.purchaseInvoice.findMany({
      where: {
        invoiceDate: { gte: startDate, lte: endOfDay },
        status: { in: validInvoiceStatuses },
      },
      select: {
        contactId: true,
        totalAmount: true,
      },
    }),
  ]);

  const map = new Map<string, Accumulator>();

  const getOrCreate = (contactId: string, contactName: string) => {
    let entry = map.get(contactId);
    if (!entry) {
      entry = {
        contactId,
        contactName,
        returnCount: 0,
        returnAmount: 0,
        totalQtyReturned: 0,
        purchaseAmount: 0,
        reasons: new Map(),
      };
      map.set(contactId, entry);
    }
    return entry;
  };

  // Aggregate returns
  for (const ret of returns) {
    const contactName = ret.contact?.name || "Unknown";
    const entry = getOrCreate(ret.contactId, contactName);
    entry.returnCount += 1;
    entry.returnAmount += ret.totalAmount.toNumber();
    entry.totalQtyReturned += ret.items.reduce(
      (sum, it) => sum + it.quantity,
      0
    );
    const reason = ret.reason || "Unspecified";
    let r = entry.reasons.get(reason);
    if (!r) {
      r = { count: 0, amount: 0 };
      entry.reasons.set(reason, r);
    }
    r.count += 1;
    r.amount += ret.totalAmount.toNumber();
  }

  // Aggregate purchases (for return-rate denominator)
  for (const inv of invoices) {
    let entry = map.get(inv.contactId);
    if (!entry) {
      entry = {
        contactId: inv.contactId,
        contactName: "Unknown",
        returnCount: 0,
        returnAmount: 0,
        totalQtyReturned: 0,
        purchaseAmount: 0,
        reasons: new Map(),
      };
      map.set(inv.contactId, entry);
    }
    entry.purchaseAmount += inv.totalAmount.toNumber();
  }

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
        e.purchaseAmount > 0
          ? (e.returnAmount / e.purchaseAmount) * 100
          : 0;
      return {
        contactId: e.contactId,
        contactName: contactMap.get(e.contactId) || e.contactName,
        returnCount: e.returnCount,
        returnAmount: e.returnAmount,
        totalQtyReturned: e.totalQtyReturned,
        purchaseAmount: e.purchaseAmount,
        returnRate,
        topReason,
        reasons: reasonsArr,
      };
    })
    .sort((a, b) => b.returnAmount - a.returnAmount);
}
