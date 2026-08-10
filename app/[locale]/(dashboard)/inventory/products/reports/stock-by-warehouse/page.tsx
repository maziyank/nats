"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getStockByWarehouseReport,
  getReportFilterOptions,
  type StockByWarehouseEntry,
} from "../actions";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
import { CustomSelect } from "@/components/ui/custom-select";
import { SelectItem } from "@/components/ui/select";
import { Loader2, PrinterIcon, Search } from "lucide-react";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslations } from "next-intl";
import { useReportExport } from "@/hooks/use-report-export";
import { ReportExportButton } from "@/components/ui/report-export-button";
import type { ExportColumn } from "@/services/lib/export";

export default function StockByWarehouseReportPage() {
  const t = useTranslations("Inventory");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();

  const [categoryId, setCategoryId] = useState("ALL");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const { data: filters } = useQuery({
    queryKey: ["product-report-filters"],
    queryFn: getReportFilterOptions,
  });

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery<StockByWarehouseEntry[]>({
    queryKey: ["stock-by-warehouse-report", categoryId, appliedSearch],
    queryFn: () =>
      getStockByWarehouseReport({
        categoryId: categoryId === "ALL" ? undefined : categoryId,
        search: appliedSearch || undefined,
      }),
  });

  // Collect unique warehouse names across all products for dynamic columns
  const warehouseNames = Array.from(
    new Set(
      report?.flatMap((p) => p.warehouses.map((w) => w.warehouseName)) ?? [],
    ),
  ).sort();

  const totals = report?.reduce(
    (acc, item) => {
      acc.totalQuantity += item.totalQuantity;
      acc.totalAvailable += item.totalAvailable;
      acc.totalValue += item.totalValue;
      return acc;
    },
    { totalQuantity: 0, totalAvailable: 0, totalValue: 0 },
  );


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "productSku", header: t("reports_col_sku") },
    { key: "productName", header: t("reports_col_product") },
    { key: "categoryName", header: t("reports_col_category") },
    { key: "unitSymbol", header: t("reports_col_unit") },
    ...warehouseNames.map((name) => ({
      key: name,
      header: name,
    })),
    { key: "totalQuantity", header: t("reports_col_total_qty") },
    { key: "totalValue", header: t("reports_col_stock_value") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report ?? []).map((item) => {
          const row: Record<string, unknown> = {
            productSku: item.productSku,
            productName: item.productName,
            categoryName: item.categoryName,
            unitSymbol: item.unitSymbol,
            totalQuantity: item.totalQuantity,
            totalValue: item.totalValue,
          };
          for (const name of warehouseNames) {
            const wh = item.warehouses.find((w) => w.warehouseName === name);
            row[name] = wh?.availableQty ?? 0;
          }
          return row;
        }),
      columns: exportColumns,
      filename: () => `stock-by-warehouse`,
      sheetName: "Stock by Warehouse",
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_stock_by_warehouse_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_stock_by_warehouse_subheading")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ReportExportButton
              onExportCsv={exportCsv}
              onExportExcel={exportExcel}
              isExporting={isExporting}
              exportingFormat={exportingFormat}
              disabled={loading || !report?.length}
            />
            <Button variant="outline" onClick={() => window.print()}>
              <PrinterIcon className="mr-2 h-4 w-4" />
              {tCommon("print")}
            </Button>
            <Button onClick={() => refetch()} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                t("reports_run_report")
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-muted/20 p-4 rounded-lg border">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <CustomInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setAppliedSearch(search);
              }}
              placeholder={t("search_products")}
              className="pl-8 w-[220px]"
            />
          </div>
          <CustomSelect
            value={categoryId}
            onValueChange={setCategoryId}
            containerClassName="w-[200px]"
            placeholder={t("categories")}
          >
            <SelectItem value="ALL">{t("all_categories")}</SelectItem>
            {filters?.categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </CustomSelect>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : report && report.length > 0 ? (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports_col_sku")}</TableHead>
                  <TableHead>{t("reports_col_product")}</TableHead>
                  <TableHead>{t("reports_col_category")}</TableHead>
                  {warehouseNames.map((name) => (
                    <TableHead key={name} className="text-center">
                      {name}
                    </TableHead>
                  ))}
                  <TableHead className="text-center">
                    {t("reports_col_total_qty")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_stock_value")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((item) => {
                  const qtyByWarehouse = new Map(
                    item.warehouses.map((w) => [w.warehouseName, w.availableQty]),
                  );
                  return (
                    <TableRow key={item.productId}>
                      <TableCell className="font-medium">
                        {item.productSku}
                      </TableCell>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.categoryName ?? "—"}
                      </TableCell>
                      {warehouseNames.map((name) => (
                        <TableCell key={name} className="text-center">
                          {qtyByWarehouse.get(name) ?? 0}
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-medium">
                        {item.totalAvailable}
                        {item.unitSymbol ? ` ${item.unitSymbol}` : ""}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.totalValue)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={3 + warehouseNames.length}>
                    {tCommon("total")}
                  </TableCell>
                  <TableCell className="text-center">
                    {totals!.totalAvailable}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.totalValue)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            {t("reports_no_data")}
          </div>
        )}
      </div>
    </div>
  );
}
