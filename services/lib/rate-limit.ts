/**
 * Simple in-memory per-key rate limiter.
 * Suitable for single-process deployments; replace with Redis for multi-instance.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

type RateBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateBucket>();

/**
 * Consume one unit from the rate-limit bucket for `key`.
 */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = {
      count: 0,
      resetAt: now + windowMs,
    };
    buckets.set(key, bucket);
  }

  if (bucket.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, bucket.resetAt - now),
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: max - bucket.count,
    retryAfterMs: 0,
  };
}

/** Test helper — clear all buckets. */
export function resetRateLimits(keyPrefix?: string) {
  if (!keyPrefix) {
    buckets.clear();
    return;
  }
  for (const key of buckets.keys()) {
    if (key.startsWith(keyPrefix)) {
      buckets.delete(key);
    }
  }
}
