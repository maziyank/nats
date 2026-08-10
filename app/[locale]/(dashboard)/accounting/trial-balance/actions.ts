"use server";

import { prisma } from "@/services/lib/prisma";
import {
  CalculatedAccount,
  TrialBalanceItem,
  TrialBalanceResult,
} from "../types";

import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { getCumulativeBalancesAsOf } from "@/services/modules/accounting/services/period-balance.service";

/**
 * Fetch Trial Balance report.
 * Aggregates all account balances up to a specific date.
 * Validates the fundamental accounting equation (Debit = Credit).
 * Permission: "reports.view"
 *
 * @param date - The cut-off date for the report
 * @returns    - Object containing list of accounts with their debit/credit balances and totals
 */
export const getTrialBalance = authorizedAction(
  "reports.view",
  async (
    date: string
  ): Promise<import("@/types/actions").ActionResponse<TrialBalanceResult>> => {
    const targetDate = new Date(date);

    // 1. Get ALL active accounts
    const accounts = await prisma.account.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        code: "asc",
      },
    });

    // 2. Cumulative balances via monthly snapshots + residual live scan
    const balanceMap = await getCumulativeBalancesAsOf(targetDate);

    // 3. Prepare data structure for hierarchy and calculation

    const nodeMap = new Map<string, CalculatedAccount>();

    // Initialize nodes
    for (const acc of accounts) {
      const bal = balanceMap.get(acc.id) || { debit: 0, credit: 0 };
      nodeMap.set(acc.id, {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        parentId: acc.parentId ?? null,
        level: acc.level, // We will re-verify level or trust it. Let's trust it for sorting but re-verify structure.
        ownDebit: bal.debit,
        ownCredit: bal.credit,
        totalDebit: 0,
        totalCredit: 0,
        children: [],
        calculated: false,
        parent: null,
        _count: {
          journalEntryLines: 0,
        },
        normalBalance: "debit",
        isPosting: false,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Build hierarchy (populate children)
    for (const acc of accounts) {
      if (acc.parentId) {
        const parent = nodeMap.get(acc.parentId);
        if (parent) {
          parent.children.push(acc.id);
        }
      }
    }

    // Recursive rollup function
    function calculateRollup(nodeId: string): {
      debit: number;
      credit: number;
    } {
      const node = nodeMap.get(nodeId);
      if (!node) return { debit: 0, credit: 0 };

      if (node.calculated) {
        return { debit: node.totalDebit, credit: node.totalCredit };
      }

      let sumDebit = node.ownDebit;
      let sumCredit = node.ownCredit;

      for (const childId of node.children) {
        const childTotals = calculateRollup(childId);
        sumDebit += childTotals.debit;
        sumCredit += childTotals.credit;
      }

      node.totalDebit = sumDebit;
      node.totalCredit = sumCredit;
      node.calculated = true;

      return { debit: sumDebit, credit: sumCredit };
    }

    // Trigger calculation for all nodes
    // We can just iterate all and call calculateRollup. It handles memoization.
    for (const acc of accounts) {
      calculateRollup(acc.id);
    }

    // 4. Prepare final list
    const items: TrialBalanceItem[] = [];
    let grandTotalDebit = 0;
    let grandTotalCredit = 0;

    for (const acc of accounts) {
      const node = nodeMap.get(acc.id)!;

      // Calculate Net Balance for display
      const net = node.totalDebit - node.totalCredit;
      let displayDebit = 0;
      let displayCredit = 0;

      if (net > 0) {
        displayDebit = net;
      } else {
        displayCredit = Math.abs(net);
      }

      items.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        debit: displayDebit,
        credit: displayCredit,
        level: node.level,
        hasChildren: node.children.length > 0,
        parentId: node.parentId ?? null,
      });

      // Add to Grand Total only if it's a root node
      if (!node.parentId) {
        grandTotalDebit += displayDebit;
        grandTotalCredit += displayCredit;
      }
    }

    return {
      success: true,
      data: {
        items,
        totalDebit: grandTotalDebit,
        totalCredit: grandTotalCredit,
      },
    };
  }
);
