import type { AITool } from "../types";
import {
  formatChartMarkdown,
  parseChartSpec,
  type ChartType,
} from "../chart-spec";

/**
 * Tool that validates chart data and returns a fenced ```chart``` block
 * the chat UI can render as an interactive chart.
 */
export const createChartTool: AITool = {
  name: "create_chart",
  description:
    "Create an interactive chart for visual analysis in the chat window. Use after gathering numeric data from other tools when trends, comparisons, or composition would be clearer as a chart. Returns a markdown chart block the UI will render. Prefer bar for comparisons, line/area for time series, pie for composition (max ~8 slices).",
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["bar", "line", "area", "pie"],
        description: "Chart type",
      },
      title: {
        type: "string",
        description: "Short chart title",
      },
      description: {
        type: "string",
        description: "Optional one-line caption under the title",
      },
      xKey: {
        type: "string",
        description:
          "Category / x-axis field name in each data row (default: name). For pie charts this is the slice label field.",
      },
      yKeys: {
        type: "array",
        items: { type: "string" },
        description:
          "Numeric field names to plot (required for bar/line/area). For pie, a single value key.",
      },
      valueKey: {
        type: "string",
        description: "Pie chart value field (default: value or first yKey)",
      },
      nameKey: {
        type: "string",
        description: "Pie chart label field (default: xKey or name)",
      },
      series: {
        type: "array",
        description: "Optional series labels/colors for multi-series charts",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            label: { type: "string" },
            color: { type: "string" },
          },
          required: ["key"],
        },
      },
      data: {
        type: "array",
        description:
          "Array of data points. Each object must include xKey and the numeric yKeys. Max 100 rows.",
        items: {
          type: "object",
          additionalProperties: true,
        },
      },
      stacked: {
        type: "boolean",
        description: "Stack series for bar/area charts (default false)",
      },
      currency: {
        type: "boolean",
        description: "Format tooltip values as currency (default false)",
      },
    },
    required: ["type", "data"],
  },
  handler: async (args: {
    type: ChartType;
    title?: string;
    description?: string;
    xKey?: string;
    yKeys?: string[];
    valueKey?: string;
    nameKey?: string;
    series?: { key: string; label?: string; color?: string }[];
    data: Record<string, string | number | null>[];
    stacked?: boolean;
    currency?: boolean;
  }) => {
    try {
      if (!args?.data || !Array.isArray(args.data) || args.data.length === 0) {
        return "Error: create_chart requires a non-empty data array.";
      }

      // Coerce numeric-looking strings so models can pass mixed types
      const data = args.data.map((row) => {
        const next: Record<string, string | number | null> = {};
        for (const [k, v] of Object.entries(row)) {
          if (v === null || v === undefined) {
            next[k] = null;
          } else if (typeof v === "number") {
            next[k] = v;
          } else if (typeof v === "string") {
            const cleaned = v.replace(/[$,%\s]/g, "").replace(/,/g, "");
            const num = Number(cleaned);
            next[k] =
              cleaned !== "" && Number.isFinite(num) && /^-?\d/.test(cleaned)
                ? num
                : v;
          } else {
            next[k] = String(v);
          }
        }
        return next;
      });

      const spec = parseChartSpec({
        type: args.type,
        title: args.title,
        description: args.description,
        xKey: args.xKey,
        yKeys: args.yKeys,
        valueKey: args.valueKey,
        nameKey: args.nameKey,
        series: args.series,
        data,
        stacked: args.stacked,
        currency: args.currency,
      });

      return formatChartMarkdown(spec);
    } catch (error) {
      return `Error creating chart: ${(error as Error).message}`;
    }
  },
};

export const chartTools: AITool[] = [createChartTool];
