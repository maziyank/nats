import { Box } from "lucide-react";
import type { ModulePlugin } from "./types";

export const assetsPlugin: ModulePlugin = {
  id: "assets",
  navigation: [
    {
      section: "Finance & Accounting",
      items: [
        {
          title: "Navigation.assets",
          url: "#",
          icon: Box,
          items: [
            { title: "Assets.dashboard", url: "/assets/dashboard" },
            { title: "Assets.fixed_assets", url: "/assets" },
            { title: "Assets.depreciation", url: "/assets/depreciation" },
            { title: "Assets.categories", url: "/assets/categories" },
            { title: "Assets.reports_title", url: "/assets/reports" },
          ],
        },
      ],
    },
  ],
  permissions: [
    {
      name: "assets.view",
      description: "Allows viewing assets",
      module: "assets",
    },
    {
      name: "assets.create",
      description: "Allows creating assets",
      module: "assets",
    },
    {
      name: "assets.edit",
      description: "Allows editing assets",
      module: "assets",
    },
    {
      name: "assets.delete",
      description: "Allows deleting assets",
      module: "assets",
    },
  ],
};

