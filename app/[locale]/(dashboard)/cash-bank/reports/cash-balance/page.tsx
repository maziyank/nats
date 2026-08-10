"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  getCashBalanceReport,
  type CashBalanceReportResult,
} from "../actions";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
import { Loader2, PrinterIcon, ExternalLink } from "lucide-react";
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

export default function CashBalanceReportPage() {
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
  } = useQuery<CashBalanceReportResult>({
    queryKey: ["cash-bank-balance-report", startDate, endDate],
    queryFn: async () => {
      return await getCashBalanceReport(
        new Date(startDate),
        new Date(endDate),
      );
    },
  });

  const totals = report?.totals;


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "accountName", header: t("reports_col_account") },
    { key: "accountType", header: t("type") },
    { key: "accountNumber", header: "Account Number" },
    { key: "bankName", header: "Bank" },
    { key: "beginningBalance", header: t("reports_col_beginning_balance") },
    { key: "totalIn", header: t("reports_col_cash_in") },
    { key: "totalOut", header: t("reports_col_cash_out") },
    { key: "endingBalance", header: t("reports_col_ending_balance") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report?.entries ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `cash-balance-${startDate}-${endDate}`,
      sheetName: "Cash Balance",
      estimatedRowCount: report?.entries?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="mb-2">
          <h1 className="text-lg font-bold">
            {t("reports_cash_balance_heading")}
          </h1>
        </div>

        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground">
              {t("reports_cash_balance_subheading")}
            </p>
          </div>
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

        {/* Filters */}
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
          <div className="text-center py-12 text-muted-foreground border rounded-md">
            {t("reports_no_data")}
          </div>
        )}

        {!loading && report && report.entries.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports_col_account")}</TableHead>
                  <TableHead>{t("type")}</TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_beginning_balance")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_cash_in")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_cash_out")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_ending_balance")}
                  </TableHead>
                  <TableHead className="text-center">{t("reports_col_ledger")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.entries.map((entry) => (
                  <TableRow key={entry.accountId}>
                    <TableCell className="font-medium">
                      <div>{entry.accountName}</div>
                      {(entry.accountNumber || entry.bankName) && (
                        <div className="text-xs text-muted-foreground">
                          {entry.bankName}
                          {entry.bankName && entry.accountNumber ? " · " : ""}
                          {entry.accountNumber}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{t(entry.accountType.toLowerCase())}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(entry.beginningBalance)}
                    </TableCell>
                    <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(entry.totalIn)}
                    </TableCell>
                    <TableCell className="text-right text-red-600 dark:text-red-400">
                      {formatCurrency(entry.totalOut)}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(entry.endingBalance)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/cash-bank/${entry.accountId}`}>
                          <ExternalLink className="h-4 w-4 mr-1" />
                          {t("reports_view_ledger")}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {/* Totals row */}
                {totals && (
                  <TableRow className="border-t-2 bg-muted/30 font-semibold">
                    <TableCell>{t("reports_total")}</TableCell>
                    <TableCell />
                    <TableCell className="text-right">
                      {formatCurrency(totals.beginningBalance)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.totalIn)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.totalOut)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.endingBalance)}
                    </TableCell>
                    <TableCell />
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
