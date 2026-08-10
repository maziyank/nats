"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { validateJournalEntries } from "../actions";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useFormatDate } from "@/hooks/use-format-date";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useReportExport } from "@/hooks/use-report-export";
import { ReportExportButton } from "@/components/ui/report-export-button";
import type { ExportColumn } from "@/services/lib/export";

export default function ValidationPage() {
  const formatDate = useFormatDate();
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const {
    data: result,
    isLoading: loading,
    refetch,
  } = useQuery({
    queryKey: ["validation-report", startDate, endDate],
    queryFn: async () => {
      const res = await validateJournalEntries(startDate, endDate);
      if (res.success && res.data) {
        return res.data;
      }
      return null;
    },
    enabled: false, // Don't run on mount, wait for user
  });

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { key: "entryNumber", header: "Entry #" },
    {
      key: "date",
      header: "Date",
      format: (value) =>
        value instanceof Date
          ? value.toISOString().split("T")[0]
          : value
            ? String(value)
            : "",
    },
    { key: "difference", header: "Difference" },
  ];

  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport<Record<string, unknown>>({
      fetchRows: async () =>
        (result?.unbalancedEntries ?? []) as unknown as Array<
          Record<string, unknown>
        >,
      columns: exportColumns,
      filename: () => `validation-issues-${startDate}-${endDate}`,
      sheetName: "Validation",
      estimatedRowCount: result?.unbalancedEntries?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h1 className="text-lg font-bold">Data Integrity Validation</h1>
          <div className="flex items-center gap-4">
            <ReportExportButton
              onExportCsv={exportCsv}
              onExportExcel={exportExcel}
              isExporting={isExporting}
              exportingFormat={exportingFormat}
              disabled={loading || !result?.unbalancedEntries?.length}
            />
            <Button onClick={() => refetch()} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                "Run Check"
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
        </div>
      </div>

      {result && (
        <div className="flex flex-col gap-4">
          {result.unbalancedEntries.length === 0 ? (
            <Alert className="border-green-500 bg-green-50 text-green-900">
              <CheckCircle className="h-4 w-4 !text-green-600" />
              <AlertTitle>Passed</AlertTitle>
              <AlertDescription>
                No data integrity issues found for the selected period. All journal entries are balanced.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Issues Found</AlertTitle>
              <AlertDescription>
                Found {result.unbalancedEntries.length} unbalanced journal entries. These need to be corrected.
              </AlertDescription>
            </Alert>
          )}

          {result.unbalancedEntries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Unbalanced Entries</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entry #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Difference</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.unbalancedEntries.map((entry: any) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">{entry.entryNumber}</TableCell>
                        <TableCell>{formatDate(entry.date)}</TableCell>
                        <TableCell className="text-right font-mono text-red-600">
                          {entry.difference.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="link" size="sm" asChild>
                            <a href={`/accounting/journals/${entry.id}`}>View Entry</a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
