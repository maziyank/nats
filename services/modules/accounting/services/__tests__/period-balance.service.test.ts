import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  accountPeriodBalance: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    createMany: vi.fn(),
    updateMany: vi.fn(),
  },
  journalEntry: {
    findFirst: vi.fn(),
  },
  journalEntryLine: {
    groupBy: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  endOfMonthUtc,
  getCumulativeBalancesAsOf,
  getPeriodBalances,
  startOfNextMonthUtc,
} from "../period-balance.service";

describe("period-balance date helpers", () => {
  it("endOfMonthUtc returns last day of month", () => {
    expect(endOfMonthUtc(new Date("2026-02-10T12:00:00.000Z")).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
    expect(endOfMonthUtc(new Date("2024-02-01T00:00:00.000Z")).toISOString()).toBe(
      "2024-02-29T00:00:00.000Z",
    );
  });

  it("startOfNextMonthUtc returns first day of next month", () => {
    expect(
      startOfNextMonthUtc(new Date("2026-01-15T00:00:00.000Z")).toISOString(),
    ).toBe("2026-02-01T00:00:00.000Z");
    expect(
      startOfNextMonthUtc(new Date("2026-12-31T00:00:00.000Z")).toISOString(),
    ).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("getCumulativeBalancesAsOf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses month-end snapshot when available", async () => {
    // prior month ensure path
    prismaMock.accountPeriodBalance.findFirst
      .mockResolvedValueOnce({ periodEnd: new Date("2025-12-31") }) // ensure: latest
      .mockResolvedValueOnce({ periodEnd: new Date("2026-01-31") }); // snap lookup (not used on exact path)

    prismaMock.accountPeriodBalance.findMany.mockResolvedValueOnce([
      { accountId: "a1", debitTotal: 100, creditTotal: 40 },
      { accountId: "a2", debitTotal: 10, creditTotal: 90 },
    ]);

    const map = await getCumulativeBalancesAsOf(new Date("2026-01-31T12:00:00Z"));

    expect(map.get("a1")).toEqual({ debit: 100, credit: 40 });
    expect(map.get("a2")).toEqual({ debit: 10, credit: 90 });
    // exact month-end path should not need residual groupBy
    expect(prismaMock.journalEntryLine.groupBy).not.toHaveBeenCalled();
  });

  it("falls back to residual live aggregate after nearest snapshot", async () => {
    // ensure prior month: already caught up
    prismaMock.accountPeriodBalance.findFirst
      .mockResolvedValueOnce({ periodEnd: new Date("2026-01-31") }) // ensure latest
      .mockResolvedValueOnce({ periodEnd: new Date("2026-01-31") }); // nearest snap <= asOf

    prismaMock.accountPeriodBalance.findMany.mockResolvedValueOnce([
      { accountId: "a1", debitTotal: 100, creditTotal: 0 },
    ]);

    prismaMock.journalEntryLine.groupBy.mockResolvedValueOnce([
      {
        accountId: "a1",
        _sum: { debitAmount: 25, creditAmount: 5 },
      },
      {
        accountId: "a2",
        _sum: { debitAmount: 7, creditAmount: 0 },
      },
    ]);

    const map = await getCumulativeBalancesAsOf(new Date("2026-02-10T00:00:00Z"));

    expect(map.get("a1")).toEqual({ debit: 125, credit: 5 });
    expect(map.get("a2")).toEqual({ debit: 7, credit: 0 });
    expect(prismaMock.journalEntryLine.groupBy).toHaveBeenCalledTimes(1);
  });
});

describe("getPeriodBalances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("subtracts start-of-period cumulative from end cumulative", async () => {
    // getPeriodBalances calls getCumulativeBalancesAsOf twice in parallel.
    // Each call may hit ensure + snapshot paths; stub residual full live path.
    prismaMock.accountPeriodBalance.findFirst.mockResolvedValue(null);
    prismaMock.journalEntry.findFirst.mockResolvedValue(null);

    prismaMock.journalEntryLine.groupBy
      .mockResolvedValueOnce([
        // endDate cumulative
        { accountId: "a1", _sum: { debitAmount: 200, creditAmount: 50 } },
      ])
      .mockResolvedValueOnce([
        // day-before-start cumulative
        { accountId: "a1", _sum: { debitAmount: 80, creditAmount: 20 } },
      ]);

    const map = await getPeriodBalances(
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-02-28T00:00:00Z"),
    );

    expect(map.get("a1")).toEqual({ debit: 120, credit: 30 });
  });
});
