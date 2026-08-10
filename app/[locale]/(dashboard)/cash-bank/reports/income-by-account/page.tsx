"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getAllocationByAccountReport,
  type AllocationByAccountResult,
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

export default function IncomeByAccountReportPage() {
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
  } = useQuery<AllocationByAccountResult>({
    queryKey: ["cash-bank-income-by-account", startDate, endDate],
    queryFn: async () =>
      getAllocationByAccountReport(
        new Date(startDate),
        new Date(endDate),
        "INCOME",
      ),
  });


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "accountCode", header: t("reports_col_code") },
    { key: "accountName", header: t("reports_col_account") },
    { key: "amount", header: t("reports_col_amount") },
    { key: "transactionCount", header: t("reports_col_tx_count") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report?.entries ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `income-by-account-${startDate}-${endDate}`,
      sheetName: "Income by Account",
      estimatedRowCount: report?.entries?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="mb-2">
          <h1 className="text-lg font-bold">
            {t("reports_income_by_account_heading")}
          </h1>
        </div>

        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {t("reports_income_by_account_subheading")}
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
                  <TableHead>{t("reports_col_account_code")}</TableHead>
                  <TableHead>{t("reports_col_account")}</TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_tx_count")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_amount")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_pct")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.entries.map((entry) => (
                  <TableRow key={entry.accountId}>
                    <TableCell className="font-mono text-sm">
                      {entry.accountCode}
                    </TableCell>
                    <TableCell className="font-medium">
                      {entry.accountName}
                    </TableCell>
                    <TableCell className="text-right">
                      {entry.transactionCount}
                    </TableCell>
                    <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(entry.totalAmount)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {report.totalAmount > 0
                        ? `${((entry.totalAmount / report.totalAmount) * 100).toFixed(1)}%`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 bg-muted/30 font-semibold">
                  <TableCell colSpan={2}>{t("reports_total")}</TableCell>
                  <TableCell className="text-right">
                    {report.entries.reduce(
                      (s, e) => s + e.transactionCount,
                      0,
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(report.totalAmount)}
                  </TableCell>
                  <TableCell className="text-right">100%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
