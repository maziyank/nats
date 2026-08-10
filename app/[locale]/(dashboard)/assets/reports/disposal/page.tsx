"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getAssetDisposalReport,
  type AssetDisposalEntry,
} from "../actions";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
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
import Link from "next/link";
import { useReportExport } from "@/hooks/use-report-export";
import { ReportExportButton } from "@/components/ui/report-export-button";
import type { ExportColumn } from "@/services/lib/export";

export default function AssetDisposalReportPage() {
  const t = useTranslations("Assets");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();
  const formatDate = useFormatDate();

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
  } = useQuery<AssetDisposalEntry[]>({
    queryKey: ["asset-disposal-report", startDate, endDate],
    queryFn: () =>
      getAssetDisposalReport(new Date(startDate), new Date(endDate)),
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.disposalAmount += item.disposalAmount;
      acc.bookValue += item.bookValue;
      acc.gainLoss += item.gainLoss;
      return acc;
    },
    { disposalAmount: 0, bookValue: 0, gainLoss: 0 },
  );


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "assetCode", header: t("code") },
    { key: "assetName", header: t("name") },
    { key: "categoryName", header: t("category") },
    { key: "disposalDate", header: t("reports_col_disposal_date") },
    { key: "disposalAmount", header: t("reports_col_disposal_amount") },
    { key: "bookValue", header: t("book_value") },
    { key: "gainLoss", header: t("reports_col_gain_loss") },
    { key: "reason", header: t("reports_col_reason") },
    { key: "status", header: tCommon("status") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `asset-disposal`,
      sheetName: "Disposal",
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_disposal_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_disposal_subheading")}
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
              {report.length} {t("reports_disposals_count")}
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
                  <TableHead>{t("code")}</TableHead>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("category")}</TableHead>
                  <TableHead>{t("reports_col_disposal_date")}</TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_disposal_amount")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("book_value")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_gain_loss")}
                  </TableHead>
                  <TableHead>{t("reports_col_reason")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((item) => (
                  <TableRow key={item.disposalId}>
                    <TableCell className="font-medium">
                      {item.assetCode}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/assets/${item.assetId}`}
                        className="text-primary hover:underline"
                      >
                        {item.assetName}
                      </Link>
                    </TableCell>
                    <TableCell>{item.categoryName}</TableCell>
                    <TableCell>
                      {formatDate(new Date(item.disposalDate))}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.disposalAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.bookValue)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        item.gainLoss < 0
                          ? "text-red-600 dark:text-red-400"
                          : item.gainLoss > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : ""
                      }`}
                    >
                      {formatCurrency(item.gainLoss)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {item.reason ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {totals && (
                  <TableRow className="font-bold border-t-2">
                    <TableCell colSpan={4}>{tCommon("total")}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.disposalAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.bookValue)}
                    </TableCell>
                    <TableCell
                      className={`text-right ${
                        totals.gainLoss < 0
                          ? "text-red-600 dark:text-red-400"
                          : totals.gainLoss > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : ""
                      }`}
                    >
                      {formatCurrency(totals.gainLoss)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                )}
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
