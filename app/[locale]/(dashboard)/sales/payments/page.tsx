"use client";
export const dynamic = "force-dynamic";

import { Button } from "@/components/ui/button";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Eye,
  BookOpen,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import {
  getSalesPayments,
  deleteSalesPayment,
  postSalesPayment,
} from "./actions";
import { Protect } from "@/components/ui/protect";
import {
  PageListActions,
  PageListContent,
  PageListFilter,
  PageListHeader,
  PageListLayout,
  PageListTitle,
} from "@/components/layout/page/list-layout";
import { SalesPaymentFilters } from "./_components/sales-payment-filters";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { SalesPaymentWithDetails } from "./types";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { DataTable, Column } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/hooks/use-confirm";
import { useFormatDate, useFormatCurrency } from "@/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { useTransition } from "react";
import { useTranslations } from "next-intl";

export default function SalesPaymentsPage() {
  const t = useTranslations("Sales");
  const tCommon = useTranslations("Common");
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page")) || 1;
  const search = searchParams.get("search") || "";
  const formatDate = useFormatDate();
  const [isPending, startTransition] = useTransition();

  const { data, isLoading } = useQuery({
    queryKey: ["sales-payments", page, search],
    queryFn: async () => {
      const result = await getSalesPayments(page, 10, search);
      return {
        payments: Array.isArray(result.payments)
          ? []
          : (SuperJSON.deserialize<SalesPaymentWithDetails[]>(
              result.payments as SuperJSONResult,
            ) as SalesPaymentWithDetails[]),
        total: result.total,
        totalPages: result.totalPages,
      };
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const formatCurrency = useFormatCurrency();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handlePost = async (id: string) => {
    if (
      await confirm({
        title: t("post_payment"),
        description: t("post_payment_desc"),
        confirmText: tCommon("confirm"),
      })
    ) {
      startTransition(async () => {
        try {
          const result = await postSalesPayment(id);
          if (result.success) {
            toast({
              title: tCommon("success"),
              description: result.data?.processed ? (
                t("post_success")
              ) : (
                <span>
                  {result.data?.alreadyQueued
                    ? t("already_queued")
                    : t("queued_for_processing")}{" "}
                  {result.data?.outboxId ? (
                    <Link
                      href={`/admin/integrations/outbox?search=${encodeURIComponent(
                        result.data.outboxId,
                      )}`}
                      className="underline"
                    >
                      {t("view_outbox")}
                    </Link>
                  ) : null}
                </span>
              ),
            });
            queryClient.invalidateQueries({ queryKey: ["sales-payments"] });
          } else {
            toast({
              title: tCommon("error"),
              description: result.error,
              variant: "destructive",
            });
          }
        } catch (error) {
          toast({
            title: tCommon("error"),
            description: t("post_error"),
            variant: "destructive",
          });
        }
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (
      await confirm({
        title: t("delete_payment"),
        description: t("delete_payment_desc"),
        confirmText: tCommon("delete"),
        variant: "destructive",
      })
    ) {
      startTransition(async () => {
        try {
          await deleteSalesPayment(id);
          queryClient.invalidateQueries({ queryKey: ["sales-payments"] });
          toast({
            title: tCommon("success"),
            description: t("delete_success_payment"),
          });
        } catch (error) {
          toast({
            title: tCommon("error"),
            description: t("delete_error_payment"),
            variant: "destructive",
          });
        }
      });
    }
  };

  const columns: Column<SalesPaymentWithDetails>[] = [
    {
      header: t("payment_number"),
      accessorKey: "paymentNumber",
      className: "font-medium",
    },
    {
      header: tCommon("status"),
      accessorKey: "journalEntryId",
      cell: (item) =>
        item.journalEntryId ? (
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200"
          >
            {t("posted")}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="bg-yellow-50 text-yellow-700 border-yellow-200"
          >
            {t("unposted")}
          </Badge>
        ),
    },
    {
      header: tCommon("date"),
      accessorKey: "paymentDate",
      cell: (item) => formatDate(item.paymentDate, { includeTime: true }),
    },
    {
      header: tCommon("customer"),
      cell: (item) =>
        item.contact ? (
          <Link
            target="_blank"
            href={`/general/contacts/${item.contact.id}`}
            className="text-primary hover:underline"
          >
            {item.contact.name}
          </Link>
        ) : (
          "-"
        ),
    },
    {
      header: t("invoice_number"),
      cell: (item) => (
        <Link target="_blank" href={`/sales/invoices/${item.salesInvoiceId}`}>
          <span className="font-medium text-primary">
            {item.salesInvoice.invoiceNumber}
          </span>
        </Link>
      ),
    },
    {
      header: t("account"),
      cell: (item) => item.cashAccount?.name || "-",
    },
    {
      header: tCommon("amount"),
      accessorKey: "amount",
      className: "text-right",
      headerClassName: "text-right",
      cell: (item) => formatCurrency(Number(item.amount)),
    },
    {
      header: "",
      className: "w-[50px]",
      cell: (payment) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">{tCommon("actions")}</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{tCommon("actions")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link target="_blank" href={`/sales/payments/${payment.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                {tCommon("details")}
              </Link>
            </DropdownMenuItem>
            {!payment.journalEntryId && (
              <Protect permission="sales.update">
                <DropdownMenuItem asChild>
                  <Link href={`/sales/payments/${payment.id}/edit`}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {tCommon("edit")}
                  </Link>
                </DropdownMenuItem>
              </Protect>
            )}
            {!payment.journalEntryId && (
              <Protect permission="sales.create">
                <DropdownMenuItem onClick={() => handlePost(payment.id)}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  {t("post")}
                </DropdownMenuItem>
              </Protect>
            )}
            {!payment.journalEntryId && (
              <Protect permission="sales.delete">
                <DropdownMenuItem
                  onClick={() => handleDelete(payment.id)}
                  className="text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {tCommon("delete")}
                </DropdownMenuItem>
              </Protect>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <PageListLayout>
      <PageListHeader>
        <PageListTitle title={t("sales_payments")} />
        <PageListActions>
          <Protect permission="sales.create">
            <Button asChild>
              <Link href="/sales/payments/new">
                <Plus className="mr-2 h-4 w-4" />
                {t("new_payment")}
              </Link>
            </Button>
          </Protect>
        </PageListActions>
      </PageListHeader>
      <PageListFilter>
        <SalesPaymentFilters />
      </PageListFilter>
      <PageListContent>
        {isLoading ? (
          <Skeleton className="h-[400px] w-full" />
        ) : (
          <DataTable
            data={data?.payments || []}
            columns={columns}
            pagination={{
              totalEntries: data?.total || 0,
              pageSize: 10,
              currentPage: page,
            }}
            emptyMessage={t("no_payments_found")}
          />
        )}
      </PageListContent>
    </PageListLayout>
  );
}
