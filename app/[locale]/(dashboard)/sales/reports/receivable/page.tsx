"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getReceivableReport,
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

export default function ReceivableReportPage() {
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
    queryKey: ["sales-receivable", startDate, endDate],
    queryFn: async () => {
      return await getReceivableReport(
        new Date(startDate),
        new Date(endDate)
      );
    },
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.openingBalance += item.openingBalance;
      acc.invoiceAmount += item.invoiceAmount;
      acc.returnAmount += item.returnAmount;
      acc.paymentAmount += item.paymentAmount;
      acc.closingBalance += item.closingBalance;
      return acc;
    },
    {
      openingBalance: 0,
      invoiceAmount: 0,
      returnAmount: 0,
      paymentAmount: 0,
      closingBalance: 0,
    }
  );


  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport({
      serverJobId: "sales.receivable",
      serverJobContext: () => ({ startDate, endDate }),
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold">{t("reports_receivable_heading")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_receivable_subheading")}
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
                  <TableHead className="text-right">{t("reports_col_opening_balance")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_invoice_additions")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_returns")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_payments")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_closing_balance")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
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
                    <TableCell className="text-right">
                      {formatCurrency(item.openingBalance)}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      {formatCurrency(item.invoiceAmount)}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      {formatCurrency(item.returnAmount)}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      {formatCurrency(item.paymentAmount)}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(item.closingBalance)}
                    </TableCell>
                  </TableRow>
                ))}
                {report.length > 0 && totals && (
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>{tCommon("total")}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.openingBalance)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.invoiceAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.returnAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.paymentAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.closingBalance)}
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
