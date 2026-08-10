import { beforeEach, describe, expect, it, vi } from "vitest";

const getIntegrationHandlersMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/integration/handlers", () => ({
  getIntegrationHandlers: (type: string) => getIntegrationHandlersMock(type),
}));

const prismaMock = vi.hoisted(() => ({
  integrationOutbox: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  integrationInbox: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { enqueueIntegrationEventOnce, processIntegrationOutboxEvent } from "@/services/modules/integration/outbox";

describe("enqueueIntegrationEventOnce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing id when active outbox exists", async () => {
    const tx = {
      integrationOutbox: {
        findFirst: vi.fn().mockResolvedValue({ id: "existing" }),
        create: vi.fn(),
      },
    } as any;

    const result = await enqueueIntegrationEventOnce(tx, {
      topic: "t",
      type: "TYPE",
      aggregateType: "Agg",
      aggregateId: "1",
      payload: { ok: true },
    });

    expect(result).toEqual({ id: "existing", alreadyQueued: true });
    expect(tx.integrationOutbox.create).not.toHaveBeenCalled();
  });

  it("creates a new outbox when none exists", async () => {
    const tx = {
      integrationOutbox: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "created" }),
      },
    } as any;

    const result = await enqueueIntegrationEventOnce(tx, {
      topic: "t",
      type: "TYPE",
      aggregateType: "Agg",
      aggregateId: "1",
      payload: { ok: true },
    });

    expect(result).toEqual({ id: "created", alreadyQueued: false });
    expect(tx.integrationOutbox.create).toHaveBeenCalledTimes(1);
  });
});

describe("processIntegrationOutboxEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.integrationOutbox.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.integrationOutbox.findUnique.mockResolvedValue({
      id: "outbox-1",
      type: "TYPE",
      payload: { hello: "world" },
      attempts: 1,
    });
    prismaMock.integrationOutbox.update.mockResolvedValue({});
  });

  it("skips handler when consumer already processed", async () => {
    const handle = vi.fn();
    getIntegrationHandlersMock.mockReturnValue([{ consumer: "consumer-a", handle }]);

    prismaMock.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        integrationInbox: {
          findUnique: vi.fn().mockResolvedValue({ id: "inbox-1" }),
          create: vi.fn(),
        },
      };
      return cb(tx);
    });

    await processIntegrationOutboxEvent("outbox-1");

    expect(handle).not.toHaveBeenCalled();
    expect(prismaMock.integrationOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "outbox-1" },
        data: expect.objectContaining({ status: "PROCESSED" }),
      }),
    );
  });

  it("runs handler and then records inbox receipt", async () => {
    const calls: string[] = [];
    const handle = vi.fn(async () => {
      calls.push("handle");
    });
    getIntegrationHandlersMock.mockReturnValue([{ consumer: "consumer-a", handle }]);

    prismaMock.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        integrationInbox: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn(async () => {
            calls.push("inbox.create");
            return {};
          }),
        },
      };
      return cb(tx);
    });

    await processIntegrationOutboxEvent("outbox-1");

    expect(handle).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["handle", "inbox.create"]);
  });

  it("marks FAILED and unlocks when handler throws", async () => {
    const handle = vi.fn(async () => {
      throw new Error("boom");
    });
    getIntegrationHandlersMock.mockReturnValue([{ consumer: "consumer-a", handle }]);

    prismaMock.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        integrationInbox: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
        },
      };
      return cb(tx);
    });

    await expect(processIntegrationOutboxEvent("outbox-1")).rejects.toThrow("boom");

    expect(prismaMock.integrationOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "outbox-1" },
        data: expect.objectContaining({
          status: "FAILED",
          lockedAt: null,
          lockedBy: null,
          lastError: "boom",
          nextAttemptAt: expect.any(Date),
        }),
      }),
    );
  });

  it("keeps successful consumer receipt when later consumer fails, then retries remaining consumer only", async () => {
    const handleA = vi.fn(async () => { });
    const handleB = vi.fn<() => Promise<void>>(async () => {
      throw new Error("broke");
    });
    getIntegrationHandlersMock.mockReturnValue([
      { consumer: "consumer-a", handle: handleA },
      { consumer: "consumer-b", handle: handleB },
    ]);

    let phase: "first" | "retry" = "first";

    prismaMock.integrationOutbox.findUnique
      .mockResolvedValueOnce({
        id: "outbox-1",
        type: "TYPE",
        payload: { hello: "world" },
        attempts: 1,
      })
      .mockResolvedValueOnce({
        id: "outbox-1",
        type: "TYPE",
        payload: { hello: "world" },
        attempts: 2,
      });

    prismaMock.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        integrationInbox: {
          findUnique: vi.fn(async ({ where }: any) => {
            const consumer = where.consumer_outboxId.consumer;
            if (phase === "first") return null;
            if (consumer === "consumer-a") return { id: "inbox-a" };
            return null;
          }),
          create: vi.fn(),
        },
      };
      return cb(tx);
    });

    await expect(processIntegrationOutboxEvent("outbox-1")).rejects.toThrow("broke");
    expect(handleA).toHaveBeenCalledTimes(1);
    expect(handleB).toHaveBeenCalledTimes(1);

    phase = "retry";
    handleB.mockImplementationOnce(async () => { });

    await processIntegrationOutboxEvent("outbox-1");

    expect(handleA).toHaveBeenCalledTimes(1);
    expect(handleB).toHaveBeenCalledTimes(2);

    expect(prismaMock.integrationOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "outbox-1" },
        data: expect.objectContaining({ status: "PROCESSED" }),
      }),
    );
  });
});
