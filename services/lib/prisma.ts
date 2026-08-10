/* eslint-disable @typescript-eslint/no-explicit-any */

import { Prisma, PrismaClient } from "@/prisma/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Decimal } from "decimal.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter, log: ["error", "warn"] });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

function isDecimalLike(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (value instanceof Prisma.Decimal) return true;
  if (value instanceof Decimal) return true;
  try {
    return Decimal.isDecimal(value);
  } catch {
    return false;
  }
}

/**
 * Recursively serializes Prisma-specific and built-in JavaScript objects into
 * plain JSON-compatible values.
 *
 * Decimals are converted to **strings** (not numbers) to avoid IEEE-754
 * precision loss. Prefer SuperJSON when round-tripping Decimals is required.
 */
export function serializePrisma(obj: unknown): any {
  return serializeValue(obj);
}

function serializeValue(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (isDecimalLike(obj)) {
    return String(obj);
  }

  if (Object.prototype.toString.call(obj) === "[object Date]") {
    return (obj as Date).toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => serializeValue(item));
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      result[key] = serializeValue((obj as Record<string, unknown>)[key]);
    }
    return result;
  }

  return obj;
}
