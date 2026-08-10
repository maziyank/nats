import type { ExportColumn } from "./types";
import { resolveCellValue } from "./utils";

function escapeCsvValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Escape if value contains special CSV characters
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build a CSV string (UTF-8 with BOM for Excel compatibility).
 */
export function buildCsv<T>(
  rows: T[],
  columns: ExportColumn<T>[],
): string {
  const headerLine = columns.map((c) => escapeCsvValue(c.header)).join(",");
  const dataLines = rows.map((row) =>
    columns
      .map((col) => escapeCsvValue(resolveCellValue(row, col)))
      .join(","),
  );
  // BOM helps Excel open UTF-8 correctly
  return "\uFEFF" + [headerLine, ...dataLines].join("\n");
}

export function csvToBuffer<T>(
  rows: T[],
  columns: ExportColumn<T>[],
): Buffer {
  return Buffer.from(buildCsv(rows, columns), "utf-8");
}
