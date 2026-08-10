"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/hooks/use-toast";
import {
  downloadBlob,
  EXPORT_LIMITS,
  type ExportColumn,
  type ExportFormat,
} from "@/services/lib/export";

export type UseReportExportOptions<T> = {
  /**
   * Async fetcher that returns the FULL unpaginated dataset for export.
   * Prefer `serverJobId` for large reports so rows stay on the server.
   */
  fetchRows?: () => Promise<T[]>;
  /**
   * Server-side export job id (see lib/export/registry).
   * When set, the client only sends jobId + context — no row payload.
   */
  serverJobId?: string;
  /** Context passed to the server export job (filters, dates, etc.). */
  serverJobContext?: Record<string, unknown> | (() => Record<string, unknown>);
  /** Column definitions for the export file. Optional when using serverJobId. */
  columns?: ExportColumn<T>[] | (() => ExportColumn<T>[]);
  /** Base filename without extension. Optional when using serverJobId. */
  filename?: string | (() => string);
  /** Excel sheet name. */
  sheetName?: string;
  /** Optional estimated/known row count for large-export warning before fetch. */
  estimatedRowCount?: number;
};

export function useReportExport<T extends Record<string, unknown>>(
  options: UseReportExportOptions<T>,
) {
  const t = useTranslations("Common");
  const [isExporting, setIsExporting] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(
    null,
  );

  const runExport = useCallback(
    async (format: ExportFormat) => {
      if (isExporting) return;

      const estimated = options.estimatedRowCount;
      if (
        typeof estimated === "number" &&
        estimated > EXPORT_LIMITS.WARN_ROW_COUNT
      ) {
        const proceed = window.confirm(
          t("export_large_dataset_warning", {
            count: estimated.toLocaleString(),
            max: EXPORT_LIMITS.MAX_ROW_COUNT.toLocaleString(),
          }),
        );
        if (!proceed) return;
      }

      setIsExporting(true);
      setExportingFormat(format);

      try {
        // Prefer server-side job (rows never leave the server).
        if (options.serverJobId) {
          const context =
            typeof options.serverJobContext === "function"
              ? options.serverJobContext()
              : (options.serverJobContext ?? {});

          const response = await fetch("/api/export/job", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobId: options.serverJobId,
              format,
              context,
            }),
          });

          if (!response.ok) {
            let message = t("export_failed");
            try {
              const err = (await response.json()) as { error?: string };
              if (err.error) message = err.error;
            } catch {
              // ignore
            }
            toast({
              title: t("error"),
              description: message,
              variant: "destructive",
            });
            return;
          }

          const blob = await response.blob();
          const disposition = response.headers.get("Content-Disposition") ?? "";
          const match = /filename="([^"]+)"/.exec(disposition);
          const downloadName =
            match?.[1] ?? `export.${format === "xlsx" ? "xlsx" : "csv"}`;
          const rowCount = Number(
            response.headers.get("X-Export-Row-Count") ?? 0,
          );

          downloadBlob(blob, downloadName);
          toast({
            title: t("success"),
            description: t("export_success", { count: rowCount }),
          });
          return;
        }

        if (!options.fetchRows) {
          toast({
            title: t("error"),
            description: t("export_failed"),
            variant: "destructive",
          });
          return;
        }

        const rows = await options.fetchRows();

        if (!rows.length) {
          toast({
            title: t("error"),
            description: t("export_no_data"),
            variant: "destructive",
          });
          return;
        }

        if (rows.length > EXPORT_LIMITS.MAX_ROW_COUNT) {
          toast({
            title: t("error"),
            description: t("export_too_large", {
              max: EXPORT_LIMITS.MAX_ROW_COUNT.toLocaleString(),
            }),
            variant: "destructive",
          });
          return;
        }

        // Confirm after fetch if we didn't know the size and it's large
        if (
          (estimated === undefined ||
            estimated <= EXPORT_LIMITS.WARN_ROW_COUNT) &&
          rows.length > EXPORT_LIMITS.WARN_ROW_COUNT
        ) {
          const proceed = window.confirm(
            t("export_large_dataset_warning", {
              count: rows.length.toLocaleString(),
              max: EXPORT_LIMITS.MAX_ROW_COUNT.toLocaleString(),
            }),
          );
          if (!proceed) return;
        }

        const columns =
          typeof options.columns === "function"
            ? options.columns()
            : options.columns;
        if (!columns?.length) {
          toast({
            title: t("error"),
            description: t("export_failed"),
            variant: "destructive",
          });
          return;
        }

        const filename =
          typeof options.filename === "function"
            ? options.filename()
            : (options.filename ?? "export");

        // Serialize rows to plain objects (strip class instances / accessors)
        const plainRows = rows.map((row) => {
          const plain: Record<string, unknown> = {};
          for (const col of columns) {
            if (col.accessor) {
              plain[col.key] = col.accessor(row);
            } else {
              plain[col.key] = row[col.key as keyof T];
            }
          }
          return plain;
        });

        const plainColumns: ExportColumn[] = columns.map((col) => ({
          key: col.key,
          header: col.header,
        }));

        // Binary API avoids base64 triple-copy of large files over server actions.
        const response = await fetch("/api/export/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: plainRows,
            columns: plainColumns,
            format,
            filename,
            sheetName: options.sheetName,
          }),
        });

        if (!response.ok) {
          let message = t("export_failed");
          try {
            const err = (await response.json()) as { error?: string };
            if (err.error) message = err.error;
          } catch {
            // ignore parse errors
          }
          toast({
            title: t("error"),
            description: message,
            variant: "destructive",
          });
          return;
        }

        const blob = await response.blob();
        const disposition = response.headers.get("Content-Disposition") ?? "";
        const match = /filename="([^"]+)"/.exec(disposition);
        const downloadName =
          match?.[1] ??
          `${filename}.${format === "xlsx" ? "xlsx" : "csv"}`;
        const rowCount = Number(
          response.headers.get("X-Export-Row-Count") ?? plainRows.length,
        );

        downloadBlob(blob, downloadName);

        toast({
          title: t("success"),
          description: t("export_success", { count: rowCount }),
        });
      } catch (error) {
        console.error("Export failed:", error);
        toast({
          title: t("error"),
          description:
            error instanceof Error ? error.message : t("export_failed"),
          variant: "destructive",
        });
      } finally {
        setIsExporting(false);
        setExportingFormat(null);
      }
    },
    [isExporting, options, t],
  );

  return {
    isExporting,
    exportingFormat,
    exportCsv: () => runExport("csv"),
    exportExcel: () => runExport("xlsx"),
    runExport,
  };
}
