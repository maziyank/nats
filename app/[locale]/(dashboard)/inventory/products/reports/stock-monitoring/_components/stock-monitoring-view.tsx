"use client";

import { Button } from "@/components/ui/button";
import { DataTable, Column } from "@/components/ui/data-table";
import {
  ArrowLeft,
  Search,
  Eye,
  TrendingUp,
  TrendingDown,
  Package,
} from "lucide-react";
import Link from "next/link";
import {
  getStockMonitoring,
  getStockMonitoringForExport,
  getWarehousesForFilter,
  type StockMonitoringItem,
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
import {
  useQuery,
  keepPreviousData,
} from "@tanstack/react-query";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
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

export function StockMonitoringView() {
  const t = useTranslations("Inventory");
  const tCommon = useTranslations("Common");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const page = Number(searchParams.get("page")) || 1;
  const search = searchParams.get("search") || "";
  const warehouseId = searchParams.get("warehouseId") || "ALL";
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";
  const pageSize = 10;

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-for-filter"],
    queryFn: getWarehousesForFilter,
  });

  const { data, isLoading } = useQuery({
    queryKey: [
      "stock-monitoring",
      { page, search, warehouseId, dateFrom, dateTo },
    ],
    queryFn: async () => {
      const result = await getStockMonitoring({
        page,
        limit: pageSize,
        search: search || undefined,
        warehouseId: warehouseId !== "ALL" ? warehouseId : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      return {
        items: SuperJSON.deserialize(
          result.items as SuperJSONResult,
        ) as StockMonitoringItem[],
        total: result.total,
        totalPages: result.totalPages,
      };
    },
    placeholderData: keepPreviousData,
  });

  const items = data?.items || [];

  // Aggregate totals for summary cards
  const totalOpening = items.reduce((sum, i) => sum + i.openingStock, 0);
  const totalIn = items.reduce((sum, i) => sum + i.stockIn, 0);
  const totalOut = items.reduce((sum, i) => sum + i.stockOut, 0);
  const totalClosing = items.reduce((sum, i) => sum + i.closingStock, 0);

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value && value !== "ALL") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleSearch = (term: string) => {
    const params = new URLSearchParams(searchParams);
    if (term) {
      params.set("search", term);
    } else {
      params.delete("search");
    }
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleReset = () => {
    router.push(`${pathname}`);
  };

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "sku", header: t("sku") },
    { key: "name", header: tCommon("name") },
    { key: "unitSymbol", header: tCommon("unit") },
    { key: "openingStock", header: t("stock_opening") },
    { key: "stockIn", header: t("stock_in") },
    { key: "stockOut", header: t("stock_out") },
    { key: "closingStock", header: t("stock_closing") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () => {
        const result = await getStockMonitoringForExport({
          search: search || undefined,
          warehouseId: warehouseId !== "ALL" ? warehouseId : undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        });
        return result.items as unknown as Array<Record<string, unknown>>;
      },
      columns: exportColumns,
      filename: () =>
        `stock-monitoring${dateFrom ? `-${dateFrom}` : ""}${dateTo ? `-${dateTo}` : ""}`,
      sheetName: "Stock Monitoring",
      estimatedRowCount: data?.total,
    });

  const columns: Column<StockMonitoringItem>[] = [
    {
      header: `${t("sku")}/${tCommon("name")}`,
      cell: (item) => (
        <div>
          <div className="text-xs text-muted-foreground">{item.sku}</div>
          <div className="font-medium">{item.name}</div>
        </div>
      ),
    },
    {
      header: t("stock_opening"),
      className: "text-right",
      headerClassName: "text-right",
      cell: (item) => (
        <span className="font-mono">
          {item.openingStock} {item.unitSymbol}
        </span>
      ),
    },
    {
      header: t("stock_in"),
      className: "text-right",
      headerClassName: "text-right",
      cell: (item) => (
        <span className="font-mono text-green-600">
          {item.stockIn > 0 ? `+${item.stockIn}` : item.stockIn}{" "}
          {item.unitSymbol}
        </span>
      ),
    },
    {
      header: t("stock_out"),
      className: "text-right",
      headerClassName: "text-right",
      cell: (item) => (
        <span className="font-mono text-red-600">
          {item.stockOut > 0 ? `-${item.stockOut}` : item.stockOut}{" "}
          {item.unitSymbol}
        </span>
      ),
    },
    {
      header: t("stock_closing"),
      className: "text-right",
      headerClassName: "text-right",
      cell: (item) => (
        <span className="font-mono font-semibold">
          {item.closingStock} {item.unitSymbol}
        </span>
      ),
    },
    {
      header: tCommon("actions"),
      className: "w-[100px]",
      cell: (item) => {
        const params = new URLSearchParams();
        if (warehouseId !== "ALL") params.set("warehouseId", warehouseId);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        const queryStr = params.toString();
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            asChild
          >
            <Link
              href={`/inventory/products/reports/stock-monitoring/${item.id}${queryStr ? `?${queryStr}` : ""}`}
            >
              <Eye className="mr-1 h-4 w-4" /> {t("view_detail")}
            </Link>
          </Button>
        );
      },
    },
  ];

  return (
    <PageListLayout>
      <PageListHeader>
        <div className="mb-2 flex w-full items-start justify-between gap-4">
          <div>
            <PageListTitle title={t("stock_monitoring")} />
            <p className="text-sm text-muted-foreground">
              {t("reports_stock_monitoring_subheading")}
            </p>
          </div>
          <ReportExportButton
            onExportCsv={exportCsv}
            onExportExcel={exportExcel}
            isExporting={isExporting}
            exportingFormat={exportingFormat}
            disabled={isLoading || !data?.total}
          />
        </div>
      </PageListHeader>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label={t("stock_opening")}
          value={String(totalOpening)}
          icon={<Package className="h-4 w-4" />}
          variant="default"
        />
        <StatCard
          label={t("stock_in")}
          value={`+${totalIn}`}
          icon={<TrendingUp className="h-4 w-4" />}
          variant="in"
        />
        <StatCard
          label={t("stock_out")}
          value={`-${totalOut}`}
          icon={<TrendingDown className="h-4 w-4" />}
          variant="out"
        />
        <StatCard
          label={t("stock_closing")}
          value={String(totalClosing)}
          icon={<Package className="h-4 w-4" />}
          variant="default"
        />
      </div>

      <PageListFilter>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <CustomInput
            placeholder={t("search_product_code")}
            className="pl-8"
            defaultValue={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
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
          data={items}
          columns={columns}
          isLoading={isLoading}
          emptyMessage={t("no_stock_data")}
          pagination={{
            totalEntries: data?.total || 0,
            pageSize,
            currentPage: page,
            onPageChange: handlePageChange,
          }}
        />
      </PageListContent>
    </PageListLayout>
  );
}
