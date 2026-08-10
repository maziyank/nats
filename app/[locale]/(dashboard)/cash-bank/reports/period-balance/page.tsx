"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getCashAccountBalancePerPeriod,
  type CashAccountPeriodBalanceReportResult,
} from "../actions";
import {
  PeriodBalanceChart,
  type PeriodBalanceChartSeries,
} from "../_components/period-balance-chart";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { useReportExport } from "@/hooks/use-report-export";
import { ReportExportButton } from "@/components/ui/report-export-button";
import type { ExportColumn } from "@/services/lib/export";

// Chart color palette (matches chart CSS variables used elsewhere)
const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export default function CashAccountPeriodBalanceReportPage() {
  const t = useTranslations("CashBank");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();

  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery<CashAccountPeriodBalanceReportResult>({
    queryKey: ["cash-bank-period-balance-report", startDate, endDate],
    queryFn: async () => {
      return await getCashAccountBalancePerPeriod(
        new Date(startDate),
        new Date(endDate),
      );
    },
  });

  // Build chart series: one bar per account per period
  const chartSeries: PeriodBalanceChartSeries[] =
    report?.series.map((s, idx) => ({
      key: s.accountId,
      label: s.accountName,
      color: CHART_COLORS[idx % CHART_COLORS.length],
    })) ?? [];

  // Build chart data: one row per period, with a column per account + total
  const chartData =
    report?.periods.map((p, idx) => {
      const row: Record<string, string | number> = {
        periodLabel: p.periodLabel,
      };
      report.series.forEach((s) => {
        row[s.accountId] = s.data[idx]?.balance ?? 0;
      });
      row.__total = report.totals[idx]?.balance ?? 0;
      return row;
    }) ?? [];


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "accountName", header: t("reports_col_account") },
    { key: "accountType", header: t("type") },
    { key: "period", header: t("reports_col_period") },
    { key: "periodLabel", header: t("reports_col_period") },
    { key: "balance", header: t("reports_col_balance") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () => {
        if (!report) return [];
        const rows: Array<Record<string, unknown>> = [];
        for (const series of report.series) {
          for (const point of series.data) {
            rows.push({
              accountName: series.accountName,
              accountType: series.accountType,
              period: point.period,
              periodLabel: point.periodLabel,
              balance: point.balance,
            });
          }
        }
        for (const point of report.totals) {
          rows.push({
            accountName: "TOTAL",
            accountType: "",
            period: point.period,
            periodLabel: point.periodLabel,
            balance: point.balance,
          });
        }
        return rows;
      },
      columns: exportColumns,
      filename: () => `period-balance-${startDate}-${endDate}`,
      sheetName: "Period Balance",
      estimatedRowCount:
        (report?.series?.length ?? 0) * (report?.periods?.length ?? 0) +
        (report?.totals?.length ?? 0),
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="mb-2">
          <h1 className="text-lg font-bold">
            {t("reports_period_balance_heading")}
          </h1>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {t("reports_period_balance_subheading")}
          </p>
          <div className="flex items-center gap-2">
            <ReportExportButton
              onExportCsv={exportCsv}
              onExportExcel={exportExcel}
              isExporting={isExporting}
              exportingFormat={exportingFormat}
              disabled={loading || !report?.series?.length}
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

        {/* Period Filter */}
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

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !report || report.series.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {t("reports_no_data")}
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Combined Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("reports_period_balance_chart_title")}
                </CardTitle>
                <CardDescription>
                  {t("reports_period_balance_chart_desc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PeriodBalanceChart data={chartData} series={chartSeries} />
              </CardContent>
            </Card>

            {/* Per-account data table */}
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background">
                      {t("account_name")}
                    </TableHead>
                    {report.periods.map((p) => (
                      <TableHead key={p.period} className="text-right">
                        {p.periodLabel}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.series.map((series) => (
                    <TableRow key={series.accountId}>
                      <TableCell className="font-medium sticky left-0 bg-background">
                        {series.accountName}
                      </TableCell>
                      {series.data.map((point) => (
                        <TableCell
                          key={point.period}
                          className="text-right tabular-nums"
                        >
                          {formatCurrency(point.balance)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {/* Totals row */}
                  <TableRow className="border-t-2 bg-muted/30 font-semibold">
                    <TableCell className="sticky left-0 bg-muted/30">
                      {t("reports_total")}
                    </TableCell>
                    {report.totals.map((point) => (
                      <TableCell
                        key={point.period}
                        className="text-right tabular-nums"
                      >
                        {formatCurrency(point.balance)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
