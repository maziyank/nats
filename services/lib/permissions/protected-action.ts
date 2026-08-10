import { getSession } from "@/services/lib/auth/auth";
import { hasPermission, Permission } from "@/services/lib/permissions/utils";
import { prisma } from "@/services/lib/prisma";
import type { ActionResponse } from "@/types/actions";
export type { ActionResponse };

/**
 * Wraps a server action with session auth, active-role, and permission checks.
 */
export function authorizedAction<T, A extends unknown[]>(
  permission: Permission,
  action: (...args: A) => Promise<ActionResponse<T>>,
) {
  return async (...args: A): Promise<ActionResponse<T>> => {
    const session = await getSession();

    if (!session) {
      return { success: false, error: "Unauthorized" };
    }

    const role = await prisma.role.findUnique({
      where: { id: session.roleId },
      select: { isActive: true },
    });

    if (!role || !role.isActive) {
      return { success: false, error: "Forbidden: Role is deactivated" };
    }

    if (!hasPermission(session.permissions, permission)) {
      return { success: false, error: "Forbidden: Insufficient permissions" };
    }

    return action(...args);
  };
}
