"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/services/lib/utils";

export interface CustomSelectOption {
  value: string;
  label: React.ReactNode;
}

export interface CustomSelectProps
  extends React.ComponentPropsWithoutRef<typeof Select> {
  label?: React.ReactNode;
  placeholder?: string;
  options?: CustomSelectOption[];
  containerClassName?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

export function CustomSelect({
  label,
  placeholder,
  options,
  children,
  containerClassName,
  triggerClassName,
  contentClassName,
  ...props
}: CustomSelectProps) {
  return (
    <div className={cn("space-y-1", containerClassName)}>
      {label && <Label>{label}</Label>}
      <Select {...props}>
        <SelectTrigger className={cn("w-full", triggerClassName)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className={contentClassName}>
          {options
            ? options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))
            : children}
        </SelectContent>
      </Select>
    </div>
  );
}
