import { prisma } from "@/services/lib/prisma";
import {
    TransferStatus,
} from "@/prisma/generated/prisma/enums";
import { Decimal } from "decimal.js";
import {
    enqueueIntegrationEventOnce,
} from "@/services/modules/integration/outbox";
import { z } from "zod";
import { cashTransferSchema } from "@/services/lib/validation/schemas";

export type CreateCashTransferInput = z.infer<typeof cashTransferSchema>;

export class CashTransferService {
    static async createTransfer(data: CreateCashTransferInput) {
        // 1. Validate accounts
        const fromAccount = await prisma.cashAccount.findUnique({
            where: { id: data.fromAccountId },
            include: { glAccount: true },
        });
        const toAccount = await prisma.cashAccount.findUnique({
            where: { id: data.toAccountId },
            include: { glAccount: true },
        });

        if (!fromAccount || !toAccount) {
            throw new Error("Invalid accounts.");
        }

        if (data.fromAccountId === data.toAccountId) {
            throw new Error("Cannot transfer to the same account.");
        }

        // 2. Create Transfer (Pending Approval)
        const transfer = await prisma.cashTransfer.create({
            data: {
                fromAccountId: data.fromAccountId,
                toAccountId: data.toAccountId,
                amount: new Decimal(data.amount),
                date: data.date,
                description: data.description,
                reference: data.reference,
                status: TransferStatus.PENDING,
            },
        });

        return transfer;
    }

    static async updateTransfer(id: string, data: CreateCashTransferInput) {
        const transfer = await prisma.cashTransfer.findUnique({
            where: { id },
        });

        if (!transfer) {
            throw new Error("Transfer not found");
        }

        if (transfer.status === TransferStatus.APPROVED) {
            throw new Error("Cannot edit approved transfer");
        }

        // Validate accounts
        if (data.fromAccountId === data.toAccountId) {
            throw new Error("Cannot transfer to the same account.");
        }

        return await prisma.cashTransfer.update({
            where: { id },
            data: {
                fromAccountId: data.fromAccountId,
                toAccountId: data.toAccountId,
                amount: new Decimal(data.amount),
                date: data.date,
                description: data.description,
                reference: data.reference,
            },
        });
    }

    static async approveTransfer(id: string, userId: string) {
        const transfer = await prisma.cashTransfer.findUnique({
            where: { id },
            include: {
                fromAccount: { include: { glAccount: true } },
                toAccount: { include: { glAccount: true } },
            },
        });

        if (!transfer) {
            throw new Error("Transfer not found");
        }

        if (transfer.status === TransferStatus.APPROVED) {
            throw new Error("Transfer already approved");
        }

        const outbox = await prisma.$transaction(async (tx) => {
            return enqueueIntegrationEventOnce(tx, {
                topic: "cash_bank",
                type: "CASH_TRANSFER_APPROVED",
                aggregateType: "CashTransfer",
                aggregateId: id,
                payload: {
                    transferId: id,
                    userId,
                },
            });
        });

        return {
            transferId: id,
            outboxId: outbox.id,
            alreadyQueued: outbox.alreadyQueued,
        };
    }

    static async deleteTransfer(id: string) {
        const transfer = await prisma.cashTransfer.findUnique({
            where: { id },
        });

        if (!transfer) {
            throw new Error("Transfer not found");
        }

        if (transfer.status === TransferStatus.APPROVED) {
            throw new Error("Cannot delete approved transfer");
        }

        await prisma.cashTransfer.delete({
            where: { id },
        });
    }
}
