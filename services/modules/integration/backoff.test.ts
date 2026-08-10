import { describe, expect, it } from "vitest";
import { computeExponentialBackoffMs } from "@/services/modules/integration/backoff";

describe("computeExponentialBackoffMs", () => {
  it("uses exponential backoff with base", () => {
    expect(computeExponentialBackoffMs(1, { baseMs: 100, maxMs: 10_000 })).toBe(100);
    expect(computeExponentialBackoffMs(2, { baseMs: 100, maxMs: 10_000 })).toBe(200);
    expect(computeExponentialBackoffMs(3, { baseMs: 100, maxMs: 10_000 })).toBe(400);
  });

  it("caps at max", () => {
    expect(computeExponentialBackoffMs(10, { baseMs: 1000, maxMs: 2500 })).toBe(2500);
  });

  it("handles invalid attempts", () => {
    expect(computeExponentialBackoffMs(0, { baseMs: 100, maxMs: 10_000 })).toBe(100);
    expect(computeExponentialBackoffMs(-5, { baseMs: 100, maxMs: 10_000 })).toBe(100);
    expect(computeExponentialBackoffMs(Number.NaN, { baseMs: 100, maxMs: 10_000 })).toBe(100);
  });
});

