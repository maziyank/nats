"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getBudgetStatusReport,
  getBudgetReportFilterOptions,
  type BudgetStatusSummary,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function BudgetStatusReportPage() {
  const t = useTranslations("Budgeting");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();
  const formatDate = useFormatDate();

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
  } = useQuery<BudgetStatusSummary>({
    queryKey: ["budget-status-report", fiscalYear],
    queryFn: () =>
      getBudgetStatusReport({ fiscalYear: Number(fiscalYear) }),
  });

  const years =
    filters?.fiscalYears?.length
      ? filters.fiscalYears
      : [currentYear, currentYear - 1];


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "status", header: tCommon("status") },
    { key: "count", header: t("reports_col_count") },
    { key: "totalAmount", header: t("reports_col_total_amount") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report?.byStatus ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `budget-status-${fiscalYear}`,
      sheetName: "Status",
      estimatedRowCount: report?.byStatus?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_status_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_status_subheading")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ReportExportButton
              onExportCsv={exportCsv}
              onExportExcel={exportExcel}
              isExporting={isExporting}
              exportingFormat={exportingFormat}
              disabled={loading || !report}
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
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : report ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t("reports_total_budgets")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {report.totalBudgets}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t("reports_total_amount")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(report.totalAmount)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t("reports_pending_approvals")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {report.pendingApprovals}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t("reports_fiscal_year")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {report.fiscalYear}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tCommon("status")}</TableHead>
                    <TableHead className="text-center">
                      {t("reports_col_count")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("reports_col_total_amount")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.byStatus.map((row) => (
                    <TableRow key={row.status}>
                      <TableCell>
                        <Badge
                          variant={STATUS_VARIANT[row.status] ?? "outline"}
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {row.count}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.totalAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div>
              <h2 className="text-base font-semibold mb-2">
                {t("reports_recent_budgets")}
              </h2>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("reports_col_budget")}</TableHead>
                      <TableHead>{tCommon("status")}</TableHead>
                      <TableHead>{t("reports_col_department")}</TableHead>
                      <TableHead>{t("reports_col_project")}</TableHead>
                      <TableHead className="text-right">
                        {t("reports_col_total_amount")}
                      </TableHead>
                      <TableHead>{tCommon("date")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.recentBudgets.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center text-muted-foreground h-24"
                        >
                          {t("reports_no_data")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      report.recentBudgets.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/budgeting/budgets/${b.id}`}
                              className="text-primary hover:underline"
                            >
                              {b.name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                STATUS_VARIANT[b.status] ?? "outline"
                              }
                            >
                              {b.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{b.department ?? "—"}</TableCell>
                          <TableCell>{b.project ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(b.totalAmount)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(new Date(b.createdAt))}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            {t("reports_no_data")}
          </div>
        )}
      </div>
    </div>
  );
}
