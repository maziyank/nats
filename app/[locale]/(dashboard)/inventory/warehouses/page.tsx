"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, Column } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, Eye, Plus } from "lucide-react";
import Link from "next/link";
import { deleteWarehouse, getWarehouses } from "./actions";
import { WarehouseDialog } from "./_components/warehouse-dialog";
import { Protect } from "@/components/ui/protect";
import { useConfirm } from "@/hooks/use-confirm";
import {
  Inventory,
  Product,
  Warehouse,
} from "@/prisma/generated/prisma/browser";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import {
  PageListActions,
  PageListContent,
  PageListHeader,
  PageListLayout,
  PageListTitle,
} from "@/components/layout/page/list-layout";
import {
  useQuery,
  keepPreviousData,
  useQueryClient,
} from "@tanstack/react-query";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";

type WarehouseWithInventory = Warehouse & {
  inventory: (Inventory & {
    product: Product;
  })[];
};

import { useTranslations } from "next-intl";

export default function WarehousesPage() {
  const t = useTranslations("Inventory");
  const tCommon = useTranslations("Common");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const page = Number(searchParams.get("page")) || 1;
  const pageSize = 10;

  const formatCurrency = useFormatCurrency();
  const [editingWarehouse, setEditingWarehouse] = useState<
    WarehouseWithInventory | undefined
  >(undefined);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["warehouses", { page }],
    queryFn: async () => {
      const res = await getWarehouses(page, pageSize);
      return {
        ...res,
        warehouses: SuperJSON.deserialize<WarehouseWithInventory[]>(
          res.warehouses as unknown as SuperJSONResult,
        ),
      };
    },
    placeholderData: keepPreviousData,
  });

  async function handleDelete(id: string) {
    if (
      await confirm({
        title: t("delete_warehouse"),
        description: t("delete_warehouse_desc"),
      })
    ) {
      await deleteWarehouse(id);
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
    }
  }

  const handleCreate = () => {
    setEditingWarehouse(undefined);
    setIsDialogOpen(true);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  const columns: Column<WarehouseWithInventory>[] = [
    {
      header: tCommon("name"),
      accessorKey: "name",
      className: "font-medium",
    },
    {
      header: t("address"),
      accessorKey: "location",
      cell: (item) => item.location || "-",
    },
    {
      header: tCommon("total"), // Actually total valuation? en.json has total valuation
      cell: (item) => {
        const totalValue = item.inventory.reduce(
          (sum, inv) => sum + inv.quantity * inv.product.cost.toNumber(),
          0,
        );
        return formatCurrency(totalValue);
      },
    },
    {
      header: t("items"),
      cell: (item) => item.inventory.length,
    },
    {
      header: "",
      className: "w-[70px]",
      cell: (item) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{tCommon("actions")}</DropdownMenuLabel>
            <Protect permission="warehouses.view">
              <DropdownMenuItem asChild>
                <Link href={`/inventory/warehouses/${item.id}`}>
                  <Eye className="mr-2 h-4 w-4" /> {t("view_details")}
                </Link>
              </DropdownMenuItem>
            </Protect>
            <Protect permission="warehouses.edit">
              <DropdownMenuItem
                onClick={() => {
                  setEditingWarehouse(item);
                  setIsDialogOpen(true);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" /> {tCommon("edit")}
              </DropdownMenuItem>
            </Protect>
            <Protect permission="warehouses.delete">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => handleDelete(item.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> {tCommon("delete")}
              </DropdownMenuItem>
            </Protect>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <PageListLayout>
      <PageListHeader>
        <PageListTitle title={t("locations")} />
        <PageListActions>
          <Protect permission="warehouses.create">
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" /> {t("add_location")}
            </Button>
          </Protect>
        </PageListActions>
      </PageListHeader>

      <PageListContent>
        <DataTable
          data={data?.warehouses || []}
          columns={columns}
          isLoading={isLoading}
          emptyMessage={t("no_locations_found")}
          pagination={{
            totalEntries: data?.total || 0,
            pageSize,
            currentPage: page,
            onPageChange: handlePageChange,
          }}
        />
      </PageListContent>

      <WarehouseDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        warehouse={editingWarehouse}
      />
    </PageListLayout>
  );
}
