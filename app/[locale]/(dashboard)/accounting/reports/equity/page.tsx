"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { getStatementOfChangesInEquity, EquityChangeReport } from "../actions";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/services/lib/utils";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { useFormatDate } from "@/hooks/use-format-date";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ExportButton } from "../_components/export-button";
import { useReportExport } from "@/hooks/use-report-export";
import type { ExportColumn } from "@/services/lib/export";

export default function EquityPage() {
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

  const [report, setReport] = useState<EquityChangeReport | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await getStatementOfChangesInEquity(
        startDate,
        endDate,
        showComparative ? comparativeStartDate : undefined,
        showComparative ? comparativeEndDate : undefined
      );
      if (res.success && res.data) {
        setReport(res.data);
      } else if (!res.success) {
        console.error("Failed to fetch report:", res.error);
      } else {
        console.error("Failed to fetch report: empty data");
      }
    } catch (error) {
      console.error("Failed to fetch report:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatPercentage = (val?: number) => {
    if (val === undefined || isNaN(val)) return "-";
    return `${val.toFixed(1)}%`;
  };

  type ExportRow = {
    account: string;
    balanceBeginning: number;
    netIncome: number;
    additions: number;
    deductions: number;
    balanceEnding: number;
    previousEnding: number;
    change: number;
    changePercent: string;
  };

  const exportColumns: ExportColumn<ExportRow>[] = [
    { key: "account", header: "Account" },
    { key: "balanceBeginning", header: "Beginning Balance" },
    { key: "netIncome", header: "Net Income" },
    { key: "additions", header: "Additions" },
    { key: "deductions", header: "Deductions" },
    { key: "balanceEnding", header: "Ending Balance" },
    { key: "previousEnding", header: "Previous Ending" },
    { key: "change", header: "Change" },
    { key: "changePercent", header: "%" },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<ExportRow>({
      fetchRows: async () => {
        if (!report) return [];
        const rows: ExportRow[] = report.items.map((item) => ({
          account: item.name,
          balanceBeginning: item.balanceBeginning,
          netIncome: item.netIncome,
          additions: item.additions,
          deductions: item.deductions,
          balanceEnding: item.balanceEnding,
          previousEnding: item.previousBalanceEnding || 0,
          change: item.change || 0,
          changePercent: item.changePercentage
            ? `${item.changePercentage.toFixed(1)}%`
            : "0%",
        }));
        rows.push({
          account: "TOTAL",
          balanceBeginning: report.totalBeginning,
          netIncome: report.totalNetIncome,
          additions: report.totalAdditions,
          deductions: report.totalDeductions,
          balanceEnding: report.totalEnding,
          previousEnding: report.previousTotalEnding || 0,
          change: report.change || 0,
          changePercent: report.changePercentage
            ? `${report.changePercentage.toFixed(1)}%`
            : "0%",
        });
        return rows;
      },
      columns: exportColumns,
      filename: () => `equity-change-${startDate}-${endDate}`,
      sheetName: "Equity",
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h1 className="text-lg font-bold">Statement of Changes in Equity</h1>
          <div className="flex items-center gap-4">
            <ExportButton
              onExportCSV={exportCsv}
              onExportExcel={exportExcel}
              isLoading={loading}
              isExporting={isExporting}
              exportingFormat={exportingFormat}
              reportCode="EQUITY_CHANGE"
              reportInput={{
                startDate,
                endDate,
                comparativeStartDate: showComparative ? comparativeStartDate : undefined,
                comparativeEndDate: showComparative ? comparativeEndDate : undefined,
              }}
              reportTitle="Statement of Changes in Equity"
            />
            <Button onClick={() => fetchReport()} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                "Run Report"
              )}
            </Button>
          </div>
        </div>

        {/* Filters */}
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
              Statement of Changes in Equity
            </CardTitle>
            <p className="text-center text-muted-foreground">
              For the period {formatDate(startDate)} to {formatDate(endDate)}
              {showComparative &&
                ` compared to ${formatDate(
                  comparativeStartDate
                )} - ${formatDate(comparativeEndDate)}`}
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Account</TableHead>
                  <TableHead className="text-right">
                    Balance Beginning
                  </TableHead>
                  <TableHead className="text-right">Net Income</TableHead>
                  <TableHead className="text-right">Additions</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right font-bold">
                    Balance Ending
                  </TableHead>
                  {showComparative && (
                    <>
                      <TableHead className="text-right text-muted-foreground">
                        Prev. Ending
                      </TableHead>
                      <TableHead className="text-right text-muted-foreground">
                        Change
                      </TableHead>
                      <TableHead className="text-right text-muted-foreground">
                        % Change
                      </TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.items.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.balanceBeginning)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.netIncome)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.additions)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.deductions)}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(item.balanceEnding)}
                    </TableCell>
                    {showComparative && (
                      <>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(item.previousBalanceEnding || 0)}
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
                          {formatPercentage(item.changePercentage)}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold border-t-2 border-black">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(report.totalBeginning)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(report.totalNetIncome)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(report.totalAdditions)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(report.totalDeductions)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(report.totalEnding)}
                  </TableCell>
                  {showComparative && (
                    <>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(report.previousTotalEnding || 0)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(report.change || 0)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right",
                          (report.changePercentage || 0) < 0
                            ? "text-red-500"
                            : "text-green-500"
                        )}
                      >
                        {formatPercentage(report.changePercentage)}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
