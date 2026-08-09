import { checkBudgetAvailability } from "./actions";
import { prisma } from "@/lib/prisma";
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mocking Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    budget: {
      findFirst: vi.fn(),
    },
    journalEntryLine: {
      aggregate: vi.fn(),
    },
  },
}));

// The actions module imports getSession, which pulls in next-intl navigation
// (next/navigation) that vitest cannot resolve. Mock it to avoid loading it.
vi.mock("@/lib/auth/auth", () => ({
  getSession: vi.fn().mockResolvedValue({ userId: "user-1" }),
}));

describe("checkBudgetAvailability", () => {
  const date = new Date(2026, 0, 1); // Jan 1 2026

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return warning if budget exceeded", async () => {
    // Setup Budget
    (prisma.budget.findFirst as any).mockResolvedValue({
      id: "b1",
      totalAmount: { toNumber: () => 1000 },
      items: [],
    });

    // Setup Actuals
    (prisma.journalEntryLine.aggregate as any).mockResolvedValue({
      _sum: { debitAmount: { toNumber: () => 500 }, creditAmount: { toNumber: () => 0 } },
    });

    // Request 600. Total = 500 + 600 = 1100 > 1000
    const result = await checkBudgetAvailability(null, null, date, 600);

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.available).toBe(false);
      expect(result.data.warning).toContain("Exceeds budget");
    }
  });

  it("should return warning if approaching limit", async () => {
    // Setup Budget
    (prisma.budget.findFirst as any).mockResolvedValue({
      id: "b1",
      totalAmount: { toNumber: () => 1000 },
      items: [],
    });

    // Setup Actuals
    (prisma.journalEntryLine.aggregate as any).mockResolvedValue({
      _sum: { debitAmount: { toNumber: () => 850 }, creditAmount: { toNumber: () => 0 } },
    });

    // Request 100. Total = 950. Remaining 50. 50 < 1000 * 0.1 (100)
    const result = await checkBudgetAvailability(null, null, date, 100);

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.available).toBe(true);
      expect(result.data.warning).toContain("approaching budget limit");
    }
  });

  it("should return available if within budget", async () => {
    // Setup Budget
    (prisma.budget.findFirst as any).mockResolvedValue({
      id: "b1",
      totalAmount: { toNumber: () => 1000 },
      items: [],
    });

    // Setup Actuals
    (prisma.journalEntryLine.aggregate as any).mockResolvedValue({
      _sum: { debitAmount: { toNumber: () => 100 }, creditAmount: { toNumber: () => 0 } },
    });

    // Request 100. Total = 200 < 1000.
    const result = await checkBudgetAvailability(null, null, date, 100);

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.available).toBe(true);
      expect(result.data.warning).toBeUndefined();
    }
  });
});

