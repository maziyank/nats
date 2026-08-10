import {
  BLOCKED_TABLES,
  SENSITIVE_FIELDS,
  SENSITIVE_TABLES,
  getSchemaCatalog,
} from "../schema/parser";

export type SqlValidationResult =
  | {
      ok: true;
      sql: string;
      tables: string[];
      requiresApproval: boolean;
      sensitiveTables: string[];
    }
  | {
      ok: false;
      error: string;
      requiresApproval?: boolean;
      sensitiveTables?: string[];
    };

const FORBIDDEN_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "create",
  "truncate",
  "grant",
  "revoke",
  "copy",
  "execute",
  "exec",
  "call",
  "merge",
  "replace",
  "attach",
  "detach",
  "vacuum",
  "analyze",
  "reindex",
  "cluster",
  "comment",
  "security",
  "owner",
  "set role",
  "set session",
  "pg_sleep",
  "lo_import",
  "lo_export",
  "dblink",
  "pg_read_file",
  "pg_write_file",
];

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

function normalizeSql(sql: string): string {
  return stripComments(sql).replace(/\s+/g, " ").trim();
}

function extractTableNames(sql: string): string[] {
  const tables = new Set<string>();
  // Match FROM/JOIN "Table" or FROM/JOIN Table
  const re =
    /\b(?:from|join)\s+(?:"([A-Za-z_][A-Za-z0-9_]*)"|([A-Za-z_][A-Za-z0-9_]*))/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql)) !== null) {
    const name = match[1] || match[2];
    if (name && !["select", "lateral", "unnest"].includes(name.toLowerCase())) {
      tables.add(name);
    }
  }
  return [...tables];
}

function mentionsSensitiveField(sql: string): string | null {
  const lower = sql.toLowerCase();
  for (const field of SENSITIVE_FIELDS) {
    // word boundary-ish match
    const re = new RegExp(`\\b${field.toLowerCase()}\\b`, "i");
    if (re.test(lower)) return field;
  }
  return null;
}

function ensureLimit(sql: string): string {
  // If already has LIMIT, cap it
  const limitMatch = sql.match(/\blimit\s+(\d+)\b/i);
  if (limitMatch) {
    const n = Math.min(parseInt(limitMatch[1], 10), MAX_LIMIT);
    return sql.replace(/\blimit\s+\d+\b/i, `LIMIT ${n}`);
  }
  // Strip trailing semicolon before appending LIMIT
  const cleaned = sql.replace(/;\s*$/, "");
  return `${cleaned} LIMIT ${DEFAULT_LIMIT}`;
}

/**
 * Validate that SQL is a safe, read-only query against known schema.
 * Does not execute the query.
 */
export function validateSelectSql(
  rawSql: string,
  options?: { approved?: boolean },
): SqlValidationResult {
  if (!rawSql || typeof rawSql !== "string") {
    return { ok: false, error: "SQL query is required." };
  }

  let sql = normalizeSql(rawSql);

  if (!sql) {
    return { ok: false, error: "SQL query is empty." };
  }

  // Single statement only
  const withoutTrailingSemi = sql.replace(/;\s*$/, "");
  if (withoutTrailingSemi.includes(";")) {
    return {
      ok: false,
      error: "Multiple SQL statements are not allowed.",
    };
  }
  sql = withoutTrailingSemi;

  const lower = sql.toLowerCase();

  // Must start with SELECT or WITH
  if (!lower.startsWith("select") && !lower.startsWith("with")) {
    return {
      ok: false,
      error: "Only SELECT (or WITH ... SELECT) queries are allowed.",
    };
  }

  // WITH must still be read-only (no INSERT/UPDATE in CTE body)
  for (const kw of FORBIDDEN_KEYWORDS) {
    const re = new RegExp(`\\b${kw.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(sql)) {
      return {
        ok: false,
        error: `Forbidden keyword detected: ${kw.toUpperCase()}. Only read-only queries are allowed.`,
      };
    }
  }

  // Block SELECT INTO
  if (/\binto\b/i.test(sql) && !/\binto\s+(stdout|outfile)/i.test(sql)) {
    // allow "into" only in rare cases — safer to block
    if (/\bselect\b[\s\S]*\binto\b/i.test(sql)) {
      return { ok: false, error: "SELECT INTO is not allowed." };
    }
  }

  const sensitiveField = mentionsSensitiveField(sql);
  if (sensitiveField) {
    return {
      ok: false,
      error: `Query references sensitive field "${sensitiveField}" which is not allowed.`,
    };
  }

  const tables = extractTableNames(sql);
  if (tables.length === 0) {
    return {
      ok: false,
      error: "Could not determine target tables. Use explicit FROM/JOIN clauses.",
    };
  }

  const catalog = getSchemaCatalog();
  const modelNames = new Set(catalog.models.map((m) => m.name));
  // Also allow lowercase / snake variants mapped to known models
  const modelByLower = new Map(
    catalog.models.map((m) => [m.name.toLowerCase(), m.name]),
  );

  const resolvedTables: string[] = [];
  for (const t of tables) {
    if (BLOCKED_TABLES.has(t) || BLOCKED_TABLES.has(modelByLower.get(t.toLowerCase()) || "")) {
      return {
        ok: false,
        error: `Table "${t}" is blocked from custom queries.`,
      };
    }

    const resolved =
      modelNames.has(t) || modelByLower.has(t.toLowerCase())
        ? modelByLower.get(t.toLowerCase()) || t
        : null;

    if (!resolved) {
      // Prisma default table names are model names; reject unknown tables
      return {
        ok: false,
        error: `Unknown or disallowed table "${t}". Use get_database_schema to list valid models.`,
      };
    }
    resolvedTables.push(resolved);
  }

  const sensitiveTables = resolvedTables.filter((t) =>
    SENSITIVE_TABLES.has(t),
  );
  const requiresApproval = sensitiveTables.length > 0;

  if (requiresApproval && !options?.approved) {
    return {
      ok: false,
      error: `Query accesses sensitive data (${sensitiveTables.join(", ")}). Re-run with approved=true after confirming the request is legitimate and necessary.`,
      requiresApproval: true,
      sensitiveTables,
    };
  }

  sql = ensureLimit(sql);

  return {
    ok: true,
    sql,
    tables: resolvedTables,
    requiresApproval,
    sensitiveTables,
  };
}
