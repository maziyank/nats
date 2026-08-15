"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatValue } from "@/components/ui/stat-value";
import { cn } from "@/services/lib/utils";
import type { LucideIcon } from "lucide-react";

type CurrencyFormat = "standard" | "european" | "indian";

interface CurrencyProps {
  currency?: string;
  currencySymbol?: string;
  currencyFormat?: CurrencyFormat;
  locale?: string;
}

interface SummaryCardProps extends CurrencyProps {
  title: string;
  value: number;
  description?: string;
  icon?: LucideIcon;
  className?: string;
  cardClassName?: string;
  titleClassName?: string;
  valueClassName?: string;
  maxRem?: number;
  isInteger?: boolean;
}

export function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  className,
  cardClassName,
  titleClassName,
  valueClassName,
  maxRem = 1.5,
  isInteger = false,
  currency,
  currencySymbol,
  currencyFormat,
  locale,
}: SummaryCardProps) {
  return (
    <Card className={cn("py-2", cardClassName, className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className={cn("text-sm font-medium", titleClassName)}>
          {title}
        </CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        {isInteger ? (
          <div className={cn("text-2xl font-bold", valueClassName)}>
            {value}
          </div>
        ) : (
          <StatValue
            maxRem={maxRem}
            value={value}
            currency={currency}
            currencySymbol={currencySymbol}
            currencyFormat={currencyFormat}
            locale={locale}
            className={valueClassName}
          />
        )}
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

interface SummaryCardGridProps {
  children: React.ReactNode;
  className?: string;
}

export function SummaryCardGrid({ children, className }: SummaryCardGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        "*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card",
        "*:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs",
        "@xl/main:grid-cols-2 @5xl/main:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}

interface SummaryCardFlexProps {
  children: React.ReactNode;
  className?: string;
}

export function SummaryCardFlex({ children, className }: SummaryCardFlexProps) {
  return (
    <div
      className={cn(
        "*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card",
        "grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs",
        "@xl/main:grid-cols-2 @5xl/main:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}

export type { CurrencyProps, CurrencyFormat };
