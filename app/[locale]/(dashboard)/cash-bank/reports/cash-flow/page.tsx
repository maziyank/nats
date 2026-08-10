"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getCashFlowSummaryReport,
  type CashFlowSummaryResult,
} from "../actions";
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
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useReportExport } from "@/hooks/use-report-export";
import { ReportExportButton } from "@/components/ui/report-export-button";
import type { ExportColumn } from "@/services/lib/export";

const chartConfig = {
  cashIn: { label: "Cash In", color: "var(--color-chart-1)" },
  cashOut: { label: "Cash Out", color: "var(--color-chart-2)" },
  net: { label: "Net", color: "var(--color-chart-3)" },
} satisfies ChartConfig;

export default function CashFlowSummaryReportPage() {
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
  } = useQuery<CashFlowSummaryResult>({
    queryKey: ["cash-bank-cash-flow-summary", startDate, endDate],
    queryFn: async () =>
      getCashFlowSummaryReport(new Date(startDate), new Date(endDate)),
  });

  const totals = report?.totals;


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "period", header: "Period" },
    { key: "periodLabel", header: t("reports_col_period") },
    { key: "cashIn", header: t("reports_col_cash_in") },
    { key: "cashOut", header: t("reports_col_cash_out") },
    { key: "net", header: t("reports_col_net") },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report?.points ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `cash-flow-summary-${startDate}-${endDate}`,
      sheetName: "Cash Flow",
      estimatedRowCount: report?.points?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="mb-2">
          <h1 className="text-lg font-bold">{t("reports_cash_flow_heading")}</h1>
        </div>

        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {t("reports_cash_flow_subheading")}
          </p>
          <div className="flex items-center gap-2">
            <ReportExportButton
              onExportCsv={exportCsv}
              onExportExcel={exportExcel}
              isExporting={isExporting}
              exportingFormat={exportingFormat}
              disabled={loading || !report?.points?.length}
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

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && report && report.points.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {t("reports_no_data")}
          </div>
        )}

        {!loading && report && report.points.length > 0 && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t("reports_cash_flow_chart_title")}</CardTitle>
                <CardDescription>
                  {t("reports_cash_flow_chart_desc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={chartConfig}
                  className="min-h-[300px] w-full"
                >
                  <BarChart accessibilityLayer data={report.points}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="periodLabel"
                      tickLine={false}
                      tickMargin={10}
                      axisLine={false}
                      tickFormatter={(v) => String(v).slice(0, 3)}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={80}
                      tickFormatter={(v) => formatCurrency(Number(v))}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) =>
                            formatCurrency(Number(value))
                          }
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar
                      dataKey="cashIn"
                      fill="var(--color-cashIn)"
                      radius={4}
                    />
                    <Bar
                      dataKey="cashOut"
                      fill="var(--color-cashOut)"
                      radius={4}
                    />
                    <Bar dataKey="net" fill="var(--color-net)" radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reports_col_period")}</TableHead>
                    <TableHead className="text-right">
                      {t("reports_col_cash_in")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("reports_col_cash_out")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("reports_col_net")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.points.map((p) => (
                    <TableRow key={p.period}>
                      <TableCell className="font-medium">
                        {p.periodLabel}
                      </TableCell>
                      <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(p.cashIn)}
                      </TableCell>
                      <TableCell className="text-right text-red-600 dark:text-red-400">
                        {formatCurrency(p.cashOut)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          p.net >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {formatCurrency(p.net)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {totals && (
                    <TableRow className="border-t-2 bg-muted/30 font-semibold">
                      <TableCell>{t("reports_total")}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(totals.cashIn)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(totals.cashOut)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(totals.net)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
