"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getSlowMovingReport,
  type SlowMovingEntry,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CustomInput } from "@/components/ui/custom-input";
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
import { useReportExport } from "@/hooks/use-report-export";
import { ReportExportButton } from "@/components/ui/report-export-button";

function StatusBadge({
  status,
  labels,
}: {
  status: SlowMovingEntry["status"];
  labels: Record<SlowMovingEntry["status"], string>;
}) {
  const variant =
    status === "dead"
      ? "destructive"
      : status === "no_movement"
        ? "secondary"
        : "outline";
  return <Badge variant={variant}>{labels[status]}</Badge>;
}

export default function SlowMovingReportPage() {
  const t = useTranslations("Inventory");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();

  const [asOfDate, setAsOfDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [inactiveDays, setInactiveDays] = useState("90");

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery<SlowMovingEntry[]>({
    queryKey: ["slow-moving-report", asOfDate, inactiveDays],
    queryFn: () =>
      getSlowMovingReport(new Date(asOfDate), Number(inactiveDays) || 90),
  });

  const statusLabels: Record<SlowMovingEntry["status"], string> = {
    dead: t("reports_status_dead"),
    slow: t("reports_status_slow"),
    no_movement: t("reports_status_no_movement"),
  };

  const totals = report?.reduce(
    (acc, item) => {
      acc.quantity += item.quantity;
      acc.stockValue += item.stockValue;
      return acc;
    },
    { quantity: 0, stockValue: 0 },
  );


  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport({
      serverJobId: "inventory.slow_moving",
      serverJobContext: () => ({ asOfDate, inactiveDays }),
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_slow_moving_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_slow_moving_subheading")}
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
            <span className="text-sm font-medium">{t("reports_as_of")}</span>
            <CustomInput
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {t("reports_inactive_days")}
            </span>
            <CustomSelect
              value={inactiveDays}
              onValueChange={setInactiveDays}
              containerClassName="w-[120px]"
            >
              <SelectItem value="30">30</SelectItem>
              <SelectItem value="60">60</SelectItem>
              <SelectItem value="90">90</SelectItem>
              <SelectItem value="180">180</SelectItem>
              <SelectItem value="365">365</SelectItem>
            </CustomSelect>
          </div>
          {report && (
            <span className="text-sm text-muted-foreground">
              {report.length} {t("reports_items_flagged")} ·{" "}
              {formatCurrency(totals?.stockValue ?? 0)}{" "}
              {t("reports_tied_up_value")}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : report && report.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports_col_status")}</TableHead>
                  <TableHead>{t("reports_col_sku")}</TableHead>
                  <TableHead>{t("reports_col_product")}</TableHead>
                  <TableHead>{t("reports_col_category")}</TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_qty")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_unit_cost")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_stock_value")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_last_movement")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_days_idle")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((item) => (
                  <TableRow key={item.productId}>
                    <TableCell>
                      <StatusBadge status={item.status} labels={statusLabels} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {item.productSku}
                    </TableCell>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.categoryName ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.quantity}
                      {item.unitSymbol ? ` ${item.unitSymbol}` : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.unitCost)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.stockValue)}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {item.lastMovementDate
                        ? new Date(item.lastMovementDate).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {item.daysSinceMovement ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={4}>{tCommon("total")}</TableCell>
                  <TableCell className="text-center">
                    {totals!.quantity}
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-right">
                    {formatCurrency(totals!.stockValue)}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            {t("reports_no_slow_moving")}
          </div>
        )}
      </div>
    </div>
  );
}
