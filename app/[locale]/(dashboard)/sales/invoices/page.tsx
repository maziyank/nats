"use client";
export const dynamic = "force-dynamic";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { getSalesInvoices, deleteSalesInvoice } from "./actions";
import { Protect } from "@/components/ui/protect";
import {
  PageListActions,
  PageListContent,
  PageListFilter,
  PageListHeader,
  PageListLayout,
  PageListTitle,
} from "@/components/layout/page/list-layout";
import { SalesInvoiceFilters } from "./_components/sales-invoice-filters";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { SalesInvoiceWithDetails } from "./types";
import { DataTable, Column } from "@/components/ui/data-table";
import { MoreHorizontal, Eye, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/hooks/use-confirm";
import { useFormatDate } from "@/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

export default function SalesInvoicesPage() {
  const t = useTranslations("Sales");
  const tCommon = useTranslations("Common");
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page")) || 1;
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "ALL";
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["sales-invoices", page, search, status],
    queryFn: async () => {
      const result = await getSalesInvoices(page, 10, search, status);
      return {
        invoices: Array.isArray(result.invoices)
          ? []
          : (SuperJSON.deserialize<SalesInvoiceWithDetails[]>(
              result.invoices as SuperJSONResult,
            ) as SalesInvoiceWithDetails[]),
        total: result.total,
        totalPages: result.totalPages,
      };
    },
  });

  const formatCurrency = useFormatCurrency();
  const formatDate = useFormatDate();
  const confirm = useConfirm();

  const handleDeleteClick = async (id: string) => {
    if (
      await confirm({
        title: t("delete_sales_invoice"),
        description: t("delete_sales_invoice_desc"),
        confirmText: tCommon("delete"),
        variant: "destructive",
      })
    ) {
      startTransition(async () => {
        try {
          await deleteSalesInvoice(id);
          queryClient.invalidateQueries({ queryKey: ["sales-invoices"] });
          toast({
            title: tCommon("success"),
            description: t("delete_success"),
          });
        } catch (error) {
          toast({
            title: tCommon("error"),
            description: t("delete_error"),
            variant: "destructive",
          });
        }
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "DRAFT":
        return "bg-gray-500";
      case "ISSUED":
        return "bg-blue-500";
      case "PARTIALLY_PAID":
        return "bg-yellow-500";
      case "PAID":
        return "bg-green-500";
      case "CANCELLED":
        return "bg-red-500";
      case "OVERDUE":
        return "bg-red-700";
      default:
        return "bg-gray-500";
    }
  };

  const columns: Column<SalesInvoiceWithDetails>[] = [
    {
      header: t("invoice_number"),
      accessorKey: "invoiceNumber",
      className: "font-medium",
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
      header: t("order_number"),
      cell: (item) => (
        <Link target="_blank" href={`/sales/orders/${item.salesOrderId}`}>
          <span className="font-medium text-primary">
            {item.salesOrder?.orderNumber || "-"}
          </span>
        </Link>
      ),
    },
    {
      header: tCommon("date"),
      accessorKey: "invoiceDate",
      cell: (item) => formatDate(item.invoiceDate, { includeTime: true }),
    },
    {
      header: t("due_date"),
      accessorKey: "dueDate",
      cell: (item) => formatDate(item.dueDate),
    },
    {
      header: tCommon("status"),
      accessorKey: "status",
      cell: (item) => (
        <Badge className={getStatusColor(item.status)}>
          {item.status.replace("_", " ")}
        </Badge>
      ),
    },
    {
      header: t("paid_amount"),
      className: "text-right",
      headerClassName: "text-right",
      cell: (item) => {
        const paidAmount = item.payments.reduce(
          (acc, payment) => acc + Number(payment.amount),
          0,
        );
        return formatCurrency(paidAmount);
      },
    },
    {
      header: t("remaining_amount"),
      className: "text-right",
      headerClassName: "text-right",
      cell: (item) => {
        const paidAmount = item.payments.reduce(
          (acc, payment) => acc + Number(payment.amount),
          0,
        );
        const remainingAmount = Number(item.totalAmount) - paidAmount;
        return formatCurrency(remainingAmount);
      },
    },
    {
      header: tCommon("total"),
      accessorKey: "totalAmount",
      className: "text-right",
      headerClassName: "text-right",
      cell: (item) => formatCurrency(Number(item.totalAmount)),
    },
    {
      header: "",
      className: "w-[80px]",
      cell: (invoice) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">{tCommon("actions")}</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{tCommon("actions")}</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link target="_blank" href={`/sales/invoices/${invoice.id}`}>
                <Eye className="mr-2 h-4 w-4" /> {tCommon("details")}
              </Link>
            </DropdownMenuItem>
            {invoice.status === "DRAFT" && (
              <>
                <Protect permission="sales.edit">
                  <DropdownMenuItem asChild>
                    <Link
                      target="_blank"
                      href={`/sales/invoices/${invoice.id}/edit`}
                    >
                      <Pencil className="mr-2 h-4 w-4" /> {tCommon("edit")}
                    </Link>
                  </DropdownMenuItem>
                </Protect>
                <DropdownMenuSeparator />
                <Protect permission="sales.delete">
                  <DropdownMenuItem
                    className="text-red-600 focus:bg-red-50 focus:text-red-900 dark:focus:bg-red-900/10"
                    onClick={() => handleDeleteClick(invoice.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> {tCommon("delete")}
                  </DropdownMenuItem>
                </Protect>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <PageListLayout>
      <PageListHeader>
        <PageListTitle title={t("sales_invoices")} />
        <PageListActions>
          <Protect permission="sales.create">
            <Button asChild>
              <Link href="/sales/invoices/new">
                <Plus className="mr-2 h-4 w-4" /> {t("new_invoice")}
              </Link>
            </Button>
          </Protect>
        </PageListActions>
      </PageListHeader>

      <PageListFilter>
        <SalesInvoiceFilters />
      </PageListFilter>

      <PageListContent>
        {isLoading ? (
          <Skeleton className="h-[400px] w-full" />
        ) : (
          <DataTable
            data={data?.invoices || []}
            columns={columns}
            pagination={{
              totalEntries: data?.total || 0,
              pageSize: 10,
              currentPage: page,
            }}
            emptyMessage={t("no_invoices_found")}
          />
        )}
      </PageListContent>
    </PageListLayout>
  );
}
