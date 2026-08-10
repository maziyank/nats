"use client";
export const dynamic = "force-dynamic";

import { useQuery } from "@tanstack/react-query";
import { getProducts } from "../../products/actions";
import { getWarehouses } from "../../warehouses/actions";
import { BatchMovementForm } from "../_components/batch-movement-form";
import { SuperJSON } from "@/services/lib/superjson";
import { Product, Warehouse } from "@/prisma/generated/prisma/browser";
import { SuperJSONResult } from "superjson";

import { useTranslations } from "next-intl";

export default function CreateMovementPage() {
  const t = useTranslations("Inventory");
  const tCommon = useTranslations("Common");

  const { data: productsData, isLoading: isProductsLoading } = useQuery({
    queryKey: ["products-list"],
    queryFn: () => getProducts(),
  });

  const { data: warehousesData, isLoading: isWarehousesLoading } = useQuery({
    queryKey: ["warehouses-list"],
    queryFn: () => getWarehouses(),
  });

  if (isProductsLoading || isWarehousesLoading) {
    return <div className="p-4">{tCommon("loading")}</div>;
  }

  const products = productsData?.products
    ? SuperJSON.deserialize<Product[]>(productsData.products as SuperJSONResult)
    : [];
  const warehouses = warehousesData?.warehouses
    ? SuperJSON.deserialize<Warehouse[]>(warehousesData.warehouses as SuperJSONResult)
    : [];

  // Convert Decimals to numbers for client component
  const formattedProducts = products.map((p) => ({
    ...p,
    price: Number(p.price),
    cost: Number(p.cost),
    averageCost: Number(p.averageCost),
    purchaseConversionFactor: Number(p.purchaseConversionFactor),
    salesConversionFactor: Number(p.salesConversionFactor),
  }));

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold tracking-tight">
          {t("inventory_movements")}
        </h2>
      </div>

      <BatchMovementForm
        products={formattedProducts}
        warehouses={warehouses}
      />
    </div>
  );
}
