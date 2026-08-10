import type { PermissionType } from "./utils";
import { getPermissionRegistry } from "@/services/modules/plugins";

export const register: PermissionType[] = getPermissionRegistry();
