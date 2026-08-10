"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getStockValuationReport,
  getReportFilterOptions,
  type StockValuationEntry,
} from "../actions";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { SelectItem } from "@/components/ui/select";
import { Loader2, PrinterIcon } from "lucide-react";
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

export default function StockValuationReportPage() {
  const t = useTranslations("Inventory");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();

  const [warehouseId, setWarehouseId] = useState("ALL");
  const [categoryId, setCategoryId] = useState("ALL");

  const { data: filters } = useQuery({
    queryKey: ["product-report-filters"],
    queryFn: getReportFilterOptions,
  });

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery<StockValuationEntry[]>({
    queryKey: ["stock-valuation-report", warehouseId, categoryId],
    queryFn: () =>
      getStockValuationReport({
        warehouseId: warehouseId === "ALL" ? undefined : warehouseId,
        categoryId: categoryId === "ALL" ? undefined : categoryId,
      }),
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.quantity += item.quantity;
      acc.totalValue += item.totalValue;
      acc.potentialRevenue += item.potentialRevenue;
      return acc;
    },
    { quantity: 0, totalValue: 0, potentialRevenue: 0 },
  );


  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport({
      serverJobId: "inventory.stock_valuation",
      serverJobContext: () => ({ warehouseId, categoryId }),
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_stock_valuation_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_stock_valuation_subheading")}
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
          <CustomSelect
            value={warehouseId}
            onValueChange={setWarehouseId}
            containerClassName="w-[200px]"
            placeholder={t("warehouse")}
          >
            <SelectItem value="ALL">{t("all_warehouses")}</SelectItem>
            {filters?.warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </CustomSelect>
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
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports_col_sku")}</TableHead>
                  <TableHead>{t("reports_col_product")}</TableHead>
                  <TableHead>{t("reports_col_category")}</TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_qty")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_unit_cost")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_stock_value")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_selling_price")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_potential_revenue")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((item) => (
                  <TableRow key={item.productId}>
                    <TableCell className="font-medium">
                      {item.productSku}
                    </TableCell>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.categoryName ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.quantity}
                      {item.unitSymbol ? ` ${item.unitSymbol}` : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.unitCost)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.totalValue)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.sellingPrice)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.potentialRevenue)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={3}>{tCommon("total")}</TableCell>
                  <TableCell className="text-center">
                    {totals!.quantity}
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-right">
                    {formatCurrency(totals!.totalValue)}
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-right">
                    {formatCurrency(totals!.potentialRevenue)}
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
