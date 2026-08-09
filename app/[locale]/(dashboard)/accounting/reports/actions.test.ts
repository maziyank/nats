import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getProfitAndLoss,
  getBalanceSheet,
  getFinancialRatios,
  ReportAccountLine,
} from "./actions";

// Mock authorizedAction to just run the function
vi.mock("@/lib/permissions/protected-action", () => ({
  authorizedAction: (permission: any, action: any) => action,
}));

// Mock getCurrentUser/getSession
vi.mock("@/lib/auth/auth", () => ({
  getSession: vi.fn().mockResolvedValue({ userId: "user-1" }),
}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    account: {
      findMany: vi.fn(),
    },
    journalEntryLine: {
      groupBy: vi.fn(),
    },
    reportTemplate: {
      upsert: vi.fn().mockResolvedValue({ id: "template-1" }),
    },
    reportLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// The report actions now source balances through the period-balance service.
// Rebuild a balance map from the mocked journalEntryLine.groupBy rows so the
// report logic is exercised with controlled balance data.
vi.mock("@/modules/accounting/services/period-balance.service", () => ({
  getPeriodBalances: async () => {
    const rows = await prismaMock.journalEntryLine.groupBy({});
    const map = new Map();
    for (const r of rows) {
      map.set(r.accountId, {
        debit: Number(r._sum?.debitAmount ?? 0),
        credit: Number(r._sum?.creditAmount ?? 0),
      });
    }
    return map;
  },
  getCumulativeBalancesAsOf: async () => {
    const rows = await prismaMock.journalEntryLine.groupBy({});
    const map = new Map();
    for (const r of rows) {
      map.set(r.accountId, {
        debit: Number(r._sum?.debitAmount ?? 0),
        credit: Number(r._sum?.creditAmount ?? 0),
      });
    }
    return map;
  },
}));

describe("Financial Reports Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getProfitAndLoss", () => {
    it("should calculate net income correctly", async () => {
      // Mock Accounts
      prismaMock.account.findMany.mockResolvedValue([
        { id: "1", code: "4000", name: "Sales", type: "revenue", level: 0, parentId: null },
        { id: "2", code: "5000", name: "COGS", type: "expense", level: 0, parentId: null },
      ]);

      // Mock Balances (Revenue credit is positive, Expense debit is positive)
      // Revenue: Credit 1000
      // Expense: Debit 600
      prismaMock.journalEntryLine.groupBy.mockResolvedValue([
        { accountId: "1", _sum: { debitAmount: 0, creditAmount: 1000 } },
        { accountId: "2", _sum: { debitAmount: 600, creditAmount: 0 } },
      ]);

      const result = await getProfitAndLoss("2023-01-01", "2023-12-31");

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.totalRevenue).toBe(1000);
        expect(result.data.totalExpenses).toBe(600);
        expect(result.data.netIncome).toBe(400); // 1000 - 600
      }
    });
  });

  describe("getBalanceSheet", () => {
    it("should calculate retained earnings correctly", async () => {
      // Mock BS Accounts
      prismaMock.account.findMany.mockImplementation((args) => {
        // First call is for BS accounts, second for P&L accounts (for RE calculation)
        if (args?.where?.type?.in?.includes("asset")) {
          return Promise.resolve([
            { id: "a1", code: "1000", name: "Cash", type: "asset", level: 0 },
            { id: "l1", code: "2000", name: "AP", type: "liability", level: 0 },
            { id: "e1", code: "3000", name: "Capital", type: "equity", level: 0 },
          ]);
        }
        // P&L Accounts for RE
        return Promise.resolve([
          { id: "r1", code: "4000", name: "Revenue", type: "revenue" },
          { id: "x1", code: "5000", name: "Expense", type: "expense" },
        ]);
      });

      // Mock Balances
      prismaMock.journalEntryLine.groupBy.mockImplementation((args) => {
        // Check filtering to return appropriate balances
        // Simplified: return all balances
        return Promise.resolve([
          // Assets: Debit 1000
          { accountId: "a1", _sum: { debitAmount: 1000, creditAmount: 0 } },
          // Liabilities: Credit 500
          { accountId: "l1", _sum: { debitAmount: 0, creditAmount: 500 } },
          // Equity: Credit 200
          { accountId: "e1", _sum: { debitAmount: 0, creditAmount: 200 } },
          // Revenue: Credit 400
          { accountId: "r1", _sum: { debitAmount: 0, creditAmount: 400 } },
          // Expense: Debit 100
          { accountId: "x1", _sum: { debitAmount: 100, creditAmount: 0 } },
        ]);
      });

      const result = await getBalanceSheet("2023-12-31");

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        const totalAssets = 1000;
        const totalLiabilities = 500;
        const capital = 200;
        const retainedEarnings = 400 - 100; // 300
        const totalEquity = capital + retainedEarnings; // 500

        expect(result.data.totalAssets).toBe(totalAssets);
        expect(result.data.totalLiabilities).toBe(totalLiabilities);
        expect(result.data.totalEquity).toBe(totalEquity);
        expect(result.data.totalLiabilitiesAndEquity).toBe(totalLiabilities + totalEquity); // 1000
      }
    });
  });

  describe("getFinancialRatios", () => {
    it("should calculate ratios correctly", async () => {
        // Setup Mocks similar to Balance Sheet + P&L
        // We need specific codes for this test (11xxx for Current Assets, etc.)
        
        prismaMock.account.findMany.mockImplementation((args) => {
             if (args?.where?.type?.in?.includes("asset")) {
                 return Promise.resolve([
                     { id: "ca", code: "11100", name: "Cash", type: "asset" }, // Current Asset
                     { id: "fa", code: "15000", name: "Equipment", type: "asset" }, // Non-current
                     { id: "cl", code: "21000", name: "AP", type: "liability" }, // Current Liability
                     { id: "ll", code: "25000", name: "Loan", type: "liability" }, // Long Term
                     { id: "eq", code: "30000", name: "Equity", type: "equity" },
                 ]);
             }
             return Promise.resolve([
                 { id: "rev", code: "40000", name: "Sales", type: "revenue" },
                 { id: "cogs", code: "52000", name: "COGS", type: "expense" },
             ]);
        });

        prismaMock.journalEntryLine.groupBy.mockResolvedValue([
            { accountId: "ca", _sum: { debitAmount: 200, creditAmount: 0 } }, // Cash 200
            { accountId: "fa", _sum: { debitAmount: 800, creditAmount: 0 } }, // Equipment 800
            { accountId: "cl", _sum: { debitAmount: 0, creditAmount: 100 } }, // AP 100
            { accountId: "ll", _sum: { debitAmount: 0, creditAmount: 400 } }, // Loan 400
            { accountId: "eq", _sum: { debitAmount: 0, creditAmount: 500 } }, // Equity 500
            { accountId: "rev", _sum: { debitAmount: 0, creditAmount: 1000 } }, // Rev 1000
            { accountId: "cogs", _sum: { debitAmount: 600, creditAmount: 0 } }, // COGS 600
        ]);

        const result = await getFinancialRatios("2023-12-31");
        
        expect(result.success).toBe(true);
        if (result.success && result.data) {
            // Current Ratio = CA / CL = 200 / 100 = 2.0
            expect(result.data.currentRatio).toBe(2.0);
            
            // Gross Profit Margin = (1000 - 600) / 1000 = 40%
            expect(result.data.grossProfitMargin).toBe(40);
        }
    });
  });
});
