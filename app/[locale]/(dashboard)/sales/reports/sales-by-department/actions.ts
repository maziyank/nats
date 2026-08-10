"use server";

import { prisma } from "@/services/lib/prisma";
import {
  SalesInvoiceStatus,
  SalesReturnStatus,
} from "@/prisma/generated/prisma/client";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

export interface SalesByDepartmentEntry {
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string;
  invoiceCount: number;
  totalInvoiceAmount: number;
  returnCount: number;
  totalReturnAmount: number;
  totalPaymentAmount: number;
  netSales: number;
  outstanding: number;
}

export async function getSalesByDepartmentReport(
  startDate: Date,
  endDate: Date
): Promise<SalesByDepartmentEntry[]> {
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

  const [invoices, returns, payments] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: {
        invoiceDate: { gte: startDate, lte: endOfDay },
        status: { in: validInvoiceStatuses },
      },
      select: {
        departmentId: true,
        totalAmount: true,
        balanceDue: true,
        department: { select: { id: true, name: true, code: true } },
      },
    }),
    prisma.salesReturn.findMany({
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
    prisma.salesPayment.findMany({
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
    outstanding: number;
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
        outstanding: 0,
      };
      summary.set(key, entry);
    }
    return entry;
  };

  for (const inv of invoices) {
    const entry = ensure(inv.departmentId, inv.department);
    entry.invoiceCount += 1;
    entry.totalInvoiceAmount += inv.totalAmount.toNumber();
    entry.outstanding += inv.balanceDue.toNumber();
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
      netSales: entry.totalInvoiceAmount - entry.totalReturnAmount,
    }))
    .sort((a, b) => b.netSales - a.netSales);
}
