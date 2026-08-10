"use client";
export const dynamic = "force-dynamic";

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { getTaxSummaryReport, TaxSummaryEntry } from "./actions"
import { Button } from "@/components/ui/button"
import { CustomInput } from "@/components/ui/custom-input"
import { Loader2, PrinterIcon } from "lucide-react"
import { useFormatCurrency } from "@/hooks/use-format-currency"
import { cn } from "@/services/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useReportExport } from "@/hooks/use-report-export";
import { ReportExportButton } from "@/components/ui/report-export-button";
import type { ExportColumn } from "@/services/lib/export";

export default function TaxSummaryPage() {
  const formatCurrency = useFormatCurrency()
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
  )
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  )

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery({
    queryKey: ["tax-summary", startDate, endDate],
    queryFn: async () => {
      return await getTaxSummaryReport(new Date(startDate), new Date(endDate))
    },
  })

  const totalInputTax = report?.reduce((sum, item) => sum + item.inputTax, 0) || 0
  const totalOutputTax = report?.reduce((sum, item) => sum + item.outputTax, 0) || 0
  const netLiability = totalOutputTax - totalInputTax


  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "name", header: "Tax" },
    { key: "code", header: "Code" },
    { key: "rate", header: "Rate %" },
    { key: "outputBase", header: "Output Base" },
    { key: "outputTax", header: "Output Tax" },
    { key: "inputBase", header: "Input Base" },
    { key: "inputTax", header: "Input Tax" },
    { key: "netTax", header: "Net Tax" },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (report ?? []) as unknown as Array<Record<string, unknown>>,
      columns: exportColumns,
      filename: () => `accounting-tax-summary-${startDate}-${endDate}`,
      sheetName: "Tax Summary",
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h1 className="text-lg font-bold">Tax Summary Report</h1>
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
              Print
            </Button>
            <Button onClick={() => refetch()} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                "Run Report"
              )}
            </Button>
          </div>
        </div>

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
        </div>

        {report && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Output Tax (Sales)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totalOutputTax)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Input Tax (Purchases)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totalInputTax)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Net Tax Liability
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={cn("text-2xl font-bold", netLiability > 0 ? "text-red-600" : "text-green-600")}>
                    {formatCurrency(netLiability)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {netLiability > 0 ? "Payable to Tax Authority" : "Refundable / Credit"}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tax Rate</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="text-right">Sales (Base)</TableHead>
                    <TableHead className="text-right">Output Tax</TableHead>
                    <TableHead className="text-right">Purchases (Base)</TableHead>
                    <TableHead className="text-right">Input Tax</TableHead>
                    <TableHead className="text-right">Net Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                        No tax data found for this period.
                      </TableCell>
                    </TableRow>
                  )}
                  {report.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.code}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.outputBase)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.outputTax)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.inputBase)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.inputTax)}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(item.netTax)}</TableCell>
                    </TableRow>
                  ))}
                  {report.length > 0 && (
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={2}>Total</TableCell>
                      <TableCell className="text-right">{formatCurrency(report.reduce((s, i) => s + i.outputBase, 0))}</TableCell>
                      <TableCell className="text-right">{formatCurrency(totalOutputTax)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(report.reduce((s, i) => s + i.inputBase, 0))}</TableCell>
                      <TableCell className="text-right">{formatCurrency(totalInputTax)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(netLiability)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
