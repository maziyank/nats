"use server";

import { prisma } from "@/services/lib/prisma";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { revalidatePath } from "next/cache";
import {
    AVAILABLE_TEMPLATES,
    RECOMMENDED_DEFAULT_ACCOUNT_MAPPINGS,
    DEFAULT_UNITS,
    DEFAULT_CATEGORIES,
} from "@/services/modules/accounting/services/chart-of-accounts-template";
import { DefaultAccountPurpose } from "@/prisma/generated/prisma/client";

export type SetupStatus = {
    hasCompanyProfile: boolean;
    accountCount: number;
    defaultAccountCount: number;
    warehouseCount: number;
    unitCount: number;
    categoryCount: number;
};

/**
 * Fetches current setup completion status for each wizard step.
 */
export async function getSetupStatus(): Promise<SetupStatus> {
    const [
        companyProfile,
        accountCount,
        defaultAccountCount,
        warehouseCount,
        unitCount,
        categoryCount,
    ] = await Promise.all([
        prisma.companyProfile.findFirst(),
        prisma.account.count(),
        prisma.defaultAccount.count({ where: { isActive: true } }),
        prisma.warehouse.count(),
        prisma.unit.count(),
        prisma.category.count(),
    ]);

    return {
        hasCompanyProfile: !!companyProfile,
        accountCount,
        defaultAccountCount,
        warehouseCount,
        unitCount,
        categoryCount,
    };
}

interface CompanyProfileInput {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    taxId?: string;
    currency: string;
    currencySymbol: string;
    dateFormat: string;
    currencyFormat: string;
    locale: string;
    timezone: string;
}

/**
 * Creates or updates the company profile during initial setup.
 */
export const saveCompanyProfile = authorizedAction(
    "company.settings",
    async (data: CompanyProfileInput) => {
        if (!data.name) {
            return { success: false, error: "Company name is required" };
        }

        const existing = await prisma.companyProfile.findFirst();

        if (existing) {
            await prisma.companyProfile.update({
                where: { id: existing.id },
                data,
            });
        } else {
            await prisma.companyProfile.create({ data });
        }

        revalidatePath("/", "layout");
        return { success: true };
    }
);

/**
 * Seeds the standard chart of accounts.
 * Skips accounts that already exist (matched by code).
 */
export const seedChartOfAccounts = authorizedAction(
    "company.settings",
    async (templateId?: string) => {
        let createdCount = 0;

        const id = templateId || "general";
        const templateDef = AVAILABLE_TEMPLATES.find(t => t.id === id) || AVAILABLE_TEMPLATES[0];
        const chartTemplate = templateDef.getTemplate();

        for (const account of chartTemplate) {
            let parentId: string | null = null;

            if (account.parentCode) {
                const parent = await prisma.account.findUnique({
                    where: { code: account.parentCode },
                });
                if (parent) {
                    parentId = parent.id;
                }
            }

            const existing = await prisma.account.findUnique({
                where: { code: account.code },
            });

            if (!existing) {
                await prisma.account.create({
                    data: {
                        code: account.code,
                        name: account.name,
                        type: account.type,
                        normalBalance: account.normalBalance,
                        isPosting: account.isPosting,
                        level: account.level,
                        parentId,
                    },
                });
                createdCount++;
            }
        }

        return { success: true, data: { createdCount } };
    }
);

/**
 * Seeds recommended default account mappings.
 * Uses the standard CoA codes to find the account IDs.
 */
export const seedDefaultAccounts = authorizedAction(
    "company.settings",
    async () => {
        let mappedCount = 0;

        for (const mapping of RECOMMENDED_DEFAULT_ACCOUNT_MAPPINGS) {
            const account = await prisma.account.findUnique({
                where: { code: mapping.code },
            });

            const purpose = mapping.purpose as DefaultAccountPurpose;

            if (account) {
                // Deactivate existing mapping for this purpose
                await prisma.defaultAccount.updateMany({
                    where: { purpose, isActive: true },
                    data: { isActive: false },
                });

                await prisma.defaultAccount.create({
                    data: {
                        purpose,
                        accountId: account.id,
                        isActive: true,
                    },
                });
                mappedCount++;
            }
        }

        return { success: true, data: { mappedCount } };
    }
);

/**
 * Saves custom default account mappings provided by the user.
 */
export const saveCustomDefaultAccounts = authorizedAction(
    "company.settings",
    async (
        mappings: { purpose: DefaultAccountPurpose; accountId: string }[]
    ) => {
        for (const mapping of mappings) {
            await prisma.defaultAccount.updateMany({
                where: { purpose: mapping.purpose, isActive: true },
                data: { isActive: false },
            });

            await prisma.defaultAccount.create({
                data: {
                    purpose: mapping.purpose,
                    accountId: mapping.accountId,
                    isActive: true,
                },
            });
        }

        return { success: true };
    }
);

interface WarehouseInput {
    name: string;
    location?: string;
}

/**
 * Creates the first warehouse and seeds default units/categories.
 */
export const saveInitialWarehouse = authorizedAction(
    "company.settings",
    async (data: WarehouseInput) => {
        if (!data.name) {
            return { success: false, error: "Warehouse name is required" };
        }

        // Create warehouse
        const existing = await prisma.warehouse.findUnique({
            where: { name: data.name },
        });

        if (!existing) {
            await prisma.warehouse.create({
                data: {
                    name: data.name,
                    location: data.location || null,
                },
            });
        }

        // Seed default units
        for (const unit of DEFAULT_UNITS) {
            const existingUnit = await prisma.unit.findUnique({
                where: { name: unit.name },
            });
            if (!existingUnit) {
                await prisma.unit.create({ data: unit });
            }
        }

        // Seed default categories
        for (const category of DEFAULT_CATEGORIES) {
            const existingCategory = await prisma.category.findUnique({
                where: { name: category.name },
            });
            if (!existingCategory) {
                await prisma.category.create({ data: category });
            }
        }

        return { success: true };
    }
);

/**
 * Fetches all posting accounts for the default accounts step.
 */
export async function getPostingAccounts() {
    return prisma.account.findMany({
        where: { isPosting: true },
        select: { id: true, code: true, name: true, type: true },
        orderBy: { code: "asc" },
    });
}

/**
 * Fetches current default account mappings.
 */
export async function getCurrentDefaultAccounts() {
    return prisma.defaultAccount.findMany({
        where: { isActive: true },
        include: { account: { select: { id: true, code: true, name: true } } },
    });
}
