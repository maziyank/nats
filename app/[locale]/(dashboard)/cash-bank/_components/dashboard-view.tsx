"use client";

import { CashAccountList } from "./cash-account-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Wallet,
  Building2,
  ArrowRight,
  LayoutDashboard,
  List,
} from "lucide-react";
import { useFormatCurrency, useFormatDate } from "@/hooks";
import { useCompanyProfile } from "@/components/providers/session-provider";
import { StatValue } from "@/components/ui/stat-value";
import { DataTable, Column } from "@/components/ui/data-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { getDashboardStats } from "../actions";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { SuperJSON } from "@/lib/superjson";
import {
  JournalEntryLine,
  JournalEntry,
  Account,
} from "@/prisma/generated/prisma/client";

type RecentTransaction = JournalEntryLine & {
  journalEntry: JournalEntry;
  account: Account;
};

import { useTranslations } from "next-intl";

export function DashboardView() {
  const t = useTranslations("CashBank");
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

  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["cash-bank"],
    queryFn: async () => {
      const data = await getDashboardStats();
      return {
        ...data,
        recentTransactions: SuperJSON.deserialize<RecentTransaction[]>(
          data.recentTransactions,
        ),
      };
    },
  });

  const columns: Column<RecentTransaction>[] = [
    {
      header: tCommon("date"),
      cell: (item) => formatDate(item.journalEntry.transactionDate),
    },
    {
      header: t("entry_number"),
      cell: (item) => (
        <Link
          href={`/accounting/journal-entries/${item.journalEntry.id}`}
          className="text-primary hover:underline font-medium"
          target="_blank"
        >
          {item.journalEntry.entryNumber}
        </Link>
      ),
    },
    {
      header: tCommon("account"),
      cell: (item) => `${item.account.code} - ${item.account.name}`,
    },
    {
      header: tCommon("description"),
      cell: (item) => (
        <span className="truncate block max-w-[200px]">
          {item.description || item.journalEntry.description}
        </span>
      ),
    },
    {
      header: t("debit"),
      headerClassName: "text-right",
      className: "text-right font-medium",
      cell: (item) =>
        Number(item.debitAmount) > 0
          ? formatCurrency(Number(item.debitAmount))
          : "-",
    },
    {
      header: t("credit"),
      headerClassName: "text-right",
      className: "text-right font-medium",
      cell: (item) =>
        Number(item.creditAmount) > 0
          ? formatCurrency(Number(item.creditAmount))
          : "-",
    },
    {
      header: tCommon("status"),
      cell: (item) => <StatusBadge status={item.journalEntry.status} />,
    },
  ];

  if (isLoadingStats || !stats) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  const { accounts, summary, recentTransactions } = stats;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">{t("cash_bank")}</h1>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            {t("overview")}
          </TabsTrigger>
          <TabsTrigger value="accounts">
            <List className="mr-2 h-4 w-4" />
            {t("accounts")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-8">
          {/* Summary Cards */}
          <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
            <Card className="bg-linear-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Wallet className="h-4 w-4" /> {t("total_balance")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StatValue
                  value={summary.totalBalance}
                  {...currencyProps}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Wallet className="h-4 w-4" /> {t("cash_on_hand")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StatValue
                  maxRem={1.5}
                  value={summary.totalCash}
                  {...currencyProps}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> {t("bank_balance")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StatValue
                  maxRem={1.5}
                  value={summary.totalBank}
                  {...currencyProps}
                />
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">
                {t("recent_transactions")}
              </h2>
              <Button variant="ghost" asChild>
                <Link href="/accounting/journal-entries">
                  {t("view_all")} <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <Card className="p-0">
              <CardContent className="p-0">
                <DataTable
                  data={recentTransactions || []}
                  columns={columns}
                  emptyMessage={t("no_recent_transactions")}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="accounts">
          <CashAccountList
            accounts={accounts}
            title={t("manage_accounts")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
