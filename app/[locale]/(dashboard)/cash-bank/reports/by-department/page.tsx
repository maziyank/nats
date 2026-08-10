"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getCashByDimensionReport,
  type CashByDimensionResult,
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

export default function CashByDepartmentReportPage() {
  const t = useTranslations("CashBank");
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
  } = useQuery<CashByDimensionResult>({
    queryKey: ["cash-bank-by-department", startDate, endDate],
    queryFn: async () =>
      getCashByDimensionReport(
        new Date(startDate),
        new Date(endDate),
        "department",
      ),
  });

  const totals = report?.totals;


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "departmentName", header: t("department") },
    { key: "cashIn", header: t("reports_col_cash_in") },
    { key: "cashOut", header: t("reports_col_cash_out") },
    { key: "net", header: t("reports_col_net") },
    { key: "transactionCount", header: t("reports_col_tx_count") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report?.entries ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `cash-by-department-${startDate}-${endDate}`,
      sheetName: "By Department",
      estimatedRowCount: report?.entries?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="mb-2">
          <h1 className="text-lg font-bold">
            {t("reports_by_department_heading")}
          </h1>
        </div>

        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {t("reports_by_department_subheading")}
          </p>
          <div className="flex items-center gap-2">
            <ReportExportButton
              onExportCsv={exportCsv}
              onExportExcel={exportExcel}
              isExporting={isExporting}
              exportingFormat={exportingFormat}
              disabled={loading || !report?.entries?.length}
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

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && report && report.entries.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {t("reports_no_data")}
          </div>
        )}

        {!loading && report && report.entries.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("department")}</TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_tx_count")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_income")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_expense")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_net")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.entries.map((entry, idx) => (
                  <TableRow key={entry.dimensionId ?? `none-${idx}`}>
                    <TableCell className="font-medium">
                      {entry.dimensionName}
                    </TableCell>
                    <TableCell className="text-right">
                      {entry.transactionCount}
                    </TableCell>
                    <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(entry.incomeAmount)}
                    </TableCell>
                    <TableCell className="text-right text-red-600 dark:text-red-400">
                      {formatCurrency(entry.expenseAmount)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        entry.netAmount >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {formatCurrency(entry.netAmount)}
                    </TableCell>
                  </TableRow>
                ))}
                {totals && (
                  <TableRow className="border-t-2 bg-muted/30 font-semibold">
                    <TableCell>{t("reports_total")}</TableCell>
                    <TableCell className="text-right">
                      {totals.transactionCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.incomeAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.expenseAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.netAmount)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
