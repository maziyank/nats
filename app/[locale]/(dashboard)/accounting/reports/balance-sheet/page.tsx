"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { getBalanceSheet } from "../actions";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountTreeRow } from "../_components/account-tree-row";
import { Loader2 } from "lucide-react";
import { cn } from "@/services/lib/utils";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { useFormatDate } from "@/hooks/use-format-date";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { ExportButton } from "../_components/export-button";
import { ReportAccountLine } from "../actions";
import { useReportExport } from "@/hooks/use-report-export";
import type { ExportColumn } from "@/services/lib/export";
import { flattenTreeRows } from "@/services/lib/export";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useTranslations } from "next-intl";

export default function BalanceSheetPage() {
  const t = useTranslations("Accounting");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();
  const formatDate = useFormatDate();
  const [asOfDate, setAsOfDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // Comparative State
  const [showComparative, setShowComparative] = useState(false);
  const [comparativeDate, setComparativeDate] = useState(
    new Date(new Date().getFullYear() - 1, 11, 31).toISOString().split("T")[0]
  );

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery({
    queryKey: [
      "balance-sheet",
      asOfDate,
      showComparative ? comparativeDate : null,
    ],
    queryFn: async () => {
      const res = await getBalanceSheet(
        asOfDate,
        showComparative ? comparativeDate : undefined
      );
      if (res.success && res.data) {
        return res.data;
      }
      return null;
    },
  });

  // Helper to render total line
  const renderTotalLine = (
    label: string,
    current: number,
    previous?: number
  ) => {
    const change = current - (previous || 0);
    const percent =
      previous && previous !== 0 ? (change / Math.abs(previous)) * 100 : 0;

    const formatPercentage = (val: number) => {
      if (isNaN(val)) return "-";
      return `${val.toFixed(1)}%`;
    };

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
    type: string;
    code: string;
    account: string;
    amount: number;
    previous: number;
    change: number;
    changePercent: string;
  };

  const exportColumns: ExportColumn<ExportRow>[] = [
    { key: "type", header: tCommon("type") },
    { key: "code", header: t("code") },
    { key: "account", header: t("account") },
    { key: "amount", header: t("current") },
    { key: "previous", header: t("previous") },
    { key: "change", header: t("change") },
    { key: "changePercent", header: "%" },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<ExportRow>({
      fetchRows: async () => {
        if (!report) return [];
        const mapNode = (node: ReportAccountLine, depth: number) => ({
          type: "",
          code: node.code,
          account: `${"  ".repeat(depth)}${node.name}`,
          amount: node.amount,
          previous: node.previousAmount || 0,
          change: node.change || 0,
          changePercent: node.changePercentage
            ? `${node.changePercentage.toFixed(1)}%`
            : "0%",
        });
        const withType = (nodes: ReportAccountLine[], type: string) =>
          flattenTreeRows(nodes, mapNode).map(
            (r) => ({ ...r, type }) as ExportRow,
          );
        return [
          ...withType(report.assets, t("assets")),
          ...withType(report.liabilities, t("liabilities")),
          ...withType(report.equity, t("equity")),
          {
            type: tCommon("total"),
            code: "",
            account: t("total_liab_equity"),
            amount: report.totalLiabilitiesAndEquity,
            previous: 0,
            change: 0,
            changePercent: "0%",
          },
        ];
      },
      columns: exportColumns,
      filename: () => `balance-sheet-${asOfDate}`,
      sheetName: "Balance Sheet",
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h1 className="text-lg font-bold">{t("balance_sheet")}</h1>
          <div className="flex items-center gap-4">
            <ExportButton
              onExportCSV={exportCsv}
              onExportExcel={exportExcel}
              isLoading={loading}
              isExporting={isExporting}
              exportingFormat={exportingFormat}
              reportCode="BALANCE_SHEET"
              reportInput={{
                date: asOfDate,
                comparativeDate: showComparative ? comparativeDate : undefined,
              }}
              reportTitle={t("balance_sheet")}
            />
            <Button onClick={() => refetch()} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                t("run_report")
              )}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 bg-muted/20 p-4 rounded-lg border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t("as_of")}:</span>
            <CustomInput
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
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
            <Label htmlFor="comparative">{t("compare")}</Label>
          </div>

          {showComparative && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                {t("comp_date")}:
              </span>
              <CustomInput
                type="date"
                value={comparativeDate}
                onChange={(e) => setComparativeDate(e.target.value)}
                className="w-auto"
              />
            </div>
          )}
        </div>
      </div>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-2xl">
              {t("statement_financial_position")}
            </CardTitle>
            <p className="text-center text-muted-foreground">
              {t("as_of")} {formatDate(asOfDate)}
              {showComparative && ` ${t("compared_to")} ${formatDate(comparativeDate)}`}
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">{t("account")}</TableHead>
                  <TableHead className="text-right">{t("current")}</TableHead>
                  {showComparative && (
                    <>
                      <TableHead className="text-right text-muted-foreground">
                        {t("previous")}
                      </TableHead>
                      <TableHead className="text-right text-muted-foreground">
                        {t("change")}
                      </TableHead>
                      <TableHead className="text-right text-muted-foreground">
                        %
                      </TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Assets */}
                <TableRow className="bg-muted hover:bg-muted">
                  <TableCell
                    colSpan={showComparative ? 5 : 2}
                    className="font-bold text-lg"
                  >
                    {t("assets")}
                  </TableCell>
                </TableRow>
                {report.assets.map((node) => (
                  <AccountTreeRow
                    key={node.accountId}
                    node={node}
                    showComparative={showComparative}
                  />
                ))}
                {renderTotalLine(
                  t("total_assets"),
                  report.totalAssets,
                  report.previousTotalAssets
                )}

                {/* Liabilities */}
                <TableRow className="bg-muted hover:bg-muted">
                  <TableCell
                    colSpan={showComparative ? 5 : 2}
                    className="font-bold text-lg"
                  >
                    {t("liabilities")}
                  </TableCell>
                </TableRow>
                {report.liabilities.map((node) => (
                  <AccountTreeRow
                    key={node.accountId}
                    node={node}
                    showComparative={showComparative}
                  />
                ))}
                {renderTotalLine(
                  t("total_liabilities"),
                  report.totalLiabilities,
                  report.previousTotalLiabilities
                )}

                {/* Equity */}
                <TableRow className="bg-muted hover:bg-muted">
                  <TableCell
                    colSpan={showComparative ? 5 : 2}
                    className="font-bold text-lg"
                  >
                    {t("equity")}
                  </TableCell>
                </TableRow>
                {report.equity.map((node) => (
                  <AccountTreeRow
                    key={node.accountId}
                    node={node}
                    showComparative={showComparative}
                  />
                ))}
                {renderTotalLine(
                  t("total_equity"),
                  report.totalEquity,
                  report.previousTotalEquity
                )}

                {/* Total Liabilities and Equity */}
                <TableRow className="bg-muted font-bold text-lg border-t-4 border-double border-black">
                  <TableCell>{t("total_liab_equity")}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(report.totalLiabilitiesAndEquity)}
                  </TableCell>
                  {showComparative && (
                    <>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(
                          report.previousTotalLiabilitiesAndEquity || 0
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(
                          report.totalLiabilitiesAndEquity -
                          (report.previousTotalLiabilitiesAndEquity || 0)
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right",
                          report.previousTotalLiabilitiesAndEquity &&
                            report.previousTotalLiabilitiesAndEquity !== 0
                            ? (report.totalLiabilitiesAndEquity -
                              report.previousTotalLiabilitiesAndEquity) /
                              Math.abs(
                                report.previousTotalLiabilitiesAndEquity
                              ) <
                              0
                              ? "text-red-500"
                              : "text-green-500"
                            : ""
                        )}
                      >
                        {report.previousTotalLiabilitiesAndEquity &&
                          report.previousTotalLiabilitiesAndEquity !== 0
                          ? (
                            ((report.totalLiabilitiesAndEquity -
                              report.previousTotalLiabilitiesAndEquity) /
                              Math.abs(
                                report.previousTotalLiabilitiesAndEquity
                              )) *
                            100
                          ).toFixed(1) + "%"
                          : "-"}
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
