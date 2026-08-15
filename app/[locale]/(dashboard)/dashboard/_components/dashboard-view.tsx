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
import { SummaryCard, SummaryCardGrid, CurrencyProps } from "@/components/ui/summary-card";
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

    const currencyProps: CurrencyProps = {
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
            <SummaryCardGrid>
                <SummaryCard
                    title={t("total_revenue")}
                    value={totalRevenue}
                    description={t("this_month")}
                    icon={TrendingUp}
                    cardClassName="bg-linear-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20"
                    titleClassName="text-muted-foreground flex items-center gap-2"
                    valueClassName="text-emerald-600 dark:text-emerald-400"
                    {...currencyProps}
                />
                <SummaryCard
                    title={t("total_expenses")}
                    value={totalExpenses}
                    description={t("this_month")}
                    icon={TrendingDown}
                    cardClassName="bg-linear-to-br from-red-500/10 to-red-500/5 border-red-500/20"
                    titleClassName="text-muted-foreground flex items-center gap-2"
                    valueClassName="text-red-600 dark:text-red-400"
                    {...currencyProps}
                />
                <SummaryCard
                    title={t("accounts_receivable")}
                    value={accountsReceivable}
                    description={t("outstanding")}
                    icon={CreditCard}
                    {...currencyProps}
                />
                <SummaryCard
                    title={t("accounts_payable")}
                    value={accountsPayable}
                    description={t("outstanding")}
                    icon={Receipt}
                    {...currencyProps}
                />
            </SummaryCardGrid>

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
