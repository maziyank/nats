"use client";

import * as React from "react";
import { Paintbrush } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useThemeColor,
  ThemeColor,
} from "@/components/layout/others/theme-color-provider";
import { cn } from "@/services/lib/utils";

export function ThemeCustomizer() {
  const { themeColor, setThemeColor } = useThemeColor();

  const colors: { name: ThemeColor; label: string; color: string }[] = [
    { name: "indigo", label: "Indigo", color: "bg-indigo-500" },
    { name: "amethys", label: "Amethys", color: "bg-purple-500" },
    { name: "blue", label: "Blue", color: "bg-blue-500" },
    { name: "green", label: "Green", color: "bg-green-500" },
    { name: "orange", label: "Orange", color: "bg-orange-500" },
    { name: "catppuccin", label: "Catppuccin", color: "bg-blue-200" },
    { name: "cyberpunk", label: "Cyberpunk", color: "bg-pink-500" },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Paintbrush className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Customize theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme Color</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="grid grid-cols-3 gap-2 p-2">
          {colors.map((color) => (
            <Button
              key={color.name}
              variant={"outline"}
              className={cn(
                "h-8 w-8 rounded-full p-0",
                themeColor === color.name && "border-2 border-primary",
              )}
              onClick={() => setThemeColor(color.name)}
            >
              <span className={cn("h-6 w-6 rounded-full", color.color)} />
              <span className="sr-only">{color.label}</span>
            </Button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
