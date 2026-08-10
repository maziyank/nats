"use server";

import { prisma } from "@/services/lib/prisma";
import {
  PurchaseInvoiceStatus,
  PurchaseReturnStatus,
} from "@/prisma/generated/prisma/client";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

export interface PurchaseByDepartmentEntry {
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string;
  invoiceCount: number;
  totalInvoiceAmount: number;
  returnCount: number;
  totalReturnAmount: number;
  totalPaymentAmount: number;
  netPurchases: number;
  outstanding: number;
}

export async function getPurchaseByDepartmentReport(
  startDate: Date,
  endDate: Date
): Promise<PurchaseByDepartmentEntry[]> {
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

  const [invoices, returns, payments] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where: {
        invoiceDate: { gte: startDate, lte: endOfDay },
        status: { in: validInvoiceStatuses },
      },
      select: {
        departmentId: true,
        totalAmount: true,
        department: { select: { id: true, name: true, code: true } },
      },
    }),
    prisma.purchaseReturn.findMany({
      where: {
        returnDate: { gte: startDate, lte: endOfDay },
        status: { in: validReturnStatuses },
      },
      select: {
        departmentId: true,
        totalAmount: true,
        department: { select: { id: true, name: true, code: true } },
      },
    }),
    prisma.purchasePayment.findMany({
      where: {
        paymentDate: { gte: startDate, lte: endOfDay },
      },
      select: {
        departmentId: true,
        amount: true,
        department: { select: { id: true, name: true, code: true } },
      },
    }),
  ]);

  type Agg = {
    departmentId: string | null;
    departmentCode: string | null;
    departmentName: string;
    invoiceCount: number;
    totalInvoiceAmount: number;
    returnCount: number;
    totalReturnAmount: number;
    totalPaymentAmount: number;
  };

  const summary = new Map<string, Agg>();

  const ensure = (
    departmentId: string | null,
    department: { id: string; name: string; code: string } | null
  ): Agg => {
    const key = departmentId ?? "__none__";
    let entry = summary.get(key);
    if (!entry) {
      entry = {
        departmentId,
        departmentCode: department?.code ?? null,
        departmentName: department?.name ?? "Unassigned",
        invoiceCount: 0,
        totalInvoiceAmount: 0,
        returnCount: 0,
        totalReturnAmount: 0,
        totalPaymentAmount: 0,
      };
      summary.set(key, entry);
    }
    return entry;
  };

  for (const inv of invoices) {
    const entry = ensure(inv.departmentId, inv.department);
    entry.invoiceCount += 1;
    entry.totalInvoiceAmount += inv.totalAmount.toNumber();
  }

  for (const ret of returns) {
    const entry = ensure(ret.departmentId, ret.department);
    entry.returnCount += 1;
    entry.totalReturnAmount += ret.totalAmount.toNumber();
  }

  for (const pay of payments) {
    const entry = ensure(pay.departmentId, pay.department);
    entry.totalPaymentAmount += pay.amount.toNumber();
  }

  return Array.from(summary.values())
    .map((entry) => ({
      ...entry,
      netPurchases: entry.totalInvoiceAmount - entry.totalReturnAmount,
      outstanding: Math.max(
        0,
        entry.totalInvoiceAmount -
          entry.totalReturnAmount -
          entry.totalPaymentAmount
      ),
    }))
    .sort((a, b) => b.netPurchases - a.netPurchases);
}
