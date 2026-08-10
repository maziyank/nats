"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Printer, FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import { ReportPreviewDialog } from "@/app/[locale]/(dashboard)/reporting/_components/report-preview-dialog";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { downloadCsvClient, buildCsv, type ExportFormat } from "@/services/lib/export";

interface ExportButtonProps {
  onExportCSV?: () => void;
  onExportExcel?: () => void;
  onPrint?: () => void;
  isLoading?: boolean;
  isExporting?: boolean;
  exportingFormat?: ExportFormat | null;

  // PDF Report Props
  reportCode?: string;
  reportInput?: Record<string, unknown>;
  reportTitle?: string;
}

export function ExportButton({
  onExportCSV,
  onExportExcel,
  onPrint,
  isLoading,
  isExporting = false,
  exportingFormat = null,
  reportCode,
  reportInput,
  reportTitle,
}: ExportButtonProps) {
  const t = useTranslations("Common");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handlePrint = () => {
    if (reportCode && reportInput) {
      setIsPreviewOpen(true);
    } else if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  const busy = Boolean(isLoading || isExporting);

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handlePrint} disabled={busy}>
          {reportCode ? <FileText className="mr-2 h-4 w-4" /> : <Printer className="mr-2 h-4 w-4" />}
          {reportCode ? "PDF Preview" : t("print")}
        </Button>
        {(onExportCSV || onExportExcel) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={busy}>
                {isExporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {isExporting ? t("exporting") : t("export")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onExportCSV && (
                <DropdownMenuItem onClick={() => onExportCSV()} disabled={isExporting}>
                  {isExporting && exportingFormat === "csv" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  {t("export_csv")}
                </DropdownMenuItem>
              )}
              {onExportExcel && (
                <DropdownMenuItem onClick={() => onExportExcel()} disabled={isExporting}>
                  {isExporting && exportingFormat === "xlsx" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                  )}
                  {t("export_excel")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {reportCode && reportInput && (
        <ReportPreviewDialog
          isOpen={isPreviewOpen}
          onOpenChange={setIsPreviewOpen}
          code={reportCode}
          input={reportInput}
          title={reportTitle || "Report Preview"}
        />
      )}
    </>
  );
}

/**
 * @deprecated Prefer useReportExport + server generate. Kept for backward compatibility.
 */
export function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (!data || !data.length) return;

  const keys = Object.keys(data[0]);
  const columns = keys.map((key) => ({ key, header: key }));
  const csvContent = buildCsv(data, columns);
  downloadCsvClient(csvContent, filename);
}
