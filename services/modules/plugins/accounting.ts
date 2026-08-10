import { BookOpen } from "lucide-react";
import type { ModulePlugin } from "./types";

export const accountingPlugin: ModulePlugin = {
  id: "accounting",
  navigation: [
    {
      section: "Finance & Accounting",
      items: [
        {
          title: "Navigation.accounting",
          url: "#",
          icon: BookOpen,
          items: [
            { title: "Accounting.dashboard", url: "/accounting/" },
            { title: "Accounting.journal", url: "/accounting/journal-entries" },
            { title: "Accounting.ledger", url: "/accounting/ledger" },
            {
              title: "Accounting.chart_of_accounts",
              url: "/accounting/accounts",
            },
            { title: "Accounting.reports", url: "/accounting/reports" },
          ],
        },
      ],
    },
  ],
  permissions: [
    {
      name: "accounts.view",
      description: "Allows viewing chart of accounts",
      module: "accounts",
    },
    {
      name: "accounts.create",
      description: "Allows creating new chart of accounts",
      module: "accounts",
    },
    {
      name: "accounts.edit",
      description: "Allows editing chart of accounts",
      module: "accounts",
    },
    {
      name: "accounts.delete",
      description: "Allows deleting chart of accounts",
      module: "accounts",
    },
    {
      name: "journal_entries.view",
      description: "Allows viewing journal entries",
      module: "accounting",
    },
    {
      name: "journal_entries.create",
      description: "Allows creating journal entries",
      module: "accounting",
    },
    {
      name: "reports.view",
      description: "Allows viewing financial reports",
      module: "reports",
    },
    {
      name: "ledger.view",
      description: "Allows viewing ledger entries",
      module: "accounting",
    },
    {
      name: "ledger.create",
      description: "Allows creating ledger entries",
      module: "accounting",
    },
    {
      name: "default_accounts.view",
      description: "Allows viewing default accounts",
      module: "accounting",
    },
    {
      name: "default_accounts.manage",
      description: "Allows managing default accounts",
      module: "accounting",
    },
  ],
};
