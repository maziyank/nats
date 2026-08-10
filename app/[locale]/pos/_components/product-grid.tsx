"use client";

import { useEffect, useState, useCallback } from "react";
import { useInView } from "react-intersection-observer";
import { POSProduct } from "../types";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, AlertCircle, RefreshCcw } from "lucide-react";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { ProductImage } from "./product-image";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/services/lib/utils";
import { useTranslations } from "next-intl";

interface ProductGridProps {
  products: POSProduct[];
  onAddToCart: (product: POSProduct) => void;
  onFetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function ProductGrid({
  products,
  onAddToCart,
  onFetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  isError,
  onRetry,
}: ProductGridProps) {
  const t = useTranslations("POS");
  const formatCurrency = useFormatCurrency();
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: "100px",
  });

  const columns = 5; // We should ideally calculate this based on screen size, but 5 is the lg default here.

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (products.length === 0) return;

      let newIndex = selectedIndex;

      switch (e.key) {
        case "ArrowRight":
          newIndex = Math.min(products.length - 1, selectedIndex + 1);
          break;
        case "ArrowLeft":
          newIndex = Math.max(0, selectedIndex - 1);
          break;
        case "ArrowDown":
          if (selectedIndex === -1) {
            newIndex = 0;
          } else {
            newIndex = Math.min(products.length - 1, selectedIndex + columns);
          }
          break;
        case "ArrowUp":
          newIndex = Math.max(0, selectedIndex - columns);
          break;
        case "Enter":
          if (selectedIndex >= 0 && products[selectedIndex]) {
            e.preventDefault();
            onAddToCart(products[selectedIndex]);
          }
          return;
        default:
          return;
      }

      if (newIndex !== selectedIndex) {
        e.preventDefault();
        setSelectedIndex(newIndex);
        // Scroll the selected item into view if needed
        const element = document.getElementById(`product-${newIndex}`);
        element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    },
    [products, selectedIndex, onAddToCart],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      onFetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, onFetchNextPage]);

  if (isLoading && products.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError && products.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-4 py-12">
        <div className="rounded-full bg-destructive/10 p-3">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div className="text-center">
          <p className="font-medium">{t("failed_load_products")}</p>
          <p className="text-sm text-muted-foreground">
            {t("please_try_again")}
          </p>
        </div>
        <Button onClick={onRetry} variant="outline" size="sm">
          <RefreshCcw className="mr-2 h-4 w-4" />
          {t("retry")}
        </Button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-12 text-muted-foreground">
        <p>{t("no_products_found")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {products.map((product, index) => (
          <Card
            key={product.id + "" + index}
            id={`product-${index}`}
            className={cn(
              "p-0 cursor-pointer overflow-hidden transition-all hover:shadow-md",
              selectedIndex === index &&
                "ring-2 ring-primary ring-offset-2 shadow-lg scale-[1.02]",
            )}
            onClick={() => {
              setSelectedIndex(index);
              onAddToCart(product);
            }}
          >
            <div className="flex relative aspect-square w-full bg-muted">
              <ProductImage
                src={product.image}
                alt={product.name}
                category={product.categoryName}
                productId={product.id}
              />
              <div className="absolute right-2 top-2">
                <Badge
                  variant={product.stock > 0 ? "secondary" : "destructive"}
                >
                  {product.stock} {t("in_stock")}
                </Badge>
              </div>
            </div>
            <CardContent className="p-3 grow">
              <h3 className="line-clamp-2 text-sm font-medium leading-tight">
                {product.name}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {product.sku}
              </p>
            </CardContent>
            <CardFooter className="flex-1 flex items-center justify-between p-3 pt-0">
              <span className="font-bold text-primary">
                {formatCurrency(product.price)}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-full"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        ))}

        {isFetchingNextPage &&
          Array.from({ length: 5 }).map((_, i) => (
            <ProductCardSkeleton key={`skeleton-${i}`} />
          ))}
      </div>

      {hasNextPage && (
        <div
          ref={ref}
          className="h-10 flex items-center justify-center"
          role="status"
          aria-live="polite"
        >
          {isFetchingNextPage && (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm text-muted-foreground">
                {t("loading")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProductCardSkeleton() {
  return (
    <Card className="p-0 overflow-hidden">
      <Skeleton className="aspect-square w-full" />
      <CardContent className="p-3">
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-3 w-1/2" />
      </CardContent>
      <CardFooter className="p-3 pt-0 flex justify-between">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </CardFooter>
    </Card>
  );
}
