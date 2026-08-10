export const dynamic = "force-dynamic";

import { getCategories, getProduct } from "../../actions";
import { getUnits } from "../../../uom/actions";
import { getTaxRates } from "@/app/[locale]/(dashboard)/accounting/configuration/taxes/actions";
import { ProductForm } from "../../_components/product-form";
import { Protect } from "@/components/ui/protect";
import { notFound } from "next/navigation";
import { SuperJSON } from "@/services/lib/superjson";
import { ProductFormData } from "../../../types";

export default async function EditProductPage({
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

  return (
    <Protect
      permission="products.edit"
      fallback={<div>You do not have permission to edit products.</div>}
    >
      <ProductForm
        product={productData}
        categories={categories}
        units={units.data}
        taxRates={taxRates}
      />
    </Protect>
  );
}
