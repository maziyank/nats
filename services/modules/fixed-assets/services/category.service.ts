import { prisma } from "@/services/lib/prisma";
import { AssetCategory, DepreciationMethod } from "@/prisma/generated/prisma/client";

export type CreateCategoryParams = {
    name: string;
    code: string;
    description?: string;
    defaultUsefulLife?: number;
    defaultMethod?: DepreciationMethod;
    assetAccountId: string;
    accumDepreciationAccountId: string;
    depreciationExpenseAccountId: string;
};

export class CategoryService {
    static async createCategory(data: CreateCategoryParams): Promise<AssetCategory> {
        return await prisma.assetCategory.create({
            data,
        });
    }

    static async getCategories(): Promise<AssetCategory[]> {
        return await prisma.assetCategory.findMany({
            include: {
                assetAccount: true,
                accumDepreciationAccount: true,
                depreciationExpenseAccount: true,
            },
        });
    }
}
