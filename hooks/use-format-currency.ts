import { useCompanyProfile } from "@/components/providers/session-provider";
import { formatCurrency } from "@/services/lib/utils";
import { useCallback } from "react";
import { Decimal } from "decimal.js";

export function useFormatCurrency() {
  const profile = useCompanyProfile();

  const format = useCallback(
    (amount: number | Decimal) => {
      return formatCurrency(amount, {
        currency: profile?.currency,
        currencySymbol: profile?.currencySymbol,
        currencyFormat: profile?.currencyFormat,
        locale: profile?.locale,
      });
    },
    [profile]
  );

  return format;
}
