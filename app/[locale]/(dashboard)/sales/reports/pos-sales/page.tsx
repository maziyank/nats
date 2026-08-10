"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPosSalesReport } from "./actions";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
import { Badge } from "@/components/ui/badge";
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
import { format } from "date-fns";
import { useReportExport } from "@/hooks/use-report-export";
import { ReportExportButton } from "@/components/ui/report-export-button";
import type { ExportColumn } from "@/services/lib/export";

export default function PosSalesReportPage() {
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
    queryKey: ["pos-sales-report", startDate, endDate],
    queryFn: async () => {
      return await getPosSalesReport(new Date(startDate), new Date(endDate));
    },
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.invoiceCount += item.invoiceCount;
      acc.grossSales += item.grossSales;
      acc.taxAmount += item.taxAmount;
      acc.discountAmount += item.discountAmount;
      acc.netSales += item.netSales;
      acc.paymentAmount += item.paymentAmount;
      acc.cashPayments += item.cashPayments;
      acc.nonCashPayments += item.nonCashPayments;
      return acc;
    },
    {
      invoiceCount: 0,
      grossSales: 0,
      taxAmount: 0,
      discountAmount: 0,
      netSales: 0,
      paymentAmount: 0,
      cashPayments: 0,
      nonCashPayments: 0,
    }
  );


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "sessionNumber", header: t("reports_col_session") },
    { key: "cashierName", header: t("reports_col_cashier") },
    { key: "warehouseName", header: t("reports_col_warehouse") },
    { key: "departmentName", header: t("department") },
    { key: "startTime", header: t("reports_col_session_start") },
    { key: "invoiceCount", header: t("reports_col_invoices") },
    { key: "grossSales", header: t("reports_col_gross_sales") },
    { key: "discountAmount", header: t("reports_col_discount") },
    { key: "taxAmount", header: t("reports_col_tax") },
    { key: "netSales", header: t("reports_col_net_sales") },
    { key: "cashPayments", header: t("reports_col_cash") },
    { key: "nonCashPayments", header: t("reports_col_non_cash") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `pos-sales-${startDate}-${endDate}`,
      sheetName: "POS Sales",
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold">
              {t("reports_pos_sales_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_pos_sales_subheading")}
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
        ) : !report || report.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            {t("reports_no_data")}
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports_col_session")}</TableHead>
                  <TableHead>{t("reports_col_cashier")}</TableHead>
                  <TableHead>{t("reports_col_warehouse")}</TableHead>
                  <TableHead>{t("department")}</TableHead>
                  <TableHead>{t("reports_col_session_start")}</TableHead>
                  <TableHead className="text-center">
                    {t("status")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_invoices")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_gross_sales")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_discount")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_tax")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_net_sales")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_cash_payments")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_non_cash_payments")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_cash_difference")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((item) => (
                  <TableRow key={item.sessionId}>
                    <TableCell className="font-medium">
                      {item.sessionNumber}
                    </TableCell>
                    <TableCell>{item.cashierName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.warehouseName ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.departmentName ?? "—"}
                    </TableCell>
                    <TableCell>
                      {format(new Date(item.startTime), "PP p")}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={
                          item.status === "OPEN" ? "default" : "secondary"
                        }
                      >
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {item.invoiceCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.grossSales)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.discountAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.taxAmount)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.netSales)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.cashPayments)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.nonCashPayments)}
                    </TableCell>
                    <TableCell
                      className={`text-right ${
                        item.cashDifference != null && item.cashDifference < 0
                          ? "text-red-500"
                          : item.cashDifference != null &&
                              item.cashDifference > 0
                            ? "text-emerald-600"
                            : ""
                      }`}
                    >
                      {item.cashDifference != null
                        ? formatCurrency(item.cashDifference)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={6}>{tCommon("total")}</TableCell>
                  <TableCell className="text-center">
                    {totals!.invoiceCount}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.grossSales)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.discountAmount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.taxAmount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.netSales)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.cashPayments)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.nonCashPayments)}
                  </TableCell>
                  <TableCell className="text-right">—</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
