import { PieChart } from "lucide-react";
import type { ModulePlugin } from "./types";

export const budgetingPlugin: ModulePlugin = {
  id: "budgeting",
  navigation: [
    {
      section: "Finance & Accounting",
      items: [
        {
          title: "Navigation.budgeting",
          url: "#",
          icon: PieChart,
          items: [
            { title: "Budgeting.dashboard", url: "/budgeting" },
            { title: "Budgeting.budgets", url: "/budgeting/budgets" },
            { title: "Budgeting.reports_title", url: "/budgeting/reports" },
          ],
        },
      ],
    },
  ],
};
