"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  type ChartSpec,
  parseChartSpec,
  resolveSeries,
  tryParseChartSpec,
} from "@/services/lib/ai/chart-spec";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { cn } from "@/services/lib/utils";

type ChatChartProps = {
  /** Raw JSON string from a ```chart fence, or a pre-parsed spec */
  source: string | ChartSpec;
  className?: string;
};

function buildConfig(spec: ChartSpec): ChartConfig {
  const series = resolveSeries(spec);
  const config: ChartConfig = {};

  if (spec.type === "pie") {
    const nameKey = spec.nameKey || spec.xKey || "name";
    for (const row of spec.data) {
      const name = String(row[nameKey] ?? "item");
      config[name] = {
        label: name,
        color: undefined,
      };
    }
    const valueKey = spec.valueKey || series[0]?.key || "value";
    config[valueKey] = { label: series[0]?.label || valueKey };
    return config;
  }

  for (const s of series) {
    config[s.key] = {
      label: s.label,
      color: s.color,
    };
  }
  return config;
}

function ChatChartInner({
  spec,
  className,
}: {
  spec: ChartSpec;
  className?: string;
}) {
  const formatCurrency = useFormatCurrency();
  const series = resolveSeries(spec);
  const config = buildConfig(spec);
  const xKey = spec.xKey || "name";

  const formatValue = (value: unknown) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value ?? "");
    if (spec.currency) return formatCurrency(num);
    return num.toLocaleString();
  };

  const pieData =
    spec.type === "pie"
      ? spec.data.map((row, index) => {
          const nameKey = spec.nameKey || xKey;
          const valueKey = spec.valueKey || series[0]?.key || "value";
          return {
            name: String(row[nameKey] ?? `Item ${index + 1}`),
            value: Number(row[valueKey] ?? 0),
            fill: `var(--color-chart-${(index % 5) + 1})`,
          };
        })
      : [];

  return (
    <div
      className={cn(
        "my-3 w-full rounded-lg border border-muted-foreground/15 bg-background/80 p-3 shadow-sm",
        className,
      )}
    >
      {(spec.title || spec.description) && (
        <div className="mb-3 space-y-0.5">
          {spec.title && (
            <div className="text-sm font-semibold text-foreground">
              {spec.title}
            </div>
          )}
          {spec.description && (
            <div className="text-xs text-muted-foreground">
              {spec.description}
            </div>
          )}
        </div>
      )}

      {spec.type === "pie" ? (
        <ChartContainer
          config={config}
          className="mx-auto aspect-square max-h-[280px] w-full"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value) => formatValue(value)}
                />
              }
            />
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              strokeWidth={4}
            >
              {pieData.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Pie>
            <ChartLegend content={<ChartLegendContent nameKey="name" />} />
          </PieChart>
        </ChartContainer>
      ) : (
        <ChartContainer config={config} className="min-h-[260px] w-full">
          {spec.type === "line" ? (
            <LineChart accessibilityLayer data={spec.data}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey={xKey}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(v) => String(v).slice(0, 12)}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v) =>
                  spec.currency
                    ? formatCurrency(Number(v)).replace(/[^\d.,kKmMbB+-]/g, "")
                    : String(v)
                }
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => formatValue(value)}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={`var(--color-${s.key})`}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          ) : spec.type === "area" ? (
            <AreaChart accessibilityLayer data={spec.data}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey={xKey}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(v) => String(v).slice(0, 12)}
              />
              <YAxis tickLine={false} axisLine={false} width={48} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => formatValue(value)}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {series.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  fill={`var(--color-${s.key})`}
                  stroke={`var(--color-${s.key})`}
                  fillOpacity={0.25}
                  stackId={spec.stacked ? "a" : undefined}
                />
              ))}
            </AreaChart>
          ) : (
            <BarChart accessibilityLayer data={spec.data}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey={xKey}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(v) => String(v).slice(0, 12)}
              />
              <YAxis tickLine={false} axisLine={false} width={48} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => formatValue(value)}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  fill={`var(--color-${s.key})`}
                  radius={4}
                  stackId={spec.stacked ? "a" : undefined}
                />
              ))}
            </BarChart>
          )}
        </ChartContainer>
      )}
    </div>
  );
}

export function ChatChart({ source, className }: ChatChartProps) {
  let spec: ChartSpec | null = null;

  if (typeof source === "string") {
    spec = tryParseChartSpec(source);
  } else {
    try {
      spec = parseChartSpec(source);
    } catch {
      spec = null;
    }
  }

  if (!spec) {
    return (
      <div className="my-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        Unable to render chart: invalid chart specification.
      </div>
    );
  }

  return <ChatChartInner spec={spec} className={className} />;
}

export function isChartLanguage(language?: string | null): boolean {
  if (!language) return false;
  return language.toLowerCase() === "chart";
}
