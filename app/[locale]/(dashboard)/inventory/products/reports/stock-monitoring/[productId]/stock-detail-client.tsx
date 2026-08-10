"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, Column } from "@/components/ui/data-table";
import { ArrowLeft, Search, TrendingUp, TrendingDown, Package } from "lucide-react";
import Link from "next/link";
import {
  getStockMonitoringDetail,
  getWarehousesForFilter,
  type StockMonitoringDetail,
  type StockMovementDetail,
} from "../actions";
import {
  PageListContent,
  PageListFilter,
  PageListHeader,
  PageListLayout,
  PageListTitle,
} from "@/components/layout/page/list-layout";
import { CustomInput } from "@/components/ui/custom-input";
import { CustomSelect } from "@/components/ui/custom-select";
import { SelectItem } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormatDate } from "@/hooks";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useReportExport } from "@/hooks/use-report-export";
import { ReportExportButton } from "@/components/ui/report-export-button";
import type { ExportColumn } from "@/services/lib/export";

function StatCard({
  label,
  value,
  icon,
  variant,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  variant: "default" | "in" | "out";
}) {
  const colorClass =
    variant === "in"
      ? "text-green-600"
      : variant === "out"
        ? "text-red-600"
        : "text-blue-600";

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-md bg-muted p-2 ${colorClass}`}>{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-lg font-bold ${colorClass}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function StockDetailClient({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const t = useTranslations("Inventory");
  const tCommon = useTranslations("Common");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const formatDate = useFormatDate();

  const [productId, setProductId] = useState<string>("");

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-for-filter"],
    queryFn: getWarehousesForFilter,
  });

  useEffect(() => {
    params.then((p) => setProductId(p.productId));
  }, [params]);

  const search = searchParams.get("search") || "";
  const warehouseId = searchParams.get("warehouseId") || "ALL";
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";

  const { data, isLoading } = useQuery({
    queryKey: [
      "stock-monitoring-detail",
      productId,
      warehouseId,
      dateFrom,
      dateTo,
    ],
    queryFn: async () => {
      const result = await getStockMonitoringDetail({
        productId,
        warehouseId: warehouseId !== "ALL" ? warehouseId : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      if (!result) return null;
      return SuperJSON.deserialize(
        result as SuperJSONResult,
      ) as StockMonitoringDetail;
    },
    enabled: !!productId,
  });

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value && value !== "ALL") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleReset = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("warehouseId");
    params.delete("dateFrom");
    params.delete("dateTo");
    router.push(`${pathname}?${params.toString()}`);
  };

  const product = data?.product;
  const summary = data?.summary;
  const movements = data?.movements || [];
  const inventory = data?.inventory || [];

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    {
      key: "date",
      header: tCommon("date"),
      format: (value) =>
        value instanceof Date
          ? value.toISOString().split("T")[0]
          : value
            ? String(value)
            : "",
    },
    { key: "type", header: t("type") },
    { key: "direction", header: tCommon("type") },
    { key: "reference", header: t("reference") },
    { key: "fromWarehouse", header: t("from") },
    { key: "toWarehouse", header: t("to") },
    { key: "quantity", header: tCommon("quantity") },
    { key: "notes", header: tCommon("description") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        movements as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () =>
        `stock-movements-${product?.sku || productId}${dateFrom ? `-${dateFrom}` : ""}${dateTo ? `-${dateTo}` : ""}`,
      sheetName: "Movements",
      estimatedRowCount: movements.length,
    });

  const columns: Column<StockMovementDetail>[] = [
    {
      header: tCommon("date"),
      cell: (m) => formatDate(m.date),
    },
    {
      header: t("type"),
      cell: (m) => (
        <Badge
          variant={
            m.direction === "IN"
              ? "default"
              : m.direction === "OUT"
                ? "destructive"
                : "secondary"
          }
        >
          {m.direction === "IN" ? t("stock_in") : m.direction === "OUT" ? t("stock_out") : m.type}
        </Badge>
      ),
    },
    {
      header: t("reference"),
      cell: (m) => m.reference || "-",
    },
    {
      header: t("from"),
      cell: (m) => m.fromWarehouse,
    },
    {
      header: t("to"),
      cell: (m) => m.toWarehouse,
    },
    {
      header: tCommon("quantity"),
      className: "text-right",
      headerClassName: "text-right",
      cell: (m) => (
        <span
          className={`font-mono ${
            m.direction === "IN"
              ? "text-green-600"
              : m.direction === "OUT"
                ? "text-red-600"
                : ""
          }`}
        >
          {m.direction === "IN"
            ? `+${m.quantity}`
            : m.direction === "OUT"
              ? `-${m.quantity}`
              : m.quantity}{" "}
          {product?.unitSymbol}
        </span>
      ),
    },
    {
      header: tCommon("description"),
      cell: (m) =>
        m.notes ? (
          <span className="text-sm text-muted-foreground">{m.notes}</span>
        ) : (
          "-"
        ),
    },
  ];

  return (
    <PageListLayout>
      <PageListHeader>
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/inventory/products/reports/stock-monitoring">
                <ArrowLeft className="mr-1 h-4 w-4" /> {tCommon("back")}
              </Link>
            </Button>
            <PageListTitle
              title={`${t("stock_movement_detail")} - ${product?.name || ""}`}
            />
          </div>
          <ReportExportButton
            onExportCsv={exportCsv}
            onExportExcel={exportExcel}
            isExporting={isExporting}
            exportingFormat={exportingFormat}
            disabled={isLoading || !movements.length}
          />
        </div>
      </PageListHeader>

      {/* Product info */}
      {product && (
        <div className="flex flex-wrap gap-4 rounded-md border p-4 text-sm">
          <div>
            <span className="text-muted-foreground">{t("sku")}: </span>
            <span className="font-medium">{product.sku}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t("categories")}: </span>
            <span className="font-medium">{product.category}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t("min_stock")}: </span>
            <span className="font-medium">
              {product.minStock} {product.unitSymbol}
            </span>
          </div>
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label={t("stock_opening")}
            value={`${summary.openingStock} ${product?.unitSymbol || ""}`}
            icon={<Package className="h-4 w-4" />}
            variant="default"
          />
          <StatCard
            label={t("stock_in")}
            value={`+${summary.stockIn} ${product?.unitSymbol || ""}`}
            icon={<TrendingUp className="h-4 w-4" />}
            variant="in"
          />
          <StatCard
            label={t("stock_out")}
            value={`-${summary.stockOut} ${product?.unitSymbol || ""}`}
            icon={<TrendingDown className="h-4 w-4" />}
            variant="out"
          />
          <StatCard
            label={t("stock_closing")}
            value={`${summary.closingStock} ${product?.unitSymbol || ""}`}
            icon={<Package className="h-4 w-4" />}
            variant="default"
          />
        </div>
      )}

      {/* Current inventory by warehouse */}
      {inventory.length > 0 && (
        <div className="rounded-md border p-4">
          <h3 className="mb-2 text-sm font-semibold">
            {t("current_stock_by_warehouse")}
          </h3>
          <div className="flex flex-wrap gap-3">
            {inventory.map((inv, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-sm"
              >
                <span className="text-muted-foreground">{inv.warehouse}:</span>
                <span className="font-mono font-medium">
                  {inv.quantity} {product?.unitSymbol || ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <PageListFilter>
        <CustomSelect
          value={warehouseId}
          onValueChange={(val) => updateParam("warehouseId", val)}
          containerClassName="w-[180px]"
          placeholder={t("warehouse")}
        >
          <SelectItem value="ALL">{t("all_warehouses")}</SelectItem>
          {warehouses.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name}
            </SelectItem>
          ))}
        </CustomSelect>
        <div className="flex items-center gap-1">
          <CustomInput
            type="date"
            placeholder={tCommon("start_date")}
            className="w-[150px]"
            defaultValue={dateFrom}
            onChange={(e) => updateParam("dateFrom", e.target.value)}
          />
          <span className="text-muted-foreground">-</span>
          <CustomInput
            type="date"
            placeholder={tCommon("end_date")}
            className="w-[150px]"
            defaultValue={dateTo}
            onChange={(e) => updateParam("dateTo", e.target.value)}
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleReset}>
          {tCommon("reset")}
        </Button>
      </PageListFilter>

      <PageListContent>
        <DataTable
          data={movements}
          columns={columns}
          isLoading={isLoading}
          emptyMessage={t("no_stock_movements_found")}
        />
      </PageListContent>
    </PageListLayout>
  );
}
