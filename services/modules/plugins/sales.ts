import { Rocket } from "lucide-react";
import type { ModulePlugin } from "./types";

export const salesPlugin: ModulePlugin = {
  id: "sales",
  navigation: [
    {
      section: "Operations",
      items: [
        {
          title: "Navigation.sales",
          url: "#",
          icon: Rocket,
          items: [
            { title: "Sales.overview", url: "/sales" },
            { title: "Sales.dashboard", url: "/sales/dashboard" },
            { title: "Sales.orders", url: "/sales/orders" },
            { title: "Sales.invoices", url: "/sales/invoices" },
            { title: "Sales.returns", url: "/sales/returns" },
            { title: "Sales.shipments", url: "/sales/shipments" },
            { title: "Sales.payments", url: "/sales/payments" },
            { title: "Sales.reports", url: "/sales/reports" },
          ],
        },
      ],
    },
  ],
  permissions: [
    {
      name: "sales.view",
      description: "Allows viewing sales module",
      module: "sales",
    },
    {
      name: "sales.create",
      description: "Allows creating sales records",
      module: "sales",
    },
    {
      name: "sales.payments",
      description: "Allows managing sales payments",
      module: "sales",
    },
    {
      name: "sales.edit",
      description: "Allows editing sales records",
      module: "sales",
    },
    {
      name: "sales.delete",
      description: "Allows deleting sales records",
      module: "sales",
    },
  ],
};
