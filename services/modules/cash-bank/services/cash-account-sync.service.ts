
import { prisma } from "@/services/lib/prisma";
import { AccountType, CashAccountType } from "@/prisma/generated/prisma/enums";

export class CashAccountSyncService {
    static async sync() {
        const cashGLAccounts = await prisma.account.findMany({
            where: {
                type: AccountType.asset,
                isPosting: true,
                children: {
                    none: {},
                },
            },
            include: {
                cashAccount: true,
            },
        });

        const existingCashAccounts = await prisma.cashAccount.findMany();
        const existingGLAccountIds = new Set(
            existingCashAccounts.map((ca) => ca.glAccountId)
        );

        const newCashAccounts = [];
        for (const glAccount of cashGLAccounts) {
            if (!existingGLAccountIds.has(glAccount.id)) {
                newCashAccounts.push({
                    name: glAccount.name,
                    type: CashAccountType.CASH, // Default type
                    glAccountId: glAccount.id,
                });
            }
        }

        if (newCashAccounts.length > 0) {
            await prisma.cashAccount.createMany({
                data: newCashAccounts,
            });
        }

        return {
            syncedCount: newCashAccounts.length,
        };
    }
}
