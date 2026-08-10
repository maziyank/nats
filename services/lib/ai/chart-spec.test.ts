import { describe, it, expect } from "vitest";
import {
  formatChartMarkdown,
  parseChartSpec,
  tryParseChartSpec,
  resolveSeries,
} from "./chart-spec";
import { createChartTool } from "./tools/chart-tools";

describe("chart-spec", () => {
  it("parses a bar chart with yKeys", () => {
    const spec = parseChartSpec({
      type: "bar",
      title: "Sales",
      xKey: "month",
      yKeys: ["amount"],
      data: [
        { month: "Jan", amount: 100 },
        { month: "Feb", amount: 200 },
      ],
      currency: true,
    });
    expect(spec.type).toBe("bar");
    expect(spec.yKeys).toEqual(["amount"]);
    expect(spec.currency).toBe(true);
  });

  it("infers yKeys for cartesian charts", () => {
    const spec = parseChartSpec({
      type: "line",
      data: [
        { name: "Q1", revenue: 10, expense: 5 },
        { name: "Q2", revenue: 12, expense: 6 },
      ],
    });
    expect(spec.xKey).toBe("name");
    expect(spec.yKeys).toEqual(expect.arrayContaining(["revenue", "expense"]));
  });

  it("normalizes pie charts", () => {
    const spec = parseChartSpec({
      type: "pie",
      data: [
        { name: "Rent", value: 40 },
        { name: "Payroll", value: 60 },
      ],
    });
    expect(spec.valueKey).toBe("value");
    expect(spec.nameKey).toBe("name");
  });

  it("tryParseChartSpec reads fenced and raw JSON", () => {
    const json = JSON.stringify({
      type: "bar",
      data: [{ name: "A", value: 1 }],
      yKeys: ["value"],
    });
    expect(tryParseChartSpec(json)?.type).toBe("bar");
    expect(tryParseChartSpec("```chart\n" + json + "\n```")?.type).toBe("bar");
    expect(tryParseChartSpec("not a chart")).toBeNull();
  });

  it("formatChartMarkdown wraps a chart fence", () => {
    const md = formatChartMarkdown({
      type: "bar",
      xKey: "name",
      data: [{ name: "A", value: 1 }],
      yKeys: ["value"],
    } as const);
    expect(md).toContain("```chart");
    expect(md).toContain('"type": "bar"');
  });

  it("resolveSeries uses defaults", () => {
    const series = resolveSeries(
      parseChartSpec({
        type: "bar",
        data: [{ name: "A", amount: 1 }],
        yKeys: ["amount"],
      }),
    );
    expect(series[0].key).toBe("amount");
    expect(series[0].color).toContain("chart-1");
  });
});

describe("create_chart tool", () => {
  it("returns a chart markdown block", async () => {
    const result = await createChartTool.handler({
      type: "bar",
      title: "Demo",
      data: [
        { name: "Jan", amount: "1,000" },
        { name: "Feb", amount: 2000 },
      ],
      yKeys: ["amount"],
      currency: true,
    });
    expect(typeof result).toBe("string");
    expect(result).toContain("```chart");
    expect(result).toContain("Demo");
    const parsed = tryParseChartSpec(result as string);
    expect(parsed?.data[0].amount).toBe(1000);
  });

  it("errors on empty data", async () => {
    const result = await createChartTool.handler({
      type: "pie",
      data: [],
    });
    expect(result).toMatch(/Error/i);
  });
});
