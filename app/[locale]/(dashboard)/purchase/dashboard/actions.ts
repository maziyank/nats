"use server";

import { prisma } from "@/services/lib/prisma";
import { PurchaseOrderStatus, PurchaseInvoiceStatus } from "@/prisma/generated/prisma/client";
import { startOfMonth, subMonths, format, endOfMonth } from "date-fns";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

export async function getDashboardSummary() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const [
      totalOrders,
      totalInvoices,
      totalPaid,
      totalOutstanding
    ] = await Promise.all([
      // Total Purchase Orders Count
      prisma.purchaseOrder.count(),

      // Total Purchase Invoices Amount (Billed)
      prisma.purchaseInvoice.aggregate({
        _sum: {
          totalAmount: true,
        },
        where: {
          status: {
            not: PurchaseInvoiceStatus.CANCELED,
          },
        },
      }),

      // Total Paid Amount
      prisma.purchasePayment.aggregate({
        _sum: {
          amount: true,
        },
      }),

      // Total Outstanding (Unpaid Invoices)
      // This is an approximation. Ideally we check balanceDue on invoice if it exists, 
      // or calculate Total Invoice Amount - Total Payment Amount linked to it.
      // Looking at schema, SalesInvoice has balanceDue but PurchaseInvoice doesn't seem to have it explicitly mentioned in the snippet I saw?
      // Wait, let me check PurchaseInvoice schema again.
      // It has `totalAmount`. It doesn't show `balanceDue` in the snippet I saw for PurchaseInvoice (only SalesInvoice had it).
      // So I might need to calculate it or just sum invoices that are not paid.
      // A better approximation for outstanding is sum of invoices with status != PAID and != CANCELED.
      // But PARTIALLY_PAID is tricky without balanceDue.
      // Let's check if PurchaseInvoice has balanceDue.
      // In 06_purchasing.prisma snippet:
      // model PurchaseInvoice { ... totalAmount Decimal ... status PurchaseInvoiceStatus ... }
      // It DOES NOT have balanceDue in the snippet.
      // So I will calculate Outstanding as: Sum(Total Amount) where status in [DRAFT, BILLED, PARTIALLY_PAID] - Sum(Payments for those invoices).
      // Or simply Sum of all Invoices (except Canceled) - Sum of all Payments.

      prisma.purchaseInvoice.aggregate({
        _sum: {
          totalAmount: true,
        },
        where: {
          status: {
            in: [PurchaseInvoiceStatus.BILLED, PurchaseInvoiceStatus.PARTIALLY_PAID],
          },
        },
      }),
    ]);

    const totalInvoiceAmount = totalInvoices._sum.totalAmount?.toNumber() || 0;
    const totalPaidAmount = totalPaid._sum.amount?.toNumber() || 0;

    // Outstanding is basically what we owe.
    // Simple calc: Total Invoices (excluding draft/canceled) - Total Payments.
    // Draft invoices usually don't count as liability yet.

    const committedInvoices = await prisma.purchaseInvoice.aggregate({
      _sum: {
        totalAmount: true
      },
      where: {
        status: {
          in: [PurchaseInvoiceStatus.BILLED, PurchaseInvoiceStatus.PARTIALLY_PAID, PurchaseInvoiceStatus.PAID]
        }
      }
    });

    const committedAmount = committedInvoices._sum.totalAmount?.toNumber() || 0;
    const outstandingAmount = Math.max(0, committedAmount - totalPaidAmount);

    return {
      success: true,
      data: {
        totalOrders,
        totalPurchases: committedAmount,
        totalPaid: totalPaidAmount,
        outstandingAmount: outstandingAmount,
      },
    };
  } catch (error) {
    console.error("Error fetching dashboard summary:", error);
    return { success: false, error: "Failed to fetch dashboard summary" };
  }
}

export async function getPurchaseTrends() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
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
        const agg = await prisma.purchaseOrder.aggregate({
          where: {
            createdAt: { gte: start, lte: end },
            status: { not: PurchaseOrderStatus.CANCELLED },
          },
          _sum: { totalAmount: true },
        });
        return Number(agg._sum.totalAmount ?? 0);
      }),
    );

    const monthlyData = new Map<string, number>();
    months.forEach((m, i) => monthlyData.set(m.key, amounts[i]));

    // Sort by date (reverse the map iteration or reconstruction)
    // Actually we initialized current to past, so keys are "Feb 2026", "Jan 2026"...
    // We want chronological order for chart.

    const result = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(today, i);
      const key = format(date, "MMM yyyy");
      result.push({
        name: key,
        amount: monthlyData.get(key) || 0
      });
    }

    return { success: true, data: result };
  } catch (error) {
    console.error("Error fetching purchase trends:", error);
    return { success: false, error: "Failed to fetch purchase trends" };
  }
}

export async function getPurchaseStatusBreakdown() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const statusCounts = await prisma.purchaseOrder.groupBy({
      by: ["status"],
      _count: {
        status: true,
      },
    });

    const formattedData = statusCounts.map((item) => ({
      status: item.status,
      count: item._count.status,
    }));

    return { success: true, data: formattedData };
  } catch (error) {
    console.error("Error fetching status breakdown:", error);
    return { success: false, error: "Failed to fetch status breakdown" };
  }
}

export async function getRecentPurchases() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const recentOrders = await prisma.purchaseOrder.findMany({
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
      vendor: order.contact.name,
      date: order.createdAt,
      status: order.status,
      amount: order.totalAmount.toNumber(),
    }));

    return { success: true, data: formattedOrders };
  } catch (error) {
    console.error("Error fetching recent purchases:", error);
    return { success: false, error: "Failed to fetch recent purchases" };
  }
}

export async function getTopSuppliers() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const topSuppliers = await prisma.purchaseInvoice.groupBy({
      by: ["contactId"],
      _sum: {
        totalAmount: true,
      },
      where: {
        status: {
          notIn: [PurchaseInvoiceStatus.CANCELED, PurchaseInvoiceStatus.DRAFT],
        },
      },
      orderBy: {
        _sum: {
          totalAmount: "desc",
        },
      },
      take: 5,
    });

    const contactIds = topSuppliers.map((s) => s.contactId);
    const contacts = await prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: { id: true, name: true, email: true },
    });

    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    const formattedData = topSuppliers.map((s) => ({
      id: s.contactId,
      name: contactMap.get(s.contactId)?.name || "Unknown",
      email: contactMap.get(s.contactId)?.email || "",
      amount: s._sum.totalAmount?.toNumber() || 0,
    }));

    return { success: true, data: formattedData };
  } catch (error) {
    console.error("Error fetching top suppliers:", error);
    return { success: false, error: "Failed to fetch top suppliers" };
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
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const topProducts = await prisma.purchaseOrderItem.groupBy({
      by: ["productId"],
      _sum: {
        quantity: true,
        totalCost: true,
      },
      where: {
        purchaseOrder: {
          status: {
            notIn: [PurchaseOrderStatus.CANCELLED, PurchaseOrderStatus.DRAFT],
          },
        },
      },
      orderBy: {
        _sum: {
          quantity: "desc",
        },
      },
      take: 5,
    });

    const productIds = topProducts.map((p) => p.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    const formattedData = topProducts.map((p) => ({
      id: p.productId,
      name: productMap.get(p.productId)?.name || "Unknown",
      sku: productMap.get(p.productId)?.sku || "",
      quantity: p._sum.quantity || 0,
      amount: p._sum.totalCost?.toNumber() || 0,
    }));

    return { success: true, data: formattedData };
  } catch (error) {
    console.error("Error fetching top purchase products:", error);
    return { success: false, error: "Failed to fetch top products" };
  }
}

export async function getOutstandingSummary() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const outstandingInvoices = await prisma.purchaseInvoice.findMany({
      where: {
        status: {
          in: [PurchaseInvoiceStatus.BILLED, PurchaseInvoiceStatus.PARTIALLY_PAID],
        },
      },
      select: {
        dueDate: true,
        totalAmount: true,
        payments: {
          select: {
            amount: true,
          },
        },
      },
    });

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    let notDue = 0;
    let days1to30 = 0;
    let days31to60 = 0;
    let daysOver60 = 0;

    outstandingInvoices.forEach((invoice) => {
      const paidAmount = invoice.payments.reduce((sum, p) => sum + p.amount.toNumber(), 0);
      const balanceDue = invoice.totalAmount.toNumber() - paidAmount;

      if (balanceDue <= 0) return;

      const dueDate = new Date(invoice.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      if (dueDate >= now) {
        notDue += balanceDue;
      } else {
        const diffTime = Math.abs(now.getTime() - dueDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 30) {
          days1to30 += balanceDue;
        } else if (diffDays <= 60) {
          days31to60 += balanceDue;
        } else {
          daysOver60 += balanceDue;
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
    console.error("Error fetching purchase outstanding summary:", error);
    return { success: false, error: "Failed to fetch outstanding summary" };
  }
}

export async function getOverdueInvoices() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "purchase.view")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const overdueInvoices = await prisma.purchaseInvoice.findMany({
      where: {
        status: {
          in: [PurchaseInvoiceStatus.BILLED, PurchaseInvoiceStatus.PARTIALLY_PAID],
        },
        dueDate: {
          lt: new Date(),
        },
      },
      include: {
        contact: {
          select: {
            name: true,
          },
        },
        payments: {
          select: {
            amount: true,
          },
        },
      },
      orderBy: {
        dueDate: "asc",
      },
      take: 20, // Fetch more to filter down to 5 genuine overdue after balance check
    });

    const formattedData = overdueInvoices
      .map((inv) => {
        const paidAmount = inv.payments.reduce((sum, p) => sum + p.amount.toNumber(), 0);
        const balanceDue = inv.totalAmount.toNumber() - paidAmount;
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          vendorName: inv.contact.name,
          dueDate: inv.dueDate,
          balanceDue: balanceDue,
          totalAmount: inv.totalAmount.toNumber(),
        };
      })
      .filter((inv) => inv.balanceDue > 0)
      .slice(0, 5);

    return { success: true, data: formattedData };
  } catch (error) {
    console.error("Error fetching purchase overdue invoices:", error);
    return { success: false, error: "Failed to fetch overdue invoices" };
  }
}
