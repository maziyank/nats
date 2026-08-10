"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getProductionOutputReport,
  type ProductionOutputEntry,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CustomInput } from "@/components/ui/custom-input";
import { CustomSelect } from "@/components/ui/custom-select";
import { SelectItem } from "@/components/ui/select";
import { Loader2, PrinterIcon } from "lucide-react";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { useFormatDate } from "@/hooks";
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

export default function OutputYieldReportPage() {
  const t = useTranslations("Production");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();
  const formatDate = useFormatDate();

  const [status, setStatus] = useState("ALL");
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
  } = useQuery<ProductionOutputEntry[]>({
    queryKey: ["production-output-yield", startDate, endDate, status],
    queryFn: () =>
      getProductionOutputReport(new Date(startDate), new Date(endDate), {
        status,
      }),
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.planned += item.plannedQuantity;
      acc.produced += item.producedQuantity;
      acc.value += item.finishedGoodsValue;
      return acc;
    },
    { planned: 0, produced: 0, value: 0 },
  );

  const avgYield =
    totals && totals.planned > 0
      ? (totals.produced / totals.planned) * 100
      : 0;


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "orderNumber", header: t("reports_col_order") },
    { key: "productSku", header: t("reports_col_sku") },
    { key: "productName", header: t("reports_col_product") },
    { key: "status", header: tCommon("status") },
    { key: "plannedQuantity", header: t("reports_col_planned") },
    { key: "producedQuantity", header: t("reports_col_produced") },
    { key: "yieldPct", header: t("reports_col_yield") },
    { key: "varianceQty", header: t("reports_col_variance") },
    { key: "finishedGoodsValue", header: t("reports_col_fg_value") },
    { key: "unitCost", header: t("reports_col_unit_cost") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `output-yield-${startDate}-${endDate}`,
      sheetName: "Output Yield",
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_output_yield_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_output_yield_subheading")}
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
          <CustomSelect
            value={status}
            onValueChange={setStatus}
            containerClassName="w-[180px]"
            placeholder={t("status")}
          >
            <SelectItem value="ALL">{tCommon("all_statuses")}</SelectItem>
            <SelectItem value="IN_PROGRESS">IN_PROGRESS</SelectItem>
            <SelectItem value="COMPLETED">COMPLETED</SelectItem>
            <SelectItem value="RELEASED">RELEASED</SelectItem>
          </CustomSelect>
          {report && totals && (
            <span className="text-sm text-muted-foreground">
              {t("reports_avg_yield")}: {avgYield.toFixed(1)}%
            </span>
          )}
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
                  <TableHead>{t("order_number")}</TableHead>
                  <TableHead>{t("product")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="text-center">
                    {t("planned_qty")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("produced_qty")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_yield")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_variance")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_unit_cost")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_fg_value")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_days")}
                  </TableHead>
                  <TableHead>{t("reports_col_completed")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((item) => (
                  <TableRow key={item.orderId}>
                    <TableCell className="font-medium">
                      {item.orderNumber}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{item.productName}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.productSku}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.status}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {item.plannedQuantity}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.producedQuantity}
                    </TableCell>
                    <TableCell
                      className={`text-center font-medium ${
                        item.yieldPct >= 100
                          ? "text-emerald-600"
                          : item.yieldPct < 90
                            ? "text-destructive"
                            : ""
                      }`}
                    >
                      {item.yieldPct.toFixed(1)}%
                    </TableCell>
                    <TableCell
                      className={`text-center ${
                        item.varianceQty < 0
                          ? "text-destructive"
                          : item.varianceQty > 0
                            ? "text-emerald-600"
                            : ""
                      }`}
                    >
                      {item.varianceQty > 0 ? "+" : ""}
                      {item.varianceQty}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.unitCost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.finishedGoodsValue)}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.daysToComplete ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {item.completedDate
                        ? formatDate(new Date(item.completedDate))
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={3}>{tCommon("total")}</TableCell>
                  <TableCell className="text-center">
                    {totals!.planned}
                  </TableCell>
                  <TableCell className="text-center">
                    {totals!.produced}
                  </TableCell>
                  <TableCell className="text-center">
                    {avgYield.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-center">
                    {totals!.produced - totals!.planned}
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-right">
                    {formatCurrency(totals!.value)}
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
