import { runOutboxWorker } from "@/services/modules/integration/worker";

async function main() {
  const limitPerBatch = process.env.OUTBOX_LIMIT_PER_BATCH
    ? Number(process.env.OUTBOX_LIMIT_PER_BATCH)
    : undefined;
  const maxBatches = process.env.OUTBOX_MAX_BATCHES
    ? Number(process.env.OUTBOX_MAX_BATCHES)
    : undefined;
  const deadlineMs = process.env.OUTBOX_DEADLINE_MS
    ? Number(process.env.OUTBOX_DEADLINE_MS)
    : undefined;
  const concurrency = process.env.OUTBOX_CONCURRENCY
    ? Number(process.env.OUTBOX_CONCURRENCY)
    : undefined;
  const drain = process.env.OUTBOX_DRAIN === "true" ? true : undefined;
  const safeMode = process.env.OUTBOX_SAFE_MODE === "true" ? true : undefined;

  const result = await runOutboxWorker({
    limitPerBatch,
    maxBatches,
    deadlineMs,
    concurrency,
    drain,
    safeMode,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
