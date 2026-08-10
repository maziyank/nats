"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CustomInput } from "@/components/ui/custom-input";
import { CustomSelect } from "@/components/ui/custom-select";
import { Button } from "@/components/ui/button";
import { SelectItem } from "@/components/ui/select";
import { Search, Loader2, Check, X } from "lucide-react";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import {
  getPricingProducts,
  updateSinglePrice,
  getCategories,
  getAllPricingProductIds,
} from "../actions";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DiscountManager } from "./discount-manager";
import { useAlert } from "@/hooks/use-alert";
import { PricingProductWithDetails } from "../types";
import { DataTable, Column } from "@/components/ui/data-table";
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";

export function IndividualPricingTable() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();
  const formatCurrency = useFormatCurrency();
  const alert = useAlert();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState(
    searchParams.get("search") || "",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string | number>("");
  const [isSaving, setIsSaving] = useState(false);

  const categoryFilter = searchParams.get("categoryId") || "ALL";
  const page = Number(searchParams.get("page")) || 1;
  const pageSize = 10;

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });

  // Fetch products
  const { data: productsData, isLoading } = useQuery({
    queryKey: [
      "pricing-products",
      { page, search: searchTerm, categoryId: categoryFilter },
    ],
    queryFn: async () => {
      const res = await getPricingProducts(
        page,
        pageSize,
        searchTerm,
        categoryFilter,
      );
      return {
        ...res,
        products: SuperJSON.deserialize<PricingProductWithDetails[]>(
          res.products as unknown as SuperJSONResult,
        ),
      };
    },
    placeholderData: keepPreviousData,
  });

  const products = productsData?.products || [];
  const totalEntries = productsData?.total || 0;

  // Debounced search
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

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    replace(`${pathname}?${params.toString()}`);
  };

  const handleEdit = (product: PricingProductWithDetails) => {
    setEditingId(product.id);
    setEditValue(Number(product.price));
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const handleSaveEdit = async (id: string) => {
    try {
      setIsSaving(true);
      const res = await updateSinglePrice({
        id,
        price: Number(editValue),
      });

      if (!res.success) {
        throw new Error(res.error);
      }

      await alert({
        title: "Success",
        description: "Price updated successfully",
      });
      setEditingId(null);
      // Invalidate the query to refetch data
      queryClient.invalidateQueries({ queryKey: ["pricing-products"] });
    } catch (error) {
      await alert({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to update",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Selection State
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(
    new Set(),
  );

  // Selection Handlers
  const handleSelectAll = async (checked: boolean) => {
    if (checked) {
      if (searchTerm || categoryFilter !== "ALL") {
        // If filtering, we might want to select only filtered items, but "Select All" usually implies all currently listable items.
        // The actions.ts update handles filters.
      }

      try {
        const allIds = await getAllPricingProductIds(
          searchTerm,
          categoryFilter,
        );
        setSelectedProducts(new Set(allIds));
      } catch (error) {
        console.error("Failed to select all products", error);
        // Fallback or error notification could be added here
      }
    } else {
      setSelectedProducts(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedProducts);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedProducts(newSelected);
  };

  const handlePrintLabels = () => {
    const ids = Array.from(selectedProducts);
    const sessionKey = `print_labels_${Date.now()}`;

    try {
      localStorage.setItem(sessionKey, JSON.stringify(ids));
      window.open(`/inventory/products/print-labels?s=${sessionKey}`, "_blank");
    } catch (error) {
      console.error(
        "Failed to save to localStorage, falling back to URL (might fail for large selections)",
        error,
      );
      const idsParam = ids.join(",");
      window.open(`/inventory/products/print-labels?ids=${idsParam}`, "_blank");
    }
  };

  const isAllSelected =
    totalEntries > 0 && selectedProducts.size === totalEntries;
  const isIndeterminate = selectedProducts.size > 0 && !isAllSelected;

  const columns: Column<PricingProductWithDetails>[] = [
    {
      header: (
        <input
          type="checkbox"
          className="translate-y-[2px]"
          checked={isAllSelected}
          ref={(input) => {
            if (input) input.indeterminate = isIndeterminate;
          }}
          onChange={(e) => handleSelectAll(e.target.checked)}
        />
      ),
      cell: (product) => (
        <input
          type="checkbox"
          className="translate-y-[2px]"
          checked={selectedProducts.has(product.id as string)}
          onChange={(e) =>
            handleSelectOne(product.id as string, e.target.checked)
          }
        />
      ),
      className: "w-[50px]",
    },
    {
      header: "SKU",
      accessorKey: "sku",
    },
    {
      header: "Product Name",
      accessorKey: "name",
      className: "font-medium",
    },
    {
      header: "Category",
      cell: (item) => item.category?.name,
    },
    {
      header: "Cost Price",
      cell: (item) => formatCurrency(Number(item.cost)),
    },
    {
      header: "Selling Price",
      cell: (item) => {
        if (editingId === item.id) {
          return (
            <div className="flex items-center gap-2">
              <div className="w-32">
                <CurrencyInput
                  value={editValue}
                  onChange={(val) => setEditValue(val)}
                  className="h-8"
                />
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => handleSaveEdit(item.id)}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 text-green-600" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={handleCancelEdit}
                disabled={isSaving}
              >
                <X className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          );
        }
        return (
          <div
            className="flex cursor-pointer items-center gap-2 hover:text-primary"
            onClick={() => handleEdit(item)}
            title="Click to edit"
          >
            {formatCurrency(Number(item.price))}
          </div>
        );
      },
    },
    {
      header: "Margin",
      cell: (item) => {
        const price = Number(item.price);
        const cost = Number(item.cost);
        const margin = price - cost;
        const marginPercent = cost > 0 ? (margin / cost) * 100 : 0;
        return (
          <div className={margin < 0 ? "text-red-500" : "text-green-600"}>
            {marginPercent.toFixed(1)}%
          </div>
        );
      },
    },
    {
      header: "Discounts",
      cell: (item) => (
        <DiscountManager
          productName={item.name}
          productId={item.id}
          discounts={item.discounts}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 gap-4">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <CustomInput
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="w-full md:w-48">
            <CustomSelect
              value={categoryFilter}
              onValueChange={handleCategoryChange}
              placeholder="Filter by Category"
            >
              <SelectItem value="ALL">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </CustomSelect>
          </div>
          {selectedProducts.size > 0 && (
            <Button variant="outline" onClick={handlePrintLabels}>
              Print Labels ({selectedProducts.size})
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border">
        <DataTable
          columns={columns}
          data={products}
          isLoading={isLoading}
          pagination={{
            currentPage: page,
            pageSize: 10,
            totalEntries: totalEntries,
            onPageChange: handlePageChange,
          }}
        />
      </div>
    </div>
  );
}
