"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizedAction } from "@/lib/permissions/protected-action";
import { getSession } from "@/lib/auth/auth";
import { revalidatePath } from "next/cache";
import { generateDocumentNumber } from "@/lib/document-numbering";
import {
  nonNegativeDecimalSchema,
  requiredIdSchema,
} from "@/lib/validation/schemas";

export type BeginningBalanceItem = {
  accountId: string;
  accountCode: string;
  accountName: string;
  normalBalance: "debit" | "credit";
  currentDebit: number;
  currentCredit: number;
  netBalance: number; // Positive = Debit, Negative = Credit
};

export const getBeginningBalances = authorizedAction(
  "ledger.view",
  async (): Promise<
    import("@/types/actions").ActionResponse<BeginningBalanceItem[]>
  > => {
    try {
      const accounts = await prisma.account.findMany({
        where: {
          isPosting: true,
          isActive: true,
        },
        select: {
          id: true,
          code: true,
          name: true,
          normalBalance: true,
        },
        orderBy: {
          code: "asc",
        },
      });

      // Optimized approach: Aggregate all JournalEntryLines grouped by accountId
      const aggregates = await prisma.journalEntryLine.groupBy({
        by: ["accountId"],
        where: {
          journalEntry: {
            status: "posted",
          },
        },
        _sum: {
          debitAmount: true,
          creditAmount: true,
        },
      });

      const balanceMap = new Map<string, { debit: number; credit: number }>();
      aggregates.forEach((agg) => {
        balanceMap.set(agg.accountId, {
          debit: agg._sum.debitAmount?.toNumber() || 0,
          credit: agg._sum.creditAmount?.toNumber() || 0,
        });
      });

      const items: BeginningBalanceItem[] = accounts.map((acc) => {
        const bal = balanceMap.get(acc.id) || { debit: 0, credit: 0 };
        return {
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          normalBalance: acc.normalBalance,
          currentDebit: bal.debit,
          currentCredit: bal.credit,
          netBalance: bal.debit - bal.credit,
        };
      });

      return { success: true, data: items };
    } catch (error) {
      console.error("Error fetching beginning balances:", error);
      return { success: false, error: "Failed to fetch beginning balances" };
    }
  },
);

export type BeginningBalanceInput = {
  accountId: string;
  debit: number;
  credit: number;
};

export const saveBeginningBalances = authorizedAction(
  "ledger.create",
  async (inputs: BeginningBalanceInput[]) => {
    try {
      const beginningBalanceSchema = z
        .array(
          z.object({
            accountId: requiredIdSchema,
            debit: nonNegativeDecimalSchema,
            credit: nonNegativeDecimalSchema,
          }),
        )
        .min(1, "At least one balance line is required");

      const parseResult = beginningBalanceSchema.safeParse(inputs);
      if (!parseResult.success) {
        return {
          success: false,
          error: parseResult.error.issues[0]?.message ?? "Invalid input",
        };
      }
      const validatedInputs = parseResult.data;

      const session = await getSession();
      if (!session?.userId) {
        return { success: false, error: "Unauthorized" };
      }

      // 1. Validate Balance
      const totalDebitInput = validatedInputs.reduce((sum, i) => sum + i.debit, 0);
      const totalCreditInput = validatedInputs.reduce((sum, i) => sum + i.credit, 0);

      if (Math.abs(totalDebitInput - totalCreditInput) > 0.01) {
        return {
          success: false,
          error: `Beginning balances are not balanced. Debits: ${totalDebitInput.toFixed(2)}, Credits: ${totalCreditInput.toFixed(2)}. Difference: ${(totalDebitInput - totalCreditInput).toFixed(2)}`,
        };
      }

      // 2. Fetch current balances again to ensure we calculate difference correctly
      const aggregates = await prisma.journalEntryLine.groupBy({
        by: ["accountId"],
        where: {
          journalEntry: {
            status: "posted",
          },
        },
        _sum: {
          debitAmount: true,
          creditAmount: true,
        },
      });

      const currentBalanceMap = new Map<string, number>(); // Net Debit
      aggregates.forEach((agg) => {
        const debit = agg._sum.debitAmount?.toNumber() || 0;
        const credit = agg._sum.creditAmount?.toNumber() || 0;
        currentBalanceMap.set(agg.accountId, debit - credit);
      });

      const linesToCreate: {
        accountId: string;
        debitAmount: number;
        creditAmount: number;
        description: string;
        lineNumber: number;
      }[] = [];

      let lineNumber = 1;

      for (const input of validatedInputs) {
        const currentNet = currentBalanceMap.get(input.accountId) || 0;
        const targetNet = input.debit - input.credit;
        const diff = targetNet - currentNet;

        // Round to 2 decimals
        const roundedDiff = Math.round(diff * 100) / 100;

        if (Math.abs(roundedDiff) < 0.01) continue;

        if (roundedDiff > 0) {
          // Need more Debit
          linesToCreate.push({
            accountId: input.accountId,
            debitAmount: roundedDiff,
            creditAmount: 0,
            description: "Beginning Balance Adjustment",
            lineNumber: lineNumber++,
          });
        } else {
          // Need more Credit
          const absDiff = Math.abs(roundedDiff);
          linesToCreate.push({
            accountId: input.accountId,
            debitAmount: 0,
            creditAmount: absDiff,
            description: "Beginning Balance Adjustment",
            lineNumber: lineNumber++,
          });
        }
      }

      if (linesToCreate.length === 0) {
        return { success: true, message: "No changes detected" };
      }

      // 3. Create Journal Entry
      // Note: We expect linesToCreate to be balanced if inputs and current ledger are balanced.
      // If not, the transaction will fail (or we should check here).

      const totalDebitAdj = linesToCreate.reduce(
        (sum, l) => sum + l.debitAmount,
        0,
      );
      const totalCreditAdj = linesToCreate.reduce(
        (sum, l) => sum + l.creditAmount,
        0,
      );

      if (Math.abs(totalDebitAdj - totalCreditAdj) > 0.01) {
        return {
          success: false,
          error: `System Error: Calculated adjustments are not balanced (${totalDebitAdj.toFixed(2)} vs ${totalCreditAdj.toFixed(2)}). Ensure current ledger is balanced.`,
        };
      }

      const entryNumber = await generateDocumentNumber(
        "BEGINNING_BALANCE_JOURNAL",
        "Beginning Balance Journal",
        "JE-BB",
      );

      await prisma.journalEntry.create({
        data: {
          entryNumber,
          transactionDate: new Date(),
          description: "Beginning Balance Adjustment",
          status: "posted", // Auto-post
          postedAt: new Date(),
          userId: session.userId,
          lines: {
            create: linesToCreate,
          },
        },
      });

      revalidatePath("/accounting/configuration/beginning-balance");
      revalidatePath("/accounting/ledger");

      return {
        success: true,
        message: "Beginning balances updated successfully",
      };
    } catch (error) {
      console.error("Error saving beginning balances:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to save beginning balances",
      };
    }
  },
);
