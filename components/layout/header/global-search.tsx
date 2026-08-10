"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SearchIcon } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { getNavigationBySection } from "@/services/modules/plugins";
import { NavItem, NavSectionKey } from "@/services/modules/plugins/types";

export function GlobalSearch() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const t = useTranslations();
  const navigation = getNavigationBySection();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = React.useCallback((command: () => unknown) => {
    setOpen(false);
    command();
  }, []);

  const sections = Object.keys(navigation) as NavSectionKey[];

  return (
    <>
      <Button
        variant="outline"
        className="relative h-8 w-full justify-start rounded-[0.5rem] bg-background text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-40 lg:w-64"
        onClick={() => setOpen(true)}
      >
        <SearchIcon className="mr-2 h-4 w-4" />
        <span className="inline-flex">{t("Common.search")}...</span>
        <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder={`${t("Common.search")}...`} />
        <CommandList>
          <CommandEmpty>{t("Common.no_results_found")}</CommandEmpty>
          {sections.map((section) => (
            <CommandGroup
              key={section}
              heading={t(
                `Navigation.${section.toLowerCase().replace(/ & /g, "_")}` as any,
              )}
            >
              {navigation[section].map((item: NavItem) => (
                <React.Fragment key={item.title}>
                  {item.items && item.items.length > 0 ? (
                    item.items.map((subItem) => (
                      <CommandItem
                        key={subItem.url}
                        onSelect={() => {
                          runCommand(() => router.push(subItem.url));
                        }}
                      >
                        {item.icon && <item.icon className="mr-2 h-4 w-4" />}
                        <span>{t(subItem.title)}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {t(item.title)}
                        </span>
                      </CommandItem>
                    ))
                  ) : (
                    <CommandItem
                      key={item.url}
                      onSelect={() => {
                        runCommand(() => router.push(item.url));
                      }}
                    >
                      {item.icon && <item.icon className="mr-2 h-4 w-4" />}
                      <span>{t(item.title)}</span>
                    </CommandItem>
                  )}
                </React.Fragment>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
