"use client";

import { usePermission } from "@/services/lib/permissions/use-permission";
import { Permission } from "@/services/lib/permissions/utils";

interface ProtectProps {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function Protect({
  permission,
  children,
  fallback = null,
}: ProtectProps) {
  const hasAccess = usePermission(permission);

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
