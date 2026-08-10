"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getBudgetVarianceReport,
  getBudgetReportFilterOptions,
  type BudgetVarianceEntry,
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

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "outline",
  PENDING_APPROVAL: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
  ARCHIVED: "outline",
};

export default function BudgetVarianceReportPage() {
  const t = useTranslations("Budgeting");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();

  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(String(currentYear));
  const [status, setStatus] = useState("ALL");

  const { data: filters } = useQuery({
    queryKey: ["budget-report-filters"],
    queryFn: () => getBudgetReportFilterOptions(),
  });

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery<BudgetVarianceEntry[]>({
    queryKey: ["budget-variance-report", fiscalYear, status],
    queryFn: () =>
      getBudgetVarianceReport({
        fiscalYear: Number(fiscalYear),
        status,
      }),
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.totalBudget += item.totalBudget;
      acc.totalActual += item.totalActual;
      acc.variance += item.variance;
      return acc;
    },
    { totalBudget: 0, totalActual: 0, variance: 0 },
  );

  const years =
    filters?.fiscalYears?.length
      ? filters.fiscalYears
      : [currentYear, currentYear - 1];


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "budgetName", header: t("reports_col_budget") },
    { key: "status", header: tCommon("status") },
    { key: "department", header: t("reports_col_department") },
    { key: "project", header: t("reports_col_project") },
    { key: "totalBudget", header: t("reports_col_budgeted") },
    { key: "totalActual", header: t("reports_col_actual") },
    { key: "variance", header: t("reports_col_variance") },
    { key: "utilizationPct", header: t("reports_col_utilization") },
    { key: "overBudgetItems", header: t("reports_col_over_items") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `budget-variance-${fiscalYear}`,
      sheetName: "Variance",
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_variance_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_variance_subheading")}
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
          <CustomSelect
            value={status}
            onValueChange={setStatus}
            containerClassName="w-[180px]"
            placeholder={tCommon("status")}
          >
            <SelectItem value="ALL">{tCommon("all_statuses")}</SelectItem>
            <SelectItem value="DRAFT">DRAFT</SelectItem>
            <SelectItem value="PENDING_APPROVAL">PENDING_APPROVAL</SelectItem>
            <SelectItem value="APPROVED">APPROVED</SelectItem>
            <SelectItem value="REJECTED">REJECTED</SelectItem>
            <SelectItem value="ARCHIVED">ARCHIVED</SelectItem>
          </CustomSelect>
          {report && (
            <span className="text-sm text-muted-foreground">
              {report.length} {t("reports_budgets_count")}
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
                  <TableHead>{t("reports_col_budget")}</TableHead>
                  <TableHead>{tCommon("status")}</TableHead>
                  <TableHead>{t("reports_col_department")}</TableHead>
                  <TableHead>{t("reports_col_project")}</TableHead>
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
                  <TableHead className="text-center">
                    {t("reports_col_over_items")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((item) => (
                  <TableRow key={item.budgetId}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/budgeting/budgets/${item.budgetId}`}
                        className="text-primary hover:underline"
                      >
                        {item.budgetName}
                      </Link>
                      {item.isDefault && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          Default
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_VARIANT[item.status] ?? "outline"}
                      >
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.department ?? "—"}</TableCell>
                    <TableCell>{item.project ?? "—"}</TableCell>
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
                    <TableCell className="text-center">
                      {item.overBudgetItems > 0 ? (
                        <Badge variant="destructive">
                          {item.overBudgetItems}
                        </Badge>
                      ) : (
                        "0"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {totals && (
                  <TableRow className="font-bold border-t-2">
                    <TableCell colSpan={4}>{tCommon("total")}</TableCell>
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
