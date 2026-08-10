"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProfitabilityReport } from "./actions";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
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

export default function ProfitabilityPage() {
  const t = useTranslations("Sales");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery({
    queryKey: ["sales-profitability", startDate, endDate],
    queryFn: async () => {
      return await getProfitabilityReport(
        new Date(startDate),
        new Date(endDate)
      );
    },
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.revenue += item.revenue;
      acc.cogs += item.cogs;
      acc.grossProfit += item.grossProfit;
      return acc;
    },
    { revenue: 0, cogs: 0, grossProfit: 0 }
  );

  const totalMargin =
    totals && totals.revenue > 0
      ? (totals.grossProfit / totals.revenue) * 100
      : 0;


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "productSku", header: t("reports_col_sku") },
    { key: "productName", header: t("reports_col_product") },
    { key: "categoryName", header: t("reports_col_category") },
    { key: "quantitySold", header: t("reports_col_qty_sold") },
    { key: "revenue", header: t("reports_col_revenue") },
    { key: "cogs", header: t("reports_col_cogs") },
    { key: "grossProfit", header: t("reports_col_gross_profit") },
    { key: "marginPct", header: t("reports_col_margin") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport({
      serverJobId: "sales.profitability",
      serverJobContext: () => ({ startDate, endDate }),
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold">
              {t("reports_profitability_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_profitability_subheading")}
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
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t("reports_from")}</span>
            <CustomInput
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t("reports_to")}</span>
            <CustomInput
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-auto"
            />
          </div>
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
                  <TableHead>{t("reports_col_product")}</TableHead>
                  <TableHead>{t("reports_col_category")}</TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_qty_sold")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_revenue")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_cogs")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_gross_profit")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_margin_pct")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((item) => {
                  const margin =
                    item.revenue > 0
                      ? (item.grossProfit / item.revenue) * 100
                      : 0;
                  return (
                    <TableRow key={item.productId}>
                      <TableCell className="font-medium">
                        {item.productSku}
                      </TableCell>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.categoryName}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.quantitySold}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.revenue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.cogs)}
                      </TableCell>
                      <TableCell
                        className={
                          "text-right font-medium " +
                          (item.grossProfit >= 0
                            ? "text-emerald-600"
                            : "text-red-600")
                        }
                      >
                        {formatCurrency(item.grossProfit)}
                      </TableCell>
                      <TableCell
                        className={
                          "text-right " +
                          (margin >= 0 ? "text-emerald-600" : "text-red-600")
                        }
                      >
                        {margin.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={4}>{tCommon("total")}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.revenue)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.cogs)}
                  </TableCell>
                  <TableCell
                    className={
                      "text-right " +
                      (totals!.grossProfit >= 0
                        ? "text-emerald-600"
                        : "text-red-600")
                    }
                  >
                    {formatCurrency(totals!.grossProfit)}
                  </TableCell>
                  <TableCell
                    className={
                      "text-right " +
                      (totalMargin >= 0 ? "text-emerald-600" : "text-red-600")
                    }
                  >
                    {totalMargin.toFixed(1)}%
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
