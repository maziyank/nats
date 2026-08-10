"use client";

import * as React from "react";
import { cn } from "@/services/lib/utils";
import { Decimal } from "decimal.js";

type CurrencyFormat = "standard" | "european" | "indian";

type StatValueProps = React.ComponentProps<"div"> & {
  maxRem?: number;
  minRem?: number;
  value?: number | Decimal;
  prefix?: string;
  suffix?: string;
  currency?: string;
  currencySymbol?: string;
  currencyFormat?: CurrencyFormat;
  locale?: string;
  abbreviate?: boolean;
  abbreviationThreshold?: number;
  maximumFractionDigits?: number;
};

function toNumber(v: number | Decimal | undefined): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (v instanceof Decimal) return v.toNumber();
  if (typeof v === "number") return v;
  if (typeof v === "string" && !isNaN(Number(v))) return Number(v);
  return undefined;
}

function resolveLocale(locale: string | undefined, currencyFormat: CurrencyFormat | undefined): string {
  if (locale) return locale;
  if (currencyFormat === "european") return "de-DE";
  if (currencyFormat === "indian") return "en-IN";
  return "en-US";
}

function formatCompact(params: {
  num: number;
  locale: string;
  prefix?: string;
  suffix?: string;
  currency?: string;
  currencySymbol?: string;
  maximumFractionDigits: number;
  abbreviate: boolean;
  threshold: number;
}): { display: string; raw: number } {
  const {
    num,
    locale,
    prefix,
    suffix,
    currency,
    currencySymbol,
    maximumFractionDigits,
    abbreviate,
    threshold,
  } = params;

  const absNum = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  const unsigned = absNum;

  let formattedNumber: string;

  if (abbreviate && absNum >= threshold) {
    if (currency && !currencySymbol) {
      formattedNumber = new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        notation: "compact",
        compactDisplay: "short",
        maximumFractionDigits,
      }).format(unsigned);
      return {
        display: sign ? formattedNumber.replace(/^/, sign) : formattedNumber,
        raw: num,
      };
    }

    const compact = new Intl.NumberFormat(locale, {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits,
    }).format(unsigned);

    const sym = currencySymbol ?? prefix;
    if (sym) {
      formattedNumber = `${sym}${compact}`;
    } else {
      formattedNumber = compact;
    }

    const suff = suffix ?? "";
    return { display: `${sign}${formattedNumber}${suff}`, raw: num };
  }

  if (currency && !currencySymbol) {
    formattedNumber = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits,
      minimumFractionDigits: maximumFractionDigits >= 2 ? 2 : 0,
    }).format(unsigned);
    return {
      display: sign ? formattedNumber.replace(/^/, sign) : formattedNumber,
      raw: num,
    };
  }

  formattedNumber = new Intl.NumberFormat(locale, {
    style: "decimal",
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits >= 2 ? 2 : 0,
  }).format(unsigned);

  const pre = currencySymbol ?? prefix ?? "";
  const suf = suffix ?? "";
  return { display: `${sign}${pre}${formattedNumber}${suf}`, raw: num };
}

export function StatValue({
  className,
  children,
  maxRem = 1.275,
  minRem = 0.875,
  value,
  prefix,
  suffix,
  currency,
  currencySymbol,
  currencyFormat,
  locale,
  abbreviate = true,
  abbreviationThreshold = 1000,
  maximumFractionDigits = 2,
  ...props
}: StatValueProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  const resolvedLocale = resolveLocale(locale, currencyFormat);

  const { displayContent, titleContent } = React.useMemo(() => {
    const rawNum = toNumber(value);
    const displayPrefix = prefix;
    const displaySuffix = suffix;

    if (rawNum !== undefined) {
      const { display, raw } = formatCompact({
        num: rawNum,
        locale: resolvedLocale,
        prefix: displayPrefix,
        suffix: displaySuffix,
        currency,
        currencySymbol,
        maximumFractionDigits,
        abbreviate,
        threshold: abbreviationThreshold,
      });

      let fullStr: string;
      const isNegative = raw < 0;
      const absRaw = Math.abs(raw);

      if (currency && !currencySymbol) {
        fullStr = new Intl.NumberFormat(resolvedLocale, {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        }).format(raw);
      } else {
        const dec = new Intl.NumberFormat(resolvedLocale, {
          style: "decimal",
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        }).format(absRaw);
        const pre = currencySymbol ?? displayPrefix ?? "";
        const suf = displaySuffix ?? "";
        fullStr = `${isNegative ? "-" : ""}${pre}${dec}${suf}`;
      }
      return { displayContent: display, titleContent: fullStr };
    }

    if (typeof children === "number") {
      const { display, raw } = formatCompact({
        num: children,
        locale: resolvedLocale,
        prefix: displayPrefix,
        suffix: displaySuffix,
        currency,
        currencySymbol,
        maximumFractionDigits,
        abbreviate,
        threshold: abbreviationThreshold,
      });

      const isNegative = raw < 0;
      const absRaw = Math.abs(raw);

      let titleStr: string;
      if (currency && !currencySymbol) {
        titleStr = new Intl.NumberFormat(resolvedLocale, {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        }).format(raw);
      } else {
        const dec = new Intl.NumberFormat(resolvedLocale, {
          style: "decimal",
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        }).format(absRaw);
        const pre = currencySymbol ?? displayPrefix ?? "";
        const suf = displaySuffix ?? "";
        titleStr = `${isNegative ? "-" : ""}${pre}${dec}${suf}`;
      }

      return {
        displayContent: display,
        titleContent: titleStr,
      };
    }

    return {
      displayContent: children,
      titleContent:
        typeof children === "string" || typeof children === "number"
          ? String(children)
          : undefined,
    };
  }, [
    children,
    value,
    resolvedLocale,
    prefix,
    suffix,
    currency,
    currencySymbol,
    maximumFractionDigits,
    abbreviate,
    abbreviationThreshold,
  ]);

  const fit = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const parent = el.parentElement;
    if (!parent) return;

    el.style.fontSize = `${maxRem}rem`;

    const available = parent.clientWidth;
    if (available <= 0) return;

    let low = minRem;
    let high = maxRem;
    let best = minRem;

    for (let i = 0; i < 12; i++) {
      const mid = (low + high) / 2;
      el.style.fontSize = `${mid}rem`;
      if (el.scrollWidth <= available) {
        best = mid;
        low = mid;
      } else {
        high = mid;
      }
    }

    el.style.fontSize = `${best}rem`;
  }, [maxRem, minRem, displayContent]);

  React.useLayoutEffect(() => {
    fit();

    const el = ref.current;
    const parent = el?.parentElement;
    if (!parent) return;

    const observer = new ResizeObserver(() => fit());
    observer.observe(parent);
    return () => observer.disconnect();
  }, [fit]);

  return (
    <div
      ref={ref}
      data-slot="stat-value"
      className={cn(
        "min-w-0 max-w-full whitespace-nowrap font-bold tabular-nums tracking-tight leading-none",
        className
      )}
      title={titleContent}
      {...props}
    >
      {displayContent}
    </div>
  );
}
