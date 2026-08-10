import { checkRateLimit as checkSharedRateLimit } from "@/services/lib/rate-limit";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export function checkRateLimit(userId: string): {
  allowed: boolean;
  remaining: number;
} {
  return checkSharedRateLimit(
    `sku_search:${userId}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );
}
