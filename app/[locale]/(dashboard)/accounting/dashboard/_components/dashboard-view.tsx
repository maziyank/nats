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
  getFinancialTrends,
  getExpenseBreakdown,
  getRecentTransactions,
} from "../actions";
import { FinancialTrendsChart } from "./financial-trends-chart";
import { ExpenseBreakdownChart } from "./expense-breakdown-chart";
import { RecentTransactions } from "./recent-transactions";
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  Wallet,
  PlusCircle,
  FileText,
} from "lucide-react";
import { StatValue } from "@/components/ui/stat-value";
import { CompanyProfile } from "@/prisma/generated/prisma/client";

interface DashboardViewProps {
  companyProfile: CompanyProfile | null;
}

import { useTranslations } from "next-intl";

export function DashboardView({ companyProfile }: DashboardViewProps) {
  const t = useTranslations("Accounting");
  const currencyProps = {
    currency: companyProfile?.currency,
    currencySymbol: companyProfile?.currencySymbol || undefined,
    currencyFormat: (companyProfile?.currencyFormat as "standard" | "european" | "indian" | undefined) || undefined,
    locale: companyProfile?.locale,
  };

  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const res = await getDashboardSummary();
      return res.success
        ? res.data
        : {
          totalRevenue: 0,
          totalExpenses: 0,
          netIncome: 0,
          accountsReceivable: 0,
          accountsPayable: 0,
        };
    },
  });

  const { data: trends = [] } = useQuery({
    queryKey: ["financial-trends"],
    queryFn: async () => {
      const res = await getFinancialTrends();
      return res.success ? res.data : [];
    },
  });

  const { data: breakdown = [] } = useQuery({
    queryKey: ["expense-breakdown"],
    queryFn: async () => {
      const res = await getExpenseBreakdown();
      return res.success ? res.data : [];
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["recent-transactions"],
    queryFn: async () => {
      const res = await getRecentTransactions();
      return res.success ? res.data : [];
    },
  });

  return (
    <div className="flex flex-1 flex-col gap-4 px-4">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-xl font-bold tracking-tight">
          {t("dashboard")}
        </h2>
        <div className="flex items-center space-x-2">
          <Button asChild>
            <Link href="/accounting/journal-entries/create">
              <PlusCircle className="mr-2 h-4 w-4" />
              {t("new_entry")}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/accounting/reports">
              <FileText className="mr-2 h-4 w-4" />
              {t("reports")}
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("total_revenue")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <StatValue
              maxRem={1.5}
              value={summary?.totalRevenue || 0}
              {...currencyProps}
            />
            <p className="text-xs text-muted-foreground">{t("current_month")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("total_expenses")}
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <StatValue
              maxRem={1.5}
              value={summary?.totalExpenses || 0}
              {...currencyProps}
            />
            <p className="text-xs text-muted-foreground">{t("current_month")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("net_income")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <StatValue
              maxRem={1.5}
              value={summary?.netIncome || 0}
              {...currencyProps}
            />
            <p className="text-xs text-muted-foreground">{t("current_month")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("receivables")}</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <StatValue
              maxRem={1.5}
              value={summary?.accountsReceivable || 0}
              {...currencyProps}
            />
            <p className="text-xs text-muted-foreground">
              {t("outstanding_invoices")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>{t("financial_trends")}</CardTitle>
            <CardDescription>
              {t("financial_trends_desc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <FinancialTrendsChart data={trends || []} />
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>{t("expense_breakdown")}</CardTitle>
            <CardDescription>
              {t("expense_breakdown_desc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExpenseBreakdownChart data={breakdown || []} />
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>{t("recent_transactions")}</CardTitle>
          <CardDescription>{t("recent_transactions_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <RecentTransactions data={transactions || []} />
        </CardContent>
      </Card>
    </div>
  );
}
