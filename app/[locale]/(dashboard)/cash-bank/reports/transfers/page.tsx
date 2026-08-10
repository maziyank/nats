"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getTransferReport,
  type TransferReportResult,
} from "../actions";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
import { Loader2, PrinterIcon } from "lucide-react";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { useFormatDate } from "@/hooks/use-format-date";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { useReportExport } from "@/hooks/use-report-export";
import { ReportExportButton } from "@/components/ui/report-export-button";
import type { ExportColumn } from "@/services/lib/export";

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "APPROVED") return "default";
  if (status === "PENDING") return "secondary";
  return "destructive";
}

export default function TransferReportPage() {
  const t = useTranslations("CashBank");
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
  } = useQuery<TransferReportResult>({
    queryKey: ["cash-bank-transfer-report", startDate, endDate],
    queryFn: async () =>
      getTransferReport(new Date(startDate), new Date(endDate)),
  });

  const totals = report?.totals;


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "date", header: t("date") },
    { key: "reference", header: t("reports_col_reference") },
    { key: "fromAccount", header: t("reports_col_from") },
    { key: "toAccount", header: t("reports_col_to") },
    { key: "amount", header: t("reports_col_amount") },
    { key: "status", header: tCommon("status") },
    { key: "notes", header: t("reports_col_notes") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report?.entries ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `cash-transfers-${startDate}-${endDate}`,
      sheetName: "Transfers",
      estimatedRowCount: report?.entries?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="mb-2">
          <h1 className="text-lg font-bold">
            {t("reports_transfers_heading")}
          </h1>
        </div>

        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {t("reports_transfers_subheading")}
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

        {!loading && totals && report && report.entries.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">
                    {t("reports_col_total_transfers")}
                  </p>
                  <p className="text-lg font-bold">
                    {formatCurrency(totals.totalAmount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {totals.count} {t("reports_col_tx_count").toLowerCase()}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">
                    {t("reports_col_approved_amount")}
                  </p>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(totals.approvedAmount)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">
                    {t("reports_col_pending_amount")}
                  </p>
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                    {formatCurrency(totals.pendingAmount)}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("date")}</TableHead>
                    <TableHead>{t("from")}</TableHead>
                    <TableHead>{t("to")}</TableHead>
                    <TableHead className="text-right">
                      {t("amount")}
                    </TableHead>
                    <TableHead>{t("reference")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatDate(entry.date)}</TableCell>
                      <TableCell className="font-medium">
                        {entry.fromAccountName}
                      </TableCell>
                      <TableCell className="font-medium">
                        {entry.toAccountName}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(entry.amount)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.reference ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(entry.status)}>
                          {entry.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
