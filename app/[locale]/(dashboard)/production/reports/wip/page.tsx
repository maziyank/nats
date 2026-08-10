"use client";
export const dynamic = "force-dynamic";

import { useQuery } from "@tanstack/react-query";
import { getWipReport, type WipEntry } from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export default function WipReportPage() {
  const t = useTranslations("Production");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();
  const formatDate = useFormatDate();

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery<WipEntry[]>({
    queryKey: ["production-wip-report"],
    queryFn: () => getWipReport(),
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.materialCost += item.materialCost;
      acc.finishedGoodsValue += item.finishedGoodsValue;
      acc.wipBalance += item.wipBalance;
      acc.remaining += item.remainingQuantity;
      return acc;
    },
    {
      materialCost: 0,
      finishedGoodsValue: 0,
      wipBalance: 0,
      remaining: 0,
    },
  );


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "orderNumber", header: t("reports_col_order") },
    { key: "productSku", header: t("reports_col_sku") },
    { key: "productName", header: t("reports_col_product") },
    { key: "status", header: tCommon("status") },
    { key: "plannedQuantity", header: t("reports_col_planned") },
    { key: "producedQuantity", header: t("reports_col_produced") },
    { key: "remainingQuantity", header: t("reports_col_remaining") },
    { key: "materialCost", header: t("reports_col_material_cost") },
    { key: "finishedGoodsValue", header: t("reports_col_fg_value") },
    { key: "wipBalance", header: t("reports_col_wip") },
    { key: "daysOpen", header: t("reports_col_days_open") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `production-wip`,
      sheetName: "WIP",
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">{t("reports_wip_heading")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_wip_subheading")}
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

        {report && totals && (
          <div className="flex flex-wrap items-center gap-4 bg-muted/20 p-4 rounded-lg border">
            <span className="text-sm">
              <span className="text-muted-foreground">
                {t("reports_open_orders")}:{" "}
              </span>
              <span className="font-medium">{report.length}</span>
            </span>
            <span className="text-sm">
              <span className="text-muted-foreground">
                {t("reports_total_wip")}:{" "}
              </span>
              <span className="font-medium text-amber-600">
                {formatCurrency(totals.wipBalance)}
              </span>
            </span>
            <span className="text-sm">
              <span className="text-muted-foreground">
                {t("reports_col_remaining")}:{" "}
              </span>
              <span className="font-medium">{totals.remaining}</span>
            </span>
          </div>
        )}

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
                    {t("reports_col_remaining")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_material_cost")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_fg_value")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_wip_balance")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_days_open")}
                  </TableHead>
                  <TableHead>{t("start_date")}</TableHead>
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
                      <Badge
                        variant={
                          item.status === "IN_PROGRESS"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {item.plannedQuantity}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.producedQuantity}
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {item.remainingQuantity}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.materialCost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.finishedGoodsValue)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-amber-600">
                      {formatCurrency(item.wipBalance)}
                    </TableCell>
                    <TableCell
                      className={`text-center ${
                        item.daysOpen > 30
                          ? "text-destructive font-medium"
                          : item.daysOpen > 14
                            ? "text-amber-600"
                            : ""
                      }`}
                    >
                      {item.daysOpen}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {item.startDate
                        ? formatDate(new Date(item.startDate))
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={5}>{tCommon("total")}</TableCell>
                  <TableCell className="text-center">
                    {totals!.remaining}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.materialCost)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.finishedGoodsValue)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.wipBalance)}
                  </TableCell>
                  <TableCell />
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            {t("reports_no_wip")}
          </div>
        )}
      </div>
    </div>
  );
}
