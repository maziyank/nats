import { Decimal } from "decimal.js";
import { journalEntryPostedPayloadSchema } from "@/services/modules/integration/events";
import type { Prisma } from "@/prisma/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Async running balance calculation for a posted journal entry.
 *
 * Computes the net delta per unique account (respecting normal balance
 * direction) and applies it atomically to the `AccountBalance` row.
 * PostgreSQL serializes the `balance = balance + delta` update, so
 * concurrent posts to the same account queue naturally.
 */
export async function handleJournalEntryPostedAccounting(
  tx: Tx,
  payloadInput: unknown,
) {
  const payload = journalEntryPostedPayloadSchema.parse(payloadInput);

  const entry = await tx.journalEntry.findUnique({
    where: { id: payload.journalEntryId },
    select: {
      id: true,
      status: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        select: {
          accountId: true,
          debitAmount: true,
          creditAmount: true,
          account: { select: { normalBalance: true } },
        },
      },
    },
  });

  if (!entry) {
    throw new Error("Journal entry not found");
  }

  // Idempotency guard: the outbox worker may re-deliver a previously
  // processed event (e.g. after a crash). Skip if the entry was reversed
  // or otherwise moved out of `posted` since the event was emitted.
  if (entry.status !== "posted") {
    return;
  }

  const deltas = new Map<string, Decimal>();
  for (const line of entry.lines) {
    const debit = new Decimal(line.debitAmount ?? 0);
    const credit = new Decimal(line.creditAmount ?? 0);
    const signed =
      line.account.normalBalance === "credit"
        ? credit.minus(debit)
        : debit.minus(credit);

    deltas.set(
      line.accountId,
      (deltas.get(line.accountId) ?? new Decimal(0)).plus(signed),
    );
  }

  for (const [accountId, delta] of deltas) {
    if (delta.isZero()) continue;

    await tx.accountBalance.upsert({
      where: { accountId },
      create: { accountId, balance: delta },
      update: { balance: { increment: delta } },
    });
  }
}
