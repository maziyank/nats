import { Landmark } from "lucide-react";
import type { ModulePlugin } from "./types";

export const cashBankPlugin: ModulePlugin = {
  id: "cash-bank",
  navigation: [
    {
      section: "Operations",
      items: [
        {
          title: "Navigation.cash_bank",
          url: "#",
          icon: Landmark,
          items: [
            { title: "CashBank.overview", url: "/cash-bank" },
            { title: "CashBank.dashboard", url: "/cash-bank/dashboard" },
            { title: "CashBank.transactions", url: "/cash-bank/transaction" },
            { title: "CashBank.transfers", url: "/cash-bank/transfer" },
            { title: "CashBank.reports_title", url: "/cash-bank/reports" },
          ],
        },
      ],
    },
  ],
  permissions: [
    {
      name: "cash_bank.view",
      description: "Allows viewing cash and bank transactions",
      module: "cash_bank",
    },
    {
      name: "cash_bank.create",
      description: "Allows creating cash and bank transactions",
      module: "cash_bank",
    },
    {
      name: "cash_bank.edit",
      description: "Allows editing cash and bank transactions",
      module: "cash_bank",
    },
    {
      name: "cash_bank.delete",
      description: "Allows deleting cash and bank transactions",
      module: "cash_bank",
    },
  ],
};

