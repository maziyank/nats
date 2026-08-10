"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPurchaseTaxSummary,
} from "./actions";
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

export default function PurchaseTaxSummaryPage() {
  const t = useTranslations("Purchase");
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
    queryKey: ["purchase-tax-summary", startDate, endDate],
    queryFn: async () => {
      return await getPurchaseTaxSummary(
        new Date(startDate),
        new Date(endDate)
      );
    },
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.taxableAmount += item.taxableAmount;
      acc.taxAmount += item.taxAmount;
      return acc;
    },
    { taxableAmount: 0, taxAmount: 0 }
  );


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "taxRateName", header: t("reports_col_tax_rate") },
    { key: "taxRateCode", header: t("reports_col_tax_code") },
    { key: "rate", header: t("reports_col_rate_percent") },
    { key: "taxableAmount", header: t("reports_col_taxable_amount") },
    { key: "taxAmount", header: t("reports_col_tax_amount") },
    { key: "invoiceCount", header: t("reports_col_invoices") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `purchase-tax-summary-${startDate}-${endDate}`,
      sheetName: "Tax Summary",
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold">
              {t("reports_tax_summary_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_tax_summary_subheading")}
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
        ) : report && report.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports_col_tax_rate")}</TableHead>
                  <TableHead>{t("reports_col_tax_code")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_rate_percent")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_taxable_amount")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_tax_amount")}</TableHead>
                  <TableHead className="text-center">{t("reports_col_invoices")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((item) => (
                  <TableRow key={item.taxRateId ?? "__no_tax__"}>
                    <TableCell className="font-medium">{item.taxRateName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.taxRateCode ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.rate.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.taxableAmount)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.taxAmount)}
                    </TableCell>
                    <TableCell className="text-center">{item.invoiceCount}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={3}>{tCommon("total")}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.taxableAmount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.taxAmount)}
                  </TableCell>
                  <TableCell className="text-center">
                    {report.reduce((s, i) => s + i.invoiceCount, 0)}
                  </TableCell>
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
