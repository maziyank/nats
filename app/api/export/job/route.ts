import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";
import { generateExportFile } from "@/services/lib/export/generate";
import type { ExportFormat } from "@/services/lib/export/types";
import { EXPORT_LIMITS } from "@/services/lib/export/types";
import { getExportJob } from "@/services/lib/export/registry";

type JobBody = {
  jobId?: string;
  format?: ExportFormat;
  context?: Record<string, unknown>;
};

const jobBodySchema = z.object({
  jobId: z.string().min(1, "jobId is required"),
  format: z.enum(["csv", "xlsx"]).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Server-side export job runner.
 * Client only sends jobId + context; rows are fetched and serialized on the server.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: JobBody;
  try {
    body = (await request.json()) as JobBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = jobBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }
  body = parsed.data;

  const jobId = body.jobId;
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const job = getExportJob(jobId);
  if (!job) {
    return NextResponse.json({ error: `Unknown export job: ${jobId}` }, { status: 404 });
  }

  if (!hasPermission(session.permissions, job.permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const format: ExportFormat = body.format === "xlsx" ? "xlsx" : "csv";
  const context = body.context ?? {};

  let rows: Record<string, unknown>[];
  try {
    rows = await job.fetchRows(context);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch export rows";
    return NextResponse.json({ error: message }, { status: 500 });
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

  // Flatten rows to plain column keys for the generator
  const plainRows = rows.map((row) => {
    const plain: Record<string, unknown> = {};
    for (const col of job.columns) {
      plain[col.key] = row[col.key];
    }
    return plain;
  });

  const result = await generateExportFile({
    rows: plainRows,
    columns: job.columns,
    format,
    filename: job.filename(context),
    sheetName: job.sheetName,
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
