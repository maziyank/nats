"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useState } from "react";
import { createProduct, updateProduct } from "../actions";
import { ProductFormData } from "../../types";
import { Category, Unit, TaxRate } from "@/prisma/generated/prisma/browser";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PriceHistory } from "./price-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAlert } from "@/hooks/use-alert";
import { SuperJSON } from "@/services/lib/superjson";
import { ProductFormState } from "./form-types";
import { GeneralSection } from "./form-sections/general-section";
import { PricingSection } from "./form-sections/pricing-section";
import { ImageSection } from "./form-sections/image-section";
import { SkuSearchDialog, type SelectedMetadata } from "./sku-search-dialog";

interface ProductFormProps {
  product?: ProductFormData | any;
  categories: Category[];
  units: Unit[];
  taxRates: TaxRate[];
  readonly?: boolean;
}

export function ProductForm({
  product: initialProduct,
  categories,
  units,
  taxRates,
  readonly = false,
}: ProductFormProps) {
  const product =
    initialProduct && (initialProduct as any).json
      ? (SuperJSON.deserialize(initialProduct) as unknown as ProductFormData)
      : (initialProduct as unknown as ProductFormData | undefined);

  const router = useRouter();
  const alert = useAlert();
  const [isLoading, setIsLoading] = useState(false);
  const [isSkuSearchOpen, setIsSkuSearchOpen] = useState(false);
  const isEditing = !!product;

  // Fully controlled form state
  const [formData, setFormData] = useState<ProductFormState>({
    sku: product?.sku || "",
    name: product?.name || "",
    description: product?.description || "",
    categoryId: product?.categoryId || "",
    price: product?.price?.toString() || "",
    cost: product?.cost?.toString() || "",
    minStock: product?.minStock || 0,
    isActive: product?.isActive ?? true,
    baseUnitId: product?.baseUnitId || "",
    purchaseUnitId: product?.purchaseUnitId || "",
    purchaseConversionFactor:
      product?.purchaseConversionFactor?.toString() || 1,
    salesUnitId: product?.salesUnitId || "",
    salesConversionFactor: product?.salesConversionFactor?.toString() || 1,
    image: product?.image || "",
    taxRateId: product?.taxRateId || "",
  });

  const handleInputChange = (
    field: string,
    value: string | number | boolean | null,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleApplySkuMetadata = (metadata: SelectedMetadata) => {
    if (metadata.sku) {
      handleInputChange("sku", metadata.sku);
    }
    if (metadata.name) {
      handleInputChange("name", metadata.name);
    }
    if (metadata.description) {
      handleInputChange("description", metadata.description);
    }
    if (metadata.image) {
      handleInputChange("image", metadata.image);
    }
    if (metadata.price) {
      // Extract numeric value from price string
      const numericPrice = metadata.price
        .replace(/[^0-9.,]/g, "")
        .replace(",", ".");
      if (numericPrice && !isNaN(Number(numericPrice))) {
        handleInputChange("price", numericPrice);
      }
    }
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);

    // Validation
    const purchaseFactor = formData.purchaseConversionFactor;
    const salesFactor = formData.salesConversionFactor;

    if (!formData.baseUnitId) {
      await alert({ title: "Error", description: "Base Unit is required" });
      setIsLoading(false);
      return;
    }

    if (Number(purchaseFactor) < 0) {
      await alert({
        title: "Error",
        description: "Purchase conversion factor must be positive",
      });
      setIsLoading(false);
      return;
    }

    if (Number(salesFactor) < 0) {
      await alert({
        title: "Error",
        description: "Sales conversion factor must be positive",
      });
      setIsLoading(false);
      return;
    }

    const priceValue = formData.price;
    const costValue = formData.cost;

    const data = {
      sku: formData.sku,
      name: formData.name,
      description: formData.description,
      image: formData.image,
      categoryId: formData.categoryId || null,
      price: priceValue.toString(),
      cost: costValue.toString(),
      minStock: Number(formData.minStock),
      isActive: formData.isActive,
      baseUnitId: formData.baseUnitId || null,
      purchaseUnitId: formData.purchaseUnitId || null,
      purchaseConversionFactor: purchaseFactor?.toString() || 1,
      salesUnitId: formData.salesUnitId || null,
      salesConversionFactor: salesFactor?.toString() || 1,
      taxRateId: formData.taxRateId || null,
    };

    try {
      let result;
      if (isEditing && product) {
        result = await updateProduct(product.id, data);
      } else {
        result = await createProduct(data);
      }

      if (result.success) {
        router.push("/inventory/products");
        router.refresh();
      } else {
        await alert({
          title: "Error",
          description: result.error || "Something went wrong",
        });
      }
    } catch (error) {
      console.error(error);
      await alert({
        title: "Error",
        description: "An unexpected error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full mx-auto p-2">
      <div className="flex items-center justify-between mb-4 px-2">
        <h2 className="text-base font-bold tracking-tight">
          {readonly
            ? "Product Details"
            : isEditing
              ? "Edit Product"
              : "Create Product"}
        </h2>
      </div>

      <form onSubmit={handleSubmit}>
        <Tabs defaultValue="general" className="w-full">
          <div className="flex items-center justify-between mb-2">
            <TabsList className="h-8 p-0.5 bg-muted/50">
              <TabsTrigger value="general" className="px-3 text-xs h-7">
                General
              </TabsTrigger>
              <TabsTrigger value="pricing" className="px-3 text-xs h-7">
                Pricing & Inventory
              </TabsTrigger>
              <TabsTrigger value="image" className="px-3 text-xs h-7">
                Product Image
              </TabsTrigger>
            </TabsList>
          </div>

          <Card className="shadow-none border">
            <CardContent className="p-4">
              <TabsContent value="general" className="mt-0">
                <GeneralSection
                  formData={formData}
                  handleInputChange={handleInputChange}
                  categories={categories}
                  readonly={readonly}
                  onOpenSkuSearch={
                    !readonly ? () => setIsSkuSearchOpen(true) : undefined
                  }
                />
              </TabsContent>

              <TabsContent value="pricing" className="mt-0">
                <PricingSection
                  formData={formData}
                  handleInputChange={handleInputChange}
                  units={units}
                  taxRates={taxRates}
                  readonly={readonly}
                />
              </TabsContent>

              <TabsContent value="image" className="mt-0">
                <ImageSection
                  formData={formData}
                  handleInputChange={handleInputChange}
                  readonly={readonly}
                />
              </TabsContent>
            </CardContent>

            <CardFooter className="flex justify-end space-x-2 border-t p-3 bg-muted/5">
              <Button
                variant="outline"
                type="button"
                size="sm"
                disabled={isLoading}
                onClick={() => router.back()}
              >
                {readonly ? "Back" : "Cancel"}
              </Button>
              {!readonly && (
                <Button type="submit" size="sm" disabled={isLoading}>
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isEditing ? "Save Changes" : "Create Product"}
                </Button>
              )}
            </CardFooter>
          </Card>
        </Tabs>
      </form>

      {isEditing && product?.priceHistory && (
        <div className="mt-4">
          <PriceHistory history={product.priceHistory} />
        </div>
      )}

      <SkuSearchDialog
        open={isSkuSearchOpen}
        onOpenChange={setIsSkuSearchOpen}
        onApplyMetadata={handleApplySkuMetadata}
      />
    </div>
  );
}
