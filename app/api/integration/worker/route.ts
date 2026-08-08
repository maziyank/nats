import { NextResponse } from "next/server";
import { z } from "zod";
import { runOutboxWorker } from "@/modules/integration/worker";

const workerParamsSchema = z
  .object({
    limitPerBatch: z.coerce.number().finite().optional().catch(undefined),
    maxBatches: z.coerce.number().finite().optional().catch(undefined),
    deadlineMs: z.coerce.number().finite().optional().catch(undefined),
    concurrency: z.coerce.number().finite().optional().catch(undefined),
    drain: z.string().optional(),
    safeMode: z.string().optional(),
  })
  .transform((v) => ({
    limitPerBatch: v.limitPerBatch || undefined,
    maxBatches: v.maxBatches || undefined,
    deadlineMs: v.deadlineMs || undefined,
    concurrency: v.concurrency || undefined,
    drain: v.drain === "true" ? true : undefined,
    safeMode: v.safeMode === "true" ? true : undefined,
  }));

export async function POST(request: Request) {
  const key = request.headers.get("x-integration-dispatch-key");
  if (!process.env.INTEGRATION_DISPATCH_KEY || key !== process.env.INTEGRATION_DISPATCH_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const params = workerParamsSchema.parse(Object.fromEntries(url.searchParams));

  const result = await runOutboxWorker(params);

  return NextResponse.json({ success: true, result });
}
