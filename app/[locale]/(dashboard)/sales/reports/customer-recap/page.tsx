"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getCustomerRecapReport,
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
import type { ExportColumn } from "@/lib/export";

export default function CustomerRecapPage() {
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
    queryKey: ["sales-customer-recap", startDate, endDate],
    queryFn: async () => {
      return await getCustomerRecapReport(
        new Date(startDate),
        new Date(endDate)
      );
    },
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.totalInvoiceAmount += item.totalInvoiceAmount;
      acc.totalReturnAmount += item.totalReturnAmount;
      acc.totalPaymentAmount += item.totalPaymentAmount;
      acc.netSales += item.netSales;
      acc.outstanding += item.outstanding;
      return acc;
    },
    {
      totalInvoiceAmount: 0,
      totalReturnAmount: 0,
      totalPaymentAmount: 0,
      netSales: 0,
      outstanding: 0,
    }
  );


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "contactName", header: t("reports_col_customer") },
    { key: "invoiceCount", header: t("reports_col_invoices") },
    { key: "totalInvoiceAmount", header: t("reports_col_invoice_amount") },
    { key: "totalReturnAmount", header: t("reports_col_returns") },
    { key: "totalPaymentAmount", header: t("reports_col_payments") },
    { key: "netSales", header: t("reports_col_net_sales") },
    { key: "outstanding", header: t("reports_col_outstanding") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport({
      serverJobId: "sales.customer_recap",
      serverJobContext: () => ({ startDate, endDate }),
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold">{t("reports_customer_recap_heading")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_customer_recap_subheading")}
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

        {report && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports_col_customer")}</TableHead>
                  <TableHead className="text-center">{t("reports_col_invoices")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_invoice_amount")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_returns")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_payments")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_net_sales")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_outstanding")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center h-24 text-muted-foreground"
                    >
                      {t("reports_no_data")}
                    </TableCell>
                  </TableRow>
                )}
                {report.map((item) => (
                  <TableRow key={item.contactId}>
                    <TableCell>
                      <div className="font-medium">{item.contactName}</div>
                      {item.email && (
                        <div className="text-xs text-muted-foreground">
                          {item.email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.invoiceCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.totalInvoiceAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.totalReturnAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.totalPaymentAmount)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.netSales)}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(item.outstanding)}
                    </TableCell>
                  </TableRow>
                ))}
                {report.length > 0 && totals && (
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>{tCommon("total")}</TableCell>
                    <TableCell className="text-center">
                      {report.reduce((s, i) => s + i.invoiceCount, 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.totalInvoiceAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.totalReturnAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.totalPaymentAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.netSales)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.outstanding)}
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
