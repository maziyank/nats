"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getProductMarginReport,
  getReportFilterOptions,
  type ProductMarginEntry,
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

export default function ProductMarginReportPage() {
  const t = useTranslations("Inventory");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();

  const [categoryId, setCategoryId] = useState("ALL");

  const { data: filters } = useQuery({
    queryKey: ["product-report-filters"],
    queryFn: getReportFilterOptions,
  });

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery<ProductMarginEntry[]>({
    queryKey: ["product-margin-report", categoryId],
    queryFn: () =>
      getProductMarginReport({
        categoryId: categoryId === "ALL" ? undefined : categoryId,
        activeOnly: true,
      }),
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.stockValue += item.stockValue;
      acc.stockQty += item.stockQty;
      return acc;
    },
    { stockValue: 0, stockQty: 0 },
  );

  const avgMargin =
    report && report.length > 0
      ? report.reduce((s, i) => s + i.marginPct, 0) / report.length
      : 0;


  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport({
      serverJobId: "inventory.product_margin",
      serverJobContext: () => ({ categoryId }),
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_product_margin_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_product_margin_subheading")}
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
          {report && (
            <span className="text-sm text-muted-foreground">
              {t("reports_avg_margin")}:{" "}
              <span
                className={
                  avgMargin >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"
                }
              >
                {avgMargin.toFixed(1)}%
              </span>
            </span>
          )}
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
                  <TableHead className="text-right">
                    {t("reports_col_cost")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_avg_cost")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_selling_price")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_margin_amount")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_margin_pct")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_stock_qty")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_stock_value")}
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
                    <TableCell className="text-right">
                      {formatCurrency(item.cost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.averageCost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.sellingPrice)}
                    </TableCell>
                    <TableCell
                      className={
                        "text-right " +
                        (item.marginAmount >= 0
                          ? "text-emerald-600"
                          : "text-red-600")
                      }
                    >
                      {formatCurrency(item.marginAmount)}
                    </TableCell>
                    <TableCell
                      className={
                        "text-right font-medium " +
                        (item.marginPct >= 0
                          ? "text-emerald-600"
                          : "text-red-600")
                      }
                    >
                      {item.marginPct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-center">
                      {item.stockQty}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.stockValue)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={8}>{tCommon("total")}</TableCell>
                  <TableCell className="text-center">
                    {totals!.stockQty}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.stockValue)}
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
