"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getOverspendingReport,
  getBudgetReportFilterOptions,
  type OverspendingEntry,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import Link from "next/link";
import { useReportExport } from "@/hooks/use-report-export";
import { ReportExportButton } from "@/components/ui/report-export-button";
import type { ExportColumn } from "@/services/lib/export";

export default function OverspendingReportPage() {
  const t = useTranslations("Budgeting");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();

  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(String(currentYear));
  const [threshold, setThreshold] = useState("80");

  const { data: filters } = useQuery({
    queryKey: ["budget-report-filters"],
    queryFn: () => getBudgetReportFilterOptions(),
  });

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery<OverspendingEntry[]>({
    queryKey: ["budget-overspending-report", fiscalYear, threshold],
    queryFn: () =>
      getOverspendingReport({
        fiscalYear: Number(fiscalYear),
        thresholdPct: Number(threshold),
      }),
  });

  const years =
    filters?.fiscalYears?.length
      ? filters.fiscalYears
      : [currentYear, currentYear - 1];

  const overCount = report?.filter((r) => r.severity === "OVER").length ?? 0;
  const warningCount =
    report?.filter((r) => r.severity === "WARNING").length ?? 0;


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "severity", header: t("reports_col_severity") },
    { key: "budgetName", header: t("reports_col_budget") },
    { key: "accountCode", header: t("reports_col_code") },
    { key: "accountName", header: t("reports_col_account") },
    { key: "department", header: t("reports_col_department") },
    { key: "project", header: t("reports_col_project") },
    { key: "budgeted", header: t("reports_col_budgeted") },
    { key: "actual", header: t("reports_col_actual") },
    { key: "variance", header: t("reports_col_variance") },
    { key: "utilizationPct", header: t("reports_col_utilization") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `budget-overspending-${fiscalYear}`,
      sheetName: "Overspending",
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_overspending_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_overspending_subheading")}
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
              {t("reports_fiscal_year")}
            </span>
            <CustomSelect
              value={fiscalYear}
              onValueChange={setFiscalYear}
              containerClassName="w-[140px]"
            >
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </CustomSelect>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t("reports_threshold")}
            </span>
            <CustomSelect
              value={threshold}
              onValueChange={setThreshold}
              containerClassName="w-[120px]"
            >
              <SelectItem value="70">70%</SelectItem>
              <SelectItem value="80">80%</SelectItem>
              <SelectItem value="90">90%</SelectItem>
              <SelectItem value="100">100%</SelectItem>
            </CustomSelect>
          </div>
          {report && (
            <span className="text-sm text-muted-foreground">
              {overCount} {t("reports_over_count")} · {warningCount}{" "}
              {t("reports_warning_count")}
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
                  <TableHead>{t("reports_col_severity")}</TableHead>
                  <TableHead>{t("reports_col_budget")}</TableHead>
                  <TableHead>{t("reports_col_account")}</TableHead>
                  <TableHead>{t("reports_col_department")}</TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_budgeted")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_actual")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_variance")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_utilization")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((item, idx) => (
                  <TableRow
                    key={`${item.budgetId}-${item.accountCode}-${idx}`}
                  >
                    <TableCell>
                      <Badge
                        variant={
                          item.severity === "OVER"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {item.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/budgeting/budgets/${item.budgetId}`}
                        className="text-primary hover:underline"
                      >
                        {item.budgetName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{item.accountName}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.accountCode}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.department ?? item.project ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.budgeted)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.actual)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        item.variance < 0
                          ? "text-red-600 dark:text-red-400"
                          : ""
                      }`}
                    >
                      {formatCurrency(item.variance)}
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {item.utilizationPct.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            {t("reports_no_overspending")}
          </div>
        )}
      </div>
    </div>
  );
}
