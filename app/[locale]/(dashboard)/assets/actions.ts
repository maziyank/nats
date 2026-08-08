"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { SuperJSON } from "@/lib/superjson";
import { AssetService } from "@/modules/fixed-assets/services/asset.service";
import { DepreciationService } from "@/modules/fixed-assets/services/depreciation.service";
import { CategoryService } from "@/modules/fixed-assets/services/category.service";
import { AssetStatus, DepreciationMethod } from "@/prisma/generated/prisma/client";
import { Decimal } from "decimal.js";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/auth";
import {
  dateSchema,
  nonNegativeDecimalSchema,
  requiredIdSchema,
} from "@/lib/validation/schemas";

// --- Types ---
export type AssetFormData = {
  code: string;
  name: string;
  description?: string;
  serialNumber?: string;
  barcode?: string;
  purchaseDate: Date;
  acquisitionCost: number;
  residualValue: number;
  usefulLife: number;
  depreciationMethod: DepreciationMethod;
  categoryId: string;
  location?: string;
  department?: string;
  assignedTo?: string;
};

export type AssetCategoryFormData = {
  name: string;
  code: string;
  description?: string;
  defaultUsefulLife?: number;
  defaultMethod?: DepreciationMethod;
  assetAccountId: string;
  accumDepreciationAccountId: string;
  depreciationExpenseAccountId: string;
};

const assetSchema = z.object({
  code: z.string().min(1, "Asset code is required"),
  name: z.string().min(1, "Asset name is required"),
  description: z.string().optional(),
  serialNumber: z.string().optional(),
  barcode: z.string().optional(),
  purchaseDate: dateSchema,
  acquisitionCost: nonNegativeDecimalSchema,
  residualValue: nonNegativeDecimalSchema,
  usefulLife: z.number().int().positive("Useful life must be a positive integer"),
  depreciationMethod: z.nativeEnum(DepreciationMethod),
  categoryId: requiredIdSchema,
  location: z.string().optional(),
  department: z.string().optional(),
  assignedTo: z.string().optional(),
});

const assetCategorySchema = z.object({
  name: z.string().min(1, "Category name is required"),
  code: z.string().min(1, "Category code is required"),
  description: z.string().optional(),
  defaultUsefulLife: z.number().int().positive().optional(),
  defaultMethod: z.nativeEnum(DepreciationMethod).optional(),
  assetAccountId: requiredIdSchema,
  accumDepreciationAccountId: requiredIdSchema,
  depreciationExpenseAccountId: requiredIdSchema,
});

// --- Asset Actions ---

export async function getAssets() {
  const assets = await AssetService.getAssets();
  return SuperJSON.serialize(assets);
}

export async function getAsset(id: string) {
  const asset = await AssetService.getAsset(id);
  return asset ? SuperJSON.serialize(asset) : null;
}

export async function createAsset(data: AssetFormData) {
  try {
    const parseResult = assetSchema.safeParse(data);
    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const parsed = parseResult.data;

    const session = await getSession();
    if (!session?.userId) throw new Error("Unauthorized");

    const asset = await AssetService.createAsset({
      ...parsed,
      userId: session.userId,
    });

    // Calculate initial depreciation schedule (preview)
    const schedule = DepreciationService.calculateDepreciationSchedule(
      new Decimal(parsed.acquisitionCost),
      new Decimal(parsed.residualValue),
      parsed.usefulLife,
      parsed.depreciationMethod,
      parsed.purchaseDate
    );

    if (schedule.length > 0) {
      await prisma.depreciationSchedule.createMany({
        data: schedule.map((s) => ({
          assetId: asset.id,
          date: s.date,
          amount: s.amount,
          bookValueAfter: s.bookValueAfter,
        })),
      });
    }

    revalidatePath("/assets");
    return { success: true, data: SuperJSON.serialize(asset) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateAsset(id: string, data: Partial<AssetFormData>) {
  try {
    const idResult = requiredIdSchema.safeParse(id);
    if (!idResult.success) {
      return { success: false, error: "Invalid asset id" };
    }
    const parseResult = assetSchema.partial().safeParse(data);
    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const parsed = parseResult.data;

    const session = await getSession();
    if (!session?.userId) throw new Error("Unauthorized");

    const asset = await AssetService.updateAsset(idResult.data, {
      ...parsed,
      userId: session.userId,
    });

    // Recalculate schedule if key fields changed logic
    if (asset.status === AssetStatus.DRAFT) {
      await prisma.depreciationSchedule.deleteMany({ where: { assetId: id, isPosted: false } });

      const schedule = DepreciationService.calculateDepreciationSchedule(
        asset.acquisitionCost,
        asset.residualValue,
        asset.usefulLife,
        asset.depreciationMethod,
        asset.purchaseDate
      );

      if (schedule.length > 0) {
        await prisma.depreciationSchedule.createMany({
          data: schedule.map((s) => ({
            assetId: asset.id,
            date: s.date,
            amount: s.amount,
            bookValueAfter: s.bookValueAfter,
          })),
        });
      }
    }

    revalidatePath("/assets");
    revalidatePath(`/assets/${id}`);
    return { success: true, data: SuperJSON.serialize(asset) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function activateAsset(id: string) {
  try {
    const session = await getSession();
    if (!session?.userId) throw new Error("Unauthorized");

    await AssetService.activateAsset(id, session.userId);
    revalidatePath(`/assets/${id}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function disposeAsset(
  id: string,
  date: Date,
  amount: number,
  reason: string,
  depositAccountId: string,
  userId: string
) {
  try {
    const idResult = requiredIdSchema.safeParse(id);
    if (!idResult.success) {
      return { success: false, error: "Invalid asset id" };
    }
    const parseResult = z
      .object({
        date: dateSchema,
        amount: nonNegativeDecimalSchema,
        reason: z.string().min(1, "Disposal reason is required"),
      })
      .safeParse({ date, amount, reason });
    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const parsed = parseResult.data;

    const session = await getSession();
    if (!session?.userId) throw new Error("Unauthorized");

    await AssetService.disposeAsset(idResult.data, {
      date: parsed.date,
      amount: parsed.amount,
      reason: parsed.reason,
      userId: session.userId,
    });

    revalidatePath(`/assets/${id}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- Category Actions ---

export async function getAssetCategories() {
  const categories = await CategoryService.getCategories();
  return SuperJSON.serialize(categories);
}

export async function createAssetCategory(data: AssetCategoryFormData) {
  try {
    const parseResult = assetCategorySchema.safeParse(data);
    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const category = await CategoryService.createCategory(parseResult.data);
    revalidatePath("/assets/categories");
    return { success: true, data: SuperJSON.serialize(category) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- Depreciation Actions ---

export async function getDueDepreciationSchedules() {
  const schedules = await DepreciationService.getDueDepreciationSchedules();
  return SuperJSON.serialize(schedules);
}

export async function postDepreciationRun(scheduleIds: string[], userId: string) {
  try {
    const idsResult = z
      .array(requiredIdSchema)
      .min(1, "At least one schedule id is required")
      .safeParse(scheduleIds);
    if (!idsResult.success) {
      return {
        success: false,
        error: idsResult.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const validatedIds = idsResult.data;

    const session = await getSession();
    if (!session?.userId) throw new Error("Unauthorized");

    let count = 0;
    for (const id of validatedIds) {
      await DepreciationService.postDepreciation(id, session.userId);
      count++;
    }
    revalidatePath("/assets/depreciation");
    return { success: true, count };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
