"use server";

import { prisma } from "@/services/lib/prisma";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

function getIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

export async function getOutboxHealth() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "integrations.outbox.view")) {
    return { allowed: false as const };
  }

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const lockTimeoutMs = getIntEnv("INTEGRATION_LOCK_TIMEOUT_MS", 60_000);
  const staleBefore = new Date(now.getTime() - lockTimeoutMs);

  const [
    pending,
    failed,
    processing,
    dead,
    oldestRetryable,
    oldestPending,
    oldestFailed,
    retrying,
    processedLastHour,
    failedLastHour,
    topicStatusCounts,
    topicOldestPending,
    topicOldestFailed,
    topicStuckProcessing,
    stuckProcessing,
  ] =
    await Promise.all([
      prisma.integrationOutbox.count({ where: { status: "PENDING" } }),
      prisma.integrationOutbox.count({ where: { status: "FAILED" } }),
      prisma.integrationOutbox.count({ where: { status: "PROCESSING" } }),
      prisma.integrationOutbox.count({ where: { status: "DEAD" } }),
      prisma.integrationOutbox.findFirst({
        where: {
          status: { in: ["PENDING", "FAILED"] },
        },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.integrationOutbox.findFirst({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.integrationOutbox.findFirst({
        where: { status: "FAILED" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.integrationOutbox.count({
        where: { status: { in: ["PENDING", "FAILED"] }, attempts: { gt: 0 } },
      }),
      prisma.integrationOutbox.count({
        where: { status: "PROCESSED", processedAt: { gte: hourAgo } },
      }),
      prisma.integrationOutbox.count({
        where: { status: "FAILED", updatedAt: { gte: hourAgo } },
      }),
      prisma.integrationOutbox.groupBy({
        by: ["topic", "status"],
        where: { status: { in: ["PENDING", "FAILED", "PROCESSING", "DEAD"] } },
        _count: { _all: true },
      }),
      prisma.integrationOutbox.groupBy({
        by: ["topic"],
        where: { status: "PENDING" },
        _min: { createdAt: true },
      }),
      prisma.integrationOutbox.groupBy({
        by: ["topic"],
        where: { status: "FAILED" },
        _min: { createdAt: true },
      }),
      prisma.integrationOutbox.groupBy({
        by: ["topic"],
        where: { status: "PROCESSING", lockedAt: { lte: staleBefore } },
        _count: { _all: true },
      }),
      prisma.integrationOutbox.count({
        where: { status: "PROCESSING", lockedAt: { lte: staleBefore } },
      }),
    ]);

  const topicMap = new Map<
    string,
    {
      topic: string;
      pending: number;
      failed: number;
      processing: number;
      dead: number;
      stuckProcessing: number;
      oldestPendingCreatedAt: Date | null;
      oldestFailedCreatedAt: Date | null;
    }
  >();

  for (const row of topicStatusCounts) {
    const existing =
      topicMap.get(row.topic) ??
      ({
        topic: row.topic,
        pending: 0,
        failed: 0,
        processing: 0,
        dead: 0,
        stuckProcessing: 0,
        oldestPendingCreatedAt: null,
        oldestFailedCreatedAt: null,
      } as const);

    const count = row._count._all;
    const next = { ...existing };
    if (row.status === "PENDING") next.pending = count;
    if (row.status === "FAILED") next.failed = count;
    if (row.status === "PROCESSING") next.processing = count;
    if (row.status === "DEAD") next.dead = count;
    topicMap.set(row.topic, next);
  }

  for (const row of topicOldestPending) {
    const existing =
      topicMap.get(row.topic) ??
      ({
        topic: row.topic,
        pending: 0,
        failed: 0,
        processing: 0,
        dead: 0,
        stuckProcessing: 0,
        oldestPendingCreatedAt: null,
        oldestFailedCreatedAt: null,
      } as const);
    topicMap.set(row.topic, { ...existing, oldestPendingCreatedAt: row._min.createdAt ?? null });
  }

  for (const row of topicOldestFailed) {
    const existing =
      topicMap.get(row.topic) ??
      ({
        topic: row.topic,
        pending: 0,
        failed: 0,
        processing: 0,
        dead: 0,
        stuckProcessing: 0,
        oldestPendingCreatedAt: null,
        oldestFailedCreatedAt: null,
      } as const);
    topicMap.set(row.topic, { ...existing, oldestFailedCreatedAt: row._min.createdAt ?? null });
  }

  for (const row of topicStuckProcessing) {
    const existing =
      topicMap.get(row.topic) ??
      ({
        topic: row.topic,
        pending: 0,
        failed: 0,
        processing: 0,
        dead: 0,
        stuckProcessing: 0,
        oldestPendingCreatedAt: null,
        oldestFailedCreatedAt: null,
      } as const);
    topicMap.set(row.topic, { ...existing, stuckProcessing: row._count._all });
  }

  return {
    allowed: true as const,
    counts: {
      pending,
      failed,
      processing,
      dead,
      stuckProcessing,
    },
    oldestRetryableCreatedAt: oldestRetryable?.createdAt ?? null,
    oldestPendingCreatedAt: oldestPending?.createdAt ?? null,
    oldestFailedCreatedAt: oldestFailed?.createdAt ?? null,
    oldestPendingAgeSeconds: oldestPending?.createdAt
      ? Math.max(0, Math.floor((now.getTime() - oldestPending.createdAt.getTime()) / 1000))
      : null,
    oldestFailedAgeSeconds: oldestFailed?.createdAt
      ? Math.max(0, Math.floor((now.getTime() - oldestFailed.createdAt.getTime()) / 1000))
      : null,
    retrying,
    processedLastHour,
    failedLastHour,
    topics: Array.from(topicMap.values())
      .map((t) => ({
        ...t,
        oldestPendingAgeSeconds: t.oldestPendingCreatedAt
          ? Math.max(0, Math.floor((now.getTime() - t.oldestPendingCreatedAt.getTime()) / 1000))
          : null,
        oldestFailedAgeSeconds: t.oldestFailedCreatedAt
          ? Math.max(0, Math.floor((now.getTime() - t.oldestFailedCreatedAt.getTime()) / 1000))
          : null,
      }))
      .sort((a, b) => a.topic.localeCompare(b.topic)),
  };
}
