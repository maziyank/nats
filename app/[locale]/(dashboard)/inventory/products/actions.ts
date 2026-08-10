"use server";

import { prisma } from "@/services/lib/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { ProductFormData, ProductInput } from "../types";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { SuperJSON } from "@/services/lib/superjson";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";
import { z } from "zod";
import { requiredIdSchema } from "@/services/lib/validation/schemas";

const categoryDataSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

// Categories

export async function getCategories() {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "products.view")) {
    return [];
  }

  return await prisma.category.findMany({
    orderBy: { name: "asc" },
  });
}

export const createCategory = authorizedAction(
  "categories.create",
  async (data: {
    name: string;
    description?: string;
  }) => {
    const result = categoryDataSchema.safeParse(data);
    if (!result.success) {
      return { success: false, error: result.error.issues[0]?.message ?? "Invalid input" };
    }
    try {
      const category = await prisma.category.create({
        data,
      });
      revalidatePath("/inventory/products");
      return { success: true, data: category };
    } catch (error) {
      console.error("Failed to create category:", error);
      return { success: false, error: "Failed to create category" };
    }
  }
);

// Products

export async function getProducts(
  page: number = 1,
  limit: number = 10,
  search?: string,
  categoryId?: string,
) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "products.view")) {
    return {
      products: [],
      total: 0,
      totalPages: 0,
    };
  }

  const skip = (page - 1) * limit;
  const where: Prisma.ProductWhereInput = {
    AND: [],
  };

  if (search) {
    (where.AND as unknown as Prisma.ProductWhereInput[]).push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (categoryId && categoryId !== "ALL") {
    (where.AND as unknown as Prisma.ProductWhereInput[]).push({ categoryId });
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      // List: stock total + base unit only (not all warehouses/units).
      select: {
        id: true,
        name: true,
        sku: true,
        price: true,
        cost: true,
        minStock: true,
        categoryId: true,
        category: {
          select: { id: true, name: true },
        },
        baseUnit: {
          select: { id: true, symbol: true, name: true },
        },
        inventory: {
          select: { quantity: true },
        },
      },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products: SuperJSON.serialize(products),
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getProduct(id: string) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "products.view")) {
    return null;
  }

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      baseUnit: true,
      purchaseUnit: true,
      salesUnit: true,
      priceHistory: {
        orderBy: { effectiveDate: "desc" },
      },
    },
  });

  if (!product) return null;

  return SuperJSON.serialize(product);
}

export async function getProductsByIds(ids: string[]) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "products.view")) {
    return [];
  }

  const products = await prisma.product.findMany({
    where: {
      id: { in: ids },
    },
    include: {
      category: true,
      baseUnit: true,
      discounts: {
        where: {
          isActive: true,
          startDate: { lte: new Date() },
          OR: [
            { endDate: null },
            { endDate: { gte: new Date() } },
          ],
        },
        orderBy: { priority: "desc" },
      },
    },
  });

  return SuperJSON.serialize(products);
}

import { ProductService, productInputSchema } from "@/services/modules/inventory/services/product.service";

export const createProduct = authorizedAction(
  "products.create",
  async (data: ProductInput) => {
    const result = productInputSchema.safeParse(data);
    if (!result.success) {
      return { success: false, error: result.error.issues[0]?.message ?? "Invalid input" };
    }
    try {
      const product = await prisma.$transaction(async (tx) => {
        return await ProductService.createProduct(tx, data);
      });

      revalidatePath("/inventory/products");
      return {
        success: true,
        data: SuperJSON.serialize(product),
      };
    } catch (error) {
      console.error("Failed to create product:", error);
      return { success: false, error: "Failed to create product" };
    }
  },
);

export const updateProduct = authorizedAction(
  "products.edit",
  async (id: string, data: ProductInput) => {
    const idResult = requiredIdSchema.safeParse(id);
    const dataResult = productInputSchema.safeParse(data);
    if (!idResult.success || !dataResult.success) {
      return { success: false, error: dataResult.success ? "Invalid id" : (dataResult.error.issues[0]?.message ?? "Invalid input") };
    }
    try {
      const product = await prisma.$transaction(async (tx) => {
        return await ProductService.updateProduct(tx, id, data);
      });

      revalidatePath("/inventory/products");
      return {
        success: true,
        data: SuperJSON.serialize(product),
      };
    } catch (error) {
      console.error("Failed to update product:", error);
      return { success: false, error: "Failed to update product" };
    }
  },
);

export const deleteProduct = authorizedAction(
  "products.delete",
  async (id: string) => {
    if (!requiredIdSchema.safeParse(id).success) {
      return { success: false, error: "Invalid id" };
    }
    try {
      await prisma.$transaction(async (tx) => {
        await ProductService.deleteProduct(tx, id);
      });
      revalidatePath("/inventory/products");
      return { success: true };
    } catch (error) {
      console.error("Failed to delete product:", error);
      return { success: false, error: "Failed to delete product" };
    }
  },
);

// SKU Search

import {
  searchProductBySku,
  type SkuSearchResult,
} from "@/services/lib/sku-search";

export async function searchSku(
  sku: string,
): Promise<SkuSearchResult> {
  return searchProductBySku(sku);
}
