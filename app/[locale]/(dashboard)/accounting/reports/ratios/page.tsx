"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { getFinancialRatios, FinancialRatios } from "../actions";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useFormatDate } from "@/hooks/use-format-date";
import { ExportButton } from "../_components/export-button";
import { useReportExport } from "@/hooks/use-report-export";
import type { ExportColumn } from "@/services/lib/export";

export default function FinancialRatiosPage() {
  const formatDate = useFormatDate();
  const [date, setDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const {
    data: ratios,
    isLoading: loading,
    refetch,
  } = useQuery({
    queryKey: ["financial-ratios", date],
    queryFn: async () => {
      const res = await getFinancialRatios(date);
      if (res.success && res.data) {
        return res.data;
      }
      return null;
    },
  });

  type ExportRow = { metric: string; value: string };

  const exportColumns: ExportColumn<ExportRow>[] = [
    { key: "metric", header: "Metric" },
    { key: "value", header: "Value" },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<ExportRow>({
      fetchRows: async () => {
        if (!ratios) return [];
        return [
          { metric: "Current Ratio", value: ratios.currentRatio.toFixed(2) },
          { metric: "Quick Ratio", value: ratios.quickRatio.toFixed(2) },
          { metric: "Debt to Equity", value: ratios.debtToEquity.toFixed(2) },
          {
            metric: "Gross Profit Margin",
            value: `${ratios.grossProfitMargin.toFixed(2)}%`,
          },
          {
            metric: "Net Profit Margin",
            value: `${ratios.netProfitMargin.toFixed(2)}%`,
          },
          {
            metric: "Return on Assets",
            value: `${ratios.returnOnAssets.toFixed(2)}%`,
          },
          {
            metric: "Return on Equity",
            value: `${ratios.returnOnEquity.toFixed(2)}%`,
          },
        ];
      },
      columns: exportColumns,
      filename: () => `financial-ratios-${date}`,
      sheetName: "Ratios",
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h1 className="text-lg font-bold">Financial Ratios & Analysis</h1>
          <div className="flex items-center gap-4">
            <ExportButton
              onExportCSV={exportCsv}
              onExportExcel={exportExcel}
              isLoading={loading}
              isExporting={isExporting}
              exportingFormat={exportingFormat}
              reportCode="FINANCIAL_RATIOS"
              reportInput={{ date }}
              reportTitle="Financial Ratios Analysis"
            />
            <Button onClick={() => refetch()} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                "Run Analysis"
              )}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 bg-muted/20 p-4 rounded-lg border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">As Of:</span>
            <CustomInput
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-auto"
            />
          </div>
        </div>
      </div>

      {ratios && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <RatioCard
            title="Current Ratio"
            value={ratios.currentRatio}
            format="number"
            description="Ability to pay short-term obligations."
            benchmark={1.5}
          />
          <RatioCard
            title="Quick Ratio"
            value={ratios.quickRatio}
            format="number"
            description="Ability to pay short-term obligations without selling inventory."
            benchmark={1.0}
          />
          <RatioCard
            title="Debt to Equity"
            value={ratios.debtToEquity}
            format="number"
            description="Proportion of equity and debt used to finance assets."
            benchmark={2.0}
            inverse // Lower is better
          />
          <RatioCard
            title="Gross Profit Margin"
            value={ratios.grossProfitMargin}
            format="percent"
            description="Percentage of revenue that exceeds COGS."
            benchmark={30} // Industry dependent
          />
          <RatioCard
            title="Net Profit Margin"
            value={ratios.netProfitMargin}
            format="percent"
            description="Percentage of revenue remaining after all expenses."
            benchmark={10}
          />
          <RatioCard
            title="Return on Assets (ROA)"
            value={ratios.returnOnAssets}
            format="percent"
            description="How profitable a company is relative to its total assets."
            benchmark={5}
          />
          <RatioCard
            title="Return on Equity (ROE)"
            value={ratios.returnOnEquity}
            format="percent"
            description="Profitability relative to shareholder's equity."
            benchmark={15}
          />
        </div>
      )}
    </div>
  );
}

interface RatioCardProps {
  title: string;
  value: number;
  format: "number" | "percent";
  description: string;
  benchmark?: number;
  inverse?: boolean;
}

function RatioCard({
  title,
  value,
  format,
  description,
  benchmark,
  inverse = false,
}: RatioCardProps) {
  const displayValue = format === "percent" ? `${value.toFixed(1)}%` : value.toFixed(2);

  let statusColor = "text-muted-foreground";
  let Icon = Minus;

  if (benchmark !== undefined) {
    const isGood = inverse ? value <= benchmark : value >= benchmark;
    if (isGood) {
      statusColor = "text-green-500";
      Icon = TrendingUp;
    } else {
      statusColor = "text-amber-500"; // Warning, not necessarily bad
      Icon = TrendingDown;
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${statusColor}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{displayValue}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
        {benchmark !== undefined && (
          <p className="text-xs text-muted-foreground mt-2">
            Target: {inverse ? "<" : ">"} {benchmark}{format === "percent" ? "%" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
