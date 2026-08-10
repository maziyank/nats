"use server";

import { prisma } from "@/services/lib/prisma";
import { SalesOrderStatus, SalesInvoiceStatus } from "@/prisma/generated/prisma/client";
import { startOfMonth, subMonths, format } from "date-fns";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

export async function getDashboardSummary() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return {
      success: false,
      error: "Unauthorized",
    };
  }

  try {
    const [
      totalOrders,
      totalInvoices,
      totalPayments,
      outstandingInvoices
    ] = await Promise.all([
      // Total Sales Orders Count
      prisma.salesOrder.count(),

      // Total Sales (Invoiced Amount)
      prisma.salesInvoice.aggregate({
        _sum: {
          totalAmount: true,
        },
        where: {
          status: {
            notIn: [SalesInvoiceStatus.DRAFT, SalesInvoiceStatus.CANCELLED],
          },
        },
      }),

      // Total Received (Payments)
      prisma.salesPayment.aggregate({
        _sum: {
          amount: true,
        },
      }),

      // Total Outstanding (Balance Due on Invoices)
      prisma.salesInvoice.aggregate({
        _sum: {
          balanceDue: true,
        },
        where: {
          status: {
            notIn: [SalesInvoiceStatus.DRAFT, SalesInvoiceStatus.CANCELLED, SalesInvoiceStatus.PAID],
          },
        },
      }),
    ]);

    const totalSalesAmount = totalInvoices._sum.totalAmount?.toNumber() || 0;
    const totalReceivedAmount = totalPayments._sum.amount?.toNumber() || 0;
    const outstandingAmount = outstandingInvoices._sum.balanceDue?.toNumber() || 0;

    return {
      success: true,
      data: {
        totalOrders,
        totalSales: totalSalesAmount,
        totalReceived: totalReceivedAmount,
        outstandingAmount: outstandingAmount,
      },
    };
  } catch (error) {
    console.error("Error fetching sales dashboard summary:", error);
    return { success: false, error: "Failed to fetch sales dashboard summary" };
  }
}

export async function getSalesTrends() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const today = new Date();
    const months = Array.from({ length: 6 }, (_, idx) => {
      const offset = 5 - idx;
      const date = subMonths(today, offset);
      return {
        key: format(date, "MMM yyyy"),
        start: startOfMonth(date),
        end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999),
      };
    });

    // One aggregate per month in parallel — avoid loading all orders into Node.
    const amounts = await Promise.all(
      months.map(async ({ start, end }) => {
        const agg = await prisma.salesOrder.aggregate({
          where: {
            createdAt: { gte: start, lte: end },
            status: { not: SalesOrderStatus.CANCELLED },
          },
          _sum: { totalAmount: true },
        });
        return Number(agg._sum.totalAmount ?? 0);
      }),
    );

    const result = months.map((m, i) => ({
      name: m.key,
      amount: amounts[i],
    }));

    return { success: true, data: result };
  } catch (error) {
    console.error("Error fetching sales trends:", error);
    return { success: false, error: "Failed to fetch sales trends" };
  }
}

export async function getRecentSales() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const recentOrders = await prisma.salesOrder.findMany({
      take: 5,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        contact: {
          select: {
            name: true,
          },
        },
      },
    });

    const formattedOrders = recentOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customer: order.contact.name,
      date: order.createdAt,
      status: order.status,
      amount: order.totalAmount.toNumber(),
    }));

    return { success: true, data: formattedOrders };
  } catch (error) {
    console.error("Error fetching recent sales:", error);
    return { success: false, error: "Failed to fetch recent sales" };
  }
}

export async function getTopCustomers() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const topCustomers = await prisma.salesInvoice.groupBy({
      by: ["contactId"],
      _sum: {
        totalAmount: true,
      },
      where: {
        status: {
          notIn: [SalesInvoiceStatus.DRAFT, SalesInvoiceStatus.CANCELLED],
        },
      },
      orderBy: {
        _sum: {
          totalAmount: "desc",
        },
      },
      take: 5,
    });

    // Fetch contact details
    const contactIds = topCustomers.map((c) => c.contactId);
    const contacts = await prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: { id: true, name: true, email: true },
    });

    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    const formattedData = topCustomers.map((c) => ({
      id: c.contactId,
      name: contactMap.get(c.contactId)?.name || "Unknown",
      email: contactMap.get(c.contactId)?.email || "",
      amount: c._sum.totalAmount?.toNumber() || 0,
    }));

    return { success: true, data: formattedData };
  } catch (error) {
    console.error("Error fetching top customers:", error);
    return { success: false, error: "Failed to fetch top customers" };
  }
}

export async function getTopProducts(): Promise<{
  success: boolean;
  error?: string;
  data?: {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    amount: number;
  }[];
}> {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    // Only count products from non-cancelled/draft invoices
    const topProducts = await prisma.salesInvoiceItem.groupBy({
      by: ["productId"],
      _sum: {
        quantity: true,
        totalPrice: true,
      },
      where: {
        salesInvoice: {
          status: {
            notIn: [SalesInvoiceStatus.DRAFT, SalesInvoiceStatus.CANCELLED],
          },
        },
        productId: {
          not: null,
        },
      },
      orderBy: {
        _sum: {
          quantity: "desc",
        },
      },
      take: 5,
    });

    const productIds = topProducts
      .map((p) => p.productId)
      .filter((id): id is string => id !== null);

    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    const formattedData = topProducts
      .filter((p) => p.productId !== null)
      .map((p) => ({
        id: p.productId as string,
        name: productMap.get(p.productId as string)?.name || "Unknown",
        sku: productMap.get(p.productId as string)?.sku || "",
        quantity: p._sum.quantity || 0,
        amount: p._sum.totalPrice?.toNumber() || 0,
      }));

    return { success: true, data: formattedData };
  } catch (error) {
    console.error("Error fetching top products:", error);
    return { success: false, error: "Failed to fetch top products" };
  }
}

export async function getOutstandingSummary() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const outstandingInvoices = await prisma.salesInvoice.findMany({
      where: {
        status: {
          notIn: [SalesInvoiceStatus.DRAFT, SalesInvoiceStatus.CANCELLED, SalesInvoiceStatus.PAID],
        },
        balanceDue: {
          gt: 0,
        },
      },
      select: {
        dueDate: true,
        balanceDue: true,
      },
    });

    const now = new Date();
    // Reset to start of day for accurate day calculation
    now.setHours(0, 0, 0, 0);

    let notDue = 0;
    let days1to30 = 0;
    let days31to60 = 0;
    let daysOver60 = 0;

    outstandingInvoices.forEach((invoice) => {
      const amount = invoice.balanceDue.toNumber();

      const dueDate = new Date(invoice.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      if (dueDate >= now) {
        notDue += amount;
      } else {
        const diffTime = Math.abs(now.getTime() - dueDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 30) {
          days1to30 += amount;
        } else if (diffDays <= 60) {
          days31to60 += amount;
        } else {
          daysOver60 += amount;
        }
      }
    });

    return {
      success: true,
      data: [
        { name: "Not Due", amount: notDue },
        { name: "1-30 Days", amount: days1to30 },
        { name: "31-60 Days", amount: days31to60 },
        { name: "> 60 Days", amount: daysOver60 },
      ],
    };
  } catch (error) {
    console.error("Error fetching outstanding summary:", error);
    return { success: false, error: "Failed to fetch outstanding summary" };
  }
}

export async function getOverdueInvoices() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "sales.view")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const overdueInvoices = await prisma.salesInvoice.findMany({
      where: {
        status: {
          notIn: [SalesInvoiceStatus.DRAFT, SalesInvoiceStatus.CANCELLED, SalesInvoiceStatus.PAID],
        },
        balanceDue: {
          gt: 0,
        },
        dueDate: {
          lt: new Date(),
        },
      },
      take: 5,
      orderBy: {
        dueDate: "asc",
      },
      include: {
        contact: {
          select: {
            name: true,
          },
        },
      },
    });

    const formattedData = overdueInvoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.contact.name,
      dueDate: inv.dueDate,
      balanceDue: inv.balanceDue.toNumber(),
      totalAmount: inv.totalAmount.toNumber(),
    }));

    return { success: true, data: formattedData };
  } catch (error) {
    console.error("Error fetching overdue invoices:", error);
    return { success: false, error: "Failed to fetch overdue invoices" };
  }
}
