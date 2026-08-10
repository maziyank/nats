"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { cn } from "@/services/lib/utils";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

export interface SearchableSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onSearch?: (query: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  className,
  disabled,
  onSearch,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: SearchableSelectProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);

  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const selectedOption = React.useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  const inputValue = selectedOption ? selectedOption.label : "";

  return (
    <>
      <InputGroup
        className={cn("cursor-text", className)}
        onClick={() => !disabled && setOpen(true)}
        onKeyDown={(e) =>
          !disabled &&
          (e.key === "Enter" || /^[a-zA-Z0-9]$/.test(e.key)) &&
          setOpen(true)
        }
      >
        <InputGroupAddon>
          {selectedOption?.icon ?? <Search className="size-2 text-muted-foreground" />}
        </InputGroupAddon>
        <InputGroupInput
          value={inputValue}
          placeholder={placeholder}
          readOnly
          className="cursor-pointer"
          disabled={disabled}
        />
      </InputGroup>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command>
          <CommandInput placeholder="Search..." onValueChange={onSearch} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.icon}
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
