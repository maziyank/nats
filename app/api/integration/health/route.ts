import { NextResponse } from "next/server";
import { prisma } from "@/services/lib/prisma";

function getIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

export async function GET(request: Request) {
  const key = request.headers.get("x-integration-dispatch-key");
  if (!process.env.INTEGRATION_DISPATCH_KEY || key !== process.env.INTEGRATION_DISPATCH_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const alertOldestPendingSeconds = getIntEnv("OUTBOX_ALERT_OLDEST_PENDING_SECONDS", 60 * 60);
  const alertStuckProcessingCount = getIntEnv("OUTBOX_ALERT_STUCK_PROCESSING_COUNT", 1);
  const alertDeadCount = getIntEnv("OUTBOX_ALERT_DEAD_COUNT", 1);
  const warnFailedLastHourCount = getIntEnv("OUTBOX_WARN_FAILED_LAST_HOUR_COUNT", 1);

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const lockTimeoutMs = getIntEnv("INTEGRATION_LOCK_TIMEOUT_MS", 60_000);
  const staleBefore = new Date(now.getTime() - lockTimeoutMs);

  const [pending, failed, processing, dead, stuckProcessing, oldestPending, processedLastHour, failedLastHour] =
    await Promise.all([
      prisma.integrationOutbox.count({ where: { status: "PENDING" } }),
      prisma.integrationOutbox.count({ where: { status: "FAILED" } }),
      prisma.integrationOutbox.count({ where: { status: "PROCESSING" } }),
      prisma.integrationOutbox.count({ where: { status: "DEAD" } }),
      prisma.integrationOutbox.count({
        where: { status: "PROCESSING", lockedAt: { lte: staleBefore } },
      }),
      prisma.integrationOutbox.findFirst({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.integrationOutbox.count({
        where: { status: "PROCESSED", processedAt: { gte: hourAgo } },
      }),
      prisma.integrationOutbox.count({
        where: { status: "FAILED", updatedAt: { gte: hourAgo } },
      }),
    ]);

  const oldestPendingAgeSeconds = oldestPending?.createdAt
    ? Math.max(0, Math.floor((now.getTime() - oldestPending.createdAt.getTime()) / 1000))
    : null;

  const reasons: Array<{ level: "warn" | "alert"; reason: string }> = [];
  if (oldestPendingAgeSeconds !== null && oldestPendingAgeSeconds >= alertOldestPendingSeconds) {
    reasons.push({
      level: "alert",
      reason: `oldest_pending_age_seconds >= ${alertOldestPendingSeconds}`,
    });
  }
  if (stuckProcessing >= alertStuckProcessingCount) {
    reasons.push({
      level: "alert",
      reason: `stuck_processing >= ${alertStuckProcessingCount}`,
    });
  }
  if (dead >= alertDeadCount) {
    reasons.push({
      level: "alert",
      reason: `dead_letter >= ${alertDeadCount}`,
    });
  }
  if (failedLastHour >= warnFailedLastHourCount) {
    reasons.push({
      level: "warn",
      reason: `failed_last_hour >= ${warnFailedLastHourCount}`,
    });
  }

  const hasAlert = reasons.some((r) => r.level === "alert");
  const hasWarn = reasons.some((r) => r.level === "warn");
  const status = hasAlert ? "alert" : hasWarn ? "warn" : "ok";

  return NextResponse.json(
    {
      ok: !hasAlert,
      status,
      reasons,
      metrics: {
        pending,
        failed,
        processing,
        dead,
        stuckProcessing,
        oldestPendingAgeSeconds,
        processedLastHour,
        failedLastHour,
      },
    },
    { status: hasAlert ? 503 : 200 }
  );
}
