import type { LucideIcon } from "lucide-react";

export type NavSectionKey =
  | "Operations"
  | "Finance & Accounting"
  | "Intelligence"
  | "Administration";

export type NavSubItem = {
  title: string;
  url: string;
};

export type NavItem = {
  title: string;
  url: string;
  icon?: LucideIcon;
  items?: NavSubItem[];
};

export type PermissionDefinition = {
  name: string;
  description: string;
  module: string;
};

export type ModulePlugin = {
  id: string;
  navigation?: Array<{
    section: NavSectionKey;
    items: NavItem[];
  }>;
  permissions?: PermissionDefinition[];
};

