"use client";

import { useState, useRef, useEffect } from "react";
import { processPOSTransaction, holdOrder } from "../actions";
import { POSCartItem } from "../types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Minus,
  Plus,
  Trash2,
  ShoppingCart,
  PauseCircle,
  Tag,
  PrinterIcon,
  CreditCard,
} from "lucide-react";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { CheckoutDialog } from "./checkout-dialog";
import { HoldOrderDialog } from "./hold-order-dialog";
import { DiscountDialog } from "./discount-dialog";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/services/lib/utils";
import { ProductImage } from "./product-image";
import { ReportPreviewDialog } from "@/app/[locale]/(dashboard)/reporting/_components/report-preview-dialog";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CartViewProps {
  cart: POSCartItem[];
  globalDiscount: number;
  onUpdateGlobalDiscount: (discount: number) => void;
  onUpdateQuantity: (productId: string, delta: number) => void;
  onUpdateDiscount: (productId: string, discount: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  session: any;
}

export function CartView({
  cart,
  globalDiscount,
  onUpdateGlobalDiscount,
  onUpdateQuantity,
  onUpdateDiscount,
  onRemove,
  onClear,
  session,
}: CartViewProps) {
  const t = useTranslations("POS");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const formatCurrency = useFormatCurrency();
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastInvoiceId, setLastInvoiceId] = useState<string | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
 
      if (e.key === "F9") {
        e.preventDefault();
        if (cart.length > 0) setCheckoutOpen(true);
      } else if (e.key === "F8") {
        e.preventDefault();
        if (cart.length > 0) setHoldOpen(true);
      } else if (e.key === "F7") {
        e.preventDefault();
        if (cart.length > 0) {
          const ok = await confirm({
            title: t("clear_cart"),
            description: t("confirm_clear_cart"),
            variant: "destructive",
          });
          if (ok) {
            onClear();
          }
        }
      } else if (e.key === "F6") {
        e.preventDefault();
        openGlobalDiscount();
      }
    };
 
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart, onClear, confirm, t]);

  const subtotal = cart.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0,
  );
  const totalItemDiscounts = cart.reduce(
    (acc, item) => acc + (item.discount || 0),
    0,
  );
  const tax = 0; // TODO: Implement tax logic
  const total = Math.max(
    0,
    subtotal - totalItemDiscounts - globalDiscount + tax,
  );

  const handleCheckout = async (
    method: "CASH" | "CARD" | "QRIS",
    amount: number,
    customerId?: string,
  ) => {
    console.log("Processing checkout:", { method, amount });
    setIsProcessing(true);
    try {
      // Pass simple objects to server action
      const cartItems = cart.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
        price: item.price,
        discount: item.discount,
      }));

      const result = await processPOSTransaction(
        session.id,
        cartItems,
        method,
        amount,
        globalDiscount,
        customerId,
      );

      if (!result.success) {
        throw new Error(result.error || t("transaction_failed"));
      }

      toast({
        title: t("transaction_success"),
        description: result.data?.outbox.processed ? (
          t("paid_via", { amount: formatCurrency(amount), method })
        ) : (
          <span>
            {t("paid_via", { amount: formatCurrency(amount), method })}.{" "}
            {t("queued_processing")}.{" "}
            {result.data?.outbox.outboxIds?.[0] ? (
              <Link
                href={`/admin/integrations/outbox?search=${encodeURIComponent(
                  result.data.outbox.outboxIds[0],
                )}`}
                className="underline"
              >
                {t("view_outbox")}
              </Link>
            ) : null}
          </span>
        ),
      });

      // Store invoice ID for receipt
      if (result.data?.invoiceId) {
        setLastInvoiceId(result.data.invoiceId);
        setIsReceiptOpen(true);
      }

      onClear();
      router.refresh();
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: t("transaction_failed"),
        description:
          error instanceof Error ? error.message : t("unknown_error"),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleHold = async (note: string, customerName: string) => {
    setHolding(true);
    try {
      await holdOrder(
        cart,
        total,
        note,
        undefined,
        customerName,
        globalDiscount,
      );
      toast({ title: t("order_held_success") });
      onClear();
      setHoldOpen(false);
      queryClient.invalidateQueries({ queryKey: ["heldOrders"] });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: t("failed_hold_order") });
    } finally {
      setHolding(false);
    }
  };

  const handleApplyDiscount = (value: number, type: "PERCENTAGE" | "FIXED") => {
    if (selectedItemId) {
      // Item Discount
      const item = cart.find((i) => i.id === selectedItemId);
      if (!item) return;

      let discountAmount = 0;
      const itemTotal = item.price * item.quantity;

      if (type === "FIXED") {
        discountAmount = value;
      } else {
        discountAmount = itemTotal * (value / 100);
      }

      // Cap discount at item total
      discountAmount = Math.min(discountAmount, itemTotal);

      onUpdateDiscount(selectedItemId, discountAmount);
    } else {
      // Global Discount
      let discountAmount = 0;
      // Global discount applies to the subtotal AFTER item discounts?
      // Usually global discount is on the net total.
      const netSubtotal = subtotal - totalItemDiscounts;

      if (type === "FIXED") {
        discountAmount = value;
      } else {
        discountAmount = netSubtotal * (value / 100);
      }

      // Cap global discount
      discountAmount = Math.min(discountAmount, netSubtotal);

      onUpdateGlobalDiscount(discountAmount);
    }
  };

  const openItemDiscount = (itemId: string) => {
    setSelectedItemId(itemId);
    setDiscountOpen(true);
  };

  const openGlobalDiscount = () => {
    setSelectedItemId(null);
    setDiscountOpen(true);
  };

  const getActiveDiscountValue = () => {
    if (selectedItemId) {
      const item = cart.find((i) => i.id === selectedItemId);
      return item?.discount || 0;
    }
    return globalDiscount;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShoppingCart className="h-5 w-5" />
          {t("current_order")}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            const ok = await confirm({
              title: t("clear_cart"),
              description: t("confirm_clear_cart"),
              variant: "destructive",
            });
            if (ok) onClear();
          }}
          disabled={cart.length === 0}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t("clear")}
          <kbd className="ml-2 hidden rounded border px-1.5 font-sans text-[10px] lg:inline-block">
            F7
          </kbd>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {cart.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground opacity-50">
            <ShoppingCart className="mb-4 h-12 w-12" />
            <p>{t("cart_empty")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {cart.map((item) => (
              <div
                key={item.id}
                className="relative flex flex-col gap-2 rounded-lg border p-3 shadow-sm transition-all hover:bg-accent/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border">
                    <ProductImage
                      src={item.image}
                      alt={item.name}
                      category={item.categoryName}
                      productId={item.id}
                    />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium line-clamp-2">{item.name}</h4>
                    <p className="text-xs text-muted-foreground">{item.sku}</p>
                    <div className="mt-1 font-bold text-primary">
                      {formatCurrency(item.price)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-sm"
                        onClick={() => onUpdateQuantity(item.id, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-4 text-center text-sm font-medium">
                        {item.quantity}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-sm"
                        onClick={() => onUpdateQuantity(item.id, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="font-bold">
                      {formatCurrency(item.price * item.quantity)}
                    </div>
                  </div>
                </div>

                {/* Discount Section */}
                <div className="flex items-center justify-between border-t pt-2 mt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-6 px-2 text-xs",
                      item.discount > 0
                        ? "text-green-600 hover:text-green-700 hover:bg-green-50"
                        : "text-muted-foreground",
                    )}
                    onClick={() => openItemDiscount(item.id)}
                  >
                    <Tag className="mr-1 h-3 w-3" />
                    {item.discount > 0
                      ? `${t("discount")}: -${formatCurrency(item.discount)}`
                      : t("add_discount")}
                  </Button>
                  {item.discount > 0 && (
                    <div className="text-sm font-medium text-green-600">
                      {formatCurrency(
                        item.price * item.quantity - item.discount,
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t bg-muted/10 p-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("subtotal")}</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {totalItemDiscounts > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>{t("item_discounts")}</span>
              <span>-{formatCurrency(totalItemDiscounts)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm items-center">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 px-0 text-muted-foreground hover:text-primary",
                globalDiscount > 0 && "text-green-600",
              )}
              onClick={openGlobalDiscount}
              disabled={cart.length === 0}
            >
              {globalDiscount > 0
                ? t("global_discount")
                : t("add_global_discount")}
              <kbd className="ml-2 hidden rounded border px-1.5 font-sans text-[10px] lg:inline-block">
                F6
              </kbd>
            </Button>
            {globalDiscount > 0 && (
              <span className="text-green-600">
                -{formatCurrency(globalDiscount)}
              </span>
            )}
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("tax")}</span>
            <span>{formatCurrency(tax)}</span>
          </div>
          <Separator className="my-2" />
          <div className="flex justify-between text-lg font-bold">
            <span>{t("total")}</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="flex-1 h-12"
                  variant="secondary"
                  size="lg"
                  disabled={cart.length === 0}
                  onClick={() => setHoldOpen(true)}
                >
                  <PauseCircle className="mr-2 h-4 w-4" />
                  <span className="hidden xl:inline">{t("hold")}</span>
                  <kbd className="ml-2 hidden rounded border px-1.5 font-sans text-[10px] lg:inline-block">
                    F8
                  </kbd>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("hold_order_shortcut")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="flex-[2] h-12 text-lg font-bold"
                  size="lg"
                  disabled={cart.length === 0 || isProcessing}
                  onClick={() => setCheckoutOpen(true)}
                >
                  <CreditCard className="mr-2 h-5 w-5" />
                  {t("checkout")}
                  <kbd className="ml-2 hidden rounded border border-primary-foreground/20 bg-primary-foreground/10 px-1.5 font-sans text-xs lg:inline-block">
                    F9
                  </kbd>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("checkout_shortcut")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        totalAmount={total}
        onConfirm={(method, amount) => handleCheckout(method, amount)}
      />

      <HoldOrderDialog
        open={holdOpen}
        onOpenChange={setHoldOpen}
        onConfirm={handleHold}
        isPending={holding}
      />

      <DiscountDialog
        open={discountOpen}
        onOpenChange={setDiscountOpen}
        onApply={handleApplyDiscount}
        title={selectedItemId ? t("item_discount") : t("global_discount")}
        productId={selectedItemId}
        initialValue={getActiveDiscountValue()}
        initialType="FIXED" // Default to fixed, or we could track type if needed
        maxAmount={
          selectedItemId
            ? (cart.find((c) => c.id === selectedItemId)?.price || 0) *
              (cart.find((c) => c.id === selectedItemId)?.quantity || 0)
            : subtotal - totalItemDiscounts
        }
        availableDiscounts={
          selectedItemId
            ? cart.find((c) => c.id === selectedItemId)?.availableDiscounts
            : []
        }
      />
      <ReportPreviewDialog
        isOpen={isReceiptOpen}
        onOpenChange={setIsReceiptOpen}
        code="POS_RECEIPT"
        input={{ invoiceId: lastInvoiceId }}
        title={t("pos_receipt")}
      />
    </div>
  );
}
