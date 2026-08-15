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
  getPurchaseTrends,
  getRecentPurchases,
  getTopSuppliers,
  getTopProducts,
  getOutstandingSummary,
  getOverdueInvoices,
} from "../actions";
import { PurchaseTrendsChart } from "./purchase-trends-chart";
import { RecentPurchases } from "./recent-purchases";
import { TopSuppliers } from "./top-suppliers";
import { TopProducts } from "./top-products";
import { OutstandingSummary } from "./outstanding-summary";
import { OverdueInvoices } from "./overdue-invoices";
import {
  ShoppingCart,
  CreditCard,
  Package,
  AlertCircle,
  PlusCircle,
  FileText,
} from "lucide-react";
import { SummaryCard, SummaryCardGrid } from "@/components/ui/summary-card";
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
    queryKey: ["purchase-dashboard-summary"],
    queryFn: async () => {
      const res = await getDashboardSummary();
      return res.success
        ? res.data
        : {
          totalOrders: 0,
          totalPurchases: 0,
          totalPaid: 0,
          outstandingAmount: 0,
        };
    },
  });

  const { data: trends = [] } = useQuery({
    queryKey: ["purchase-trends"],
    queryFn: async () => {
      const res = await getPurchaseTrends();
      return res.success ? res.data : [];
    },
  });

  const { data: recentPurchases = [] } = useQuery({
    queryKey: ["recent-purchases"],
    queryFn: async () => {
      const res = await getRecentPurchases();
      return res.success ? res.data : [];
    },
  });

  const { data: topSuppliers = [] } = useQuery({
    queryKey: ["purchase-top-suppliers"],
    queryFn: async () => {
      const res = await getTopSuppliers();
      return res.success ? res.data : [];
    },
  });

  const { data: topProducts = [] } = useQuery({
    queryKey: ["purchase-top-products"],
    queryFn: async () => {
      const res = await getTopProducts();
      return res.success ? res.data : [];
    },
  });

  const { data: outstandingSummary = [] } = useQuery({
    queryKey: ["purchase-outstanding-summary"],
    queryFn: async () => {
      const res = await getOutstandingSummary();
      return res.success ? res.data : [];
    },
  });

  const { data: overdueInvoices = [] } = useQuery({
    queryKey: ["purchase-overdue-invoices"],
    queryFn: async () => {
      const res = await getOverdueInvoices();
      return res.success ? res.data : [];
    },
  });

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-4">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-xl font-bold tracking-tight">
          Purchase Dashboard
        </h2>
        <div className="flex items-center space-x-2">
          <Button asChild>
            <Link href="/purchase/orders/new">
              <PlusCircle className="mr-2 h-4 w-4" />
              New Order
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/purchase/invoices/new">
              <FileText className="mr-2 h-4 w-4" />
              New Invoice
            </Link>
          </Button>
        </div>
      </div>

      <SummaryCardGrid>
        <SummaryCard
          title="Total Orders"
          value={summary?.totalOrders || 0}
          description="Total purchase orders created"
          icon={ShoppingCart}
          isInteger
          {...currencyProps}
        />
        <SummaryCard
          title="Total Purchased"
          value={summary?.totalPurchases || 0}
          description="Total value of billed invoices"
          icon={Package}
          {...currencyProps}
        />
        <SummaryCard
          title="Total Paid"
          value={summary?.totalPaid || 0}
          description="Total amount paid to vendors"
          icon={CreditCard}
          {...currencyProps}
        />
        <SummaryCard
          title="Outstanding"
          value={summary?.outstandingAmount || 0}
          description="Unpaid invoices amount"
          icon={AlertCircle}
          {...currencyProps}
        />
      </SummaryCardGrid>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Purchase Trends</CardTitle>
            <CardDescription>
              Purchase volume over the last 6 months
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <PurchaseTrendsChart data={trends} />
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>
              Latest purchase orders
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecentPurchases data={recentPurchases} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Top Suppliers</CardTitle>
            <CardDescription>Top 5 suppliers by purchase volume</CardDescription>
          </CardHeader>
          <CardContent>
            <TopSuppliers data={topSuppliers} />
          </CardContent>
        </Card>
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Top Purchased Products</CardTitle>
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
            <CardDescription>Aging of unpaid vendor invoices</CardDescription>
          </CardHeader>
          <CardContent>
            <OutstandingSummary data={outstandingSummary} />
          </CardContent>
        </Card>
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Overdue Vendor Invoices</CardTitle>
            <CardDescription>Latest overdue invoices from vendors</CardDescription>
          </CardHeader>
          <CardContent>
            <OverdueInvoices data={overdueInvoices} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
