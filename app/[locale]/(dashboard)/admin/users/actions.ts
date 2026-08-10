"use server";

import { prisma } from "@/services/lib/prisma";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";
import { z } from "zod";
import { requiredIdSchema } from "@/services/lib/validation/schemas";

interface UserCreateData {
  name: string;
  email: string;
  password?: string;
  roleId: string;
}

interface UserUpdateData {
  name?: string;
  email?: string;
  password?: string;
  roleId?: string;
}

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  roleId: z.string().min(1, "Role is required"),
});

const updateUserSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").optional(),
  email: z.string().email("Invalid email").optional(),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  roleId: z.string().optional(),
});

export async function getUsers(page: number, limit: number) {
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: {
          select: {
            name: true,
            id: true,
          },
        },
        createdAt: true,
      },
    }),
    prisma.user.count(),
  ]);

  return { data, total, totalPages: Math.ceil(total / limit) };
}

export async function getRoles() {
  const session = await getSession();
  if (!session || (!hasPermission(session.permissions, "users.create") && !hasPermission(session.permissions, "users.edit"))) {
    return [];
  }

  return prisma.role.findMany({
    select: {
      id: true,
      name: true,
      description: true,
    },
  });
}

export const createUser = authorizedAction(
  "users.create",
  async (data: UserCreateData) => {
    const parsed = createUserSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    try {
      if (!data.name) {
        return { success: false, error: "Name is required" };
      }
      if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        return { success: false, error: "Invalid email" };
      }
      if (!data.roleId) {
        return { success: false, error: "Role is required" };
      }
      if (data.password && data.password.length < 6) {
        return {
          success: false,
          error: "Password must be at least 6 characters",
        };
      }

      const hashedPassword = await bcrypt.hash(
        data.password || "password123",
        10
      );

      const user = await prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: hashedPassword,
          roleId: data.roleId,
        },
      });
      revalidatePath("/admin/users");
      return { success: true, data: user };
    } catch (error) {
      console.error("Failed to create user:", error);
      return { success: false, error: "Failed to create user" };
    }
  }
);

export const updateUser = authorizedAction(
  "users.edit",
  async (id: string, data: UserUpdateData) => {
    const parsed = updateUserSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    try {
      if (data.name !== undefined && !data.name) {
        return { success: false, error: "Name cannot be empty" };
      }
      if (
        data.email !== undefined &&
        (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      ) {
        return { success: false, error: "Invalid email" };
      }
      if (data.password && data.password.length < 6) {
        return {
          success: false,
          error: "Password must be at least 6 characters",
        };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = { ...data };

      if (data.password) {
        updateData.password = await bcrypt.hash(data.password, 10);
      } else {
        delete updateData.password;
      }

      Object.keys(updateData).forEach(
        (key) => updateData[key] === undefined && delete updateData[key]
      );

      const user = await prisma.user.update({
        where: { id },
        data: updateData,
      });
      revalidatePath("/admin/users");
      return { success: true, data: user };
    } catch (error) {
      console.error("Failed to update user:", error);
      return { success: false, error: "Failed to update user" };
    }
  }
);

export const deleteUser = authorizedAction(
  "users.delete",
  async (id: string) => {
    const parsed = requiredIdSchema.safeParse(id);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid id" };
    }
    try {
      await prisma.user.delete({
        where: { id: parsed.data },
      });
      revalidatePath("/admin/users");
      return { success: true };
    } catch (error) {
      console.error("Failed to delete user:", error);
      return { success: false, error: "Failed to delete user" };
    }
  }
);
