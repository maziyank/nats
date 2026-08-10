"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getSalesByProductReport,
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

export default function SalesByProductPage() {
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
    queryKey: ["sales-by-product", startDate, endDate],
    queryFn: async () => {
      return await getSalesByProductReport(
        new Date(startDate),
        new Date(endDate)
      );
    },
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.quantitySold += item.quantitySold;
      acc.grossAmount += item.grossAmount;
      acc.discountAmount += item.discountAmount;
      acc.taxAmount += item.taxAmount;
      acc.netAmount += item.netAmount;
      return acc;
    },
    { quantitySold: 0, grossAmount: 0, discountAmount: 0, taxAmount: 0, netAmount: 0 }
  );


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "productSku", header: t("reports_col_sku") },
    { key: "productName", header: t("reports_col_product") },
    { key: "categoryName", header: t("reports_col_category") },
    { key: "quantitySold", header: t("reports_col_qty_sold") },
    { key: "grossAmount", header: t("reports_col_gross_sales") },
    { key: "discountAmount", header: t("reports_col_discount") },
    { key: "taxAmount", header: t("reports_col_tax") },
    { key: "netAmount", header: t("reports_col_net_sales") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport({
      serverJobId: "sales.sales_by_product",
      serverJobContext: () => ({ startDate, endDate }),
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold">{t("reports_sales_by_product_heading")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_sales_by_product_subheading")}
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
                  <TableHead>{t("reports_col_sku")}</TableHead>
                  <TableHead>{t("reports_col_product")}</TableHead>
                  <TableHead>{t("reports_col_category")}</TableHead>
                  <TableHead className="text-center">{t("reports_col_qty_sold")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_gross_sales")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_discount")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_tax")}</TableHead>
                  <TableHead className="text-right">{t("reports_col_net_sales")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {t("reports_no_data")}
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {report.map((item) => (
                      <TableRow key={item.productId}>
                        <TableCell className="font-medium">{item.productSku}</TableCell>
                        <TableCell>{item.productName}</TableCell>
                        <TableCell className="text-muted-foreground">{item.categoryName}</TableCell>
                        <TableCell className="text-center">{item.quantitySold}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.grossAmount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.discountAmount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.taxAmount)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(item.netAmount)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2">
                      <TableCell colSpan={3}>{tCommon("total")}</TableCell>
                      <TableCell className="text-center">{totals!.quantitySold}</TableCell>
                      <TableCell className="text-right">{formatCurrency(totals!.grossAmount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(totals!.discountAmount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(totals!.taxAmount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(totals!.netAmount)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
