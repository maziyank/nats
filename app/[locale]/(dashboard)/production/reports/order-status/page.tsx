"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getOrderStatusReport,
  type OrderStatusEntry,
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

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "outline",
  RELEASED: "secondary",
  IN_PROGRESS: "default",
  COMPLETED: "default",
  CANCELLED: "destructive",
};

export default function OrderStatusReportPage() {
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
  } = useQuery<OrderStatusEntry[]>({
    queryKey: ["production-order-status-report", status, startDate, endDate],
    queryFn: () =>
      getOrderStatusReport({
        status,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      }),
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.planned += item.plannedQuantity;
      acc.produced += item.producedQuantity;
      acc.materialCost += item.materialCost;
      acc.finishedGoodsValue += item.finishedGoodsValue;
      return acc;
    },
    { planned: 0, produced: 0, materialCost: 0, finishedGoodsValue: 0 },
  );


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "orderNumber", header: t("reports_col_order") },
    { key: "productSku", header: t("reports_col_sku") },
    { key: "productName", header: t("reports_col_product") },
    { key: "status", header: tCommon("status") },
    { key: "plannedQuantity", header: t("reports_col_planned") },
    { key: "producedQuantity", header: t("reports_col_produced") },
    { key: "remainingQuantity", header: t("reports_col_remaining") },
    { key: "completionPct", header: t("reports_col_completion") },
    { key: "materialCost", header: t("reports_col_material_cost") },
    { key: "finishedGoodsValue", header: t("reports_col_fg_value") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `production-order-status`,
      sheetName: "Order Status",
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_order_status_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_order_status_subheading")}
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
            <SelectItem value="DRAFT">DRAFT</SelectItem>
            <SelectItem value="RELEASED">RELEASED</SelectItem>
            <SelectItem value="IN_PROGRESS">IN_PROGRESS</SelectItem>
            <SelectItem value="COMPLETED">COMPLETED</SelectItem>
            <SelectItem value="CANCELLED">CANCELLED</SelectItem>
          </CustomSelect>
          {report && (
            <span className="text-sm text-muted-foreground">
              {report.length} {t("reports_orders_count")}
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
                    {t("reports_col_remaining")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_completion")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_material_cost")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_fg_value")}
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
                      <Badge variant={STATUS_VARIANT[item.status] ?? "outline"}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {item.plannedQuantity}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.producedQuantity}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.remainingQuantity}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.completionPct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.materialCost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.finishedGoodsValue)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {item.actualStartDate || item.startDate
                        ? formatDate(
                            new Date(
                              item.actualStartDate ?? item.startDate!,
                            ),
                          )
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
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right">
                    {formatCurrency(totals!.materialCost)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.finishedGoodsValue)}
                  </TableCell>
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
