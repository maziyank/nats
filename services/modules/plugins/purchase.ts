import { ShoppingCart } from "lucide-react";
import type { ModulePlugin } from "./types";

export const purchasePlugin: ModulePlugin = {
  id: "purchase",
  navigation: [
    {
      section: "Operations",
      items: [
        {
          title: "Navigation.purchase",
          url: "#",
          icon: ShoppingCart,
          items: [
            { title: "Purchase.overview", url: "/purchase" },
            { title: "Purchase.dashboard", url: "/purchase/dashboard" },
            { title: "Purchase.orders", url: "/purchase/orders" },
            { title: "Purchase.invoices", url: "/purchase/invoices" },
            { title: "Purchase.returns", url: "/purchase/returns" },
            { title: "Purchase.payments", url: "/purchase/payments" },
            { title: "Purchase.receives", url: "/purchase/receives" },
            { title: "Purchase.reports", url: "/purchase/reports" },
          ],
        },
      ],
    },
  ],
  permissions: [
    {
      name: "purchase.view",
      description: "Allows viewing purchase module",
      module: "purchase",
    },
    {
      name: "purchase.create",
      description: "Allows creating purchase records",
      module: "purchase",
    },
    {
      name: "purchase.payments",
      description: "Allows managing purchase payments",
      module: "purchase",
    },
    {
      name: "purchase.edit",
      description: "Allows editing purchase records",
      module: "purchase",
    },
    {
      name: "purchase.delete",
      description: "Allows deleting purchase records",
      module: "purchase",
    },
  ],
};
