export type Permission = string;

export type PermissionType = {
  name: Permission;
  description: string;
  module: string;
};

export function hasPermission(
  userPermissions: string[],
  requiredPermission: Permission
): boolean {
  if (userPermissions?.includes("*")) return true;
  return userPermissions?.includes(requiredPermission);
}
