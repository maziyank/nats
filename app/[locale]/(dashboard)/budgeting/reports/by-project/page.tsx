"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getBudgetByProjectReport,
  getBudgetReportFilterOptions,
  type BudgetByProjectEntry,
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
import { useReportExport } from "@/hooks/use-report-export";
import { ReportExportButton } from "@/components/ui/report-export-button";
import type { ExportColumn } from "@/services/lib/export";

export default function BudgetByProjectReportPage() {
  const t = useTranslations("Budgeting");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();

  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(String(currentYear));

  const { data: filters } = useQuery({
    queryKey: ["budget-report-filters"],
    queryFn: () => getBudgetReportFilterOptions(),
  });

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery<BudgetByProjectEntry[]>({
    queryKey: ["budget-by-project-report", fiscalYear],
    queryFn: () =>
      getBudgetByProjectReport({ fiscalYear: Number(fiscalYear) }),
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.totalBudget += item.totalBudget;
      acc.totalActual += item.totalActual;
      acc.variance += item.variance;
      acc.budgetCount += item.budgetCount;
      return acc;
    },
    { totalBudget: 0, totalActual: 0, variance: 0, budgetCount: 0 },
  );

  const years =
    filters?.fiscalYears?.length
      ? filters.fiscalYears
      : [currentYear, currentYear - 1];


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "projectCode", header: t("reports_col_code") },
    { key: "projectName", header: t("reports_col_project") },
    { key: "projectStatus", header: tCommon("status") },
    { key: "budgetCount", header: t("reports_col_budgets") },
    { key: "totalBudget", header: t("reports_col_budgeted") },
    { key: "totalActual", header: t("reports_col_actual") },
    { key: "variance", header: t("reports_col_variance") },
    { key: "utilizationPct", header: t("reports_col_utilization") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `budget-by-project-${fiscalYear}`,
      sheetName: "By Project",
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_by_project_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_by_project_subheading")}
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
          {report && (
            <span className="text-sm text-muted-foreground">
              {report.length} {t("reports_projects_count")}
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
                  <TableHead>{t("reports_col_project")}</TableHead>
                  <TableHead>{t("reports_col_code")}</TableHead>
                  <TableHead>{tCommon("status")}</TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_budgets")}
                  </TableHead>
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
                {report.map((item) => (
                  <TableRow key={item.projectId ?? item.projectName}>
                    <TableCell className="font-medium">
                      {item.projectName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.projectCode ?? "—"}
                    </TableCell>
                    <TableCell>
                      {item.projectStatus ? (
                        <Badge variant="outline">{item.projectStatus}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.budgetCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.totalBudget)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.totalActual)}
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
                    <TableCell className="text-center">
                      <span
                        className={
                          item.utilizationPct > 100
                            ? "text-red-600 dark:text-red-400 font-medium"
                            : item.utilizationPct >= 80
                              ? "text-amber-600 dark:text-amber-400"
                              : ""
                        }
                      >
                        {item.utilizationPct.toFixed(1)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {totals && (
                  <TableRow className="font-bold border-t-2">
                    <TableCell colSpan={3}>{tCommon("total")}</TableCell>
                    <TableCell className="text-center">
                      {totals.budgetCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.totalBudget)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.totalActual)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.variance)}
                    </TableCell>
                    <TableCell className="text-center">
                      {totals.totalBudget > 0
                        ? (
                            (totals.totalActual / totals.totalBudget) *
                            100
                          ).toFixed(1)
                        : "0.0"}
                      %
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
