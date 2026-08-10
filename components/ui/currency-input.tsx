"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/services/lib/utils";

interface CurrencyInputProps extends Omit<
  React.ComponentProps<"input">,
  "onChange" | "value"
> {
  value: string | number;
  onChange: (value: number) => void;
}

export const CurrencyInput = React.forwardRef<
  HTMLInputElement,
  CurrencyInputProps
>(({ value, onChange, onFocus, onBlur, ...props }, ref) => {
  const [localValue, setLocalValue] = React.useState<string>("");

  const formatDisplayValue = (val: string | number) => {
    if (val === "" || val === undefined || val === null) return "";
    const strVal = val.toString();

    // Split into integer and decimal parts
    const parts = strVal.split(".");
    const integerPart = parts[0];
    const decimalPart = parts.length > 1 ? "." + parts[1] : "";

    // Add commas to integer part
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    return formattedInteger + decimalPart;
  };

  // Sync localValue with value prop
  React.useEffect(() => {
    if (value !== undefined && value !== null && value !== "") {
      const formatted = formatDisplayValue(value);
      const currentParsed = parseFloat(localValue.replace(/,/g, ""));
      const newParsed =
        typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : value;

      if (currentParsed !== newParsed || localValue === "") {
        setLocalValue(formatted);
      }
    } else if (value === "") {
      setLocalValue("");
    }
  }, [value, localValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // Remove commas to get raw value
    const rawValue = inputValue.replace(/,/g, "");

    // Allow digits and one dot.
    if (rawValue === "" || /^\d*\.?\d*$/.test(rawValue)) {
      setLocalValue(inputValue);
      const parsed = parseFloat(rawValue);
      if (!isNaN(parsed)) {
        onChange(parsed);
      }
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    onBlur?.(e);

    // On blur, format the local value properly with 2 decimal places
    if (value !== "" && value !== undefined && value !== null) {
      const numberVal = parseFloat(value.toString());
      if (!isNaN(numberVal)) {
        setLocalValue(formatDisplayValue(numberVal.toFixed(2)));
        onChange(numberVal);
      }
    }
  };

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="decimal"
      className={cn("text-right", props.className)}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={(e) => {
        e.target.select();
        onFocus?.(e);
      }}
    />
  );
});

CurrencyInput.displayName = "CurrencyInput";
