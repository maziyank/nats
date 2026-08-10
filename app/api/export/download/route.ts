import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/services/lib/auth/auth";
import { generateExportFile } from "@/services/lib/export/generate";
import type { ExportColumn, ExportFormat } from "@/services/lib/export/types";
import { EXPORT_LIMITS } from "@/services/lib/export/types";

type ExportBody = {
  rows?: Record<string, unknown>[];
  columns?: ExportColumn[];
  format?: ExportFormat;
  filename?: string;
  sheetName?: string;
};

const exportBodySchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).optional(),
  columns: z
    .array(
      z.object({
        key: z.string(),
        header: z.string(),
        accessor: z.unknown().optional(),
        format: z.unknown().optional(),
      }),
    )
    .optional(),
  format: z.enum(["csv", "xlsx"]).optional(),
  filename: z.string().optional(),
  sheetName: z.string().optional(),
});

/**
 * Binary export download — avoids base64 triple-copy over the server-action path.
 * Client POSTs plain rows; response is application/octet-stream with Content-Disposition.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ExportBody;
  try {
    body = (await request.json()) as ExportBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = exportBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  body = parsed.data as unknown as ExportBody;

  const rows = body.rows ?? [];
  const columns = body.columns ?? [];
  const format: ExportFormat = body.format === "xlsx" ? "xlsx" : "csv";
  const filename = body.filename ?? "export";
  const sheetName = body.sheetName;

  if (!columns.length) {
    return NextResponse.json({ error: "No columns defined" }, { status: 400 });
  }
  if (!rows.length) {
    return NextResponse.json({ error: "No data available to export" }, { status: 400 });
  }
  if (rows.length > EXPORT_LIMITS.MAX_ROW_COUNT) {
    return NextResponse.json(
      {
        error: `Export exceeds the maximum of ${EXPORT_LIMITS.MAX_ROW_COUNT.toLocaleString()} rows`,
      },
      { status: 413 },
    );
  }

  const result = await generateExportFile({
    rows,
    columns,
    format,
    filename,
    sheetName,
    userId: session.userId,
  });

  if (!result.success) {
    const status =
      result.code === "RATE_LIMITED"
        ? 429
        : result.code === "TOO_LARGE"
          ? 413
          : result.code === "EMPTY"
            ? 400
            : 500;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  // Prefer raw buffer to avoid base64 encode → decode round-trip.
  const bytes = result.buffer ?? Buffer.from(result.base64, "base64");
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": result.mimeType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Content-Length": String(bytes.length),
      "X-Export-Row-Count": String(result.rowCount),
      "Cache-Control": "no-store",
    },
  });
}
