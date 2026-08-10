import type { SessionPayload } from "@/services/lib/auth/auth";

export type AIUserContext = {
  userId: string;
  userName: string;
  roleId: string;
  role: string;
  permissions: string[];
};

/** Roles allowed to run custom SQL / schema-driven reports. */
export const CUSTOM_REPORT_ROLES = ["superadmin", "Accountant"] as const;

export type CustomReportRole = (typeof CUSTOM_REPORT_ROLES)[number];

export function toAIUserContext(session: {
  userId: string;
  userName: string;
  roleId: string;
  role: string;
  permissions: string[];
}): AIUserContext {
  return {
    userId: session.userId,
    userName: session.userName,
    roleId: session.roleId,
    role: session.role,
    permissions: session.permissions,
  };
}

export function isCustomReportRole(role: string): boolean {
  const normalized = role.trim().toLowerCase();
  return CUSTOM_REPORT_ROLES.some((r) => r.toLowerCase() === normalized);
}

export function hasWildcardPermission(permissions: string[]): boolean {
  return permissions.includes("*");
}

export function canAccessCustomReports(ctx: AIUserContext): boolean {
  return isCustomReportRole(ctx.role) || hasWildcardPermission(ctx.permissions);
}

export function assertCustomReportAccess(ctx: AIUserContext): void {
  if (!canAccessCustomReports(ctx)) {
    throw new Error(
      "Access denied: custom report generation is restricted to superadmin and Accountant roles.",
    );
  }
}

// SessionPayload re-export for typing convenience where needed
export type { SessionPayload };
