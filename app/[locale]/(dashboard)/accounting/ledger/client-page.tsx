"use client";

import { useState, useEffect } from "react";
import { getAccountHistory, getLedgerAccounts } from "./actions";
import { DataTable, Column } from "@/components/ui/data-table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ScaleIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { CustomInput } from "@/components/ui/custom-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountType } from "@/prisma/generated/prisma/browser";
import { useFormatCurrency, useFormatDate } from "@/hooks";
import {
  PageListContent,
  PageListHeader,
  PageListLayout,
  PageListTitle,
} from "@/components/layout/page/list-layout";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import Link from "next/link";
import { SuperJSON } from "@/services/lib/superjson";
import { Prisma } from "@/prisma/generated/prisma/client";
import { useRouter } from "next/navigation";

type LedgerEntry = Prisma.JournalEntryLineGetPayload<{
  include: {
    journalEntry: {
      select: {
        entryNumber: true;
        transactionDate: true;
        description: true;
        createdAt: true;
        postedAt: true;
        status: true;
      };
    };
  };
}>;

interface LedgerClientPageProps {
  initialAccount?: {
    id: string;
    code: string;
    name: string;
    type: AccountType;
  };
}

import { useTranslations } from "next-intl";

export default function LedgerClientPage({
  initialAccount,
}: LedgerClientPageProps) {
  const t = useTranslations("Accounting");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const [selectedAccount, setSelectedAccount] = useState(initialAccount);

  // Sync state if prop changes (e.g. navigation)
  useEffect(() => {
    setSelectedAccount(initialAccount);
  }, [initialAccount]);

  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showDraft, setShowDraft] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data: accounts = [] } = useQuery({
    queryKey: ["ledger-accounts"],
    queryFn: async () => {
      const resp = await getLedgerAccounts();
      return resp.success && resp.data ? resp.data : [];
    },
  });

  const { data: entries, isLoading: loading } = useQuery({
    queryKey: [
      "ledger-entries",
      {
        accountId: selectedAccount?.id,
        page,
        pageSize,
        startDate,
        endDate,
        showDraft,
      },
    ],
    queryFn: async () => {
      if (!selectedAccount?.id) return null;
      const response = await getAccountHistory({
        accountId: selectedAccount.id,
        page,
        pageSize,
        startDate,
        endDate,
        showDraft,
      });
      if (response.success && response.data) {
        const deserializedItems = SuperJSON.deserialize<LedgerEntry[]>(
          response.data.items,
        );
        return { ...response.data, items: deserializedItems };
      }
      return null;
    },
    enabled: !!selectedAccount?.id,
    placeholderData: keepPreviousData,
  });

  const accountDetails = entries?.account || null;

  const handleAccountChange = (
    value: string,
    accountList: typeof accounts,
  ) => {
    const found = accountList?.find((item) => item.id == value);
    if (found) {
      // Navigate to the slug URL
      router.push(`/accounting/ledger/${found.id}`);
    }
  };

  const balance =
    accountDetails?.normalBalance === "debit"
      ? (entries?.totals?.debit ?? 0) - (entries?.totals?.credit ?? 0)
      : (entries?.totals?.credit ?? 0) - (entries?.totals?.debit ?? 0);

  const formatCurrency = useFormatCurrency();
  const formatDate = useFormatDate();

  const columns: Column<LedgerEntry>[] = [
    {
      header: t("posted_at"),
      cell: (entry) => formatDate(entry.journalEntry.postedAt || t("draft")),
    },
    {
      header: t("trans_date"),
      cell: (entry) => formatDate(entry.journalEntry.transactionDate),
    },
    {
      header: t("entry_number"),
      cell: (entry) => (
        <Link
          href={`/accounting/journal-entries/${entry.journalEntryId}`}
          target="_blank"
          className="text-primary hover:underline font-medium"
        >
          {entry.journalEntry.entryNumber}
        </Link>
      ),
    },
    {
      header: t("description"),
      cell: (entry) => (
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground text-wrap whitespace-normal">
            {entry.description}
          </span>
          <span className="text-xs text-wrap whitespace-normal">
            {entry.journalEntry.description}
          </span>
        </div>
      ),
    },
    {
      header: tCommon("debit") || "Debit",
      className: "text-right",
      headerClassName: "text-right",
      cell: (entry) =>
        Number(entry.debitAmount) > 0
          ? formatCurrency(Number(entry.debitAmount))
          : "-",
    },
    {
      header: tCommon("credit") || "Credit",
      className: "text-right",
      headerClassName: "text-right",
      cell: (entry) =>
        Number(entry.creditAmount) > 0
          ? formatCurrency(Number(entry.creditAmount))
          : "-",
    },
    {
      header: t("balance"),
      className: "text-right",
      headerClassName: "text-right",
      cell: (entry) => formatCurrency(Number(entry.runningBalance)),
    },
    {
      header: tCommon("status"),
      className: "text-center",
      headerClassName: "text-center",
      cell: (entry) => <StatusBadge status={entry.journalEntry.status} />,
    },
  ];

  return (
    <PageListLayout>
      <PageListHeader>
        <PageListTitle title={t("ledger")} />
      </PageListHeader>

      {selectedAccount?.id && (
        <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex gap-2">
                {selectedAccount.type == AccountType.asset ? (
                  <TrendingUpIcon />
                ) : (
                  <TrendingDownIcon />
                )}
                <span>{t("total_debit")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold">
                  {formatCurrency(entries?.totals?.debit ?? 0)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex gap-1">
                {selectedAccount.type != AccountType.asset ? (
                  <TrendingUpIcon />
                ) : (
                  <TrendingDownIcon />
                )}
                <span>{t("total_credit")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold">
                  {formatCurrency(entries?.totals?.credit ?? 0)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex gap-2">
                <ScaleIcon />
                <span>{t("net_balance")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold">
                  {formatCurrency(balance)}
                  <span className="text-xs text-muted-foreground ml-2">
                    ({accountDetails?.normalBalance})
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <PageListContent>
        <div className="flex items-end gap-4 flex-wrap p-4">
          {accounts && (
            <div className="space-y-1">
              <Label>{t("account")}</Label>
              <SearchableSelect
                placeholder={t("select_account")}
                value={selectedAccount?.id}
                onValueChange={(val) =>
                  handleAccountChange(val || "", accounts)
                }
                options={accounts.map((account) => ({
                  value: account.id,
                  label: `${account.code} - ${account.name}`,
                }))}
                className="min-w-[250px]"
              />
            </div>
          )}
          <CustomInput
            label={tCommon("start_date")}
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
          />
          <CustomInput
            label={tCommon("end_date")}
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
          />
          <div className="flex items-center space-x-2 pb-2">
            <Checkbox
              id="showDraft"
              checked={showDraft}
              onCheckedChange={(checked) => {
                setShowDraft(checked as boolean);
                setPage(1);
              }}
            />
            <Label htmlFor="showDraft">{t("show_draft")}</Label>
          </div>
        </div>
        <div className="px-4">
          <DataTable
            data={entries?.items || []}
            columns={columns}
            isLoading={loading}
            emptyMessage={
              selectedAccount?.id
                ? t("no_transactions_found")
                : t("select_account_to_view")
            }
            pagination={
              entries?.pagination.total
                ? {
                    totalEntries: entries.pagination.total,
                    pageSize: pageSize,
                    currentPage: page,
                    onPageChange: setPage,
                  }
                : undefined
            }
          />
        </div>
      </PageListContent>
    </PageListLayout>
  );
}
