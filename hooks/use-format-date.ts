import { useCompanyProfile } from "@/components/providers/session-provider";
import { formatDate } from "@/services/lib/utils";
import { useCallback } from "react";

export function useFormatDate() {
  const profile = useCompanyProfile();

  const format = useCallback(
    (
      date: Date | string | number,
      options?: { formatStr?: string; includeTime?: boolean } | string
    ) => {
      let formatStr = profile?.dateFormat;
      let includeTime = false;

      if (typeof options === "string") {
        formatStr = options;
      } else if (typeof options === "object") {
        if (options.formatStr) formatStr = options.formatStr;
        if (options.includeTime) includeTime = options.includeTime;
      }

      return formatDate(date, {
        dateFormat: formatStr,
        includeTime,
      });
    },
    [profile]
  );

  return format;
}
