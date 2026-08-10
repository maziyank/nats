import { checkRateLimit, resetRateLimits } from "@/services/lib/rate-limit";
import { EXPORT_LIMITS } from "./types";

/**
 * In-memory per-user export rate limiter.
 * Suitable for single-process deployments; for multi-instance, replace with Redis.
 */
export function checkExportRateLimit(userId: string): {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
} {
  return checkRateLimit(
    `export:${userId}`,
    EXPORT_LIMITS.RATE_LIMIT_MAX,
    EXPORT_LIMITS.RATE_LIMIT_WINDOW_MS,
  );
}

/** Test helper — clear all buckets. */
export function _resetExportRateLimits() {
  resetRateLimits("export:");
}
