"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAPAgingDetail, getAPAgingSummary } from "./actions";
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

export default function APAgingPage() {
  const t = useTranslations("Purchase");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();
  const [asOfDate, setAsOfDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [view, setView] = useState<"summary" | "detail">("summary");

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ["purchase-ap-aging-detail", asOfDate],
    queryFn: async () => await getAPAgingDetail(new Date(asOfDate)),
  });

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["purchase-ap-aging-summary", asOfDate],
    queryFn: async () => await getAPAgingSummary(new Date(asOfDate)),
  });

  const loading = view === "summary" ? loadingSummary : loadingDetail;

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport({
      serverJobId:
        view === "summary"
          ? "purchase.ap_aging.summary"
          : "purchase.ap_aging.detail",
      serverJobContext: () => ({ asOfDate }),
      estimatedRowCount:
        view === "summary" ? summary?.length : detail?.length,
    });

  const summaryTotals = summary?.reduce(
    (acc, item) => {
      acc.current += item.current;
      acc.bucket1 += item.bucket1;
      acc.bucket2 += item.bucket2;
      acc.bucket3 += item.bucket3;
      acc.bucket4 += item.bucket4;
      acc.totalOutstanding += item.totalOutstanding;
      return acc;
    },
    {
      current: 0,
      bucket1: 0,
      bucket2: 0,
      bucket3: 0,
      bucket4: 0,
      totalOutstanding: 0,
    }
  );

  const detailTotals = detail?.reduce(
    (acc, item) => {
      acc.totalAmount += item.totalAmount;
      acc.paidAmount += item.paidAmount;
      acc.balance += item.balance;
      return acc;
    },
    { totalAmount: 0, paidAmount: 0, balance: 0 }
  );

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold">{t("reports_ap_aging_heading")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_ap_aging_subheading")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ReportExportButton
              onExportCsv={exportCsv}
              onExportExcel={exportExcel}
              isExporting={isExporting}
              exportingFormat={exportingFormat}
              disabled={
                loading ||
                (view === "summary" ? !summary?.length : !detail?.length)
              }
            />
            <Button variant="outline" onClick={() => window.print()}>
              <PrinterIcon className="mr-2 h-4 w-4" />
              {tCommon("print")}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-muted/20 p-4 rounded-lg border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t("reports_as_of")}</span>
            <CustomInput
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-auto"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant={view === "summary" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("summary")}
            >
              {t("reports_view_summary")}
            </Button>
            <Button
              variant={view === "detail" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("detail")}
            >
              {t("reports_view_detail")}
            </Button>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && view === "summary" && summary && summary.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports_col_vendor")}</TableHead>
                  <TableHead className="text-center">{t("reports_col_invoices")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_current")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_1_30")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_31_60")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_61_90")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_90_plus")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_outstanding")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((item) => (
                  <TableRow key={item.contactId}>
                    <TableCell className="font-medium">{item.contactName}</TableCell>
                    <TableCell className="text-center">{item.invoiceCount}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.current)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.bucket1)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.bucket2)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.bucket3)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.bucket4)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(item.totalOutstanding)}</TableCell>
                  </TableRow>
                ))}
                {summaryTotals && (
                  <TableRow className="bg-muted/50 font-medium">
                    <TableCell>{t("reports_total")}</TableCell>
                    <TableCell className="text-center">
                      {summary.reduce((s, i) => s + i.invoiceCount, 0)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(summaryTotals.current)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(summaryTotals.bucket1)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(summaryTotals.bucket2)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(summaryTotals.bucket3)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(summaryTotals.bucket4)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(summaryTotals.totalOutstanding)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && view === "detail" && detail && detail.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports_col_vendor")}</TableHead>
                  <TableHead>{t("reports_col_invoice_number")}</TableHead>
                  <TableHead>{t("reports_col_invoice_date")}</TableHead>
                  <TableHead>{t("reports_col_due_date")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_total_amount")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_paid_amount")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_balance")}</TableHead>
                  <TableHead className="text-center">{t("reports_col_days_overdue")}</TableHead>
                  <TableHead className="text-center">{t("reports_col_bucket")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.map((item) => (
                  <TableRow key={`${item.contactId}-${item.invoiceNumber}`}>
                    <TableCell className="font-medium">{item.contactName}</TableCell>
                    <TableCell>{item.invoiceNumber}</TableCell>
                    <TableCell>{new Date(item.invoiceDate).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(item.dueDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.totalAmount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.paidAmount)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(item.balance)}</TableCell>
                    <TableCell className="text-center">{item.daysOverdue}</TableCell>
                    <TableCell className="text-center">
                      <span
                        className={
                          item.bucket === "90+"
                            ? "text-red-600 font-medium"
                            : item.bucket === "61-90"
                              ? "text-orange-600 font-medium"
                              : item.bucket === "31-60"
                                ? "text-yellow-600 font-medium"
                                : item.bucket === "1-30"
                                  ? "text-blue-600 font-medium"
                                  : "text-green-600 font-medium"
                        }
                      >
                        {t(`reports_bucket_${item.bucket}`)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {detailTotals && (
                  <TableRow className="bg-muted/50 font-medium">
                    <TableCell colSpan={4}>{t("reports_total")}</TableCell>
                    <TableCell className="text-right">{formatCurrency(detailTotals.totalAmount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(detailTotals.paidAmount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(detailTotals.balance)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && ((view === "summary" && (!summary || summary.length === 0)) || (view === "detail" && (!detail || detail.length === 0))) && (
          <div className="text-center text-muted-foreground py-8">
            {t("reports_no_data")}
          </div>
        )}
      </div>
    </div>
  );
}
