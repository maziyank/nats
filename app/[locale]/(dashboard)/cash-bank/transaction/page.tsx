"use client";
export const dynamic = "force-dynamic";

import { Button } from "@/components/ui/button";
import {
  Plus,
  Check,
  Edit,
  Trash2,
  Eye,
  MoreHorizontal,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import {
  getCashTransactions,
  approveCashTransaction,
  deleteCashTransaction,
} from "./actions";
import {
  PageListActions,
  PageListContent,
  PageListHeader,
  PageListLayout,
  PageListTitle,
  PageListFilter,
} from "@/components/layout/page/list-layout";
import { CashTransactionFilters } from "./_components/cash-transaction-filters";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { DataTable, Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/services/lib/utils";
import {
  CashTransaction,
  CashAccount,
  CashTransactionAllocation,
  CashTransactionStatus,
  Contact,
} from "@/prisma/generated/prisma/browser";
import { Skeleton } from "@/components/ui/skeleton";
import { Decimal } from "decimal.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { useTransition } from "react";
import { SuperJSON } from "@/services/lib/superjson";

interface TransactionWithDetails extends CashTransaction {
  cashAccount: CashAccount;
  allocations: CashTransactionAllocation[];
  status: CashTransactionStatus;
  contact?: Contact | null;
}

import { useTranslations } from "next-intl";

export default function CashTransactionListPage() {
  const t = useTranslations("CashBank");
  const tCommon = useTranslations("Common");
  const tSales = useTranslations("Sales");
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page")) || 1;
  const search = searchParams.get("search") || "";
  const { toast } = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["cash-transactions", page, search],
    queryFn: async () => {
      const res = await getCashTransactions(page, 10, search);
      console.log({ res });
      return {
        ...res,
        transactions: SuperJSON.deserialize(res.transactions),
      };
    },
    refetchOnMount: true,
    staleTime: 0,
  });

  const transactions = (data?.transactions ||
    []) as unknown as TransactionWithDetails[];
  const total = data?.total || 0;

  const handleApprove = async (id: string) => {
    if (
      await confirm({
        title: t("approve_transaction"),
        description: t("approve_transaction_desc"),
      })
    ) {
      startTransition(async () => {
        try {
          const result = await approveCashTransaction(id);
          if (!result.success) {
            throw new Error(result.error || "Failed to approve");
          }
          queryClient.invalidateQueries({ queryKey: ["cash-transactions"] });
          queryClient.invalidateQueries({
            queryKey: ["cash-bank", "dashboard-stats"],
          });
          toast({
            title: tCommon("success"),
            description: result.data?.processed ? (
              t("transaction_approved")
            ) : (
              <span>
                {result.data?.alreadyQueued
                  ? tSales("already_queued")
                  : tSales("queued_for_processing")}{" "}
                {result.data?.outboxId ? (
                  <Link
                    href={`/admin/integrations/outbox?search=${encodeURIComponent(
                      result.data.outboxId,
                    )}`}
                    className="underline"
                  >
                    {tSales("view_outbox")}
                  </Link>
                ) : null}
              </span>
            ),
          });
        } catch (error) {
          toast({
            title: tCommon("error"),
            description:
              error instanceof Error ? error.message : "Failed to approve",
            variant: "destructive",
          });
        }
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (
      await confirm({
        title: t("delete_transaction"),
        description: t("delete_transaction_desc"),
      })
    ) {
      startTransition(async () => {
        try {
          await deleteCashTransaction(id);
          queryClient.invalidateQueries({ queryKey: ["cash-transactions"] });
          queryClient.invalidateQueries({
            queryKey: ["cash-bank", "dashboard-stats"],
          });
          toast({
            title: tCommon("success"),
            description: t("transaction_deleted"),
          });
        } catch (error) {
          toast({
            title: tCommon("error"),
            description:
              error instanceof Error ? error.message : "Failed to delete",
            variant: "destructive",
          });
        }
      });
    }
  };

  const columns: Column<TransactionWithDetails>[] = [
    {
      header: `${tCommon("date")}/${t("reference")}`,
      cell: (tx) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm">{formatDate(tx.date)}</span>
          <span className="text-xs text-muted-foreground">
            {tx.reference || "-"}
          </span>
        </div>
      ),
    },
    {
      header: tCommon("type"),
      cell: (tx) => (
        <div className="flex flex-col">
          <Badge variant={tx.type === "INCOME" ? "default" : "destructive"}>
            {tx.type}
          </Badge>

          <Link href={`/accounting/ledger/${tx.cashAccount.glAccountId}`} target="_blank">
            <span className="font-medium text-primary">{tx.cashAccount.name}</span>
          </Link>
        </div>
      ),
    },
    {
      header: tCommon("customer") + "/" + tCommon("vendor"), // Or just tCommon("contact") if I add it
      accessorKey: "contact",
      cell: (tx) =>
        tx.contact ? (
          <Link target="_blank"
            href={`/general/contacts/${tx.contact.id}`}
            className="text-primary hover:underline"
          >
            {tx.contact.name}
          </Link>
        ) : (
          "-"
        ),
    },
    {
      header: tCommon("description"),
      accessorKey: "description",
    },
    {
      header: tCommon("amount"),
      className: "text-right",
      headerClassName: "text-right",
      cell: (tx) => {
        const totalAmount = tx.allocations.reduce(
          (sum, a) => sum.plus(new Decimal(a.amount)),
          new Decimal(0),
        );
        return formatCurrency(totalAmount, { currency: "IDR" });
      },
    },
    {
      header: tCommon("status"),
      cell: (tx) => (
        <Badge
          variant={
            tx.status === "APPROVED"
              ? "default"
              : tx.status === "REJECTED"
                ? "destructive"
                : "secondary"
          }
        >
          {tx.status}
        </Badge>
      ),
    },
    {
      header: tCommon("actions"),
      cell: (tx) => {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{tCommon("actions")}</DropdownMenuLabel>
              {tx.status === "APPROVED" ? (
                <DropdownMenuItem asChild>
                  <Link href={`/cash-bank/transaction/${tx.id}`}>
                    <Eye className="mr-2 h-4 w-4" />
                    {tCommon("view")}
                  </Link>
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => handleApprove(tx.id)}>
                    <Check className="mr-2 h-4 w-4" />
                    {tSales("post")}
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/cash-bank/transaction/${tx.id}`}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {tCommon("edit")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => handleDelete(tx.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {tCommon("delete")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <PageListLayout>
      <PageListHeader>
        <PageListTitle title={t("cash_in_out")} />
        <PageListActions>
          <Button asChild>
            <Link href="/cash-bank/transaction/new">
              <Plus className="mr-2 h-4 w-4" /> {t("new_transaction")}
            </Link>
          </Button>
        </PageListActions>
      </PageListHeader>
      <PageListFilter>
        <CashTransactionFilters />
      </PageListFilter>
      <PageListContent>
        {isLoading ? (
          <Skeleton className="h-[400px] w-full" />
        ) : (
          <DataTable
            data={transactions}
            columns={columns}
            pagination={{
              totalEntries: total,
              pageSize: 20,
              currentPage: page,
            }}
            emptyMessage={t("no_recent_transactions")}
          />
        )}
      </PageListContent>
    </PageListLayout>
  );
}
