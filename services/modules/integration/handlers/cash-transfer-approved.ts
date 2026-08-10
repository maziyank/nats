import { Decimal } from "decimal.js";
import { JournalService } from "@/services/modules/accounting/services/journal.service";
import { TransferStatus, EntryStatus } from "@/prisma/generated/prisma/enums";
import { cashTransferApprovedPayloadSchema } from "@/services/modules/integration/events";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { generateDocumentNumber } from "@/services/lib/document-numbering";

type Tx = Prisma.TransactionClient;

export async function handleCashTransferApprovedAccounting(
  tx: Tx,
  payloadInput: unknown,
) {
  const payload = cashTransferApprovedPayloadSchema.parse(payloadInput);

  const transfer = await tx.cashTransfer.findUnique({
    where: { id: payload.transferId },
    include: {
      fromAccount: true,
      toAccount: true,
    },
  });

  if (!transfer) {
    throw new Error("Transfer not found");
  }

  const existingJeId = transfer.journalEntryId;
  let jeId = existingJeId;

  if (!jeId) {
    const entryNumber = await generateDocumentNumber(
      "CASH_TRANSFER",
      "Cash Transfer",
      "TRF",
    );
    const je = await JournalService.createJournalEntry(
      {
        entryNumber,
        transactionDate: transfer.date,
        description:
          transfer.description ||
          `Transfer from ${transfer.fromAccount.name} to ${transfer.toAccount.name}`,
        lines: [
          {
            accountId: transfer.toAccount.glAccountId,
            debitAmount: new Decimal(transfer.amount).toNumber(),
            creditAmount: 0,
            description: `Transfer from ${transfer.fromAccount.name}`,
          },
          {
            accountId: transfer.fromAccount.glAccountId,
            debitAmount: 0,
            creditAmount: new Decimal(transfer.amount).toNumber(),
            description: `Transfer to ${transfer.toAccount.name}`,
          },
        ],
      },
      payload.userId,
      tx,
    );
    jeId = je.id;
  }

  if (!existingJeId) {
    await tx.cashTransfer.update({
      where: { id: transfer.id },
      data: { journalEntryId: jeId },
    });
  }

  await JournalService.postJournalEntry(jeId, tx);
}

export async function handleCashTransferApprovedCashBank(
  tx: Tx,
  payloadInput: unknown,
) {
  const payload = cashTransferApprovedPayloadSchema.parse(payloadInput);

  const transfer = await tx.cashTransfer.findUnique({
    where: { id: payload.transferId },
    select: { id: true, status: true, approvedAt: true, journalEntryId: true },
  });

  if (!transfer) {
    throw new Error("Transfer not found");
  }

  if (transfer.status === TransferStatus.APPROVED) {
    return;
  }

  await tx.cashTransfer.update({
    where: { id: payload.transferId },
    data: {
      status: TransferStatus.APPROVED,
      approvedById: payload.userId,
      approvedAt: new Date(),
    },
  });
}
