"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  getDashboardSummary,
  getSalesTrends,
  getRecentSales,
  getTopCustomers,
  getTopProducts,
  getOutstandingSummary,
  getOverdueInvoices,
} from "../actions";
import { SalesTrendsChart } from "./sales-trends-chart";
import { RecentSales } from "./recent-sales";
import { TopCustomers } from "./top-customers";
import { TopProducts } from "./top-products";
import { OutstandingSummary } from "./outstanding-summary";
import { OverdueInvoices } from "./overdue-invoices";
import {
  ShoppingCart,
  CreditCard,
  Rocket,
  AlertCircle,
  PlusCircle,
  FileText,
} from "lucide-react";
import { StatValue } from "@/components/ui/stat-value";
import { CompanyProfile } from "@/prisma/generated/prisma/client";

interface DashboardViewProps {
  companyProfile: CompanyProfile | null;
}

export function DashboardView({ companyProfile }: DashboardViewProps) {
  const currencyProps = {
    currency: companyProfile?.currency,
    currencySymbol: companyProfile?.currencySymbol || undefined,
    currencyFormat: (companyProfile?.currencyFormat as "standard" | "european" | "indian" | undefined) || undefined,
    locale: companyProfile?.locale,
  };

  const { data: summary } = useQuery({
    queryKey: ["sales-dashboard-summary"],
    queryFn: async () => {
      const res = await getDashboardSummary();
      return res.success
        ? res.data
        : {
            totalOrders: 0,
            totalSales: 0,
            totalReceived: 0,
            outstandingAmount: 0,
          };
    },
  });

  const { data: trends = [] } = useQuery({
    queryKey: ["sales-trends"],
    queryFn: async () => {
      const res = await getSalesTrends();
      return res.success ? res.data : [];
    },
  });

  const { data: recentSales = [] } = useQuery({
    queryKey: ["recent-sales"],
    queryFn: async () => {
      const res = await getRecentSales();
      return res.success ? res.data : [];
    },
  });

  const { data: topCustomers = [] } = useQuery({
    queryKey: ["sales-top-customers"],
    queryFn: async () => {
      const res = await getTopCustomers();
      return res.success ? res.data : [];
    },
  });

  const { data: topProducts = [] } = useQuery({
    queryKey: ["sales-top-products"],
    queryFn: async () => {
      const res = await getTopProducts();
      return res.success ? res.data : [];
    },
  });

  const { data: outstandingSummary = [] } = useQuery({
    queryKey: ["sales-outstanding-summary"],
    queryFn: async () => {
      const res = await getOutstandingSummary();
      return res.success ? res.data : [];
    },
  });

  const { data: overdueInvoices = [] } = useQuery({
    queryKey: ["sales-overdue-invoices"],
    queryFn: async () => {
      const res = await getOverdueInvoices();
      return res.success ? res.data : [];
    },
  });

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-4">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-xl font-bold tracking-tight">Dashboard</h2>
        <div className="flex items-center space-x-2">
          <Button asChild>
            <Link href="/sales/orders/new">
              <PlusCircle className="mr-2 h-4 w-4" />
              New Order
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sales/invoices/new">
              <FileText className="mr-2 h-4 w-4" />
              New Invoice
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.totalOrders || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Total sales orders created
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <Rocket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
            <CardContent>
              <StatValue
                maxRem={1.5}
                value={summary?.totalSales || 0}
                {...currencyProps}
              />
              <p className="text-xs text-muted-foreground">
                Total value of invoiced sales
              </p>
            </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Received
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <StatValue
              maxRem={1.5}
              value={summary?.totalReceived || 0}
              {...currencyProps}
            />
            <p className="text-xs text-muted-foreground">
              Total amount received from customers
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <StatValue
              maxRem={1.5}
              value={summary?.outstandingAmount || 0}
              {...currencyProps}
            />
            <p className="text-xs text-muted-foreground">
              Unpaid invoices amount
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Sales Trends</CardTitle>
            <CardDescription>
              Sales volume over the last 6 months
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <SalesTrendsChart data={trends} />
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>Latest sales orders</CardDescription>
          </CardHeader>
          <CardContent>
            <RecentSales data={recentSales} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Top Customers</CardTitle>
            <CardDescription>Top 5 customers by sales volume</CardDescription>
          </CardHeader>
          <CardContent>
            <TopCustomers data={topCustomers} />
          </CardContent>
        </Card>
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
            <CardDescription>Best-selling products by quantity</CardDescription>
          </CardHeader>
          <CardContent>
            <TopProducts data={topProducts} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Outstanding Summary</CardTitle>
            <CardDescription>Aging of unpaid invoices</CardDescription>
          </CardHeader>
          <CardContent>
            <OutstandingSummary data={outstandingSummary} />
          </CardContent>
        </Card>
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Overdue Invoices</CardTitle>
            <CardDescription>Latest overdue invoices</CardDescription>
          </CardHeader>
          <CardContent>
            <OverdueInvoices data={overdueInvoices} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
