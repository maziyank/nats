"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ExportFormat } from "@/services/lib/export";

export type ReportExportButtonProps = {
  onExportCsv: () => void | Promise<void>;
  onExportExcel: () => void | Promise<void>;
  isExporting?: boolean;
  exportingFormat?: ExportFormat | null;
  disabled?: boolean;
  /** Optional extra class on the trigger button. */
  className?: string;
  /** Show labels on the trigger (default true for sm+). */
  size?: "sm" | "default";
};

/**
 * Consistent export dropdown for all report pages (CSV + Excel).
 */
export function ReportExportButton({
  onExportCsv,
  onExportExcel,
  isExporting = false,
  exportingFormat = null,
  disabled = false,
  className,
  size = "sm",
}: ReportExportButtonProps) {
  const t = useTranslations("Common");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={size}
          disabled={disabled || isExporting}
          className={className}
        >
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {isExporting
            ? t("exporting")
            : t("export")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => onExportCsv()}
          disabled={isExporting}
        >
          {isExporting && exportingFormat === "csv" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileText className="mr-2 h-4 w-4" />
          )}
          {t("export_csv")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onExportExcel()}
          disabled={isExporting}
        >
          {isExporting && exportingFormat === "xlsx" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="mr-2 h-4 w-4" />
          )}
          {t("export_excel")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
