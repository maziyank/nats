"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/services/lib/utils";

export interface CustomInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  containerClassName?: string;
}

const CustomInput = React.forwardRef<HTMLInputElement, CustomInputProps>(
  ({ className, containerClassName, label, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;

    return (
      <div className={cn("space-y-1", containerClassName)}>
        {label && <Label htmlFor={inputId}>{label}</Label>}
        <Input id={inputId} className={cn(className)} ref={ref} {...props} />
      </div>
    );
  }
);
CustomInput.displayName = "CustomInput";

export { CustomInput };
