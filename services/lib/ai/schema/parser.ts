import fs from "fs";
import path from "path";

export type SchemaField = {
  name: string;
  type: string;
  isOptional: boolean;
  isId: boolean;
  isUnique: boolean;
  isRelation: boolean;
  relationModel?: string;
};

export type SchemaModel = {
  name: string;
  /** Prisma model name (PascalCase) */
  tableHint: string;
  fields: SchemaField[];
  module: string;
  description?: string;
};

export type ParsedSchema = {
  models: SchemaModel[];
  generatedAt: string;
};

const RELATION_TYPES = new Set([
  "String",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "Boolean",
  "DateTime",
  "Json",
  "Bytes",
]);

/** Sensitive fields that must never be selected via custom SQL. */
export const SENSITIVE_FIELDS = new Set([
  "password",
  "token",
  "apiKey",
  "api_key",
  "secret",
  "hashedPassword",
  "hashed_password",
  "sessionToken",
  "session_token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
]);

/** Tables blocked from custom SQL entirely. */
export const BLOCKED_TABLES = new Set([
  "VerificationToken",
  "IntegrationOutbox",
  "IntegrationInbox",
]);

/** Tables that require explicit approval before querying. */
export const SENSITIVE_TABLES = new Set([
  "User",
  "Role",
  "AIUsage",
  "AISession",
  "AIMessage",
  "SalarySlip",
  "PayrollRun",
  "JournalEntry",
  "JournalEntryLine",
  "PurchasePayment",
  "SalesPayment",
  "CashTransaction",
  "CashTransfer",
  "AccountBalance",
]);

function moduleFromFilename(filename: string): string {
  const base = path.basename(filename, ".prisma");
  const match = base.match(/^\d+_(.+)$/);
  return match ? match[1].replace(/_/g, "-") : base;
}

function parseFieldLine(line: string): SchemaField | null {
  const trimmed = line.trim();
  if (
    !trimmed ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("@@") ||
    trimmed.startsWith("}")
  ) {
    return null;
  }

  // Skip pure relation-only lines
  if (trimmed.includes("@relation")) {
    return null;
  }

  // fieldName Type? modifiers
  const fieldMatch = trimmed.match(
    /^([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_\[\]]+)(\?)?/,
  );
  if (!fieldMatch) return null;

  const name = fieldMatch[1];
  const isArray = fieldMatch[2].includes("[]");
  const rawType = fieldMatch[2].replace("[]", "");
  const isOptional = Boolean(fieldMatch[3]) || trimmed.includes("?");

  // Array of models / relation lists are not scalar columns
  if (isArray && !RELATION_TYPES.has(rawType)) {
    return null;
  }

  // Relation to another model (PascalCase non-scalar without list already handled)
  if (!RELATION_TYPES.has(rawType) && !isArray) {
    // Treat as enum if it looks like a domain enum; otherwise skip bare relations without FK attrs
    // Keep enums (AccountType, EntryStatus, etc.) as selectable columns
    const looksLikeEnum =
      /Status|Type|Balance|Method|Mode|Kind|Level|Format|Provider|Unit|Role|Source|Channel|Frequency|Period|Category$/.test(
        rawType,
      ) ||
      trimmed.includes("@default") ||
      trimmed.includes("@map");

    if (!looksLikeEnum && /^[A-Z]/.test(rawType)) {
      // Likely a relation field without @relation on same line — skip
      // (FK scalar fields are typed String/Int)
      return null;
    }
  }

  return {
    name,
    type: rawType,
    isOptional,
    isId: trimmed.includes("@id"),
    isUnique: trimmed.includes("@unique"),
    isRelation: false,
  };
}

/**
 * Parse Prisma schema files under prisma/schema into a structured catalog.
 * Used by the AI agent to construct accurate, permission-aware SQL.
 */
export function parsePrismaSchema(schemaDir?: string): ParsedSchema {
  const dir =
    schemaDir ?? path.join(process.cwd(), "prisma", "schema");

  if (!fs.existsSync(dir)) {
    return { models: [], generatedAt: new Date().toISOString() };
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".prisma"))
    .sort();

  const models: SchemaModel[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), "utf8");
    const module = moduleFromFilename(file);
    const lines = content.split(/\r?\n/);

    let currentModel: SchemaModel | null = null;

    for (const line of lines) {
      const modelMatch = line.match(/^model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/);
      if (modelMatch) {
        currentModel = {
          name: modelMatch[1],
          tableHint: modelMatch[1],
          fields: [],
          module,
        };
        continue;
      }

      if (currentModel) {
        if (line.trim() === "}") {
          models.push(currentModel);
          currentModel = null;
          continue;
        }
        const field = parseFieldLine(line);
        if (field && !field.isRelation) {
          // Keep scalar + enum fields for query construction
          // Re-parse more liberally: include non-relation scalar-looking fields
          currentModel.fields.push(field);
        } else if (field && field.isRelation) {
          // skip pure relation fields (no DB column typically when using FK)
        } else {
          // Fallback: capture scalar fields without @relation
          const simple = line.trim().match(
            /^([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_\[\]]+\??)/,
          );
          if (
            simple &&
            !line.includes("@relation") &&
            !line.trim().startsWith("@@") &&
            !line.trim().startsWith("//")
          ) {
            const type = simple[2].replace("?", "").replace("[]", "");
            const isArray = simple[2].includes("[]");
            if (!isArray && RELATION_TYPES.has(type)) {
              currentModel.fields.push({
                name: simple[1],
                type,
                isOptional: simple[2].includes("?"),
                isId: line.includes("@id"),
                isUnique: line.includes("@unique"),
                isRelation: false,
              });
            } else if (!isArray && !line.includes("@relation")) {
              // enums
              currentModel.fields.push({
                name: simple[1],
                type,
                isOptional: simple[2].includes("?"),
                isId: line.includes("@id"),
                isUnique: line.includes("@unique"),
                isRelation: false,
              });
            }
          }
        }
      }
    }
  }

  // Deduplicate fields per model (parser may double-count)
  for (const model of models) {
    const seen = new Set<string>();
    model.fields = model.fields.filter((f) => {
      if (seen.has(f.name)) return false;
      seen.add(f.name);
      return true;
    });
  }

  return { models, generatedAt: new Date().toISOString() };
}

let cachedSchema: ParsedSchema | null = null;

export function getSchemaCatalog(forceRefresh = false): ParsedSchema {
  if (!cachedSchema || forceRefresh) {
    cachedSchema = parsePrismaSchema();
  }
  return cachedSchema;
}

export function getQueryableModels(includeSensitive = false): SchemaModel[] {
  const { models } = getSchemaCatalog();
  return models.filter((m) => {
    if (BLOCKED_TABLES.has(m.name)) return false;
    if (!includeSensitive && SENSITIVE_TABLES.has(m.name)) return false;
    return true;
  });
}

export function formatSchemaForLLM(options?: {
  includeSensitive?: boolean;
  modules?: string[];
}): string {
  const models = getQueryableModels(options?.includeSensitive ?? true).filter(
    (m) =>
      !options?.modules?.length || options.modules.includes(m.module),
  );

  const lines: string[] = [
    "# Database Schema Catalog (Prisma models → PostgreSQL tables)",
    "# Use double-quoted PascalCase identifiers for table/column names unless mapped otherwise.",
    `# Generated: ${getSchemaCatalog().generatedAt}`,
    "",
  ];

  for (const model of models) {
    const sensitive = SENSITIVE_TABLES.has(model.name) ? " [SENSITIVE]" : "";
    lines.push(`## ${model.name}${sensitive} (module: ${model.module})`);
    const cols = model.fields
      .filter((f) => !SENSITIVE_FIELDS.has(f.name))
      .map(
        (f) =>
          `  - ${f.name}: ${f.type}${f.isOptional ? "?" : ""}${f.isId ? " PK" : ""}`,
      );
    lines.push(...cols);
    lines.push("");
  }

  lines.push("## Security Rules");
  lines.push("- Only SELECT / WITH ... SELECT queries are allowed.");
  lines.push("- Never select password, token, or secret columns.");
  lines.push(
    `- Sensitive tables require approved=true: ${[...SENSITIVE_TABLES].join(", ")}`,
  );
  lines.push(
    `- Blocked tables: ${[...BLOCKED_TABLES].join(", ")}`,
  );
  lines.push("- Always include LIMIT (max 500).");

  return lines.join("\n");
}
