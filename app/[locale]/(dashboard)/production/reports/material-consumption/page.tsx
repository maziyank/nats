"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getMaterialConsumptionReport,
  type MaterialConsumptionEntry,
} from "../actions";
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

export default function MaterialConsumptionReportPage() {
  const t = useTranslations("Production");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();

  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery<MaterialConsumptionEntry[]>({
    queryKey: ["production-material-consumption", startDate, endDate],
    queryFn: () =>
      getMaterialConsumptionReport(new Date(startDate), new Date(endDate)),
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.quantity += item.totalQuantity;
      acc.cost += item.totalCost;
      return acc;
    },
    { quantity: 0, cost: 0 },
  );


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "productSku", header: t("reports_col_sku") },
    { key: "productName", header: t("reports_col_product") },
    { key: "categoryName", header: t("reports_col_category") },
    { key: "totalQuantity", header: t("reports_col_qty") },
    { key: "totalCost", header: t("reports_col_cost") },
    { key: "avgUnitCost", header: t("reports_col_avg_cost") },
    { key: "issueCount", header: t("reports_col_issues") },
    { key: "orderCount", header: t("reports_col_orders") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `material-consumption-${startDate}-${endDate}`,
      sheetName: "Material Consumption",
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_material_consumption_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_material_consumption_subheading")}
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
            <span className="text-sm text-muted-foreground">
              {t("reports_from")}
            </span>
            <CustomInput
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              containerClassName="w-[160px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t("reports_to")}
            </span>
            <CustomInput
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              containerClassName="w-[160px]"
            />
          </div>
          {report && (
            <span className="text-sm text-muted-foreground">
              {report.length} {t("reports_materials_count")}
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
                  <TableHead>{t("product")}</TableHead>
                  <TableHead>{t("reports_col_category")}</TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_qty_consumed")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("unit_cost")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("total_cost")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_issues")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_orders")}
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
                      {item.totalQuantity}
                      {item.unitSymbol ? ` ${item.unitSymbol}` : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.avgUnitCost)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.totalCost)}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.issueCount}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.orderCount}
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
                    {formatCurrency(totals!.cost)}
                  </TableCell>
                  <TableCell />
                  <TableCell />
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
