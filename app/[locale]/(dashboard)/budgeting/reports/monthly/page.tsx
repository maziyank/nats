"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getMonthlyBudgetReport,
  getBudgetReportFilterOptions,
  type MonthlyBudgetEntry,
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

export default function MonthlyBudgetReportPage() {
  const t = useTranslations("Budgeting");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();

  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(String(currentYear));
  const [budgetId, setBudgetId] = useState("ALL");

  const { data: filters } = useQuery({
    queryKey: ["budget-report-filters"],
    queryFn: () => getBudgetReportFilterOptions(),
  });

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery<MonthlyBudgetEntry[]>({
    queryKey: ["budget-monthly-report", fiscalYear, budgetId],
    queryFn: () =>
      getMonthlyBudgetReport({
        fiscalYear: Number(fiscalYear),
        budgetId: budgetId !== "ALL" ? budgetId : undefined,
      }),
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.budgeted += item.budgeted;
      acc.actual += item.actual;
      acc.variance += item.variance;
      return acc;
    },
    { budgeted: 0, actual: 0, variance: 0 },
  );

  const years =
    filters?.fiscalYears?.length
      ? filters.fiscalYears
      : [currentYear, currentYear - 1];

  const budgetsForYear =
    filters?.budgets?.filter((b) => b.fiscalYear === Number(fiscalYear)) ??
    [];


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "monthName", header: t("reports_col_month") },
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
      filename: () => `budget-monthly-${fiscalYear}`,
      sheetName: "Monthly",
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_monthly_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_monthly_subheading")}
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
              onValueChange={(v) => {
                setFiscalYear(v);
                setBudgetId("ALL");
              }}
              containerClassName="w-[140px]"
            >
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </CustomSelect>
          </div>
          <CustomSelect
            value={budgetId}
            onValueChange={setBudgetId}
            containerClassName="w-[240px]"
            placeholder={t("reports_col_budget")}
          >
            <SelectItem value="ALL">{t("reports_all_budgets")}</SelectItem>
            {budgetsForYear.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </CustomSelect>
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
                  <TableHead>{t("reports_col_month")}</TableHead>
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
                  <TableRow key={item.month}>
                    <TableCell className="font-medium">
                      {item.monthName}
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
                    <TableCell>{tCommon("total")}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.budgeted)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.actual)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.variance)}
                    </TableCell>
                    <TableCell className="text-center">
                      {totals.budgeted > 0
                        ? ((totals.actual / totals.budgeted) * 100).toFixed(
                            1,
                          )
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
