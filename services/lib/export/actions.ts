"use server";

import { getSession } from "@/services/lib/auth/auth";
import { generateExportFile, type GenerateExportInput } from "./generate";
import type { ExportColumn, ExportFormat, ExportResult } from "./types";
import { EXPORT_LIMITS } from "./types";

export type ServerExportPayload = {
  /** Pre-serialized plain rows (no class instances). */
  rows: Record<string, unknown>[];
  columns: ExportColumn[];
  format: ExportFormat;
  filename: string;
  sheetName?: string;
};

/**
 * Server-side export generation with auth + rate limiting.
 * Prefer sending already-fetched full datasets from report server actions,
 * or call this after a dedicated full-fetch action.
 */
export async function createExportFile(
  payload: ServerExportPayload,
): Promise<ExportResult> {
  const session = await getSession();
  if (!session) {
    return {
      success: false,
      error: "Unauthorized",
      code: "UNAUTHORIZED",
    };
  }

  return generateExportFile({
    rows: payload.rows,
    columns: payload.columns,
    format: payload.format,
    filename: payload.filename,
    sheetName: payload.sheetName,
    userId: session.userId,
  } satisfies GenerateExportInput);
}

/**
 * Lightweight pre-check for large exports (used by UI before confirming).
 */
export async function getExportLimits() {
  return {
    warnRowCount: EXPORT_LIMITS.WARN_ROW_COUNT,
    maxRowCount: EXPORT_LIMITS.MAX_ROW_COUNT,
  };
}
