import { dispatchPendingIntegrationEvents } from "@/services/modules/integration/outbox";

export type RunOutboxWorkerResult = {
  attempted: number;
  processed: number;
  failed: number;
  batches: number;
  finishedBecause: "drained" | "deadline" | "max_batches";
};

type SafeModeConfig = {
  enabled: boolean;
  limitPerBatch: number;
  maxBatches: number;
  deadlineMs: number;
  concurrency: number;
};

function getIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function getSafeModeConfig(): SafeModeConfig {
  return {
    enabled: process.env.OUTBOX_SAFE_MODE === "true",
    limitPerBatch: getIntEnv("OUTBOX_SAFE_MODE_LIMIT_PER_BATCH", 10),
    maxBatches: getIntEnv("OUTBOX_SAFE_MODE_MAX_BATCHES", 10),
    deadlineMs: getIntEnv("OUTBOX_SAFE_MODE_DEADLINE_MS", 10_000),
    concurrency: getIntEnv("OUTBOX_SAFE_MODE_CONCURRENCY", 1),
  };
}

export async function runOutboxWorker(options?: {
  limitPerBatch?: number;
  maxBatches?: number;
  deadlineMs?: number;
  concurrency?: number;
  drain?: boolean;
  safeMode?: boolean;
}): Promise<RunOutboxWorkerResult> {
  const safeModeConfig = getSafeModeConfig();
  const safeMode = options?.safeMode ?? safeModeConfig.enabled;

  let limitPerBatch = options?.limitPerBatch ?? (safeMode ? safeModeConfig.limitPerBatch : 50);
  let maxBatches = options?.maxBatches ?? (safeMode ? safeModeConfig.maxBatches : 25);
  let deadlineMs = options?.deadlineMs ?? (safeMode ? safeModeConfig.deadlineMs : 25_000);
  let concurrency = options?.concurrency ?? (safeMode ? safeModeConfig.concurrency : 4);
  const drain = options?.drain ?? false;

  if (safeMode) {
    limitPerBatch = Math.min(limitPerBatch, safeModeConfig.limitPerBatch);
    maxBatches = Math.min(maxBatches, safeModeConfig.maxBatches);
    deadlineMs = Math.min(deadlineMs, safeModeConfig.deadlineMs);
    concurrency = Math.min(concurrency, safeModeConfig.concurrency);
  }

  const startedAt = Date.now();
  const deadlineAt = startedAt + deadlineMs;

  let attempted = 0;
  let processed = 0;
  let failed = 0;
  let batches = 0;

  while (drain || batches < maxBatches) {
    if (Date.now() > deadlineAt) {
      return { attempted, processed, failed, batches, finishedBecause: "deadline" };
    }

    const batch = await dispatchPendingIntegrationEvents({
      limit: limitPerBatch,
      concurrency,
    });
    batches += 1;
    attempted += batch.attempted;
    processed += batch.processed;
    failed += batch.failed;

    if (batch.attempted === 0) {
      return { attempted, processed, failed, batches, finishedBecause: "drained" };
    }
  }

  return { attempted, processed, failed, batches, finishedBecause: "max_batches" };
}
