"use client";

import { useQuery } from "@tanstack/react-query";
import { getWarehouse, getCategories } from "../actions";
import { InventoryTable } from "./inventory-table";
import { notFound } from "next/navigation";
import { SuperJSON } from "@/services/lib/superjson";
import { Warehouse, Category } from "@/prisma/generated/prisma/browser";
import { SuperJSONResult } from "superjson";

interface WarehouseDetailViewProps {
  warehouseId: string;
}

export function WarehouseDetailView({ warehouseId }: WarehouseDetailViewProps) {
  const { data: warehouseData, isLoading } = useQuery({
    queryKey: ["warehouse", warehouseId],
    queryFn: () => getWarehouse(warehouseId),
  });

  const warehouse = warehouseData
    ? SuperJSON.deserialize<Warehouse>(warehouseData)
    : null;

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });

  const categories = categoriesData
    ? Array.isArray(categoriesData)
      ? []
      : (SuperJSON.deserialize<Category[]>(
        categoriesData as SuperJSONResult,
      ) as Category[])
    : [];

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-4 px-4">
        <div className="h-16 w-full animate-pulse rounded-lg bg-muted/50" />
        <div className="h-[400px] w-full animate-pulse rounded-lg bg-muted/50" />
      </div>
    );
  }

  if (!warehouse) {
    return notFound();
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <h2 className="text-lg font-bold tracking-tight">{warehouse.name}</h2>
          <p className="text-sm text-muted-foreground">{warehouse.location}</p>
        </div>
      </div>

      <InventoryTable warehouseId={warehouseId} categories={categories} />
    </div>
  );
}
