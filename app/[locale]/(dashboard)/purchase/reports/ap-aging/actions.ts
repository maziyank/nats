"use server";

import { prisma } from "@/services/lib/prisma";
import {
  PurchaseInvoiceStatus,
  PurchaseReturnStatus,
} from "@/prisma/generated/prisma/client";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

// Aging buckets (in days): 0-30, 31-60, 61-90, 90+
const BUCKET_1 = 30;
const BUCKET_2 = 60;
const BUCKET_3 = 90;

export interface APAgingEntry {
  contactId: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  daysOverdue: number;
  bucket: "current" | "1-30" | "31-60" | "61-90" | "90+";
}

export interface APAgingSummaryEntry {
  contactId: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  invoiceCount: number;
  current: number;
  bucket1: number; // 1-30
  bucket2: number; // 31-60
  bucket3: number; // 61-90
  bucket4: number; // 90+
  totalOutstanding: number;
}

function getBucket(daysOverdue: number): APAgingEntry["bucket"] {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= BUCKET_1) return "1-30";
  if (daysOverdue <= BUCKET_2) return "31-60";
  if (daysOverdue <= BUCKET_3) return "61-90";
  return "90+";
}

/**
 * Detail AP Aging: one row per outstanding invoice.
 * As-of date defaults to today. PurchaseInvoice has no balanceDue field,
 * so balance = totalAmount − payments − returns.
 */
export async function getAPAgingDetail(
  asOfDate?: Date
): Promise<APAgingEntry[]> {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    throw new Error("Unauthorized");
  }

  const asOf = asOfDate ?? new Date();
  asOf.setHours(23, 59, 59, 999);

  // Outstanding invoices: any non-draft/cancelled/paid status.
  const validStatuses = [
    PurchaseInvoiceStatus.BILLED,
    PurchaseInvoiceStatus.PARTIALLY_PAID,
  ];

  const validReturnStatuses = [
    PurchaseReturnStatus.APPROVED,
    PurchaseReturnStatus.COMPLETED,
  ];

  const invoices = await prisma.purchaseInvoice.findMany({
    where: {
      status: { in: validStatuses },
      invoiceDate: { lte: asOf },
    },
    select: {
      id: true,
      invoiceNumber: true,
      contactId: true,
      invoiceDate: true,
      dueDate: true,
      totalAmount: true,
      payments: {
        where: { paymentDate: { lte: asOf } },
        select: { amount: true },
      },
      returns: {
        where: {
          returnDate: { lte: asOf },
          status: { in: validReturnStatuses },
        },
        select: { totalAmount: true },
      },
    },
  });

  const contactIds = Array.from(new Set(invoices.map((i) => i.contactId)));
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
    select: { id: true, name: true, email: true, phone: true },
  });
  const contactMap = new Map(contacts.map((c) => [c.id, c]));

  const result: APAgingEntry[] = [];
  for (const inv of invoices) {
    const totalAmount = inv.totalAmount.toNumber();
    const paidAmount = inv.payments.reduce(
      (s, p) => s + p.amount.toNumber(),
      0
    );
    const returnAmount = inv.returns.reduce(
      (s, r) => s + r.totalAmount.toNumber(),
      0
    );
    const balance = totalAmount - paidAmount - returnAmount;
    // Skip fully settled invoices
    if (balance <= 0.0001) continue;

    const daysOverdue = Math.floor(
      (asOf.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const contact = contactMap.get(inv.contactId);
    result.push({
      contactId: inv.contactId,
      contactName: contact?.name || "Unknown",
      email: contact?.email || null,
      phone: contact?.phone || null,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      totalAmount,
      paidAmount: paidAmount + returnAmount,
      balance,
      daysOverdue,
      bucket: getBucket(daysOverdue),
    });
  }

  return result.sort(
    (a, b) =>
      a.contactName.localeCompare(b.contactName) || b.daysOverdue - a.daysOverdue
  );
}

/**
 * Summary AP Aging: outstanding balances bucketed per vendor.
 */
export async function getAPAgingSummary(
  asOfDate?: Date
): Promise<APAgingSummaryEntry[]> {
  const detail = await getAPAgingDetail(asOfDate);
  const map = new Map<string, APAgingSummaryEntry>();

  for (const item of detail) {
    let entry = map.get(item.contactId);
    if (!entry) {
      entry = {
        contactId: item.contactId,
        contactName: item.contactName,
        email: item.email,
        phone: item.phone,
        invoiceCount: 0,
        current: 0,
        bucket1: 0,
        bucket2: 0,
        bucket3: 0,
        bucket4: 0,
        totalOutstanding: 0,
      };
      map.set(item.contactId, entry);
    }
    entry.invoiceCount += 1;
    entry.totalOutstanding += item.balance;
    switch (item.bucket) {
      case "current":
        entry.current += item.balance;
        break;
      case "1-30":
        entry.bucket1 += item.balance;
        break;
      case "31-60":
        entry.bucket2 += item.balance;
        break;
      case "61-90":
        entry.bucket3 += item.balance;
        break;
      case "90+":
        entry.bucket4 += item.balance;
        break;
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.totalOutstanding - a.totalOutstanding
  );
}
