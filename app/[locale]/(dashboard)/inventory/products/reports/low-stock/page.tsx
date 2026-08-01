"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getLowStockReport,
  getReportFilterOptions,
  type LowStockEntry,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CustomSelect } from "@/components/ui/custom-select";
import { SelectItem } from "@/components/ui/select";
import { Loader2, PrinterIcon } from "lucide-react";
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
  status: LowStockEntry["status"];
  labels: Record<LowStockEntry["status"], string>;
}) {
  const variant =
    status === "out_of_stock"
      ? "destructive"
      : status === "below_min"
        ? "secondary"
        : "outline";
  return <Badge variant={variant}>{labels[status]}</Badge>;
}

export default function LowStockReportPage() {
  const t = useTranslations("Inventory");
  const tCommon = useTranslations("Common");

  const [warehouseId, setWarehouseId] = useState("ALL");

  const { data: filters } = useQuery({
    queryKey: ["product-report-filters"],
    queryFn: getReportFilterOptions,
  });

  const {
    data: report,
    isLoading: loading,
    refetch,
  } = useQuery<LowStockEntry[]>({
    queryKey: ["low-stock-report", warehouseId],
    queryFn: () =>
      getLowStockReport({
        warehouseId: warehouseId === "ALL" ? undefined : warehouseId,
      }),
  });

  const statusLabels: Record<LowStockEntry["status"], string> = {
    out_of_stock: t("reports_status_out_of_stock"),
    below_min: t("reports_status_below_min"),
    below_reorder: t("reports_status_below_reorder"),
  };


  const { isExporting, exportingFormat, exportCsv, exportExcel } =
    useReportExport({
      serverJobId: "inventory.low_stock",
      serverJobContext: () => ({ warehouseId }),
      estimatedRowCount: report?.length,
    });

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="mb-2">
            <h1 className="text-lg font-bold">{t("reports_low_stock_heading")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("reports_low_stock_subheading")}
            </p>
          </div>ƒ
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
          <CustomSelect
            value={warehouseId}
            onValueChange={setWarehouseId}
            containerClassName="w-[200px]"
            placeholder={t("warehouse")}
          >
            <SelectItem value="ALL">{t("all_warehouses")}</SelectItem>
            {filters?.warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </CustomSelect>
          {report && (
            <span className="text-sm text-muted-foreground">
              {report.length} {t("reports_items_flagged")}
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
                  <TableHead>{t("warehouse")}</TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_on_hand")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_available")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("min_stock")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reorder_point")}
                  </TableHead>
                  <TableHead className="text-center">
                    {t("reports_col_deficit")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((item, idx) => (
                  <TableRow key={`${item.productId}-${item.warehouseId}-${idx}`}>
                    <TableCell>
                      <StatusBadge status={item.status} labels={statusLabels} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {item.productSku}
                    </TableCell>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.warehouseName}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.quantity}
                      {item.unitSymbol ? ` ${item.unitSymbol}` : ""}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.availableQty}
                    </TableCell>
                    <TableCell className="text-center">{item.minStock}</TableCell>
                    <TableCell className="text-center">
                      {item.reorderPoint}
                    </TableCell>
                    <TableCell className="text-center font-medium text-destructive">
                      {item.deficit}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            {t("reports_no_low_stock")}
          </div>
        )}
      </div>
    </div>
  );
}
