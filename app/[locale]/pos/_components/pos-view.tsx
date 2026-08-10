"use client";

import { cn } from "@/services/lib/utils";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  closePOSSession,
  getHeldOrders,
  holdOrder,
  getPOSProducts,
} from "../actions";
import { logout } from "@/app/[locale]/auth/actions";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  History,
  Search,
  RotateCcw,
  Keyboard,
  PowerOff,
  PowerOffIcon,
  User,
  MapPin,
  ComputerIcon,
  Computer,
  StoreIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { useRouter } from "next/navigation";
import { CartView } from "./cart-view";
import { ProductGrid } from "./product-grid";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ShoppingCart } from "lucide-react";

import { SuperJSONResult } from "superjson";
import { SuperJSON } from "@/services/lib/superjson";
import { HeldOrdersDialog } from "./held-orders-dialog";
import { POSHistoryDialog } from "./pos-history-dialog";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/components/providers/session-provider";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { Clock } from "./clock";
import { useTranslations } from "next-intl";
import { useDebounce } from "use-debounce";
import { POSCartItem, POSProduct } from "../types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ModeToggle } from "@/components/layout/others/mode-toggle";
import { ThemeCustomizer } from "@/components/layout/others/theme-customizer";

interface POSViewProps {
  initialProducts: SuperJSONResult;
  categories: SuperJSONResult;
  session: SuperJSONResult;
}

export function POSView({
  initialProducts: serializedProducts,
  categories: serializedCategories,
  session: serializedSession,
}: POSViewProps) {
  const t = useTranslations("POS");
  const initialData = SuperJSON.deserialize<{
    items: POSProduct[];
    total: number;
    hasMore: boolean;
  }>(serializedProducts);
  const categories = SuperJSON.deserialize<any[]>(serializedCategories);
  const session = SuperJSON.deserialize<any>(serializedSession);

  const [cart, setCart] = useState<POSCartItem[]>([]);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("pos_search_history");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const [showHistory, setShowHistory] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [originalQuery, setOriginalQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { toast } = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const sessionData = useSession();
  const isCashier = sessionData?.role === "Cashier";
  const searchInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        historyRef.current &&
        !historyRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowHistory(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const saveSearchToHistory = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearchHistory((prev) => {
      const filtered = prev.filter((h) => h !== trimmed);
      const newHistory = [trimmed, ...filtered].slice(0, 10);
      localStorage.setItem("pos_search_history", JSON.stringify(newHistory));
      return newHistory;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F4 or Ctrl+S to focus search
      if (e.key === "F4" || (e.ctrlKey && e.key === "s")) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      // Alt + 1-9 for categories
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (index === 0) {
          setSelectedCategory(null);
        } else if (categories[index - 1]) {
          setSelectedCategory(categories[index - 1].id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [categories]);

  const {
    data: productData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["pos-products", debouncedSearchQuery, selectedCategory],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await getPOSProducts(
        pageParam as number,
        20,
        debouncedSearchQuery,
        selectedCategory || undefined,
      );
      return SuperJSON.deserialize<{
        items: POSProduct[];
        total: number;
        hasMore: boolean;
      }>(res);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.hasMore ? allPages.length + 1 : undefined;
    },
    initialData:
      debouncedSearchQuery === "" && !selectedCategory
        ? {
            pages: [initialData],
            pageParams: [1],
          }
        : undefined,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  const products = useMemo(() => {
    return productData?.pages.flatMap((page) => page.items) ?? [];
  }, [productData]);

  const { data: heldOrders = [] } = useQuery({
    queryKey: ["heldOrders"],
    queryFn: async () => {
      const res = await getHeldOrders();
      return SuperJSON.deserialize<any[]>(res);
    },
  });

  const addToCart = (product: POSProduct) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [...prev, { ...product, quantity: 1, discount: 0 }];
    });
    searchInputRef.current?.focus();
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === productId) {
            const newQty = Math.max(0, item.quantity + delta);
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0),
    );
  };

  const updateDiscount = (productId: string, discount: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === productId) {
          return { ...item, discount };
        }
        return item;
      }),
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setGlobalDiscount(0);
  };

  const performSearch = async (query: string) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    saveSearchToHistory(trimmedQuery);

    // Try to find in current products first (already loaded in the grid)
    let productToAdd = products.find(
      (p) =>
        p.sku.toLowerCase() === trimmedQuery.toLowerCase() ||
        p.name.toLowerCase() === trimmedQuery.toLowerCase(),
    );

    // If not found in current view, fetch directly from server (important for fast barcode scans)
    if (!productToAdd) {
      try {
        const res = await getPOSProducts(1, 1, trimmedQuery);
        const data = SuperJSON.deserialize<{
          items: POSProduct[];
          total: number;
          hasMore: boolean;
        }>(res);

        if (data.items.length > 0) {
          // Check for exact match in the fetched result
          const match = data.items.find(
            (p) =>
              p.sku.toLowerCase() === trimmedQuery.toLowerCase() ||
              p.name.toLowerCase() === trimmedQuery.toLowerCase(),
          );
          // Use the match, or fallback to the first result if it's a specific search
          productToAdd = match || data.items[0];
        }
      } catch (error) {
        console.error("Failed to fetch product on Enter:", error);
      }
    }

    if (productToAdd) {
      addToCart(productToAdd);
      setSearchQuery("");
      setOriginalQuery("");
      toast({
        title: t("items_added"),
        description: productToAdd.name,
      });
    }
  };

  const handleSearchKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (searchHistory.length === 0) return;

      if (!showHistory) {
        setShowHistory(true);
        setOriginalQuery(searchQuery);
        setHistoryIndex(0);
        setSearchQuery(searchHistory[0]);
        return;
      }

      const nextIndex =
        historyIndex + 1 >= searchHistory.length ? -1 : historyIndex + 1;
      setHistoryIndex(nextIndex);
      setSearchQuery(
        nextIndex === -1 ? originalQuery : searchHistory[nextIndex],
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (searchHistory.length === 0) return;

      if (!showHistory) {
        setShowHistory(true);
        setOriginalQuery(searchQuery);
        setHistoryIndex(searchHistory.length - 1);
        setSearchQuery(searchHistory[searchHistory.length - 1]);
        return;
      }

      const nextIndex =
        historyIndex - 1 < -1 ? searchHistory.length - 1 : historyIndex - 1;
      setHistoryIndex(nextIndex);
      setSearchQuery(
        nextIndex === -1 ? originalQuery : searchHistory[nextIndex],
      );
    } else if (e.key === "Escape") {
      if (showHistory && historyIndex !== -1) {
        setSearchQuery(originalQuery);
      }
      setShowHistory(false);
      setHistoryIndex(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const trimmedQuery = searchQuery.trim();
      if (!trimmedQuery) return;

      setShowHistory(false);
      setHistoryIndex(-1);
      await performSearch(trimmedQuery);
    }
  };

  const handleCloseSession = async () => {
    const ok = await confirm({
      title: t("close_session"),
      description: t("confirm_close_session"),
      variant: "destructive",
    });

    if (ok) {
      try {
        await closePOSSession(session.id, 0); // TODO: Dialog to enter actual cash
        toast({ title: t("session_closed") });
        router.refresh();
      } catch (e) {
        toast({ variant: "destructive", title: t("error_closing") });
      }
    }
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = "/auth";
  };

  const handleViewHistoryItem = async (invoiceId: string) => {
    if (cart.length > 0) {
      try {
        await holdOrder(
          cart,
          cart.reduce((acc, item) => acc + item.price * item.quantity, 0) -
            globalDiscount, // Approx total
          t("auto_held_history"),
          undefined,
          t("walk_in_customer"),
          globalDiscount,
        );
        toast({ title: t("order_held") });
        setCart([]);
        setGlobalDiscount(0);
      } catch (e) {
        console.error(e);
        toast({ variant: "destructive", title: t("failed_hold") });
        return; // Don't navigate if hold fails
      }
    }
    router.push(`/pos/invoices/${invoiceId}`);
  };

  const handleResume = (
    items: POSCartItem[],
    customerName?: string,
    customerId?: string,
    resumedGlobalDiscount?: number,
  ) => {
    setCart((prev) => {
      const newCart = [...prev];
      items.forEach((newItem) => {
        const existingIndex = newCart.findIndex((c) => c.id === newItem.id);
        if (existingIndex >= 0) {
          const existing = newCart[existingIndex];
          newCart[existingIndex] = {
            ...existing,
            quantity: existing.quantity + newItem.quantity,
          };
        } else {
          newCart.push(newItem);
        }
      });
      return newCart;
    });
    if (resumedGlobalDiscount !== undefined) {
      setGlobalDiscount(resumedGlobalDiscount);
    }
    toast({ title: t("items_added") });
  };

  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-12 items-center justify-between border-b bg-secondary px-2 sm:px-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="flex flex-row gap-2 items-center">
            <StoreIcon className="h-5 w-5" />
            <h1 className="text-xl font-bold lg:block text-foreground">
              {t("pos")}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="hidden lg:block">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                  >
                    <Keyboard className="h-4 w-4" />
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="w-64 p-3">
                <div className="space-y-2">
                  <p className="font-semibold border-b pb-1 text-xs uppercase tracking-wider text-muted-foreground">
                    {t("shortcuts")}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <span className="font-medium">{t("focus_search")}</span>
                    <kbd className="justify-self-end rounded border bg-muted px-1.5 font-sans">
                      F4 / Ctrl+S
                    </kbd>

                    <span className="font-medium">{t("select_category")}</span>
                    <kbd className="justify-self-end rounded border bg-muted px-1.5 font-sans">
                      Alt + 1-9
                    </kbd>

                    <span className="font-medium">
                      {t("navigate_products")}
                    </span>
                    <kbd className="justify-self-end rounded border bg-muted px-1.5 font-sans">
                      ↑ ↓ ← →
                    </kbd>

                    <span className="font-medium">{t("add_to_cart")}</span>
                    <kbd className="justify-self-end rounded border bg-muted px-1.5 font-sans">
                      Enter
                    </kbd>

                    <span className="font-medium">{t("checkout")}</span>
                    <kbd className="justify-self-end rounded border bg-muted px-1.5 font-sans">
                      F9
                    </kbd>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <HeldOrdersDialog
            onResume={handleResume}
            trigger={
              <Button variant="outline" size="sm" className="relative mr-2">
                <RotateCcw className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">{t("held_orders")}</span>
                {heldOrders.length > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                  >
                    {heldOrders.length}
                  </Badge>
                )}
              </Button>
            }
          />

          <Button
            variant="outline"
            size="sm"
            className="mr-2"
            onClick={() => setHistoryOpen(true)}
          >
            <History className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">{t("history")}</span>
          </Button>

          {!isCashier && (
            <Button
              variant="outline"
              size="sm"
              asChild
              className="hidden sm:inline-flex"
            >
              <Link href="/pos/sessions">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                {t("dashboard")}
              </Link>
            </Button>
          )}

          <ThemeCustomizer />
          <ModeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src="/avatars/01.png" alt="Cashier" />
                  <AvatarFallback>
                    {sessionData?.userName?.slice(0, 2).toUpperCase() || "CA"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {t("cashier")}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {sessionData?.userName}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleCloseSession}>
                <PowerOffIcon className="mr-2 h-4 w-4" />
                <span>{t("close_session")}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>{t("logout")}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left: Product Grid */}
        <div className="flex-1 overflow-y-auto bg-muted/20 p-2 md:p-4 pb-20 lg:pb-4">
          <div className="relative w-full mb-4">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder={`${t("search_products")} (F4)`}
              className="h-11 pl-10 text-base shadow-sm transition-all focus-visible:ring-2"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setOriginalQuery(e.target.value);
                setHistoryIndex(-1);
              }}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => searchHistory.length > 0 && setShowHistory(true)}
            />
            {showHistory && searchHistory.length > 0 && (
              <div
                ref={historyRef}
                className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
              >
                {searchHistory.map((item, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                      index === historyIndex &&
                        "bg-accent text-accent-foreground",
                    )}
                    onClick={() => {
                      setShowHistory(false);
                      setHistoryIndex(-1);
                      performSearch(item);
                      searchInputRef.current?.focus();
                    }}
                  >
                    <History className="mr-2 h-4 w-4 text-muted-foreground" />
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
            <Button
              variant={selectedCategory === null ? "default" : "outline"}
              onClick={() => setSelectedCategory(null)}
              className="whitespace-nowrap"
            >
              {t("all_items")}
              <kbd className="ml-2 hidden rounded border px-1.5 font-sans text-[10px] lg:inline-block">
                Alt+1
              </kbd>
            </Button>
            {categories.map((cat, index) => (
              <Button
                key={cat.id}
                variant={selectedCategory === cat.id ? "default" : "outline"}
                onClick={() => setSelectedCategory(cat.id)}
                className="whitespace-nowrap"
              >
                {cat.name}
                {index < 8 && (
                  <kbd className="ml-2 hidden rounded border px-1.5 font-sans text-[10px] lg:inline-block">
                    Alt+{index + 2}
                  </kbd>
                )}
              </Button>
            ))}
          </div>
          <ProductGrid
            key={`${selectedCategory}-${debouncedSearchQuery}`}
            products={products}
            onAddToCart={addToCart}
            onFetchNextPage={fetchNextPage}
            hasNextPage={!!hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => refetch()}
          />
        </div>

        {/* Right: Cart Desktop */}
        <div className="hidden lg:block w-[400px] border-l bg-background shadow-xl">
          <CartView
            cart={cart}
            globalDiscount={globalDiscount}
            onUpdateGlobalDiscount={setGlobalDiscount}
            onUpdateQuantity={updateQuantity}
            onUpdateDiscount={updateDiscount}
            onRemove={removeFromCart}
            onClear={clearCart}
            session={session}
          />
        </div>

        {/* Mobile Cart Trigger */}
        <div className="lg:hidden absolute bottom-4 left-4 right-4 z-10">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                className="w-full h-14 rounded-full shadow-lg text-lg flex justify-between px-6"
                size="lg"
              >
                <span className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  {t("cart")}
                </span>
                <span className="bg-primary-foreground text-primary px-3 py-1 rounded-full text-sm font-bold">
                  {totalItems}
                </span>
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
              <SheetHeader className="sr-only">
                <SheetTitle>{t("cart")}</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-hidden">
                <CartView
                  cart={cart}
                  globalDiscount={globalDiscount}
                  onUpdateGlobalDiscount={setGlobalDiscount}
                  onUpdateQuantity={updateQuantity}
                  onUpdateDiscount={updateDiscount}
                  onRemove={removeFromCart}
                  onClear={clearCart}
                  session={session}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Footer */}
      <footer className="flex h-10 items-center justify-between border-t bg-secondary px-4 text-xs text-foreground">
        <div className="flex items-center gap-6">
          {sessionData?.userName && (
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium text-foreground">
                {sessionData.userName}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Computer className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-foreground">{session.sessionNumber}</span>
          </div>
          {session.warehouse && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium text-foreground">
                {session.warehouse.name}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Clock startTime={session.startTime} />
        </div>
      </footer>

      <POSHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        sessionId={session.id}
        onRowClick={handleViewHistoryItem}
      />
    </div>
  );
}
