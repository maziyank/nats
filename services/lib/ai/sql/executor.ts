import { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/services/lib/prisma";
import { validateSelectSql, type SqlValidationResult } from "./validator";
import type { AIUserContext } from "../context";
import { assertCustomReportAccess } from "../context";

export type QueryExecutionResult = {
  success: boolean;
  rows?: Record<string, unknown>[];
  rowCount?: number;
  columns?: string[];
  sql?: string;
  tables?: string[];
  error?: string;
  requiresApproval?: boolean;
  sensitiveTables?: string[];
  truncated?: boolean;
  executionMs?: number;
};

const QUERY_TIMEOUT_MS = 15_000;
const MAX_ROWS = 500;

/**
 * Execute a validated, read-only SQL query for authorized roles only.
 * Uses Prisma parameterized raw query wrapper with pre-validation (no user-supplied DDL/DML).
 */
export async function executeSecureQuery(
  ctx: AIUserContext,
  rawSql: string,
  options?: { approved?: boolean },
): Promise<QueryExecutionResult> {
  try {
    assertCustomReportAccess(ctx);
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }

  const validation: SqlValidationResult = validateSelectSql(rawSql, {
    approved: options?.approved,
  });

  if (!validation.ok) {
    return {
      success: false,
      error: validation.error,
      requiresApproval: validation.requiresApproval,
      sensitiveTables: validation.sensitiveTables,
    };
  }

  const started = Date.now();

  try {
    // Prisma $queryRawUnsafe is used only after strict validation.
    // SET LOCAL statement_timeout cancels the query on the Postgres side
    // (Promise.race alone leaves the DB query running after JS timeout).
    let rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL statement_timeout = '${QUERY_TIMEOUT_MS}'`,
      );
      return tx.$queryRawUnsafe<Record<string, unknown>[]>(validation.sql);
    });

    // Serialize Prisma-specific values
    rows = rows.map((row) => serializeRow(row));

    const truncated = rows.length > MAX_ROWS;
    if (truncated) {
      rows = rows.slice(0, MAX_ROWS);
    }

    const columns =
      rows.length > 0 ? Object.keys(rows[0]) : extractSelectAliases(validation.sql);

    // Audit log (best-effort)
    await logQueryAudit(ctx, validation.sql, validation.tables, rows.length).catch(
      () => undefined,
    );

    return {
      success: true,
      rows,
      rowCount: rows.length,
      columns,
      sql: validation.sql,
      tables: validation.tables,
      truncated,
      executionMs: Date.now() - started,
    };
  } catch (error) {
    const rawMessage =
      error instanceof Prisma.PrismaClientKnownRequestError
        ? error.message
        : (error as Error).message;

    // Postgres cancel from statement_timeout surfaces as query_canceled / 57014.
    const timedOut =
      /statement timeout|query_canceled|57014|canceling statement/i.test(
        rawMessage,
      );
    const message = timedOut
      ? `Query timed out after ${QUERY_TIMEOUT_MS}ms`
      : rawMessage;

    await logQueryAudit(
      ctx,
      validation.sql,
      validation.tables,
      0,
      message,
    ).catch(() => undefined);

    return {
      success: false,
      error: `Query execution failed: ${message}`,
      sql: validation.sql,
      tables: validation.tables,
      executionMs: Date.now() - started,
    };
  }
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      out[key] = value;
    } else if (value instanceof Date) {
      out[key] = value.toISOString();
    } else if (typeof value === "bigint") {
      out[key] = value.toString();
    } else if (
      typeof value === "object" &&
      value !== null &&
      "toNumber" in value &&
      typeof (value as { toNumber: () => number }).toNumber === "function"
    ) {
      out[key] = (value as { toNumber: () => number }).toNumber();
    } else if (Buffer.isBuffer(value)) {
      out[key] = "[binary]";
    } else {
      out[key] = value;
    }
  }
  return out;
}

function extractSelectAliases(sql: string): string[] {
  // Best-effort column list when result is empty
  const selectMatch = sql.match(/^\s*(?:with[\s\S]+?\)\s*)?select\s+([\s\S]+?)\s+from\s+/i);
  if (!selectMatch) return [];
  if (selectMatch[1].trim() === "*") return ["*"];
  return selectMatch[1]
    .split(",")
    .map((p) => {
      const asMatch = p.match(/\bas\s+("?[\w]+"?)\s*$/i);
      if (asMatch) return asMatch[1].replace(/"/g, "");
      const parts = p.trim().split(/\s+/);
      return parts[parts.length - 1].replace(/"/g, "");
    })
    .filter(Boolean);
}

async function logQueryAudit(
  ctx: AIUserContext,
  sql: string,
  tables: string[],
  rowCount: number,
  error?: string,
): Promise<void> {
  try {
    await prisma.reportLog.create({
      data: {
        userId: ctx.userId,
        status: error ? "FAILED" : "SUCCESS",
        format: "JSON",
        parameters: {
          source: "AI_CUSTOM_SQL",
          sql: sql.slice(0, 2000),
          tables,
          rowCount,
          role: ctx.role,
          error: error?.slice(0, 500),
        },
        errorMessage: error?.slice(0, 1000),
      },
    });
  } catch {
    if (process.env.NODE_ENV !== "production") {
      console.info("[AI Custom SQL]", {
        userId: ctx.userId,
        role: ctx.role,
        tables,
        rowCount,
        error,
        sql: sql.slice(0, 300),
      });
    }
  }
}
