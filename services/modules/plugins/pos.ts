import { StoreIcon } from "lucide-react";
import type { ModulePlugin } from "./types";

export const posPlugin: ModulePlugin = {
  id: "pos",
  navigation: [
    {
      section: "Operations",
      items: [
        {
          title: "Navigation.pos",
          url: "#",
          icon: StoreIcon,
          items: [
            { title: "POS.cashier", url: "/pos" },
            { title: "POS.sessions", url: "/pos/sessions" },
          ],
        },
      ],
    },
  ],
  permissions: [
    {
      name: "pos.access",
      description: "Allows access to POS module",
      module: "pos",
    },
  ],
};
