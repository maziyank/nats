import type { ExportColumn } from "./types";

/**
 * Resolve a single cell value from a row using column config.
 */
export function resolveCellValue<T>(
  row: T,
  column: ExportColumn<T>,
): string | number | boolean | null {
  const raw = column.accessor
    ? column.accessor(row)
    : (row as Record<string, unknown>)[column.key];

  const formatted = column.format ? column.format(raw, row) : raw;

  if (formatted === null || formatted === undefined) return null;
  if (formatted instanceof Date) return formatted.toISOString();
  if (typeof formatted === "object") {
    // Decimal.js / Prisma Decimal / nested objects
    if (
      typeof (formatted as { toNumber?: () => number }).toNumber === "function"
    ) {
      return (formatted as { toNumber: () => number }).toNumber();
    }
    if (
      typeof (formatted as { toString?: () => string }).toString === "function"
    ) {
      const str = (formatted as { toString: () => string }).toString();
      // Avoid "[object Object]"
      if (str !== "[object Object]") return str;
    }
    try {
      return JSON.stringify(formatted);
    } catch {
      return String(formatted);
    }
  }
  if (
    typeof formatted === "string" ||
    typeof formatted === "number" ||
    typeof formatted === "boolean"
  ) {
    return formatted;
  }
  return String(formatted);
}

/**
 * Flatten nested tree rows (e.g. account trees) into a flat list.
 */
export function flattenTreeRows<T extends { children?: T[] }>(
  nodes: T[],
  mapRow: (node: T, depth: number) => Record<string, unknown>,
  depth = 0,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const node of nodes) {
    rows.push(mapRow(node, depth));
    if (node.children?.length) {
      rows.push(...flattenTreeRows(node.children, mapRow, depth + 1));
    }
  }
  return rows;
}

/**
 * Sanitize a filename base (no extension).
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^\w\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "export";
}

/**
 * Convert rows + columns into a matrix of primitive cell values.
 */
export function rowsToMatrix<T>(
  rows: T[],
  columns: ExportColumn<T>[],
): (string | number | boolean | null)[][] {
  return rows.map((row) => columns.map((col) => resolveCellValue(row, col)));
}
