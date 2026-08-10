import { z } from "zod";

export const CHART_TYPES = ["bar", "line", "area", "pie"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const chartSeriesSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  color: z.string().optional(),
});

export const chartSpecSchema = z.object({
  type: z.enum(CHART_TYPES),
  title: z.string().optional(),
  description: z.string().optional(),
  xKey: z.string().min(1).optional(),
  yKeys: z.array(z.string().min(1)).min(1).optional(),
  series: z.array(chartSeriesSchema).optional(),
  data: z
    .array(z.record(z.string(), z.union([z.string(), z.number(), z.null()])))
    .min(1)
    .max(100),
  valueKey: z.string().optional(),
  nameKey: z.string().optional(),
  stacked: z.boolean().optional(),
  currency: z.boolean().optional(),
});

export type ChartSpecInput = z.input<typeof chartSpecSchema>;
export type ChartSpec = z.infer<typeof chartSpecSchema> & {
  xKey: string;
  yKeys: string[];
};

const DEFAULT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/**
 * Normalize and validate a chart payload from the model or tool.
 */
export function parseChartSpec(input: unknown): ChartSpec {
  const parsed = chartSpecSchema.parse(input);
  const xKey = parsed.xKey || "name";

  if (parsed.type === "pie") {
    const nameKey = parsed.nameKey || xKey;
    const valueKey = parsed.valueKey || parsed.yKeys?.[0] || "value";
    return {
      ...parsed,
      xKey: nameKey,
      nameKey,
      valueKey,
      yKeys: [valueKey],
    };
  }

  const yKeys =
    parsed.yKeys && parsed.yKeys.length > 0
      ? parsed.yKeys
      : parsed.series?.map((s) => s.key) ||
        Object.keys(parsed.data[0] || {}).filter((k) => k !== xKey);

  if (yKeys.length === 0) {
    throw new Error("Chart requires at least one numeric series (yKeys)");
  }

  return {
    ...parsed,
    xKey,
    yKeys,
  };
}

/**
 * Try to extract a chart spec from a code fence body or raw JSON string.
 */
export function tryParseChartSpec(raw: string): ChartSpec | null {
  const text = raw.trim();
  if (!text) return null;

  try {
    return parseChartSpec(JSON.parse(text));
  } catch {
    // Models sometimes wrap JSON in prose or extra fences
    const fenced = text.match(/```(?:json|chart)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return parseChartSpec(JSON.parse(fenced[1].trim()));
      } catch {
        return null;
      }
    }

    const start = text.search(/[\[{]/);
    if (start >= 0) {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = start; i < text.length; i++) {
        const ch = text[i];
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
              return parseChartSpec(JSON.parse(text.slice(start, i + 1)));
            } catch {
              return null;
            }
          }
        }
      }
    }
    return null;
  }
}

export function formatChartMarkdown(spec: ChartSpec): string {
  const validated = parseChartSpec(spec);
  const title = validated.title ? `**${validated.title}**\n\n` : "";
  const description = validated.description
    ? `${validated.description}\n\n`
    : "";
  return `${title}${description}\`\`\`chart\n${JSON.stringify(validated, null, 2)}\n\`\`\``;
}

export function resolveSeries(
  spec: ChartSpec,
): { key: string; label: string; color: string }[] {
  const keys =
    spec.yKeys ||
    spec.series?.map((s) => s.key) ||
    (spec.valueKey ? [spec.valueKey] : []);

  return keys.map((key, index) => {
    const fromSeries = spec.series?.find((s) => s.key === key);
    return {
      key,
      label: fromSeries?.label || key,
      color: fromSeries?.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    };
  });
}
