"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getProductsByIds } from "../actions";
import { ProductLabel } from "../_components/product-label";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import { SuperJSON } from "@/services/lib/superjson";
import { calculateDiscountedPrice } from "@/services/modules/inventory/utils/discount-calculator";
import { Decimal } from "decimal.js";
import { useState } from "react";
import { CustomPagination } from "@/components/ui/custom-pagination";

interface ProductWithDiscounts {
  id: string;
  name: string;
  sku: string;
  price: Decimal;
  discounts: any[];
  [key: string]: any;
}

const ITEMS_PER_PAGE = 18;

function PrintPageContent() {
  const searchParams = useSearchParams();
  const sessionKey = searchParams.get("s");
  const idsParam = searchParams.get("ids");
  const [currentPage, setCurrentPage] = useState(1);

  const { data: ids = [] } = useQuery({
    queryKey: ["selected-ids", sessionKey, idsParam],
    queryFn: () => {
      if (sessionKey) {
        const stored = localStorage.getItem(sessionKey);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) return parsed;
          } catch (e) {
            console.error("Failed to parse stored IDs", e);
          }
        }
      }
      return idsParam ? idsParam.split(",") : [];
    },
    // Only run on client
    enabled: typeof window !== "undefined",
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products-batch", ids],
    queryFn: async () => {
      if (ids.length === 0) return [];
      const result = await getProductsByIds(ids);
      if (!result) return [];
      // Ensure result is correct type for SuperJSON
      return SuperJSON.deserialize(result as any) as ProductWithDiscounts[];
    },
    enabled: ids.length > 0,
  });

  const totalEntries = products.length;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedProducts = products.slice(startIndex, endIndex);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (products.length === 0) {
    return <div className="p-8 text-center">No products selected.</div>;
  }

  return (
    <div className="min-h-screen bg-white text-black p-8">
      <div className="print:hidden flex justify-between items-center mb-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">
            Print Labels ({products.length})
          </h1>
          <p className="text-sm text-muted-foreground">
            Showing page {currentPage} ({paginatedProducts.length} labels)
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> Print Current Page
          </Button>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: auto;
            margin: 0;
          }
          body {
            background: white;
            -webkit-print-color-adjust: exact;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:block {
            display: block !important;
          }
        }
      `}</style>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4 print:block">
        {paginatedProducts.map((product) => {
          const price = new Decimal(product.price);
          let finalPrice = price;
          if (product.discounts && Array.isArray(product.discounts)) {
            finalPrice = calculateDiscountedPrice(price, product.discounts);
          }

          return (
            <div
              key={product.id}
              className="break-inside-avoid mb-4 print:inline-block print:m-1"
            >
              <ProductLabel product={product} discountedPrice={finalPrice} />
            </div>
          );
        })}
      </div>

      <div className="mt-8 print:hidden">
        <CustomPagination
          totalEntries={totalEntries}
          pageSize={ITEMS_PER_PAGE}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  );
}

export default function PrintLabelsPage() {
  return <PrintPageContent />;
}
