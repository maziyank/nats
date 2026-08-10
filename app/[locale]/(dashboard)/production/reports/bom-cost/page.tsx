"use client";
export const dynamic = "force-dynamic";

import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBomCostReport, type BomCostEntry } from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, PrinterIcon, ChevronDown, ChevronRight } from "lucide-react";
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

function BomRow({
  item,
  formatCurrency,
  t,
}: {
  item: BomCostEntry;
  formatCurrency: (n: number) => string;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Fragment>
      <TableRow
        className="cursor-pointer hover:bg-muted/40"
        onClick={() => setOpen((v) => !v)}
      >
        <TableCell>
          <span className="inline-flex items-center gap-1 font-medium">
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {item.bomNumber}
          </span>
        </TableCell>
        <TableCell>{item.bomName}</TableCell>
        <TableCell>
          <div className="flex flex-col">
            <span>{item.productName}</span>
            <span className="text-xs text-muted-foreground">
              {item.productSku}
            </span>
          </div>
        </TableCell>
        <TableCell className="text-center">{item.outputQty}</TableCell>
        <TableCell className="text-center">{item.materialCount}</TableCell>
        <TableCell className="text-right">
          {formatCurrency(item.estimatedUnitCost)}
        </TableCell>
        <TableCell className="text-right font-medium">
          {formatCurrency(item.estimatedTotalCost)}
        </TableCell>
        <TableCell className="text-right">
          {item.actualAvgUnitCost != null
            ? formatCurrency(item.actualAvgUnitCost)
            : "—"}
        </TableCell>
        <TableCell
          className={`text-right ${
            item.costVariance != null && item.costVariance > 0
              ? "text-destructive"
              : item.costVariance != null && item.costVariance < 0
                ? "text-emerald-600"
                : ""
          }`}
        >
          {item.costVariance != null ? formatCurrency(item.costVariance) : "—"}
        </TableCell>
        <TableCell>
          <Badge variant={item.isActive ? "default" : "outline"}>
            {item.isActive ? t("is_active") : "Inactive"}
          </Badge>
        </TableCell>
      </TableRow>
      {open &&
        item.items.map((line, idx) => (
          <TableRow key={`${item.bomId}-${idx}`} className="bg-muted/20">
            <TableCell />
            <TableCell colSpan={2} className="pl-8 text-sm">
              {line.productSku} — {line.productName}
            </TableCell>
            <TableCell className="text-center text-sm">{line.quantity}</TableCell>
            <TableCell />
            <TableCell className="text-right text-sm">
              {formatCurrency(line.currentAvgCost)}
            </TableCell>
            <TableCell className="text-right text-sm">
              {formatCurrency(line.lineCost)}
            </TableCell>
            <TableCell colSpan={3} />
          </TableRow>
        ))}
    </Fragment>
  );
}

export default function BomCostReportPage() {
  const t = useTranslations("Production");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery<BomCostEntry[]>({
    queryKey: ["production-bom-cost"],
    queryFn: () => getBomCostReport({ activeOnly: true }),
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.estimatedTotal += item.estimatedTotalCost;
      return acc;
    },
    { estimatedTotal: 0 },
  );


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "bomNumber", header: t("reports_col_bom") },
    { key: "bomName", header: t("name") },
    { key: "productSku", header: t("reports_col_sku") },
    { key: "productName", header: t("reports_col_product") },
    { key: "outputQty", header: t("reports_col_output_qty") },
    { key: "materialCount", header: t("reports_col_materials") },
    { key: "estimatedUnitCost", header: t("reports_col_est_unit_cost") },
    { key: "estimatedTotalCost", header: t("reports_col_est_total") },
    { key: "actualAvgUnitCost", header: t("reports_col_actual_unit") },
    { key: "costVariance", header: t("reports_col_variance") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `bom-cost`,
      sheetName: "BOM Cost",
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_bom_cost_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_bom_cost_subheading")}
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
                  <TableHead>{t("bom_number")}</TableHead>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("product")}</TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_output_qty")}
                  </TableHead>
                  <TableHead className="text-center">{t("items")}</TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_est_unit_cost")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_est_total_cost")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_actual_unit_cost")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_cost_variance")}
                  </TableHead>
                  <TableHead>{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((item) => (
                  <BomRow
                    key={item.bomId}
                    item={item}
                    formatCurrency={formatCurrency}
                    t={t}
                  />
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={6}>{tCommon("total")}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.estimatedTotal)}
                  </TableCell>
                  <TableCell colSpan={3} />
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
