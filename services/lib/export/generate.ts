import { csvToBuffer } from "./csv";
import { buildExcelBuffer } from "./excel";
import { checkExportRateLimit } from "./rate-limit";
import {
  EXPORT_LIMITS,
  type ExportColumn,
  type ExportFormat,
  type ExportResult,
} from "./types";
import { sanitizeFilename } from "./utils";

export type GenerateExportInput<T = Record<string, unknown>> = {
  rows: T[];
  columns: ExportColumn<T>[];
  format: ExportFormat;
  filename: string;
  sheetName?: string;
  userId?: string;
  /** Skip rate limit (e.g. internal/tests). */
  skipRateLimit?: boolean;
};

/**
 * Validate size, apply rate limit, and generate CSV or Excel file bytes.
 */
export async function generateExportFile<T>(
  input: GenerateExportInput<T>,
): Promise<ExportResult> {
  const { rows, columns, format, sheetName, userId, skipRateLimit } = input;

  if (!columns.length) {
    return { success: false, error: "No columns defined for export", code: "FAILED" };
  }

  if (!rows.length) {
    return {
      success: false,
      error: "No data available to export",
      code: "EMPTY",
    };
  }

  if (rows.length > EXPORT_LIMITS.MAX_ROW_COUNT) {
    return {
      success: false,
      error: `Export exceeds the maximum of ${EXPORT_LIMITS.MAX_ROW_COUNT.toLocaleString()} rows. Please narrow your filters.`,
      code: "TOO_LARGE",
    };
  }

  if (!skipRateLimit && userId) {
    const rate = checkExportRateLimit(userId);
    if (!rate.allowed) {
      const seconds = Math.ceil(rate.retryAfterMs / 1000);
      return {
        success: false,
        error: `Too many exports. Please try again in ${seconds}s.`,
        code: "RATE_LIMITED",
      };
    }
  }

  const baseName = sanitizeFilename(input.filename);
  const extension = format === "xlsx" ? "xlsx" : "csv";
  const filename = `${baseName}.${extension}`;

  try {
    let buffer: Buffer;
    let mimeType: string;

    if (format === "xlsx") {
      buffer = await buildExcelBuffer(rows, columns, sheetName ?? "Report");
      mimeType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else {
      buffer = csvToBuffer(rows, columns);
      mimeType = "text/csv;charset=utf-8";
    }

    return {
      success: true,
      filename,
      mimeType,
      // Keep base64 for server-action clients; buffer for binary API (no triple-copy).
      base64: buffer.toString("base64"),
      buffer,
      rowCount: rows.length,
    };
  } catch (error) {
    console.error("Export generation failed:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate export file",
      code: "FAILED",
    };
  }
}
