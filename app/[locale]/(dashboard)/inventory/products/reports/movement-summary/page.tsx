"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getMovementSummaryReport,
  getReportFilterOptions,
  type MovementSummaryEntry,
} from "../actions";
import { Button } from "@/components/ui/button";
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

export default function MovementSummaryReportPage() {
  const t = useTranslations("Inventory");
  const tCommon = useTranslations("Common");
  const formatCurrency = useFormatCurrency();

  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [warehouseId, setWarehouseId] = useState("ALL");
  const [categoryId, setCategoryId] = useState("ALL");

  const { data: filters } = useQuery({
    queryKey: ["product-report-filters"],
    queryFn: getReportFilterOptions,
  });

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery<MovementSummaryEntry[]>({
    queryKey: [
      "movement-summary-report",
      startDate,
      endDate,
      warehouseId,
      categoryId,
    ],
    queryFn: () =>
      getMovementSummaryReport(new Date(startDate), new Date(endDate), {
        warehouseId: warehouseId === "ALL" ? undefined : warehouseId,
        categoryId: categoryId === "ALL" ? undefined : categoryId,
      }),
  });

  const totals = report?.reduce(
    (acc, item) => {
      acc.qtyIn += item.qtyIn;
      acc.qtyOut += item.qtyOut;
      acc.qtyTransfer += item.qtyTransfer;
      acc.qtyAdjustment += item.qtyAdjustment;
      acc.qtyProductionIn += item.qtyProductionIn;
      acc.qtyProductionOut += item.qtyProductionOut;
      acc.netChange += item.netChange;
      acc.totalCostIn += item.totalCostIn;
      acc.totalCostOut += item.totalCostOut;
      return acc;
    },
    {
      qtyIn: 0,
      qtyOut: 0,
      qtyTransfer: 0,
      qtyAdjustment: 0,
      qtyProductionIn: 0,
      qtyProductionOut: 0,
      netChange: 0,
      totalCostIn: 0,
      totalCostOut: 0,
    },
  );


  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport({
      serverJobId: "inventory.movement_summary",
      serverJobContext: () => ({ startDate, endDate, warehouseId, categoryId }),
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">
              {t("reports_movement_summary_heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_movement_summary_subheading")}
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
          <CustomSelect
            value={warehouseId}
            onValueChange={setWarehouseId}
            containerClassName="w-[180px]"
            placeholder={t("warehouse")}
          >
            <SelectItem value="ALL">{t("all_warehouses")}</SelectItem>
            {filters?.warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </CustomSelect>
          <CustomSelect
            value={categoryId}
            onValueChange={setCategoryId}
            containerClassName="w-[180px]"
            placeholder={t("categories")}
          >
            <SelectItem value="ALL">{t("all_categories")}</SelectItem>
            {filters?.categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </CustomSelect>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : report && report.length > 0 ? (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports_col_sku")}</TableHead>
                  <TableHead>{t("reports_col_product")}</TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_in")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_out")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_transfer")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_adjustment")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_prod_in")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_prod_out")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_net_change")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_cost_in")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports_col_cost_out")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((item) => (
                  <TableRow key={item.productId}>
                    <TableCell className="font-medium">
                      {item.productSku}
                    </TableCell>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell className="text-center text-emerald-600">
                      {item.qtyIn || "—"}
                    </TableCell>
                    <TableCell className="text-center text-red-600">
                      {item.qtyOut || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.qtyTransfer || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.qtyAdjustment || "—"}
                    </TableCell>
                    <TableCell className="text-center text-emerald-600">
                      {item.qtyProductionIn || "—"}
                    </TableCell>
                    <TableCell className="text-center text-red-600">
                      {item.qtyProductionOut || "—"}
                    </TableCell>
                    <TableCell
                      className={
                        "text-center font-medium " +
                        (item.netChange > 0
                          ? "text-emerald-600"
                          : item.netChange < 0
                            ? "text-red-600"
                            : "")
                      }
                    >
                      {item.netChange > 0 ? "+" : ""}
                      {item.netChange}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.totalCostIn)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.totalCostOut)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={2}>{tCommon("total")}</TableCell>
                  <TableCell className="text-center">{totals!.qtyIn}</TableCell>
                  <TableCell className="text-center">{totals!.qtyOut}</TableCell>
                  <TableCell className="text-center">
                    {totals!.qtyTransfer}
                  </TableCell>
                  <TableCell className="text-center">
                    {totals!.qtyAdjustment}
                  </TableCell>
                  <TableCell className="text-center">
                    {totals!.qtyProductionIn}
                  </TableCell>
                  <TableCell className="text-center">
                    {totals!.qtyProductionOut}
                  </TableCell>
                  <TableCell className="text-center">
                    {totals!.netChange > 0 ? "+" : ""}
                    {totals!.netChange}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.totalCostIn)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals!.totalCostOut)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            {t("reports_no_data")}
          </div>
        )}
      </div>
    </div>
  );
}
