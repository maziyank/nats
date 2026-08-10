export const dynamic = "force-dynamic";

import { getCategories, getProduct } from "../actions";
import { getUnits } from "../../uom/actions";
import { getTaxRates } from "@/app/[locale]/(dashboard)/accounting/configuration/taxes/actions";
import { ProductForm } from "../_components/product-form";
import { notFound } from "next/navigation";
import { SuperJSON } from "@/services/lib/superjson";
import { ProductFormData } from "../../types";
import { Protect } from "@/components/ui/protect";

export default async function ProductViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [productData, categories, units, taxRates] = await Promise.all([
    getProduct(id),
    getCategories(),
    getUnits(),
    getTaxRates(),
  ]);

  if (!productData) {
    notFound();
  }

  const product = SuperJSON.deserialize(productData) as ProductFormData;

  return (
    <Protect
      permission="products.view"
      fallback={<div>You do not have permission to view products.</div>}
    >
      <ProductForm
        product={product}
        categories={categories}
        units={units.data}
        taxRates={taxRates}
        readonly={true}
      /></Protect>
  );
}
