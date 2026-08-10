"use server";

import { prisma } from "@/services/lib/prisma";
import { SuperJSON } from "@/services/lib/superjson";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { auditLogQuerySchema } from "@/services/lib/validation/schemas";
import {
  dispatchPendingIntegrationEvents,
  processIntegrationOutboxEvent,
} from "@/services/modules/integration/outbox";
import type { Prisma } from "@/prisma/generated/prisma/client";

function getIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

async function logOutboxAudit(action: string, metadata: Record<string, unknown>) {
  const session = await getSession();
  if (!session) return;
  const entityId = typeof metadata.entityId === "string" ? metadata.entityId : undefined;
  try {
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action,
        entityType: "IntegrationOutbox",
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  } catch { }
}

export const getOutboxAuditLogs = authorizedAction(
  "integrations.outbox.view",
  async (input?: unknown) => {
    const parsed = auditLogQuerySchema.parse(input ?? {});
    const where: Prisma.AuditLogWhereInput = {
      entityType: "IntegrationOutbox",
      AND: [],
    };

    if (parsed.action) {
      (where.AND as Prisma.AuditLogWhereInput[]).push({
        action: parsed.action,
      });
    }

    if (parsed.entityId) {
      (where.AND as Prisma.AuditLogWhereInput[]).push({
        entityId: parsed.entityId,
      });
    }

    const skip = (parsed.page - 1) * parsed.pageSize;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: parsed.pageSize,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          createdAt: true,
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      success: true as const,
      data: {
        logs: SuperJSON.serialize(logs),
        total,
        totalPages: Math.ceil(total / parsed.pageSize),
        page: parsed.page,
        pageSize: parsed.pageSize,
      },
    };
  }
);

export async function getIntegrationOutboxEvents(
  page: number = 1,
  limit: number = 20,
  input?: {
    search?: string;
    status?: string;
    topic?: string;
    type?: string;
  }
) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "integrations.outbox.view")) {
    return { events: [], total: 0, totalPages: 0 };
  }

  const skip = (page - 1) * limit;
  const where: Prisma.IntegrationOutboxWhereInput = { AND: [] };

  if (input?.search) {
    const search = input.search;
    (where.AND as Prisma.IntegrationOutboxWhereInput[]).push({
      OR: [
        { id: { contains: search, mode: "insensitive" } },
        { topic: { contains: search, mode: "insensitive" } },
        { type: { contains: search, mode: "insensitive" } },
        { aggregateType: { contains: search, mode: "insensitive" } },
        { aggregateId: { contains: search, mode: "insensitive" } },
        { lastError: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (input?.status) {
    (where.AND as Prisma.IntegrationOutboxWhereInput[]).push({
      status: input.status as any,
    });
  }

  if (input?.topic) {
    (where.AND as Prisma.IntegrationOutboxWhereInput[]).push({
      topic: { equals: input.topic, mode: "insensitive" },
    });
  }

  if (input?.type) {
    (where.AND as Prisma.IntegrationOutboxWhereInput[]).push({
      type: { contains: input.type, mode: "insensitive" },
    });
  }

  const [events, total] = await Promise.all([
    prisma.integrationOutbox.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        topic: true,
        type: true,
        aggregateType: true,
        aggregateId: true,
        status: true,
        attempts: true,
        lockedAt: true,
        lockedBy: true,
        nextAttemptAt: true,
        processedAt: true,
        lastError: true,
        deadAt: true,
        createdAt: true,
        updatedAt: true,
        payload: true,
      },
    }),
    prisma.integrationOutbox.count({ where }),
  ]);

  return {
    events: SuperJSON.serialize(events),
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getIntegrationOutboxTopErrors(input?: {
  topic?: string;
  type?: string;
  limit?: number;
  statuses?: Array<"FAILED" | "DEAD">;
}) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "integrations.outbox.view")) {
    return { errors: [] as Array<{ lastError: string; count: number }> };
  }

  const limit = Math.min(50, Math.max(1, input?.limit ?? 10));
  const statuses = input?.statuses?.length ? input.statuses : ["FAILED"];

  const where: Prisma.IntegrationOutboxWhereInput = {
    status: { in: statuses as any[] },
    lastError: { not: null },
    AND: [],
  };

  if (input?.topic) {
    (where.AND as Prisma.IntegrationOutboxWhereInput[]).push({
      topic: { equals: input.topic, mode: "insensitive" },
    });
  }

  if (input?.type) {
    (where.AND as Prisma.IntegrationOutboxWhereInput[]).push({
      type: { contains: input.type, mode: "insensitive" },
    });
  }

  const groups = await prisma.integrationOutbox.groupBy({
    by: ["lastError"],
    where,
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });

  return {
    errors: groups
      .map((g) => ({ lastError: g.lastError ?? "", count: g._count.id }))
      .filter((g) => g.lastError.trim().length > 0),
  };
}

export async function getIntegrationOutboxEventDetail(id: string) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "integrations.outbox.view")) {
    return null;
  }

  const outbox = await prisma.integrationOutbox.findUnique({
    where: { id },
    select: {
      id: true,
      topic: true,
      type: true,
      aggregateType: true,
      aggregateId: true,
      status: true,
      attempts: true,
      lockedAt: true,
      lockedBy: true,
      nextAttemptAt: true,
      processedAt: true,
      lastError: true,
      deadAt: true,
      createdAt: true,
      updatedAt: true,
      payload: true,
    },
  });

  if (!outbox) return null;

  const inbox = await prisma.integrationInbox.findMany({
    where: { outboxId: id },
    select: { id: true, consumer: true, processedAt: true },
    orderBy: { processedAt: "asc" },
  });

  return SuperJSON.serialize({ outbox, inbox });
}

export const requeueIntegrationOutboxEvent = authorizedAction(
  "integrations.outbox.retry",
  async (id: string, options?: { resetAttempts?: boolean }) => {
    const resetAttempts = options?.resetAttempts ?? true;

    await prisma.integrationOutbox.update({
      where: { id },
      data: {
        status: "PENDING",
        attempts: resetAttempts ? 0 : undefined,
        lockedAt: null,
        lockedBy: null,
        processedAt: null,
        nextAttemptAt: null,
        lastError: null,
        deadAt: null,
      },
    });

    await logOutboxAudit("OUTBOX_REQUEUE", {
      entityId: id,
      resetAttempts,
    });

    return { success: true as const };
  }
);

export const runIntegrationOutboxEventNow = authorizedAction(
  "integrations.outbox.dispatch",
  async (id: string) => {
    try {
      await processIntegrationOutboxEvent(id);
      return { success: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false as const, error: message };
    }
  }
);

export const dispatchIntegrationOutboxBatch = authorizedAction(
  "integrations.outbox.dispatch",
  async (limit?: number) => {
    const result = await dispatchPendingIntegrationEvents({
      limit: typeof limit === "number" && Number.isFinite(limit) ? limit : undefined,
    });
    return { success: true as const, result };
  }
);

export const unlockIntegrationOutboxEvent = authorizedAction(
  "integrations.outbox.retry",
  async (id: string) => {
    await prisma.integrationOutbox.update({
      where: { id },
      data: {
        status: "FAILED",
        lockedAt: null,
        lockedBy: null,
        nextAttemptAt: null,
      },
    });

    await logOutboxAudit("OUTBOX_UNLOCK", {
      entityId: id,
    });

    return { success: true as const };
  }
);

export const forceDeadIntegrationOutboxEvent = authorizedAction(
  "integrations.outbox.retry",
  async (id: string, reason?: string) => {
    await prisma.integrationOutbox.update({
      where: { id },
      data: {
        status: "DEAD",
        deadAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        nextAttemptAt: null,
        lastError: reason?.trim() ? reason.trim() : undefined,
      },
    });

    await logOutboxAudit("OUTBOX_MARK_DEAD", {
      entityId: id,
      reason: reason?.trim() ? reason.trim() : undefined,
    });

    return { success: true as const };
  }
);

export const bulkUnlockStuckIntegrationOutboxEvents = authorizedAction(
  "integrations.outbox.retry",
  async (input?: { topic?: string; type?: string }) => {
    const now = new Date();
    const lockTimeoutMs = getIntEnv("INTEGRATION_LOCK_TIMEOUT_MS", 60_000);
    const staleBefore = new Date(now.getTime() - lockTimeoutMs);

    const where: Prisma.IntegrationOutboxWhereInput = {
      status: "PROCESSING",
      lockedAt: { lte: staleBefore },
      AND: [],
    };

    if (input?.topic) {
      (where.AND as Prisma.IntegrationOutboxWhereInput[]).push({
        topic: { equals: input.topic, mode: "insensitive" },
      });
    }

    if (input?.type) {
      (where.AND as Prisma.IntegrationOutboxWhereInput[]).push({
        type: { contains: input.type, mode: "insensitive" },
      });
    }

    const result = await prisma.integrationOutbox.updateMany({
      where,
      data: {
        status: "FAILED",
        lockedAt: null,
        lockedBy: null,
        nextAttemptAt: null,
      },
    });

    await logOutboxAudit("OUTBOX_BULK_UNLOCK", {
      topic: input?.topic ?? null,
      type: input?.type ?? null,
      lockTimeoutMs,
      count: result.count,
    });

    return { success: true as const, count: result.count };
  }
);

export const bulkRequeueIntegrationOutboxEvents = authorizedAction(
  "integrations.outbox.retry",
  async (input: {
    fromStatus: "FAILED" | "DEAD";
    topic?: string;
    type?: string;
    lastErrorExact?: string;
    resetAttempts?: boolean;
  }) => {
    const resetAttempts = input.resetAttempts ?? true;

    const where: Prisma.IntegrationOutboxWhereInput = {
      status: input.fromStatus,
      AND: [],
    };

    if (input.topic) {
      (where.AND as Prisma.IntegrationOutboxWhereInput[]).push({
        topic: { equals: input.topic, mode: "insensitive" },
      });
    }

    if (input.type) {
      (where.AND as Prisma.IntegrationOutboxWhereInput[]).push({
        type: { contains: input.type, mode: "insensitive" },
      });
    }

    if (input.lastErrorExact) {
      (where.AND as Prisma.IntegrationOutboxWhereInput[]).push({
        lastError: { equals: input.lastErrorExact },
      });
    }

    const result = await prisma.integrationOutbox.updateMany({
      where,
      data: {
        status: "PENDING",
        attempts: resetAttempts ? 0 : undefined,
        lockedAt: null,
        lockedBy: null,
        processedAt: null,
        nextAttemptAt: null,
        lastError: null,
        deadAt: null,
      },
    });

    await logOutboxAudit("OUTBOX_BULK_REQUEUE", {
      fromStatus: input.fromStatus,
      resetAttempts,
      topic: input.topic ?? null,
      type: input.type ?? null,
      lastErrorExact: input.lastErrorExact ?? null,
      count: result.count,
    });

    return { success: true as const, count: result.count };
  }
);

export const bulkForceDeadIntegrationOutboxEvents = authorizedAction(
  "integrations.outbox.retry",
  async (input: { topic?: string; type?: string; lastErrorExact?: string; reason?: string }) => {
    const where: Prisma.IntegrationOutboxWhereInput = {
      status: "FAILED",
      AND: [],
    };

    if (input.topic) {
      (where.AND as Prisma.IntegrationOutboxWhereInput[]).push({
        topic: { equals: input.topic, mode: "insensitive" },
      });
    }

    if (input.type) {
      (where.AND as Prisma.IntegrationOutboxWhereInput[]).push({
        type: { contains: input.type, mode: "insensitive" },
      });
    }

    if (input.lastErrorExact) {
      (where.AND as Prisma.IntegrationOutboxWhereInput[]).push({
        lastError: { equals: input.lastErrorExact },
      });
    }

    const reason = input.reason?.trim();

    const result = await prisma.integrationOutbox.updateMany({
      where,
      data: {
        status: "DEAD",
        deadAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        nextAttemptAt: null,
        lastError: reason ? reason : undefined,
      },
    });

    await logOutboxAudit("OUTBOX_BULK_DEAD", {
      topic: input.topic ?? null,
      type: input.type ?? null,
      lastErrorExact: input.lastErrorExact ?? null,
      reason: reason ?? null,
      count: result.count,
    });

    return { success: true as const, count: result.count };
  }
);
