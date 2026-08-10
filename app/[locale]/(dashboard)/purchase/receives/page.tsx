"use client";
export const dynamic = "force-dynamic";

import { getPurchaseReceives, deletePurchaseReceive } from "./actions";
import { Protect } from "@/components/ui/protect";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import {
  PageListActions,
  PageListContent,
  PageListFilter,
  PageListHeader,
  PageListLayout,
  PageListTitle,
} from "@/components/layout/page/list-layout";
import { PurchaseReceiveFilters } from "./_components/purchase-receive-filters";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { PurchaseReceiveWithDetails } from "./types";
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
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/hooks/use-confirm";
import { useFormatDate } from "@/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from "next-intl";

export default function PurchaseReceivesPage() {
  const t = useTranslations("Purchase");
  const tCommon = useTranslations("Common");
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page")) || 1;
  const search = searchParams.get("search") || "";
  const formatDate = useFormatDate();

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-receives", page, search],
    queryFn: async () => {
      const result = await getPurchaseReceives(page, 10, search);
      return {
        receives: Array.isArray(result.receives)
          ? []
          : (SuperJSON.deserialize<PurchaseReceiveWithDetails[]>(
            result.receives as SuperJSONResult,
          ) as PurchaseReceiveWithDetails[]),
        total: result.total,
        totalPages: result.totalPages,
      };
    },
  });

  const confirm = useConfirm();

  const handleDeleteClick = async (id: string) => {
    if (
      await confirm({
        title: t("delete_purchase_receive"),
        description: t("delete_purchase_receive_desc"),
        confirmText: tCommon("delete"),
        variant: "destructive",
      })
    ) {
      await deletePurchaseReceive(id);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "DRAFT":
        return "bg-gray-500";
      case "COMPLETED":
        return "bg-green-500";
      case "CANCELLED":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const columns: Column<PurchaseReceiveWithDetails>[] = [
    {
      header: t("receive_number"),
      accessorKey: "receiveNumber",
      className: "font-medium",
    },
    {
      header: t("order_number"),
      cell: (item) => (
        <Link target="_blank" href={`/purchase/orders/${item.purchaseOrderId}`}>
          <span className="font-medium text-primary">
            {item.purchaseOrder?.orderNumber || "-"}
          </span>
        </Link>
      ),
    },
    {
      header: tCommon("vendor"),
      cell: (item) =>
        item.contact ? (
          <Link target="_blank"
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
      header: tCommon("date"),
      accessorKey: "receiveDate",
      cell: (item) => formatDate(item.receiveDate),
    },
    {
      header: tCommon("status"),
      accessorKey: "status",
      cell: (item) => (
        <Badge className={getStatusColor(item.status)}>
          {item.status}
        </Badge>
      ),
    },
    {
      header: "",
      className: "w-[80px]",
      cell: (receive) => (
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
              <Link target="_blank" href={`/purchase/receives/${receive.id}`}>
                <Eye className="mr-2 h-4 w-4" /> {tCommon("details")}
              </Link>
            </DropdownMenuItem>
            {receive.status !== "COMPLETED" && (
              <Protect permission="purchase.edit">
                <DropdownMenuItem asChild>
                  <Link target="_blank" href={`/purchase/receives/${receive.id}/edit`}>
                    <Pencil className="mr-2 h-4 w-4" /> {tCommon("edit")}
                  </Link>
                </DropdownMenuItem>
              </Protect>
            )}
            <DropdownMenuSeparator />
            {receive.status !== "COMPLETED" && (
              <Protect permission="purchase.delete">
                <DropdownMenuItem
                  className="text-red-600 focus:bg-red-50 focus:text-red-900 dark:focus:bg-red-900/10"
                  onClick={() => handleDeleteClick(receive.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> {tCommon("delete")}
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
        <PageListTitle title={t("purchase_receives")} />
        <PageListActions>
          <Protect permission="purchase.create">
            <Button asChild>
              <Link href="/purchase/receives/new">
                <Plus className="mr-2 h-4 w-4" /> {t("new_receive")}
              </Link>
            </Button>
          </Protect>
        </PageListActions>
      </PageListHeader>

      <PageListFilter>
        <PurchaseReceiveFilters />
      </PageListFilter>

      <PageListContent>
        {isLoading ? (
          <Skeleton className="h-[400px] w-full" />
        ) : (
          <DataTable
            data={data?.receives || []}
            columns={columns}
            pagination={{
              totalEntries: data?.total || 0,
              pageSize: 10,
              currentPage: page,
            }}
            emptyMessage={t("no_receives_found")}
          />
        )}
      </PageListContent>
    </PageListLayout>
  );
}
