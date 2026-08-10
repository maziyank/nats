import { prisma } from "@/services/lib/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";

export type PeriodBalanceMap = Map<string, { debit: number; credit: number }>;

/**
 * Normalize a date to the last calendar day of its month (UTC date, time zeroed).
 */
export function endOfMonthUtc(date: Date): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  // Day 0 of next month = last day of current month
  return new Date(Date.UTC(y, m + 1, 0));
}

/**
 * First day of the month following the given date (UTC).
 */
export function startOfNextMonthUtc(date: Date): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  return new Date(Date.UTC(y, m + 1, 1));
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Ensure monthly cumulative snapshots exist for all months through `asOf`.
 * Safe to call repeatedly — only missing months are computed.
 *
 * Strategy: for each missing month-end, take the previous month snapshot (if any)
 * and add journal line aggregates for that month only.
 */
export async function ensurePeriodBalancesThrough(
  asOf: Date,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  const targetEnd = endOfMonthUtc(asOf);
  const now = new Date();
  // Never snapshot a future month
  const maxEnd = endOfMonthUtc(now < targetEnd ? now : targetEnd);

  // Find the latest existing snapshot
  const latest = await db.accountPeriodBalance.findFirst({
    orderBy: { periodEnd: "desc" },
    select: { periodEnd: true },
  });

  let cursor: Date;
  if (latest) {
    cursor = startOfNextMonthUtc(latest.periodEnd);
  } else {
    // Bootstrap from earliest posted journal
    const first = await db.journalEntry.findFirst({
      where: { status: "posted" },
      orderBy: { transactionDate: "asc" },
      select: { transactionDate: true },
    });
    if (!first) return; // nothing to snapshot
    cursor = new Date(
      Date.UTC(
        first.transactionDate.getUTCFullYear(),
        first.transactionDate.getUTCMonth(),
        1,
      ),
    );
  }

  // Walk month by month until maxEnd
  while (cursor <= maxEnd) {
    const periodEnd = endOfMonthUtc(cursor);
    const monthStart = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1),
    );
    // Inclusive end of month at 23:59:59.999 UTC for journal filter
    const monthEndExclusive = startOfNextMonthUtc(cursor);

    // Previous month balances as base
    const prevEnd = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 0),
    );
    const prevRows = await db.accountPeriodBalance.findMany({
      where: { periodEnd: prevEnd },
      select: { accountId: true, debitTotal: true, creditTotal: true },
    });
    const base = new Map(
      prevRows.map((r) => [
        r.accountId,
        {
          debit: Number(r.debitTotal),
          credit: Number(r.creditTotal),
        },
      ]),
    );

    // Aggregate this month's posted lines
    const monthAgg = await db.journalEntryLine.groupBy({
      by: ["accountId"],
      where: {
        journalEntry: {
          status: "posted",
          transactionDate: {
            gte: monthStart,
            lt: monthEndExclusive,
          },
        },
      },
      _sum: {
        debitAmount: true,
        creditAmount: true,
      },
    });

    for (const row of monthAgg) {
      const prev = base.get(row.accountId) ?? { debit: 0, credit: 0 };
      base.set(row.accountId, {
        debit: prev.debit + Number(row._sum.debitAmount || 0),
        credit: prev.credit + Number(row._sum.creditAmount || 0),
      });
    }

    // Upsert all accounts that have any activity (or previous balance)
    if (base.size > 0) {
      const data = [...base.entries()].map(([accountId, totals]) => ({
        accountId,
        periodEnd,
        debitTotal: totals.debit,
        creditTotal: totals.credit,
        computedAt: new Date(),
      }));

      // createMany + skipDuplicates is fine; then update changed rows
      await db.accountPeriodBalance.createMany({
        data,
        skipDuplicates: true,
      });

      // For accounts that already had a row for this period (re-run), update totals
      await Promise.all(
        data.map((row) =>
          db.accountPeriodBalance.updateMany({
            where: { accountId: row.accountId, periodEnd: row.periodEnd },
            data: {
              debitTotal: row.debitTotal,
              creditTotal: row.creditTotal,
              computedAt: row.computedAt,
            },
          }),
        ),
      );
    }

    // Advance to next month
    cursor = startOfNextMonthUtc(cursor);
  }
}

/**
 * Load cumulative balances as of a date using monthly snapshots + residual days.
 *
 * - If asOf is exactly a month-end with a snapshot → pure snapshot read
 * - Otherwise: nearest prior month-end snapshot + live aggregate for residual days
 * - If no snapshot exists yet, falls back to full live groupBy (and kicks off ensure)
 */
export async function getCumulativeBalancesAsOf(
  asOf: Date,
  options?: { accountIds?: string[] },
): Promise<PeriodBalanceMap> {
  const asOfEnd = new Date(asOf);
  asOfEnd.setHours(23, 59, 59, 999);

  // Ensure snapshots are caught up through the prior full month
  const priorMonthEnd = new Date(
    Date.UTC(asOfEnd.getUTCFullYear(), asOfEnd.getUTCMonth(), 0),
  );

  try {
    await ensurePeriodBalancesThrough(priorMonthEnd);
  } catch (err) {
    // Snapshot table may not exist yet before migration — fall through to live
    console.warn("[period-balance] ensure failed, using live aggregate", err);
  }

  const monthEnd = endOfMonthUtc(asOfEnd);
  const isMonthEnd =
    asOfEnd.getUTCDate() === monthEnd.getUTCDate() &&
    asOfEnd.getUTCMonth() === monthEnd.getUTCMonth() &&
    asOfEnd.getUTCFullYear() === monthEnd.getUTCFullYear();

  // Try exact month-end snapshot
  if (isMonthEnd) {
    try {
      await ensurePeriodBalancesThrough(monthEnd);
      const rows = await prisma.accountPeriodBalance.findMany({
        where: {
          periodEnd: monthEnd,
          ...(options?.accountIds
            ? { accountId: { in: options.accountIds } }
            : {}),
        },
        select: { accountId: true, debitTotal: true, creditTotal: true },
      });
      if (rows.length > 0) {
        return new Map(
          rows.map((r) => [
            r.accountId,
            { debit: Number(r.debitTotal), credit: Number(r.creditTotal) },
          ]),
        );
      }
    } catch {
      // fall through
    }
  }

  // Snapshot + residual path
  let base: PeriodBalanceMap = new Map();
  let residualStart: Date | null = null;

  try {
    const snap = await prisma.accountPeriodBalance.findFirst({
      where: { periodEnd: { lte: asOfEnd } },
      orderBy: { periodEnd: "desc" },
      select: { periodEnd: true },
    });

    if (snap) {
      const rows = await prisma.accountPeriodBalance.findMany({
        where: {
          periodEnd: snap.periodEnd,
          ...(options?.accountIds
            ? { accountId: { in: options.accountIds } }
            : {}),
        },
        select: { accountId: true, debitTotal: true, creditTotal: true },
      });
      base = new Map(
        rows.map((r) => [
          r.accountId,
          { debit: Number(r.debitTotal), credit: Number(r.creditTotal) },
        ]),
      );
      residualStart = startOfNextMonthUtc(snap.periodEnd);
    }
  } catch {
    // table missing — full live path
  }

  // Residual (or full) live aggregate
  const liveWhere: Prisma.JournalEntryLineWhereInput = {
    journalEntry: {
      status: "posted",
      transactionDate: residualStart
        ? { gte: residualStart, lte: asOfEnd }
        : { lte: asOfEnd },
    },
    ...(options?.accountIds
      ? { accountId: { in: options.accountIds } }
      : {}),
  };

  const live = await prisma.journalEntryLine.groupBy({
    by: ["accountId"],
    where: liveWhere,
    _sum: { debitAmount: true, creditAmount: true },
  });

  for (const row of live) {
    const prev = base.get(row.accountId) ?? { debit: 0, credit: 0 };
    base.set(row.accountId, {
      debit: prev.debit + Number(row._sum.debitAmount || 0),
      credit: prev.credit + Number(row._sum.creditAmount || 0),
    });
  }

  return base;
}

/**
 * Period (start..end) balances = cumulative(end) − cumulative(start − 1 day).
 */
export async function getPeriodBalances(
  startDate: Date,
  endDate: Date,
  options?: { accountIds?: string[] },
): Promise<PeriodBalanceMap> {
  const dayBefore = new Date(startDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  dayBefore.setHours(23, 59, 59, 999);

  const [endMap, startMap] = await Promise.all([
    getCumulativeBalancesAsOf(endDate, options),
    getCumulativeBalancesAsOf(dayBefore, options),
  ]);

  const result: PeriodBalanceMap = new Map();
  const accountIds = new Set([...endMap.keys(), ...startMap.keys()]);
  for (const id of accountIds) {
    const end = endMap.get(id) ?? { debit: 0, credit: 0 };
    const start = startMap.get(id) ?? { debit: 0, credit: 0 };
    result.set(id, {
      debit: end.debit - start.debit,
      credit: end.credit - start.credit,
    });
  }
  return result;
}

// silence unused helper warning in some builds
void dateKey;
