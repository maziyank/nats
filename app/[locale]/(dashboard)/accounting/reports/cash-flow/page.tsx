"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import {
  getCashFlowStatement,
  ReportAccountLine,
} from "../actions";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { cn } from "@/services/lib/utils";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { useFormatDate } from "@/hooks/use-format-date";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { ExportButton } from "../_components/export-button";
import { useReportExport } from "@/hooks/use-report-export";
import type { ExportColumn } from "@/services/lib/export";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function CashFlowPage() {
  const formatCurrency = useFormatCurrency();
  const formatDate = useFormatDate();
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // Comparative State
  const [showComparative, setShowComparative] = useState(false);
  const [comparativeStartDate, setComparativeStartDate] = useState(
    new Date(new Date().getFullYear() - 1, 0, 1).toISOString().split("T")[0]
  );
  const [comparativeEndDate, setComparativeEndDate] = useState(
    new Date(new Date().getFullYear() - 1, 11, 31).toISOString().split("T")[0]
  );

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery({
    queryKey: [
      "cash-flow",
      startDate,
      endDate,
      showComparative ? comparativeStartDate : null,
      showComparative ? comparativeEndDate : null,
    ],
    queryFn: async () => {
      const res = await getCashFlowStatement(
        startDate,
        endDate,
        showComparative ? comparativeStartDate : undefined,
        showComparative ? comparativeEndDate : undefined
      );
      if (res.success && res.data) {
        return res.data;
      }
      return null;
    },
  });

  const formatPercentage = (val: number) => {
    if (isNaN(val)) return "-";
    return `${val.toFixed(1)}%`;
  };

  const renderRow = (item: ReportAccountLine) => (
    <TableRow key={item.accountId || item.name} className="hover:bg-muted/50">
      <TableCell>{item.name}</TableCell>
      <TableCell className="text-right">
        {formatCurrency(item.amount)}
      </TableCell>
      {showComparative && (
        <>
          <TableCell className="text-right text-muted-foreground">
            {formatCurrency(item.previousAmount || 0)}
          </TableCell>
          <TableCell className="text-right text-muted-foreground">
            {formatCurrency(item.change || 0)}
          </TableCell>
          <TableCell
            className={cn(
              "text-right",
              (item.changePercentage || 0) < 0
                ? "text-red-500"
                : "text-green-500"
            )}
          >
            {formatPercentage(item.changePercentage || 0)}
          </TableCell>
        </>
      )}
    </TableRow>
  );

  const renderTotalLine = (
    label: string,
    current: number,
    previous?: number
  ) => {
    const change = current - (previous || 0);
    const percent =
      previous && previous !== 0 ? (change / Math.abs(previous)) * 100 : 0;

    return (
      <TableRow className="font-bold border-t border-black bg-muted/20">
        <TableCell>{label}</TableCell>
        <TableCell className="text-right">{formatCurrency(current)}</TableCell>
        {showComparative && (
          <>
            <TableCell className="text-right text-muted-foreground">
              {formatCurrency(previous || 0)}
            </TableCell>
            <TableCell className="text-right text-muted-foreground">
              {formatCurrency(change)}
            </TableCell>
            <TableCell
              className={cn(
                "text-right",
                percent < 0 ? "text-red-500" : "text-green-500"
              )}
            >
              {formatPercentage(percent)}
            </TableCell>
          </>
        )}
      </TableRow>
    );
  };

  type ExportRow = {
    section: string;
    item: string;
    amount: number;
    previous: number;
    change: number;
    changePercent: string;
  };

  const exportColumns: ExportColumn<ExportRow>[] = [
    { key: "section", header: "Section" },
    { key: "item", header: "Item" },
    { key: "amount", header: "Amount" },
    { key: "previous", header: "Previous" },
    { key: "change", header: "Change" },
    { key: "changePercent", header: "%" },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<ExportRow>({
      fetchRows: async () => {
        if (!report) return [];
        const mapSection = (
          nodes: ReportAccountLine[],
          section: string,
        ): ExportRow[] =>
          nodes.map((node) => ({
            section,
            item: node.name,
            amount: node.amount,
            previous: node.previousAmount || 0,
            change: node.change || 0,
            changePercent: node.changePercentage
              ? `${node.changePercentage.toFixed(1)}%`
              : "0%",
          }));
        const total = (
          section: string,
          item: string,
          amount: number,
        ): ExportRow => ({
          section,
          item,
          amount,
          previous: 0,
          change: 0,
          changePercent: "0%",
        });
        return [
          ...mapSection(report.operatingActivities, "Operating"),
          total("Operating", "Net Cash from Operating", report.netCashProvidedByOperating),
          ...mapSection(report.investingActivities, "Investing"),
          total("Investing", "Net Cash from Investing", report.netCashProvidedByInvesting),
          ...mapSection(report.financingActivities, "Financing"),
          total("Financing", "Net Cash from Financing", report.netCashProvidedByFinancing),
          total("Summary", "Net Increase in Cash", report.netIncreaseInCash),
          total("Summary", "Cash at Beginning", report.cashAtBeginning),
          total("Summary", "Cash at End", report.cashAtEnd),
        ];
      },
      columns: exportColumns,
      filename: () => `cash-flow-${startDate}-${endDate}`,
      sheetName: "Cash Flow",
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h1 className="text-lg font-bold">Statement of Cash Flows</h1>
          <div className="flex items-center gap-4">
            <ExportButton
              onExportCSV={exportCsv}
              onExportExcel={exportExcel}
              isLoading={loading}
              isExporting={isExporting}
              exportingFormat={exportingFormat}
              reportCode="CASH_FLOW"
              reportInput={{
                startDate,
                endDate,
                comparativeStartDate: showComparative ? comparativeStartDate : undefined,
                comparativeEndDate: showComparative ? comparativeEndDate : undefined,
              }}
              reportTitle="Cash Flow Statement"
            />
            <Button onClick={() => refetch()} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                "Run Report"
              )}
            </Button>
          </div>
        </div>

        {/* Date Filters */}
        <div className="flex flex-wrap items-center gap-4 bg-muted/20 p-4 rounded-lg border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">From:</span>
            <CustomInput
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">To:</span>
            <CustomInput
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-auto"
            />
          </div>

          <div className="h-6 w-px bg-border mx-2" />

          <div className="flex items-center gap-2">
            <Checkbox
              id="comparative"
              checked={showComparative}
              onCheckedChange={(c) => setShowComparative(!!c)}
            />
            <Label htmlFor="comparative">Compare</Label>
          </div>

          {showComparative && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Comp. From:
                </span>
                <CustomInput
                  type="date"
                  value={comparativeStartDate}
                  onChange={(e) => setComparativeStartDate(e.target.value)}
                  className="w-auto"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Comp. To:
                </span>
                <CustomInput
                  type="date"
                  value={comparativeEndDate}
                  onChange={(e) => setComparativeEndDate(e.target.value)}
                  className="w-auto"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-2xl">
              Statement of Cash Flows
            </CardTitle>
            <p className="text-center text-muted-foreground">
              For the period {formatDate(startDate)} to {formatDate(endDate)}
              {showComparative &&
                ` compared to ${formatDate(
                  comparativeStartDate
                )} to ${formatDate(comparativeEndDate)}`}
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Account</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  {showComparative && (
                    <>
                      <TableHead className="text-right text-muted-foreground">
                        Previous
                      </TableHead>
                      <TableHead className="text-right text-muted-foreground">
                        Change
                      </TableHead>
                      <TableHead className="text-right text-muted-foreground">
                        %
                      </TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Operating Activities */}
                <TableRow className="bg-muted hover:bg-muted">
                  <TableCell
                    colSpan={showComparative ? 5 : 2}
                    className="font-bold text-lg uppercase text-muted-foreground"
                  >
                    Operating Activities
                  </TableCell>
                </TableRow>
                {report.operatingActivities.map(renderRow)}
                {renderTotalLine(
                  "Net Cash Provided by Operating Activities",
                  report.netCashProvidedByOperating,
                  report.previousNetCashProvidedByOperating
                )}

                {/* Investing Activities */}
                <TableRow className="bg-muted hover:bg-muted">
                  <TableCell
                    colSpan={showComparative ? 5 : 2}
                    className="font-bold text-lg uppercase text-muted-foreground"
                  >
                    Investing Activities
                  </TableCell>
                </TableRow>
                {report.investingActivities.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={showComparative ? 5 : 2}
                      className="text-muted-foreground italic text-sm"
                    >
                      No investing activities for this period.
                    </TableCell>
                  </TableRow>
                )}
                {report.investingActivities.map(renderRow)}
                {renderTotalLine(
                  "Net Cash Provided by Investing Activities",
                  report.netCashProvidedByInvesting,
                  report.previousNetCashProvidedByInvesting
                )}

                {/* Financing Activities */}
                <TableRow className="bg-muted hover:bg-muted">
                  <TableCell
                    colSpan={showComparative ? 5 : 2}
                    className="font-bold text-lg uppercase text-muted-foreground"
                  >
                    Financing Activities
                  </TableCell>
                </TableRow>
                {report.financingActivities.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={showComparative ? 5 : 2}
                      className="text-muted-foreground italic text-sm"
                    >
                      No financing activities for this period.
                    </TableCell>
                  </TableRow>
                )}
                {report.financingActivities.map(renderRow)}
                {renderTotalLine(
                  "Net Cash Provided by Financing Activities",
                  report.netCashProvidedByFinancing,
                  report.previousNetCashProvidedByFinancing
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
