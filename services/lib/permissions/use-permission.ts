"use client";

import { useSession } from "@/components/providers/session-provider";
import { hasPermission, Permission } from "@/services/lib/permissions/utils";

export function usePermission(permission: Permission) {
  const session = useSession();

  if (!session) return false;

  return hasPermission(session.permissions, permission);
}
