import { beforeEach, describe, expect, it, vi } from "vitest";
import { Decimal } from "decimal.js";

const enqueueIntegrationEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/integration/outbox", () => ({
  enqueueIntegrationEvent: enqueueIntegrationEventMock,
}));

vi.mock("@/lib/document-numbering", () => ({
  generateDocumentNumber: vi.fn().mockResolvedValue("JE-20260217-0001"),
}));

const prismaMock = vi.hoisted(() => ({
  journalEntry: {
    count: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  journalEntryLine: {
    deleteMany: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  account: {
    updateMany: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  accountBalance: {
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { JournalService } from "../journal.service";

const MOCK_USER_ID = "cuser001id";

describe("JournalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createJournalEntry", () => {
    const input = {
      transactionDate: new Date("2026-02-17"),
      description: "Test Entry",
      lines: [
        {
          accountId: "caccount001",
          debitAmount: 100,
          creditAmount: 0,
          description: "Debit Line",
        },
        {
          accountId: "caccount002",
          debitAmount: 0,
          creditAmount: 100,
          description: "Credit Line",
        },
      ],
    };

    it("validates balanced entry", async () => {
      const unbalancedInput = {
        ...input,
        lines: [
          { ...input.lines[0], debitAmount: 100 },
          { ...input.lines[1], creditAmount: 90 },
        ],
      };

      await expect(
        JournalService.createJournalEntry(unbalancedInput, MOCK_USER_ID),
      ).rejects.toThrow("Debits must equal credits");
    });

    it("creates journal entry within transaction", async () => {
      const createdEntry = {
        id: "cjournal001",
        entryNumber: "JE-20260217-0001",
        ...input,
      };

      prismaMock.journalEntry.count.mockResolvedValue(0);

      // Mock $transaction implementation
      prismaMock.$transaction.mockImplementation(async (cb) => {
        // Mock tx object passed to callback
        const tx = {
          journalEntry: {
            count: prismaMock.journalEntry.count,
            create: vi.fn().mockResolvedValue(createdEntry),
          },
        };
        return cb(tx);
      });

      const result = await JournalService.createJournalEntry(
        input,
        MOCK_USER_ID,
      );

      expect(result).toEqual(createdEntry);
      expect(enqueueIntegrationEventMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: "JOURNAL_ENTRY_CREATED",
          payload: expect.objectContaining({ journalEntryId: "cjournal001" }),
        }),
      );
    });

    it("uses provided tx if available", async () => {
      const createdEntry = {
        id: "cjournal001",
        entryNumber: "Provided-JE",
        ...input,
      };
      const txMock = {
        journalEntry: {
          count: vi.fn(),
          create: vi.fn().mockResolvedValue(createdEntry),
        },
      };

      await JournalService.createJournalEntry(
        { ...input, entryNumber: "Provided-JE" },
        MOCK_USER_ID,
        txMock as any,
      );

      expect(txMock.journalEntry.create).toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("postJournalEntry", () => {
    const mockEntry = {
      id: "cjournal001",
      status: "draft",
      userId: MOCK_USER_ID,
      entryNumber: "JE-001",
      lines: [
        {
          id: "line-1",
          accountId: "caccount001",
          debitAmount: new Decimal(100),
          creditAmount: null,
          account: { normalBalance: "debit", runningBalance: new Decimal(500) },
        },
        {
          id: "line-2",
          accountId: "caccount002",
          debitAmount: null,
          creditAmount: new Decimal(100),
          account: {
            normalBalance: "credit",
            runningBalance: new Decimal(200),
          },
        },
      ],
    };

    it("flips status to posted, skips balance updates, and enqueues outbox event", async () => {
      const accountBalanceUpsert = vi.fn();
      const journalEntryUpdate = vi
        .fn()
        .mockResolvedValue({ ...mockEntry, status: "posted" });
      prismaMock.$transaction.mockImplementation(async (cb) => {
        const tx = {
          journalEntry: {
            findUnique: vi.fn().mockResolvedValue(mockEntry),
            update: journalEntryUpdate,
          },
          accountBalance: {
            upsert: accountBalanceUpsert,
          },
        };
        return cb(tx);
      });

      enqueueIntegrationEventMock.mockResolvedValue({ id: "outbox-1" });

      await JournalService.postJournalEntry("cjournal001");

      // Status is updated to posted.
      expect(journalEntryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "cjournal001" },
          data: expect.objectContaining({ status: "posted" }),
        }),
      );

      // Running balance is NOT recomputed synchronously anymore — that
      // work is now done by the JOURNAL_ENTRY_POSTED outbox consumer.
      expect(accountBalanceUpsert).not.toHaveBeenCalled();

      // The async consumer is wired up via an outbox event.
      expect(enqueueIntegrationEventMock).toHaveBeenCalledTimes(1);
      expect(enqueueIntegrationEventMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          topic: "ACCOUNTING",
          type: "JOURNAL_ENTRY_POSTED",
          aggregateType: "JOURNAL_ENTRY",
          aggregateId: "cjournal001",
        }),
      );
    });

    it("is a no-op for entries that are already posted", async () => {
      const journalEntryUpdate = vi.fn();
      const accountBalanceUpsert = vi.fn();
      prismaMock.$transaction.mockImplementation(async (cb) => {
        const tx = {
          journalEntry: {
            findUnique: vi
              .fn()
              .mockResolvedValue({ ...mockEntry, status: "posted" }),
            update: journalEntryUpdate,
          },
          accountBalance: {
            upsert: accountBalanceUpsert,
          },
        };
        return cb(tx);
      });

      await JournalService.postJournalEntry("cjournal001");

      expect(journalEntryUpdate).not.toHaveBeenCalled();
      expect(accountBalanceUpsert).not.toHaveBeenCalled();
      expect(enqueueIntegrationEventMock).not.toHaveBeenCalled();
    });
  });
});