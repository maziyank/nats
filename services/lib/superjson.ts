import { Decimal } from "decimal.js";
import SuperJSON from "superjson";

// Duck-type Prisma.Decimal / decimal.js without importing Prisma (Node-only),
// so this module stays safe for Client Components.
function isAnyDecimal(v: unknown): v is Decimal {
  return (
    Decimal.isDecimal(v) ||
    (typeof v === "object" &&
      v !== null &&
      typeof (v as { toFixed?: unknown }).toFixed === "function" &&
      typeof (v as { toNumber?: unknown }).toNumber === "function" &&
      "d" in (v as object) &&
      "e" in (v as object) &&
      "s" in (v as object))
  );
}

SuperJSON.registerCustom<Decimal, string>(
  {
    isApplicable: (v): v is Decimal => isAnyDecimal(v),
    serialize: (v) => v.toString(),
    deserialize: (v) => new Decimal(v),
  },
  "decimal.js",
);

export { SuperJSON };
export const serialize = SuperJSON.serialize;
export const deserialize = SuperJSON.deserialize;
export const stringify = SuperJSON.stringify;
export const parse = SuperJSON.parse;
