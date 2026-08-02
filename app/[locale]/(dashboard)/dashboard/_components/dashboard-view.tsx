"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    TrendingUp,
    TrendingDown,
    CreditCard,
    Receipt,
    ArrowRight,
} from "lucide-react";
import { useFormatCurrency, useFormatDate } from "@/hooks";
import { useCompanyProfile } from "@/components/providers/session-provider";
import { StatValue } from "@/components/ui/stat-value";
import { DataTable, Column } from "@/components/ui/data-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { getMainDashboardStats } from "../actions";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from "next-intl";
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

type SalesOrder = {
    id: string;
    orderNumber: string;
    orderDate: Date | string;
    status: string;
    totalAmount: number | string;
    contact: { name: string };
};

type PurchaseOrder = {
    id: string;
    orderNumber: string;
    orderDate: Date | string;
    status: string;
    totalAmount: number | string;
    contact: { name: string };
};

const CHART_CONFIG = {
    revenue: {
        label: "Revenue",
        color: "var(--chart-1)",
    },
    expenses: {
        label: "Expenses",
        color: "var(--chart-2)",
    },
};

export function DashboardView() {
    const t = useTranslations("Dashboard");
    const tCommon = useTranslations("Common");
    const formatCurrency = useFormatCurrency();
    const formatDate = useFormatDate();
    const profile = useCompanyProfile();

    const currencyProps = {
        currency: profile?.currency,
        currencySymbol: profile?.currencySymbol || undefined,
        currencyFormat: (profile?.currencyFormat as "standard" | "european" | "indian" | undefined) || undefined,
        locale: profile?.locale,
    };

    const { data: stats, isLoading } = useQuery({
        queryKey: ["main-dashboard"],
        queryFn: () => getMainDashboardStats(),
    });

    const salesColumns: Column<SalesOrder>[] = [
        {
            header: t("order_number"),
            cell: (item) => (
                <Link
                    href={`/sales/orders/${item.id}`}
                    className="text-primary hover:underline font-medium"
                >
                    {item.orderNumber}
                </Link>
            ),
        },
        {
            header: tCommon("date"),
            cell: (item) => formatDate(item.orderDate),
        },
        {
            header: tCommon("customer"),
            cell: (item) => item.contact.name,
        },
        {
            header: tCommon("amount"),
            headerClassName: "text-right",
            className: "text-right font-medium",
            cell: (item) => formatCurrency(Number(item.totalAmount)),
        },
        {
            header: tCommon("status"),
            cell: (item) => <StatusBadge status={item.status} />,
        },
    ];

    const purchaseColumns: Column<PurchaseOrder>[] = [
        {
            header: t("order_number"),
            cell: (item) => (
                <Link
                    href={`/purchase/orders/${item.id}`}
                    className="text-primary hover:underline font-medium"
                >
                    {item.orderNumber}
                </Link>
            ),
        },
        {
            header: tCommon("date"),
            cell: (item) => formatDate(item.orderDate),
        },
        {
            header: tCommon("vendor"),
            cell: (item) => item.contact.name,
        },
        {
            header: tCommon("amount"),
            headerClassName: "text-right",
            className: "text-right font-medium",
            cell: (item) => formatCurrency(Number(item.totalAmount)),
        },
        {
            header: tCommon("status"),
            cell: (item) => <StatusBadge status={item.status} />,
        },
    ];

    if (isLoading || !stats) {
        return (
            <div className="space-y-6 px-4">
                <Skeleton className="h-8 w-48" />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-[120px]" />
                    ))}
                </div>
                <Skeleton className="h-[350px]" />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <Skeleton className="h-[300px]" />
                    <Skeleton className="h-[300px]" />
                </div>
            </div>
        );
    }

    const {
        totalRevenue,
        totalExpenses,
        accountsReceivable,
        accountsPayable,
        recentSalesOrders,
        recentPurchaseOrders,
        monthlyTrend,
    } = stats;

    const netIncome = totalRevenue - totalExpenses;

    return (
        <div className="space-y-6 px-4">
            <h1 className="text-xl font-bold tracking-tight">{t("title")}</h1>

            {/* Summary Cards */}
            <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
                <Card className="bg-linear-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-emerald-500" />
                            {t("total_revenue")}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <StatValue
                            className="text-emerald-600 dark:text-emerald-400"
                            value={totalRevenue}
                            {...currencyProps}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            {t("this_month")}
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-linear-to-br from-red-500/10 to-red-500/5 border-red-500/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-red-500" />
                            {t("total_expenses")}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <StatValue
                            className="text-red-600 dark:text-red-400"
                            value={totalExpenses}
                            {...currencyProps}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            {t("this_month")}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            {t("accounts_receivable")}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <StatValue
                            maxRem={1.5}
                            value={accountsReceivable}
                            {...currencyProps}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            {t("outstanding")}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Receipt className="h-4 w-4" />
                            {t("accounts_payable")}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <StatValue
                            maxRem={1.5}
                            value={accountsPayable}
                            {...currencyProps}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            {t("outstanding")}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Net Income Banner */}
            <Card className="bg-linear-to-r from-primary/5 to-primary/10 border-primary/20">
                <CardContent className="flex items-center justify-between py-4">
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-muted-foreground">
                            {t("net_income")}
                        </p>
                        <StatValue
                            maxRem={1.5}
                            className={
                                netIncome >= 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-red-600 dark:text-red-400"
                            }
                            value={netIncome}
                            {...currencyProps}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0 ml-4">{t("this_month")}</p>
                </CardContent>
            </Card>

            {/* Revenue vs Expenses Chart */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg font-semibold">
                        {t("revenue_vs_expenses")}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{t("last_6_months")}</p>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={CHART_CONFIG} className="h-[300px] w-full">
                        <BarChart data={monthlyTrend} accessibilityLayer>
                            <CartesianGrid vertical={false} strokeDasharray="3 3" />
                            <XAxis
                                dataKey="month"
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                            />
                            <YAxis
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) =>
                                    new Intl.NumberFormat("en", {
                                        notation: "compact",
                                        compactDisplay: "short",
                                    }).format(value)
                                }
                            />
                            <ChartTooltip
                                content={<ChartTooltipContent />}
                            />
                            <Bar
                                dataKey="revenue"
                                fill="var(--color-revenue)"
                                radius={[4, 4, 0, 0]}
                            />
                            <Bar
                                dataKey="expenses"
                                fill="var(--color-expenses)"
                                radius={[4, 4, 0, 0]}
                            />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>

            {/* Recent Orders */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Recent Sales Orders */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">{t("recent_sales_orders")}</h2>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/sales/orders">
                                {t("view_all")} <ArrowRight className="ml-1 h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                    <Card className="p-0">
                        <CardContent className="p-0">
                            <DataTable
                                data={recentSalesOrders as unknown as SalesOrder[]}
                                columns={salesColumns}
                                emptyMessage={t("no_recent_orders")}
                            />
                        </CardContent>
                    </Card>
                </div>

                {/* Recent Purchase Orders */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">
                            {t("recent_purchase_orders")}
                        </h2>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/purchase/orders">
                                {t("view_all")} <ArrowRight className="ml-1 h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                    <Card className="p-0">
                        <CardContent className="p-0">
                            <DataTable
                                data={recentPurchaseOrders as unknown as PurchaseOrder[]}
                                columns={purchaseColumns}
                                emptyMessage={t("no_recent_orders")}
                            />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
