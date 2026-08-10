"use server";

import { prisma } from "@/services/lib/prisma";
import { SalesInvoiceStatus } from "@/prisma/generated/prisma/client";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

export interface PosSalesEntry {
  sessionId: string;
  sessionNumber: string;
  cashierId: string;
  cashierName: string;
  warehouseName: string | null;
  departmentName: string | null;
  status: string;
  startTime: string;
  endTime: string | null;
  invoiceCount: number;
  grossSales: number;
  taxAmount: number;
  discountAmount: number;
  netSales: number;
  paymentCount: number;
  paymentAmount: number;
  cashPayments: number;
  nonCashPayments: number;
  openingCash: number;
  closingCash: number | null;
  actualCash: number | null;
  cashDifference: number | null;
}

export async function getPosSalesReport(
  startDate: Date,
  endDate: Date
): Promise<PosSalesEntry[]> {
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

  const posSessions = await prisma.pOSSession.findMany({
    where: {
      startTime: { gte: startDate, lte: endOfDay },
    },
    select: {
      id: true,
      sessionNumber: true,
      cashierId: true,
      status: true,
      startTime: true,
      endTime: true,
      openingCash: true,
      closingCash: true,
      actualCash: true,
      difference: true,
      warehouse: { select: { name: true } },
      department: { select: { name: true } },
      salesInvoices: {
        where: { status: { in: validInvoiceStatuses } },
        select: {
          totalAmount: true,
          subtotal: true,
          totalTax: true,
          globalDiscount: true,
        },
      },
      salesPayments: {
        select: {
          amount: true,
          method: true,
        },
      },
    },
    orderBy: { startTime: "desc" },
  });

  const cashierIds = Array.from(
    new Set(posSessions.map((s) => s.cashierId).filter(Boolean))
  );

  const cashiers = await prisma.user.findMany({
    where: { id: { in: cashierIds } },
    select: { id: true, name: true },
  });
  const cashierMap = new Map(cashiers.map((c) => [c.id, c.name]));

  return posSessions.map((s) => {
    const grossSales = s.salesInvoices.reduce(
      (sum, inv) => sum + inv.subtotal.toNumber(),
      0
    );
    const taxAmount = s.salesInvoices.reduce(
      (sum, inv) => sum + inv.totalTax.toNumber(),
      0
    );
    const discountAmount = s.salesInvoices.reduce(
      (sum, inv) => sum + inv.globalDiscount.toNumber(),
      0
    );
    const netSales = s.salesInvoices.reduce(
      (sum, inv) => sum + inv.totalAmount.toNumber(),
      0
    );
    const paymentAmount = s.salesPayments.reduce(
      (sum, p) => sum + p.amount.toNumber(),
      0
    );
    const cashPayments = s.salesPayments
      .filter((p) => (p.method ?? "CASH").toUpperCase() === "CASH")
      .reduce((sum, p) => sum + p.amount.toNumber(), 0);
    const nonCashPayments = paymentAmount - cashPayments;

    return {
      sessionId: s.id,
      sessionNumber: s.sessionNumber,
      cashierId: s.cashierId,
      cashierName: cashierMap.get(s.cashierId) ?? "Unknown",
      warehouseName: s.warehouse?.name ?? null,
      departmentName: s.department?.name ?? null,
      status: s.status,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime?.toISOString() ?? null,
      invoiceCount: s.salesInvoices.length,
      grossSales,
      taxAmount,
      discountAmount,
      netSales,
      paymentCount: s.salesPayments.length,
      paymentAmount,
      cashPayments,
      nonCashPayments,
      openingCash: s.openingCash.toNumber(),
      closingCash: s.closingCash?.toNumber() ?? null,
      actualCash: s.actualCash?.toNumber() ?? null,
      cashDifference: s.difference?.toNumber() ?? null,
    };
  });
}
