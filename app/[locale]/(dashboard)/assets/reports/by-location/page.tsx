"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getAssetByLocationReport,
  type AssetByLocationEntry,
} from "../actions";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { SelectItem } from "@/components/ui/select";
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

export default function AssetByLocationReportPage() {
  const t = useTranslations("Assets");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();

  const [groupBy, setGroupBy] = useState<"location" | "department">(
    "location",
  );

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery<AssetByLocationEntry[]>({
    queryKey: ["asset-by-location-report", groupBy],
    queryFn: () => getAssetByLocationReport({ groupBy }),
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.assetCount += item.assetCount;
      acc.activeCount += item.activeCount;
      acc.totalAcquisitionCost += item.totalAcquisitionCost;
      acc.totalBookValue += item.totalBookValue;
      return acc;
    },
    {
      assetCount: 0,
      activeCount: 0,
      totalAcquisitionCost: 0,
      totalBookValue: 0,
    },
  );


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "groupType", header: t("reports_col_type") },
    { key: "groupName", header: t("reports_col_location") },
    { key: "assetCount", header: t("reports_col_count") },
    { key: "activeCount", header: t("reports_col_active") },
    { key: "totalAcquisitionCost", header: t("acquisition_cost") },
    { key: "totalBookValue", header: t("book_value") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `assets-by-location`,
      sheetName: "By Location",
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_by_location_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_by_location_subheading")}
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
              {t("reports_group_by")}
            </span>
            <CustomSelect
              value={groupBy}
              onValueChange={(v) =>
                setGroupBy(v as "location" | "department")
              }
              containerClassName="w-[180px]"
            >
              <SelectItem value="location">
                {t("reports_col_location")}
              </SelectItem>
              <SelectItem value="department">
                {t("reports_col_department")}
              </SelectItem>
            </CustomSelect>
          </div>
          {report && (
            <span className="text-sm text-muted-foreground">
              {report.length} {t("reports_groups_count")}
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
                  <TableHead>
                    {groupBy === "location"
                      ? t("reports_col_location")
                      : t("reports_col_department")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_assets")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_active")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("acquisition_cost")}
                  </TableHead>
                  <TableHead className="text-right">{t("book_value")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((item) => (
                  <TableRow key={item.groupKey}>
                    <TableCell className="font-medium">
                      {item.groupName}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.assetCount}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.activeCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.totalAcquisitionCost)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.totalBookValue)}
                    </TableCell>
                  </TableRow>
                ))}
                {totals && (
                  <TableRow className="font-bold border-t-2">
                    <TableCell>{tCommon("total")}</TableCell>
                    <TableCell className="text-center">
                      {totals.assetCount}
                    </TableCell>
                    <TableCell className="text-center">
                      {totals.activeCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.totalAcquisitionCost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.totalBookValue)}
                    </TableCell>
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
