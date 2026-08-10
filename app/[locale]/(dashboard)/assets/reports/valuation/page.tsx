"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getAssetValuationReport,
  getAssetReportFilterOptions,
  type AssetValuationEntry,
} from "../actions";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { SelectItem } from "@/components/ui/select";
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

export default function AssetValuationReportPage() {
  const t = useTranslations("Assets");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();
  const formatDate = useFormatDate();

  const [status, setStatus] = useState("ALL");
  const [categoryId, setCategoryId] = useState("ALL");

  const { data: filters } = useQuery({
    queryKey: ["asset-report-filters"],
    queryFn: () => getAssetReportFilterOptions(),
  });

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery<AssetValuationEntry[]>({
    queryKey: ["asset-valuation-report", status, categoryId],
    queryFn: () => getAssetValuationReport({ status, categoryId }),
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.acquisitionCost += item.acquisitionCost;
      acc.currentBookValue += item.currentBookValue;
      acc.accumulatedDepreciation += item.accumulatedDepreciation;
      acc.residualValue += item.residualValue;
      return acc;
    },
    {
      acquisitionCost: 0,
      currentBookValue: 0,
      accumulatedDepreciation: 0,
      residualValue: 0,
    },
  );


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "code", header: t("code") },
    { key: "name", header: t("name") },
    { key: "categoryName", header: t("category") },
    { key: "status", header: tCommon("status") },
    { key: "purchaseDate", header: t("purchase_date") },
    { key: "acquisitionCost", header: t("acquisition_cost") },
    { key: "currentBookValue", header: t("book_value") },
    { key: "accumulatedDepreciation", header: t("reports_col_accum_dep") },
    { key: "depreciationPct", header: t("reports_col_dep_pct") },
    { key: "remainingLifeMonths", header: t("reports_col_remaining_life") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `asset-valuation`,
      sheetName: "Valuation",
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_valuation_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_valuation_subheading")}
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
          <CustomSelect
            value={status}
            onValueChange={setStatus}
            containerClassName="w-[180px]"
            placeholder={tCommon("status")}
          >
            <SelectItem value="ALL">{tCommon("all_statuses")}</SelectItem>
            <SelectItem value="ACTIVE">ACTIVE</SelectItem>
            <SelectItem value="FULLY_DEPRECIATED">FULLY_DEPRECIATED</SelectItem>
          </CustomSelect>
          <CustomSelect
            value={categoryId}
            onValueChange={setCategoryId}
            containerClassName="w-[220px]"
            placeholder={t("category")}
          >
            <SelectItem value="ALL">{t("reports_all_categories")}</SelectItem>
            {filters?.categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code} — {c.name}
              </SelectItem>
            ))}
          </CustomSelect>
          {report && (
            <span className="text-sm text-muted-foreground">
              {report.length} {t("reports_assets_count")}
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
                  <TableHead>{t("purchase_date")}</TableHead>
                  <TableHead className="text-right">
                    {t("acquisition_cost")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("residual_value")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_accum_dep")}
                  </TableHead>
                  <TableHead className="text-right">{t("book_value")}</TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_dep_pct")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_remaining_life")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((item) => (
                  <TableRow key={item.assetId}>
                    <TableCell className="font-medium">{item.code}</TableCell>
                    <TableCell>
                      <Link
                        href={`/assets/${item.assetId}`}
                        className="text-primary hover:underline"
                      >
                        {item.name}
                      </Link>
                    </TableCell>
                    <TableCell>{item.categoryName}</TableCell>
                    <TableCell>
                      {formatDate(new Date(item.purchaseDate))}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.acquisitionCost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.residualValue)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.accumulatedDepreciation)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.currentBookValue)}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.depreciationPct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-center">
                      {item.remainingLifeMonths != null
                        ? item.remainingLifeMonths
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {totals && (
                  <TableRow className="font-bold border-t-2">
                    <TableCell colSpan={4}>{tCommon("total")}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.acquisitionCost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.residualValue)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.accumulatedDepreciation)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.currentBookValue)}
                    </TableCell>
                    <TableCell colSpan={2} />
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
