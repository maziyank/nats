import { AITool } from "../types";
import type { AIUserContext } from "../context";
import { canAccessCustomReports } from "../context";
import { formatSchemaForLLM, getSchemaCatalog } from "../schema/parser";
import { validateSelectSql } from "../sql/validator";
import { executeSecureQuery } from "../sql/executor";
import { analyzeDataset, rowsToMarkdownTable } from "../analysis";

function deniedMessage(role: string): string {
  return `Access denied. Custom database reporting is restricted to superadmin and Accountant roles. Your role: "${role}". Use list_available_reports and run_standard_report instead.`;
}

/**
 * Build role-gated custom reporting tools. Only superadmin / Accountant
 * receive working handlers; others get explicit access-denied responses.
 */
export function createCustomReportTools(ctx: AIUserContext): AITool[] {
  const allowed = canAccessCustomReports(ctx);

  const getDatabaseSchemaTool: AITool = {
    name: "get_database_schema",
    description:
      "Parse and return the production database schema (tables, fields, types, modules) for constructing custom SQL reports. Restricted to superadmin and Accountant.",
    parameters: {
      type: "object",
      properties: {
        module: {
          type: "string",
          description:
            "Optional module filter (e.g. accounting, sales, inventory, cash-bank)",
        },
        includeSensitive: {
          type: "boolean",
          description:
            "Include sensitive tables (User, payments, payroll, etc.). Default true for authorized roles; still requires approved queries to run.",
        },
      },
      required: [],
    },
    handler: async ({
      module,
      includeSensitive = true,
    }: {
      module?: string;
      includeSensitive?: boolean;
    }) => {
      if (!allowed) return deniedMessage(ctx.role);

      const catalog = getSchemaCatalog();
      if (!catalog.models.length) {
        return "Schema catalog is empty — ensure prisma/schema files are available.";
      }

      return formatSchemaForLLM({
        includeSensitive,
        modules: module ? [module] : undefined,
      });
    },
  };

  const validateCustomSqlTool: AITool = {
    name: "validate_custom_sql",
    description:
      "Validate a proposed read-only SQL query against security rules (injection, DML, sensitive tables) without executing it. Returns whether approval is required.",
    parameters: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "SELECT (or WITH ... SELECT) SQL to validate",
        },
      },
      required: ["sql"],
    },
    handler: async ({ sql }: { sql: string }) => {
      if (!allowed) return deniedMessage(ctx.role);
      const result = validateSelectSql(sql, { approved: false });
      if (result.ok) {
        return JSON.stringify(
          {
            valid: true,
            requiresApproval: result.requiresApproval,
            sensitiveTables: result.sensitiveTables,
            tables: result.tables,
            normalizedSql: result.sql,
          },
          null,
          2,
        );
      }
      return JSON.stringify(
        {
          valid: false,
          error: result.error,
          requiresApproval: result.requiresApproval ?? false,
          sensitiveTables: result.sensitiveTables ?? [],
        },
        null,
        2,
      );
    },
  };

  const runCustomSqlReportTool: AITool = {
    name: "run_custom_sql_report",
    description:
      "Execute a secure, validated read-only SQL query and return a formatted report with business analysis. ONLY for superadmin/Accountant. For sensitive financial/user tables set approved=true after validating the request is legitimate. Always prefer standard reports when they cover the need.",
    parameters: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description:
            'Read-only SQL SELECT. Use Prisma model names as tables (e.g. "Account", "SalesInvoice"). Always include LIMIT.',
        },
        approved: {
          type: "boolean",
          description:
            "Set true only after confirming the query is necessary and the user is authorized for sensitive data. Required when querying sensitive tables.",
        },
        title: {
          type: "string",
          description: "Report title for the output",
        },
        includeAnalysis: {
          type: "boolean",
          description: "Include trend/anomaly insights (default true)",
        },
      },
      required: ["sql"],
    },
    handler: async ({
      sql,
      approved = false,
      title = "Custom Report",
      includeAnalysis = true,
    }: {
      sql: string;
      approved?: boolean;
      title?: string;
      includeAnalysis?: boolean;
    }) => {
      if (!allowed) return deniedMessage(ctx.role);

      const result = await executeSecureQuery(ctx, sql, { approved });

      if (!result.success) {
        if (result.requiresApproval) {
          return [
            `## Approval Required`,
            ``,
            result.error,
            ``,
            `Sensitive tables: ${(result.sensitiveTables || []).join(", ")}`,
            ``,
            `If this request is legitimate, re-invoke run_custom_sql_report with approved=true.`,
          ].join("\n");
        }
        return `## Query Failed\n\n${result.error}`;
      }

      const rows = result.rows || [];
      const table = rowsToMarkdownTable(rows);
      let md = `## ${title}\n\n`;
      md += `_Executed in ${result.executionMs ?? "?"}ms · ${result.rowCount ?? 0} row(s)`;
      if (result.truncated) md += " · truncated";
      md += `_\n\n`;
      md += `Tables: ${(result.tables || []).join(", ")}\n\n`;
      md += "```sql\n" + (result.sql || sql) + "\n```\n\n";
      md += table;

      if (includeAnalysis) {
        md +=
          "\n\n" +
          analyzeDataset(rows, { title: `${title} — Insights` }).markdown;
      }

      return md;
    },
  };

  const generateCustomReportTool: AITool = {
    name: "generate_custom_report",
    description:
      "High-level custom report helper for superadmin/Accountant: given a natural-language goal and optional SQL, validates/executes SQL and returns a full report with analysis. If sql is omitted, returns schema guidance so you can construct a query.",
    parameters: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "What the user wants to learn or report on",
        },
        sql: {
          type: "string",
          description: "Optional SQL SELECT implementing the goal",
        },
        approved: {
          type: "boolean",
          description: "Approval flag for sensitive data access",
        },
      },
      required: ["goal"],
    },
    handler: async ({
      goal,
      sql,
      approved = false,
    }: {
      goal: string;
      sql?: string;
      approved?: boolean;
    }) => {
      if (!allowed) return deniedMessage(ctx.role);

      if (!sql) {
        const schemaSnippet = formatSchemaForLLM({ includeSensitive: true });
        return [
          `## Custom Report Planning`,
          ``,
          `**Goal:** ${goal}`,
          ``,
          `No SQL provided. Use the schema below to construct a SELECT query, then call run_custom_sql_report (or generate_custom_report with sql).`,
          ``,
          `Prefer standard reports via run_standard_report when the goal matches an existing report.`,
          ``,
          schemaSnippet.slice(0, 8000),
        ].join("\n");
      }

      return runCustomSqlReportTool.handler({
        sql,
        approved,
        title: `Custom Report: ${goal.slice(0, 80)}`,
        includeAnalysis: true,
      });
    },
  };

  return [
    getDatabaseSchemaTool,
    validateCustomSqlTool,
    runCustomSqlReportTool,
    generateCustomReportTool,
  ];
}
