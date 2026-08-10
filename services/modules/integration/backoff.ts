export function computeExponentialBackoffMs(
  attempts: number,
  options?: {
    baseMs?: number;
    maxMs?: number;
  }
) {
  const baseMs = options?.baseMs ?? 5_000;
  const maxMs = options?.maxMs ?? 5 * 60_000;

  const safeAttempts = Number.isFinite(attempts) ? Math.max(1, Math.floor(attempts)) : 1;
  const unbounded = baseMs * 2 ** (safeAttempts - 1);
  return Math.min(maxMs, Math.max(0, Math.floor(unbounded)));
}

