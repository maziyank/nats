"use client";
export const dynamic = "force-dynamic";

import { useQuery } from "@tanstack/react-query";
import {
  getAssetByCategoryReport,
  type AssetByCategoryEntry,
} from "../actions";
import { Button } from "@/components/ui/button";
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

export default function AssetByCategoryReportPage() {
  const t = useTranslations("Assets");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery<AssetByCategoryEntry[]>({
    queryKey: ["asset-by-category-report"],
    queryFn: () => getAssetByCategoryReport(),
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.assetCount += item.assetCount;
      acc.activeCount += item.activeCount;
      acc.disposedCount += item.disposedCount;
      acc.totalAcquisitionCost += item.totalAcquisitionCost;
      acc.totalBookValue += item.totalBookValue;
      acc.totalAccumulatedDepreciation += item.totalAccumulatedDepreciation;
      return acc;
    },
    {
      assetCount: 0,
      activeCount: 0,
      disposedCount: 0,
      totalAcquisitionCost: 0,
      totalBookValue: 0,
      totalAccumulatedDepreciation: 0,
    },
  );


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "categoryCode", header: t("reports_col_code") },
    { key: "categoryName", header: t("category") },
    { key: "assetCount", header: t("reports_col_count") },
    { key: "activeCount", header: t("reports_col_active") },
    { key: "disposedCount", header: t("reports_col_disposed") },
    { key: "totalAcquisitionCost", header: t("acquisition_cost") },
    { key: "totalBookValue", header: t("book_value") },
    { key: "totalAccumulatedDepreciation", header: t("reports_col_accum_dep") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `assets-by-category`,
      sheetName: "By Category",
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_by_category_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_by_category_subheading")}
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

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : report && report.length > 0 ? (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports_col_category_code")}</TableHead>
                  <TableHead>{t("category")}</TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_assets")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_active")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_disposed")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("acquisition_cost")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_accum_dep")}
                  </TableHead>
                  <TableHead className="text-right">{t("book_value")}</TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_avg_book_value")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((item) => (
                  <TableRow key={item.categoryId}>
                    <TableCell className="font-medium">
                      {item.categoryCode}
                    </TableCell>
                    <TableCell>{item.categoryName}</TableCell>
                    <TableCell className="text-center">
                      {item.assetCount}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.activeCount}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.disposedCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.totalAcquisitionCost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.totalAccumulatedDepreciation)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.totalBookValue)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.avgBookValue)}
                    </TableCell>
                  </TableRow>
                ))}
                {totals && (
                  <TableRow className="font-bold border-t-2">
                    <TableCell colSpan={2}>{tCommon("total")}</TableCell>
                    <TableCell className="text-center">
                      {totals.assetCount}
                    </TableCell>
                    <TableCell className="text-center">
                      {totals.activeCount}
                    </TableCell>
                    <TableCell className="text-center">
                      {totals.disposedCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.totalAcquisitionCost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.totalAccumulatedDepreciation)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.totalBookValue)}
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
