/**
 * Lightweight business analysis helpers for AI report outputs.
 * Produces trend notes, anomaly flags, and insight summaries from tabular data.
 */

export type AnalysisInsight = {
  type: "trend" | "anomaly" | "summary" | "recommendation";
  severity?: "info" | "warning" | "critical";
  message: string;
};

export type AnalysisResult = {
  insights: AnalysisInsight[];
  markdown: string;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function pickNumericColumns(rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  return keys.filter((k) =>
    rows.some((r) => toNumber(r[k]) !== null),
  );
}

function columnSeries(
  rows: Record<string, unknown>[],
  column: string,
): number[] {
  return rows
    .map((r) => toNumber(r[column]))
    .filter((n): n is number => n !== null);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Detect simple trends and anomalies in a result set and return markdown insights.
 */
export function analyzeDataset(
  rows: Record<string, unknown>[],
  options?: { title?: string; maxInsights?: number },
): AnalysisResult {
  const title = options?.title ?? "Business Analysis";
  const maxInsights = options?.maxInsights ?? 8;
  const insights: AnalysisInsight[] = [];

  if (!rows.length) {
    insights.push({
      type: "summary",
      severity: "info",
      message: "No rows returned — nothing to analyze for this period/filter.",
    });
    return { insights, markdown: formatInsights(title, insights, 0) };
  }

  insights.push({
    type: "summary",
    severity: "info",
    message: `Dataset contains ${rows.length} row(s) and ${Object.keys(rows[0]).length} column(s).`,
  });

  const numericCols = pickNumericColumns(rows);

  for (const col of numericCols.slice(0, 6)) {
    const series = columnSeries(rows, col);
    if (series.length < 2) continue;

    const m = mean(series);
    const sd = stdDev(series);
    const total = series.reduce((a, b) => a + b, 0);
    const min = Math.min(...series);
    const max = Math.max(...series);

    // Trend: compare first half vs second half
    if (series.length >= 4) {
      const mid = Math.floor(series.length / 2);
      const first = mean(series.slice(0, mid));
      const second = mean(series.slice(mid));
      if (first !== 0) {
        const changePct = ((second - first) / Math.abs(first)) * 100;
        if (Math.abs(changePct) >= 10) {
          insights.push({
            type: "trend",
            severity: changePct < -20 ? "warning" : "info",
            message: `${col}: ${changePct >= 0 ? "upward" : "downward"} trend of ${changePct.toFixed(1)}% comparing second half vs first half of the series.`,
          });
        }
      } else if (second > 0) {
        insights.push({
          type: "trend",
          severity: "info",
          message: `${col}: values moved from ~0 to an average of ${second.toFixed(2)} in the later period.`,
        });
      }
    }

    // Anomalies: values beyond mean ± 2σ
    if (sd > 0) {
      const outliers = series.filter((v) => Math.abs(v - m) > 2 * sd);
      if (outliers.length > 0) {
        insights.push({
          type: "anomaly",
          severity: outliers.length > 2 ? "warning" : "info",
          message: `${col}: ${outliers.length} potential outlier(s) outside mean±2σ (mean=${m.toFixed(2)}, σ=${sd.toFixed(2)}). Range [${min.toFixed(2)}, ${max.toFixed(2)}].`,
        });
      }
    }

    insights.push({
      type: "summary",
      severity: "info",
      message: `${col}: total=${total.toFixed(2)}, avg=${m.toFixed(2)}, min=${min.toFixed(2)}, max=${max.toFixed(2)}.`,
    });
  }

  // Zero / null heavy columns
  if (rows.length >= 3) {
    for (const key of Object.keys(rows[0]).slice(0, 10)) {
      const empty = rows.filter(
        (r) => r[key] === null || r[key] === undefined || r[key] === "",
      ).length;
      const emptyPct = (empty / rows.length) * 100;
      if (emptyPct >= 40) {
        insights.push({
          type: "anomaly",
          severity: "info",
          message: `Column "${key}" is empty/null in ${emptyPct.toFixed(0)}% of rows — verify data completeness.`,
        });
      }
    }
  }

  // Generic recommendations
  if (insights.some((i) => i.type === "anomaly" && i.severity === "warning")) {
    insights.push({
      type: "recommendation",
      severity: "warning",
      message:
        "Review flagged outliers and reconcile against source transactions (journals, invoices, cash movements) before acting.",
    });
  } else if (insights.some((i) => i.type === "trend")) {
    insights.push({
      type: "recommendation",
      severity: "info",
      message:
        "Validate observed trends against seasonality and open periods; consider comparative reports for prior period confirmation.",
    });
  }

  const limited = insights.slice(0, maxInsights);
  return {
    insights: limited,
    markdown: formatInsights(title, limited, rows.length),
  };
}

function formatInsights(
  title: string,
  insights: AnalysisInsight[],
  rowCount: number,
): string {
  const lines = [`### ${title}`, "", `Rows analyzed: ${rowCount}`, ""];
  for (const insight of insights) {
    const badge =
      insight.type === "anomaly"
        ? "⚠"
        : insight.type === "trend"
          ? "↗"
          : insight.type === "recommendation"
            ? "→"
            : "•";
    lines.push(
      `- ${badge} **${insight.type.toUpperCase()}**${insight.severity ? ` (${insight.severity})` : ""}: ${insight.message}`,
    );
  }
  return lines.join("\n");
}

/** Format query rows as a markdown table (capped). */
export function rowsToMarkdownTable(
  rows: Record<string, unknown>[],
  maxRows = 50,
): string {
  if (!rows.length) return "No data found.";
  const headers = Object.keys(rows[0]);
  const headerRow = `| ${headers.join(" | ")} |`;
  const separatorRow = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows
    .slice(0, maxRows)
    .map(
      (row) =>
        `| ${headers
          .map((h) => {
            const v = row[h];
            if (v === null || v === undefined) return "";
            if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
            return String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
          })
          .join(" | ")} |`,
    )
    .join("\n");
  const more =
    rows.length > maxRows
      ? `\n\n_…and ${rows.length - maxRows} more row(s) truncated for display._`
      : "";
  return `${headerRow}\n${separatorRow}\n${body}${more}`;
}
