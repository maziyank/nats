"use client";

import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
import { CustomSelect } from "@/components/ui/custom-select";
import { SelectItem } from "@/components/ui/select";
import { Search, Eye } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { Category, Prisma } from "@/prisma/generated/prisma/browser";
import { DataTable, Column } from "@/components/ui/data-table";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getWarehouseInventory } from "../actions";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";

type InventoryWithProduct = Prisma.InventoryGetPayload<{
  include: {
    product: {
      include: {
        category: true;
        baseUnit: true;
      };
    };
  };
}>;

interface InventoryTableProps {
  warehouseId: string;
  categories: Category[];
}

export function InventoryTable({
  warehouseId,
  categories,
}: InventoryTableProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();
  const formatCurrency = useFormatCurrency();

  const [searchTerm, setSearchTerm] = useState(
    searchParams.get("search") || "",
  );

  const categoryFilter = searchParams.get("categoryId") || "ALL";
  const currentPage = Number(searchParams.get("page")) || 1;
  const search = searchParams.get("search") || undefined;

  const { data, isLoading } = useQuery({
    queryKey: [
      "warehouse-inventory",
      warehouseId,
      currentPage,
      search,
      categoryFilter,
    ],
    queryFn: () =>
      getWarehouseInventory(
        warehouseId,
        currentPage,
        10,
        search,
        categoryFilter === "ALL" ? undefined : categoryFilter,
      ),
    placeholderData: keepPreviousData,
  });

  const inventoryData = data?.inventory;
  const inventory = inventoryData
    ? Array.isArray(inventoryData)
      ? []
      : (SuperJSON.deserialize<InventoryWithProduct[]>(
        inventoryData as SuperJSONResult,
      ) as InventoryWithProduct[])
    : [];
  const totalEntries = data?.total || 0;

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (searchTerm) {
        params.set("search", searchTerm);
      } else {
        params.delete("search");
      }
      params.set("page", "1");

      if (params.get("search") !== (searchParams.get("search") || null)) {
        replace(`${pathname}?${params.toString()}`);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, searchParams, pathname, replace]);

  const handleCategoryChange = (val: string) => {
    const params = new URLSearchParams(searchParams);
    if (val && val !== "ALL") {
      params.set("categoryId", val);
    } else {
      params.delete("categoryId");
    }
    params.set("page", "1");
    replace(`${pathname}?${params.toString()}`);
  };

  const columns: Column<InventoryWithProduct>[] = [
    {
      header: "SKU/Name",
      cell: (inv) => (
        <>
          <div className="text-xs text-muted-foreground">{inv.product.sku}</div>
          <div className="font-medium">{inv.product.name}</div>
        </>
      ),
    },
    {
      header: "Category",
      cell: (inv) => inv.product.category?.name || "-",
    },
    {
      header: "Cost",
      cell: (inv) => formatCurrency(inv.product.cost),
    },
    {
      header: "Quantity",
      cell: (inv) => `${inv.quantity} ${inv.product.baseUnit?.symbol}`,
    },
    {
      header: "Value",
      cell: (inv) => {
        const totalValue = inv.product.cost.mul(inv.quantity);
        return formatCurrency(totalValue);
      },
    },
    {
      header: "Actions",
      className: "w-[100px]",
      cell: (inv) => (
        <Button variant="ghost" size="icon" asChild title="View Product">
          <Link href={`/inventory/products/${inv.product.id}`}>
            <Eye className="h-4 w-4" />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-sm">
          <CustomInput
            placeholder="Search by name or SKU..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            containerClassName="w-full"
          />
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
        <CustomSelect
          value={categoryFilter}
          onValueChange={handleCategoryChange}
          containerClassName="w-[180px]"
          placeholder="Category"
        >
          <SelectItem value="ALL">All Categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </CustomSelect>
      </div>

      <div className="rounded-md border">
        <DataTable
          data={inventory}
          columns={columns}
          emptyMessage="No inventory found."
          pagination={{
            totalEntries,
            pageSize: 10,
            currentPage,
          }}
        />
      </div>
    </div>
  );
}
