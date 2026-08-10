import { accountingPlugin } from "./accounting";
import { adminPlugin } from "./admin";
import { aiPlugin } from "./ai";
import { assetsPlugin } from "./assets";
import { budgetingPlugin } from "./budgeting";
import { cashBankPlugin } from "./cash-bank";
import { hrPlugin } from "./hr";
import { inventoryPlugin } from "./inventory";
import { posPlugin } from "./pos";
import { productionPlugin } from "./production";
import { purchasePlugin } from "./purchase";
import { salesPlugin } from "./sales";
import type { NavItem, NavSectionKey, PermissionDefinition } from "./types";

export const plugins = [
  posPlugin,
  salesPlugin,
  purchasePlugin,
  cashBankPlugin,
  inventoryPlugin,
  productionPlugin,
  accountingPlugin,
  budgetingPlugin,
  assetsPlugin,
  hrPlugin,
  aiPlugin,
  adminPlugin,
];

export function getNavigationBySection(): Record<NavSectionKey, NavItem[]> {
  const result: Record<NavSectionKey, NavItem[]> = {
    "Operations": [],
    "Finance & Accounting": [],
    "Intelligence": [],
    "Administration": [],
  };

  for (const plugin of plugins) {
    for (const nav of plugin.navigation ?? []) {
      result[nav.section].push(...nav.items);
    }
  }

  return result;
}

export function getPermissionRegistry(): PermissionDefinition[] {
  const byName = new Map<string, PermissionDefinition>();

  for (const plugin of plugins) {
    for (const perm of plugin.permissions ?? []) {
      byName.set(perm.name, perm);
    }
  }

  return Array.from(byName.values()).sort((a, b) =>
    a.module.localeCompare(b.module) || a.name.localeCompare(b.name)
  );
}

