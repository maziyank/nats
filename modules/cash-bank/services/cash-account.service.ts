import { prisma } from "@/lib/prisma";
import { CashAccountFormData } from "@/app/[locale]/(dashboard)/cash-bank/types";
import { z } from "zod";
import { CashAccountType } from "@/prisma/generated/prisma/enums";
import { requiredIdSchema } from "@/lib/validation/schemas";

const cashAccountFormSchema: z.ZodType<CashAccountFormData> = z.object({
    name: z.string().min(1, "Name is required"),
    type: z.nativeEnum(CashAccountType),
    accountNumber: z.string().optional(),
    bankName: z.string().optional(),
    description: z.string().optional(),
    glAccountId: requiredIdSchema,
});

export class CashAccountService {
    static async createAccount(data: CashAccountFormData) {
        data = cashAccountFormSchema.parse(data);
        return await prisma.cashAccount.create({
            data: {
                name: data.name,
                type: data.type,
                accountNumber: data.accountNumber,
                bankName: data.bankName,
                description: data.description,
                glAccountId: data.glAccountId,
            },
        });
    }

    static async updateAccount(id: string, data: CashAccountFormData) {
        requiredIdSchema.parse(id);
        data = cashAccountFormSchema.parse(data);
        return await prisma.cashAccount.update({
            where: { id },
            data: {
                name: data.name,
                type: data.type,
                accountNumber: data.accountNumber,
                bankName: data.bankName,
                description: data.description,
                glAccountId: data.glAccountId,
            },
        });
    }

    static async deleteAccount(id: string) {
        requiredIdSchema.parse(id);
        // Check if there are any transfers associated with this account
        const transfers = await prisma.cashTransfer.findFirst({
            where: {
                OR: [{ fromAccountId: id }, { toAccountId: id }],
            },
        });

        if (transfers) {
            throw new Error("Cannot delete account with existing transfers.");
        }

        await prisma.cashAccount.delete({
            where: { id },
        });
    }

    static async getAccount(id: string) {
        requiredIdSchema.parse(id);
        return await prisma.cashAccount.findUnique({
            where: { id },
            include: {
                glAccount: true,
            },
        });
    }

    static async getAllAccounts() {
        return await prisma.cashAccount.findMany({
            include: {
                glAccount: true,
            },
            orderBy: {
                name: "asc",
            },
        });
    }
}
