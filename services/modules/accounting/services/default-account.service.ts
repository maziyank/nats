import { prisma } from "@/services/lib/prisma";
import { DefaultAccountPurpose } from "@/prisma/generated/prisma/client";
import { cache } from "react";

export type DefaultAccountResult = {
    accountId: string;
    accountCode: string;
    accountName: string;
} | null;

const ACCOUNT_SELECT_FIELDS = {
    id: true,
    code: true,
    name: true,
} as const;

export class DefaultAccountService {
    /**
     * Retrieves a single default account by its purpose.
     * Results are cached per request via React's cache().
     */
    static getDefaultAccount = cache(
        async (purpose: DefaultAccountPurpose): Promise<DefaultAccountResult> => {
            const defaultAccount = await prisma.defaultAccount.findFirst({
                where: {
                    purpose,
                    isActive: true,
                },
                include: {
                    account: {
                        select: ACCOUNT_SELECT_FIELDS,
                    },
                },
            });

            if (!defaultAccount) return null;

            return {
                accountId: defaultAccount.accountId,
                accountCode: defaultAccount.account.code,
                accountName: defaultAccount.account.name,
            };
        }
    );

    /**
     * Retrieves multiple default accounts by their purposes.
     * Returns a record keyed by purpose string, with null for missing accounts.
     */
    static getDefaultAccounts = cache(
        async (
            purposes: DefaultAccountPurpose[]
        ): Promise<Record<string, DefaultAccountResult>> => {
            const defaultAccounts = await prisma.defaultAccount.findMany({
                where: {
                    purpose: {
                        in: purposes,
                    },
                    isActive: true,
                },
                include: {
                    account: {
                        select: ACCOUNT_SELECT_FIELDS,
                    },
                },
            });

            const result: Record<string, DefaultAccountResult> = {};

            purposes.forEach((p) => {
                result[p] = null;
            });

            defaultAccounts.forEach((da) => {
                result[da.purpose] = {
                    accountId: da.accountId,
                    accountCode: da.account.code,
                    accountName: da.account.name,
                };
            });

            return result;
        }
    );

    /**
     * Retrieves a default account by purpose, throwing if not configured.
     * Use this when the account is required for the operation to proceed.
     */
    static async getRequiredDefaultAccount(purpose: DefaultAccountPurpose) {
        const account = await DefaultAccountService.getDefaultAccount(purpose);
        if (!account) {
            throw new Error(
                `Missing default account configuration for ${purpose}`
            );
        }
        return account;
    }
}

export const { getDefaultAccount, getDefaultAccounts, getRequiredDefaultAccount } =
    DefaultAccountService;
