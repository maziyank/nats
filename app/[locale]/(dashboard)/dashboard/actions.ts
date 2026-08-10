"use server";

import { prisma, serializePrisma } from "@/services/lib/prisma";
import {
    SalesInvoiceStatus,
    PurchaseInvoiceStatus,
} from "@/prisma/generated/prisma/enums";

const CANCELLED_SALES_STATUSES: SalesInvoiceStatus[] = [SalesInvoiceStatus.CANCELLED];
const CANCELLED_PURCHASE_STATUSES: PurchaseInvoiceStatus[] = [PurchaseInvoiceStatus.CANCELED];
const OUTSTANDING_SALES_STATUSES: SalesInvoiceStatus[] = [
    SalesInvoiceStatus.ISSUED,
    SalesInvoiceStatus.PARTIALLY_PAID,
    SalesInvoiceStatus.OVERDUE,
];
const OUTSTANDING_PURCHASE_STATUSES: PurchaseInvoiceStatus[] = [
    PurchaseInvoiceStatus.BILLED,
    PurchaseInvoiceStatus.PARTIALLY_PAID,
];
const RECENT_ORDERS_LIMIT = 5;
const MONTHLY_TREND_MONTHS = 6;

function getMonthDateRange(date: Date) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
}

function getMonthLabel(date: Date): string {
    return date.toLocaleString("en-US", { month: "short", year: "2-digit" });
}

export async function getMainDashboardStats() {
    const now = new Date();
    const { start: monthStart, end: monthEnd } = getMonthDateRange(now);

    const [
        salesRevenueResult,
        purchaseExpenseResult,
        accountsReceivableResult,
        accountsPayableResult,
        recentSalesOrders,
        recentPurchaseOrders,
        monthlyTrend,
    ] = await Promise.all([
        getSalesRevenueThisMonth(monthStart, monthEnd),
        getPurchaseExpenseThisMonth(monthStart, monthEnd),
        getAccountsReceivable(),
        getAccountsPayable(),
        getRecentSalesOrders(),
        getRecentPurchaseOrders(),
        getMonthlyTrend(now),
    ]);

    return {
        totalRevenue: salesRevenueResult,
        totalExpenses: purchaseExpenseResult,
        accountsReceivable: accountsReceivableResult,
        accountsPayable: accountsPayableResult,
        recentSalesOrders: serializePrisma(recentSalesOrders),
        recentPurchaseOrders: serializePrisma(recentPurchaseOrders),
        monthlyTrend,
    };
}

async function getSalesRevenueThisMonth(monthStart: Date, monthEnd: Date) {
    const result = await prisma.salesInvoice.aggregate({
        where: {
            invoiceDate: { gte: monthStart, lte: monthEnd },
            status: { notIn: CANCELLED_SALES_STATUSES },
        },
        _sum: { totalAmount: true },
    });
    return Number(result._sum?.totalAmount ?? 0);
}

async function getPurchaseExpenseThisMonth(monthStart: Date, monthEnd: Date) {
    const result = await prisma.purchaseInvoice.aggregate({
        where: {
            invoiceDate: { gte: monthStart, lte: monthEnd },
            status: { notIn: CANCELLED_PURCHASE_STATUSES },
        },
        _sum: { totalAmount: true },
    });
    return Number(result._sum?.totalAmount ?? 0);
}

async function getAccountsReceivable() {
    const result = await prisma.salesInvoice.aggregate({
        where: { status: { in: OUTSTANDING_SALES_STATUSES } },
        _sum: { balanceDue: true },
    });
    return Number(result._sum?.balanceDue ?? 0);
}

async function getAccountsPayable() {
    const result = await prisma.purchaseInvoice.aggregate({
        where: { status: { in: OUTSTANDING_PURCHASE_STATUSES } },
        _sum: { totalAmount: true },
    });
    return Number(result._sum?.totalAmount ?? 0);
}

async function getRecentSalesOrders() {
    return prisma.salesOrder.findMany({
        include: { contact: true },
        orderBy: { orderDate: "desc" },
        take: RECENT_ORDERS_LIMIT,
    });
}

async function getRecentPurchaseOrders() {
    return prisma.purchaseOrder.findMany({
        include: { contact: true },
        orderBy: { orderDate: "desc" },
        take: RECENT_ORDERS_LIMIT,
    });
}

async function getMonthlyTrend(now: Date) {
    const monthWindows = Array.from({ length: MONTHLY_TREND_MONTHS }, (_, idx) => {
        const offset = MONTHLY_TREND_MONTHS - 1 - idx;
        const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        const { start, end } = getMonthDateRange(date);
        return { date, start, end, label: getMonthLabel(date) };
    });

    // Run all month aggregates in parallel instead of 12 sequential round-trips.
    const results = await Promise.all(
        monthWindows.map(async ({ start, end, label }) => {
            const [salesAgg, purchaseAgg] = await Promise.all([
                prisma.salesInvoice.aggregate({
                    where: {
                        invoiceDate: { gte: start, lte: end },
                        status: { notIn: CANCELLED_SALES_STATUSES },
                    },
                    _sum: { totalAmount: true },
                }),
                prisma.purchaseInvoice.aggregate({
                    where: {
                        invoiceDate: { gte: start, lte: end },
                        status: { notIn: CANCELLED_PURCHASE_STATUSES },
                    },
                    _sum: { totalAmount: true },
                }),
            ]);

            return {
                month: label,
                revenue: Number(salesAgg._sum?.totalAmount ?? 0),
                expenses: Number(purchaseAgg._sum?.totalAmount ?? 0),
            };
        }),
    );

    return results;
}
