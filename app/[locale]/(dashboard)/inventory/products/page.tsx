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
import {
  Pencil,
  Trash2,
  Search,
  Eye,
  MoreHorizontal,
  Plus,
  FileBarChart,
} from "lucide-react";
import Link from "next/link";
import { deleteProduct, getCategories, getProducts } from "./actions";
import { Protect } from "@/components/ui/protect";
import { useConfirm } from "@/hooks/use-confirm";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import {
  PageListActions,
  PageListContent,
  PageListFilter,
  PageListHeader,
  PageListLayout,
  PageListTitle,
} from "@/components/layout/page/list-layout";
import { CustomInput } from "@/components/ui/custom-input";
import { CustomSelect } from "@/components/ui/custom-select";
import { SelectItem } from "@/components/ui/select";
import {
  useQuery,
  keepPreviousData,
  useQueryClient,
} from "@tanstack/react-query";
import { ProductFormData } from "../types";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

import { useTranslations } from "next-intl";

export default function ProductsPage() {
  const t = useTranslations("Inventory");
  const tCommon = useTranslations("Common");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const page = Number(searchParams.get("page")) || 1;
  const search = searchParams.get("search") || "";
  const categoryId = searchParams.get("categoryId") || "ALL";
  const pageSize = 10;

  const formatCurrency = useFormatCurrency();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const { data: productsData, isLoading: isLoadingProducts } = useQuery({
    queryKey: ["products", { page, search, categoryId }],
    queryFn: async () => {
      const {
        products: serializedProducts,
        total,
        totalPages,
      } = await getProducts(page, pageSize, search || undefined, categoryId);
      return {
        products: Array.isArray(serializedProducts)
          ? []
          : (SuperJSON.deserialize(
            serializedProducts as SuperJSONResult,
          ) as ProductFormData[]),
        total,
        totalPages,
      };
    },
    placeholderData: keepPreviousData,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });

  const products = productsData?.products || [];

  const handleSearch = (term: string) => {
    const params = new URLSearchParams(searchParams);
    if (term) {
      params.set("search", term);
    } else {
      params.delete("search");
    }
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleCategoryChange = (val: string) => {
    const params = new URLSearchParams(searchParams);
    if (val && val !== "ALL") {
      params.set("categoryId", val);
    } else {
      params.delete("categoryId");
    }
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  async function handleDelete(id: string) {
    if (
      await confirm({
        title: t("delete_product"),
        description: t("delete_product_desc"),
      })
    ) {
      await deleteProduct(id);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    }
  }

  const columns: Column<ProductFormData>[] = [
    {
      header: `${t("sku")}/${tCommon("name")}`,
      cell: (product) => (
        <div>
          <div className="text-xs text-muted-foreground">{product.sku}</div>
          <div className="font-medium">{product.name}</div>
        </div>
      ),
    },
    {
      header: t("categories"),
      cell: (product) => product.category?.name || "-",
    },
    {
      header: t("price"),
      cell: (product) => formatCurrency(product.price),
    },
    {
      header: t("cost"),
      cell: (product) => formatCurrency(product.cost),
    },
    {
      header: t("min_stock"),
      accessorKey: "minStock",
    },
    {
      header: t("stock"),
      cell: (product) => {
        const totalStock = product?.inventory?.reduce(
          (acc: number, inv: { quantity: number }) =>
            acc + Number(inv.quantity),
          0,
        );
        return `${totalStock} ${product.baseUnit?.symbol}`;
      },
    },
    {
      header: tCommon("actions"),
      className: "w-[100px]",
      cell: (product) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{tCommon("actions")}</DropdownMenuLabel>
            <Protect permission="products.view">
              <DropdownMenuItem asChild>
                <Link
                  href={`/inventory/products/${product.id}`}
                  className="flex items-center"
                >
                  <Eye className="mr-2 h-4 w-4" /> {tCommon("details")}
                </Link>
              </DropdownMenuItem>
            </Protect>
            <Protect permission="products.edit">
              <DropdownMenuItem asChild>
                <Link
                  href={`/inventory/products/${product.id}/edit`}
                  className="flex items-center"
                >
                  <Pencil className="mr-2 h-4 w-4" /> {tCommon("edit")}
                </Link>
              </DropdownMenuItem>
            </Protect>
            <Protect permission="products.delete">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => handleDelete(product.id as string)}
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
        <PageListTitle title={t("products")} />
        <PageListActions>
          <Button asChild variant="outline">
            <Link href="/inventory/products/reports">
              <FileBarChart className="mr-2 h-4 w-4" /> {t("reports_title")}
            </Link>
          </Button>
          <Protect permission="products.create">
            <Button asChild>
              <Link href="/inventory/products/create">
                <Plus className="mr-2 h-4 w-4" /> {t("create_product")}
              </Link>
            </Button>
          </Protect>
        </PageListActions>
      </PageListHeader>

      <PageListFilter>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <CustomInput
            placeholder={t("search_products")}
            className="pl-8"
            defaultValue={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
        <CustomSelect
          value={categoryId}
          onValueChange={handleCategoryChange}
          containerClassName="w-[180px]"
          placeholder={t("categories")}
        >
          <SelectItem value="ALL">{t("all_categories")}</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </CustomSelect>
      </PageListFilter>

      <PageListContent>
        <DataTable
          data={products}
          columns={columns}
          isLoading={isLoadingProducts}
          emptyMessage={t("no_products_found")}
          pagination={{
            totalEntries: productsData?.total || 0,
            pageSize,
            currentPage: page,
            onPageChange: handlePageChange,
          }}
        />
      </PageListContent>
    </PageListLayout>
  );
}
