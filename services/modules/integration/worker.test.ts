import { describe, expect, it, vi, beforeEach } from "vitest";
import { runOutboxWorker } from "./worker";

const dispatchMock = vi.fn();

vi.mock("@/modules/integration/outbox", () => ({
  dispatchPendingIntegrationEvents: (...args: unknown[]) => dispatchMock(...args),
}));

describe("runOutboxWorker", () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    delete process.env.OUTBOX_SAFE_MODE;
    delete process.env.OUTBOX_SAFE_MODE_LIMIT_PER_BATCH;
    delete process.env.OUTBOX_SAFE_MODE_MAX_BATCHES;
    delete process.env.OUTBOX_SAFE_MODE_DEADLINE_MS;
    delete process.env.OUTBOX_SAFE_MODE_CONCURRENCY;
  });

  it("caps batch settings when safe mode is enabled", async () => {
    process.env.OUTBOX_SAFE_MODE = "true";
    process.env.OUTBOX_SAFE_MODE_LIMIT_PER_BATCH = "5";
    process.env.OUTBOX_SAFE_MODE_MAX_BATCHES = "2";
    process.env.OUTBOX_SAFE_MODE_DEADLINE_MS = "1000";
    process.env.OUTBOX_SAFE_MODE_CONCURRENCY = "1";

    dispatchMock.mockResolvedValueOnce({ attempted: 0, processed: 0, failed: 0 });

    await runOutboxWorker({
      limitPerBatch: 50,
      maxBatches: 10,
      deadlineMs: 20_000,
      concurrency: 8,
      safeMode: true,
    });

    expect(dispatchMock).toHaveBeenCalledWith({
      limit: 5,
      concurrency: 1,
    });
  });

  it("uses requested settings when safe mode is disabled", async () => {
    dispatchMock.mockResolvedValueOnce({ attempted: 0, processed: 0, failed: 0 });

    await runOutboxWorker({
      limitPerBatch: 40,
      concurrency: 3,
      safeMode: false,
    });

    expect(dispatchMock).toHaveBeenCalledWith({
      limit: 40,
      concurrency: 3,
    });
  });
});
