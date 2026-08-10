"use server";

import { prisma } from "@/services/lib/prisma";
import { revalidatePath } from "next/cache";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";

interface RoleData {
  name: string;
  description?: string;
  permissions: string[];
  isActive?: boolean;
}

export const getRoles = async () => {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "roles:create")) { // Assuming role view needs at least create or similar. TODO: Add roles:view permission
    // Fallback to check if they have access to user management which implies role visibility?
    // For now, let's stick to strict checking or allow if they are admin.
    // Actually, roles page is protected by layout/middleware usually, but server action needs check.
    if (!hasPermission(session?.permissions || [], "roles:update")) {
      return [];
    }
  }

  return prisma.role.findMany({
    orderBy: { name: "asc" },
  });
};

export const getRole = async (id: string) => {
  const session = await getSession();
  if (!session || (!hasPermission(session.permissions, "roles:create") && !hasPermission(session.permissions, "roles:update"))) {
    return null;
  }

  const role = await prisma.role.findUnique({
    where: { id },
  });
  return role;
};
/**
 * Create a new user role.
 * Permission: "roles:create"
 *
 * @param data - The role data (name, description, permissions, etc.)
 * @returns    - Success flag or error
 */
export const createRole = authorizedAction(
  "roles:create",
  async (data: RoleData) => {
    if (!data.name) {
      return { success: false, error: "Name is required" };
    }
    // Permissions are optional on creation now, can be added later
    // if (!data.permissions || data.permissions.length === 0) {
    //   return { success: false, error: "At least one permission is required" };
    // }

    const isActive = data.isActive ?? true;

    const existing = await prisma.role.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      return { success: false, error: "Role with this name already exists" };
    }

    await prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        permissions: data.permissions || [],
        isActive,
      },
    });

    revalidatePath("/admin/roles");
    return { success: true };
  }
);

/**
 * Update an existing role.
 * Permission: "roles:update"
 *
 * @param id   - The ID of the role to update
 * @param data - The new role data
 * @returns    - Success flag or error
 */
export const updateRole = authorizedAction(
  "roles:update",
  async (id: string, data: RoleData) => {
    if (!data.name) {
      return { success: false, error: "Name is required" };
    }
    // Permissions check removed to allow updating just details
    // if (!data.permissions || data.permissions.length === 0) {
    //   return { success: false, error: "At least one permission is required" };
    // }

    const isActive = data.isActive ?? true;

    const existing = await prisma.role.findUnique({
      where: { name: data.name },
    });

    if (existing && existing.id !== id) {
      return { success: false, error: "Role with this name already exists" };
    }

    await prisma.role.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        permissions: data.permissions, // Optional update if provided
        isActive,
      },
    });

    revalidatePath("/admin/roles");
    return { success: true };
  }
);

/**
 * Update permissions for a specific role.
 * Permission: "roles:update"
 *
 * @param id          - The ID of the role
 * @param permissions - List of permission strings
 * @returns           - Success flag or error
 */
export const updateRolePermissions = authorizedAction(
  "roles:update",
  async (id: string, permissions: string[]) => {
    await prisma.role.update({
      where: { id },
      data: {
        permissions,
      },
    });

    revalidatePath("/admin/roles");
    return { success: true };
  }
);

/**
 * Toggle the active status of a role.
 * Cannot deactivate the "superadmin" role.
 * Permission: "roles:update"
 *
 * @param id - The ID of the role
 * @returns  - Success flag or error
 */
export const toggleRoleStatus = authorizedAction(
  "roles:update",
  async (id: string) => {
    const role = await prisma.role.findUnique({
      where: { id },
    });

    if (!role) {
      return { success: false, error: "Role not found" };
    }

    if (role.name === "superadmin") {
      return { success: false, error: "Cannot deactivate superadmin role" };
    }

    await prisma.role.update({
      where: { id },
      data: { isActive: !role.isActive },
    });

    revalidatePath("/admin/roles");
    return { success: true };
  }
);

/**
 * Delete a role.
 * Cannot delete "superadmin" or if users are assigned to it.
 * Permission: "roles:delete"
 *
 * @param id - The ID of the role
 * @returns  - Success flag or error
 */
export const deleteRole = authorizedAction(
  "roles:delete",
  async (id: string) => {
    const role = await prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });

    if (!role) {
      return { success: false, error: "Role not found" };
    }

    if (role.name === "superadmin") {
      return { success: false, error: "Cannot delete superadmin role" };
    }

    if ((role as any)._count.users > 0) {
      return {
        success: false,
        error:
          "Cannot delete role with assigned users. Please reassign them first.",
      };
    }

    await prisma.role.delete({
      where: { id },
    });

    revalidatePath("/admin/roles");
    return { success: true };
  }
);
