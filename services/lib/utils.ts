import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { Decimal } from "decimal.js";

/**
 * Combines multiple class names into a single string, merging Tailwind CSS classes intelligently.
 * Uses `clsx` for conditional classes and `tailwind-merge` to handle conflicts.
 *
 * @param inputs - A list of class values (strings, objects, arrays, etc.)
 * @returns A merged class string
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface FormatDateOptions {
  dateFormat?: string;
  includeTime?: boolean;
}

/**
 * Formats a date value into a localized string representation.
 *
 * @param date - The date to format (Date object, string, or timestamp)
 * @param options - Formatting options
 * @param options.dateFormat - The pattern to format the date (default: "MMM dd, yyyy")
 * @param options.includeTime - Whether to include the time in the output (default: false)
 * @returns The formatted date string, or an empty string if the date is invalid
 */
export const formatDate = (
  date: Date | string | number,
  options?: FormatDateOptions,
) => {
  const { dateFormat = "MMM dd, yyyy", includeTime = false } = options || {};

  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    return "";
  }

  const formatStr = includeTime ? `${dateFormat} HH:mm` : dateFormat;
  return format(dateObj, formatStr);
};

export interface FormatCurrencyOptions {
  currency?: string;
  currencySymbol?: string;
  currencyFormat?: string;
  locale?: string;
}

/**
 * Formats a number as a currency string.
 *
 * @param amount - The numeric amount to format
 * @param options - Formatting options
 * @param options.currency - The currency code (e.g., "USD", "EUR")
 * @param options.currencySymbol - Optional symbol to override the default currency symbol
 * @param options.currencyFormat - Format style: "standard", "european", or "indian"
 * @param options.locale - Optional locale override (takes precedence over currencyFormat)
 * @returns The formatted currency string
 */
export const formatCurrency = (
  amount: number | Decimal,
  options?: FormatCurrencyOptions,
) => {
  const {
    currency = "USD",
    currencySymbol,
    currencyFormat = "standard",
    locale,
  } = options || {};

  const numericAmount = amount instanceof Decimal ? amount.toNumber() : amount;

  let targetLocale = locale ?? "en-US";
  if (!locale) {
    if (currencyFormat === "european") {
      targetLocale = "de-DE";
    } else if (currencyFormat === "indian") {
      targetLocale = "en-IN";
    }
  }

  if (currencySymbol) {
    const formattedNumber = new Intl.NumberFormat(targetLocale, {
      style: "decimal",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);

    if (currencyFormat === "european") {
      return `${formattedNumber} ${currencySymbol}`;
    }
    return `${currencySymbol}${formattedNumber}`;
  }

  return new Intl.NumberFormat(targetLocale, {
    style: "currency",
    currency: currency,
  }).format(numericAmount);
};

/**
 * Generates an array of page numbers and separators for pagination controls.
 *
 * @param currentPage - The current active page number
 * @param totalPages - The total number of pages
 * @returns An array containing page numbers and "..." separators
 */
export const generatePagination = (currentPage: number, totalPages: number) => {
  // If total pages is 7 or less, show all pages
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  // If current page is among the first 3 pages, show first 3, ellipsis, last 2
  if (currentPage <= 3) {
    return [1, 2, 3, "...", totalPages - 1, totalPages];
  }

  // If current page is among the last 3 pages, show first 2, ellipsis, last 3
  if (currentPage >= totalPages - 2) {
    return [1, 2, "...", totalPages - 2, totalPages - 1, totalPages];
  }

  // If current page is somewhere in the middle, show first 1, ellipsis, current-1, current, current+1, ellipsis, last 1
  return [
    1,
    "...",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "...",
    totalPages,
  ];
};

/**
 * Generates a short random alphanumeric ID for client-side list keys.
 * Prefer `crypto.randomUUID()` when a full UUID is needed.
 */
export const generateId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  }
  // Fallback for environments without Web Crypto
  return Math.random().toString(36).substring(2, 10);
};

/**
 * Converts a string to title case, capitalizing the first letter of each word
 * while preserving the case of the remaining letters.
 *
 * @param str - The string to convert to title case
 * @returns The title-cased string
 */
export const toTitleCase = (str: string): string => {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
