import { Bot, Sparkles } from "lucide-react";
import type { ModulePlugin } from "./types";

export const aiPlugin: ModulePlugin = {
  id: "ai",
  navigation: [
    {
      section: "Intelligence",
      items: [
        {
          title: "Navigation.ai",
          url: "/ai",
          icon: Sparkles,
          items: [
            { title: "AI.assistants", url: "/ai/chat" },
          ],
        },
      ],
    },
  ],
};
