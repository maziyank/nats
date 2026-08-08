"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/prisma/client";
import { getSession } from "@/lib/auth/auth";
import { hasPermission } from "@/lib/permissions/utils";
import { z } from "zod";
import { requiredIdSchema } from "@/lib/validation/schemas";

const categoryDataSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export async function getCategories(
  page: number = 1,
  limit: number = 10,
  search?: string
) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "products.view")) {
    return {
      categories: [],
      total: 0,
      totalPages: 0,
    };
  }

  const skip = (page - 1) * limit;
  const where: Prisma.CategoryWhereInput = {
    AND: [],
  };

  if (search) {
    (where.AND as Prisma.CategoryWhereInput[]).push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  const [categories, total] = await Promise.all([
    prisma.category.findMany({
      where,
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.category.count({ where }),
  ]);

  return {
    categories,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

import { authorizedAction } from "@/lib/permissions/protected-action";

export const createCategory = authorizedAction(
  "categories.create",
  async (data: { name: string; description?: string }) => {
    const result = categoryDataSchema.safeParse(data);
    if (!result.success) {
      return { success: false, error: result.error.issues[0]?.message ?? "Invalid input" };
    }
    try {
      const category = await prisma.category.create({
        data,
      });
      revalidatePath("/inventory/categories");
      return { success: true, data: category };
    } catch (error) {
      console.error("Failed to create category:", error);
      return { success: false, error: "Failed to create category" };
    }
  }
);

export const updateCategory = authorizedAction(
  "categories.edit",
  async (id: string, data: { name: string; description?: string }) => {
    const idResult = requiredIdSchema.safeParse(id);
    const dataResult = categoryDataSchema.safeParse(data);
    if (!idResult.success || !dataResult.success) {
      return { success: false, error: dataResult.success ? "Invalid id" : (dataResult.error.issues[0]?.message ?? "Invalid input") };
    }
    try {
      const category = await prisma.category.update({
        where: { id },
        data,
      });
      revalidatePath("/inventory/categories");
      return { success: true, data: category };
    } catch (error) {
      console.error("Failed to update category:", error);
      return { success: false, error: "Failed to update category" };
    }
  }
);

export const deleteCategory = authorizedAction(
  "categories.delete",
  async (id: string) => {
    if (!requiredIdSchema.safeParse(id).success) {
      return { success: false, error: "Invalid id" };
    }
    try {
      await prisma.category.delete({
        where: { id },
      });
      revalidatePath("/inventory/categories");
      return { success: true };
    } catch (error) {
      console.error("Failed to delete category:", error);
      return { success: false, error: "Failed to delete category" };
    }
  }
);
