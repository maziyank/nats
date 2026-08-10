import { ChatOpenAI } from "@langchain/openai";
import { DynamicTool } from "@langchain/core/tools";
import { createDeepAgent } from "deepagents";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { getAIConfig } from "./config";
import { getToolsForUser } from "./tool-registry";
import { AIChatMessage } from "./types";
import type { AIUserContext } from "./context";
import { canAccessCustomReports } from "./context";

function buildSystemPrompt(ctx: AIUserContext): string {
  const customAccess = canAccessCustomReports(ctx);
  const roleLine = `Authenticated user: ${ctx.userName} (role: ${ctx.role}).`;

  const customSection = customAccess
    ? `
## Custom Report Generation (AUTHORIZED)
You may use get_database_schema, validate_custom_sql, run_custom_sql_report, and generate_custom_report.
Workflow for custom reports:
1. Prefer run_standard_report when a native report already answers the question.
2. Otherwise call get_database_schema (optionally filter by module).
3. Draft a read-only SELECT; validate with validate_custom_sql.
4. If validation requires approval for sensitive tables, explain why and re-run with approved=true only when the request is clearly legitimate.
5. Present results as a clear markdown report with tables, then summarize trends, anomalies, and actionable recommendations.
Security rules: SELECT/WITH only, no password/token columns, LIMIT required, never invent table names outside the schema catalog.
`
    : `
## Custom Report Generation (NOT AUTHORIZED)
This user cannot run custom SQL or inspect the full database schema.
If they ask for ad-hoc SQL or unrestricted data dumps, refuse politely and offer standard reports via list_available_reports / run_standard_report instead.
`;

  return `You are NATS ERP business assistant with full access to operational data tools and standard system reports.

${roleLine}

## Core capabilities
- Answer questions about accounting, sales, purchasing, cash/bank, inventory, payroll, assets, budgeting, production, and POS.
- Always use tools for factual data; do not invent numbers.
- For reporting requests, call list_available_reports or run_standard_report with the correct report code and dates (YYYY-MM-DD).
- After returning report data, provide concise business analysis: trends, anomalies, and recommendations when useful.
- Format money and tables clearly in markdown.

## Charts & visual analysis
- When the user asks for a chart, graph, visualization, trend, comparison, or visual analysis — OR when numeric series would be clearer as a chart — call create_chart after fetching real data with other tools.
- Never invent chart numbers; only plot values returned by tools.
- Chart types: bar (comparisons), line/area (time series), pie (composition, max ~8 slices).
- create_chart returns a \`\`\`chart fenced block that the chat UI renders interactively. Include that block in your final reply (do not strip it).
- You may also emit a \`\`\`chart JSON block yourself using the same schema: { type, title?, description?, xKey?, yKeys?, data, series?, stacked?, currency?, valueKey?, nameKey? }.
- Prefer currency: true for money series. Keep data under 100 rows. Add a short written insight after the chart.

## Standard reports
Use run_standard_report for: profit_loss, balance_sheet, cash_flow, equity_change, financial_ratios, ar_aging, receivable, customer_recap, sales_by_product, profitability, ap_aging, payable, vendor_recap, cash_balance, cash_flow_summary, daily_cash_movement, stock_valuation, low_stock, slow_moving, inventory_movement, budget_variance, overspending, asset_register, depreciation_summary, asset_valuation, production_output, material_consumption, wip.

${customSection}

## Response style
- Be precise, structured, and actionable.
- When a request is ambiguous, choose the closest standard report and state your assumption, or ask one clarifying question.
- Never expose secrets, passwords, API keys, or raw connection strings.`;
}

function parseToolArgs(args: string): Record<string, unknown> {
  const raw = args?.trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    // Models sometimes wrap JSON in fences or append trailing text
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // fall through
      }
    }

    const start = raw.search(/[\[{]/);
    if (start >= 0) {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = start; i < raw.length; i++) {
        const ch = raw[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === "\\") escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === "{" || ch === "[") depth++;
        else if (ch === "}" || ch === "]") {
          depth--;
          if (depth === 0) {
            try {
              return JSON.parse(raw.slice(start, i + 1));
            } catch {
              break;
            }
          }
        }
      }
    }

    throw new Error("Unable to parse tool arguments as JSON");
  }
}

export async function createBusinessAgent(ctx: AIUserContext) {
  const config = await getAIConfig(ctx.userId);

  let llm;
  if (config.provider === "openrouter") {
    llm = new ChatOpenAI({
      model: config.model,
      temperature: config.temperature,
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      maxTokens: config.maxTokens,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://nats.app",
          "X-Title": "NATS ERP",
        },
      },
    });
  } else if (config.provider === "custom" && config.customEndpoint) {
    llm = new ChatOpenAI({
      model: config.model,
      temperature: config.temperature,
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      maxTokens: config.maxTokens,
      configuration: {
        baseURL: config.customEndpoint.replace(/\/+$/, ""),
      },
    });
  } else {
    llm = new ChatOpenAI({
      model: config.model,
      temperature: config.temperature,
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      maxTokens: config.maxTokens,
    });
  }

  const tools = getToolsForUser(ctx).map(
    (tool) =>
      new DynamicTool({
        name: tool.name,
        description: tool.description,
        func: async (args: string) => {
          try {
            const parsedArgs = parseToolArgs(args);
            const result = await tool.handler(parsedArgs);
            return typeof result === "string" ? result : JSON.stringify(result);
          } catch (e) {
            // Some models pass plain strings instead of JSON
            try {
              const result = await tool.handler(
                typeof args === "string" ? { input: args } : args,
              );
              return typeof result === "string"
                ? result
                : JSON.stringify(result);
            } catch (inner) {
              return `Error: ${(inner as Error).message || (e as Error).message}`;
            }
          }
        },
      }),
  );

  const agent = createDeepAgent({
    model: llm,
    tools,
    systemPrompt: buildSystemPrompt(ctx),
  });

  return agent;
}

export function convertToLangChainMessages(
  messages: AIChatMessage[],
): BaseMessage[] {
  return messages.map((msg) => {
    if (msg.role === "user") {
      return new HumanMessage(msg.content);
    } else if (msg.role === "assistant") {
      return new AIMessage(msg.content);
    } else {
      return new AIMessage(msg.content);
    }
  });
}
