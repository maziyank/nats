import { describe, it, expect } from "vitest";
import { analyzeDataset, rowsToMarkdownTable } from "./analysis";

describe("analyzeDataset", () => {
  it("handles empty rows", () => {
    const result = analyzeDataset([]);
    expect(result.insights.length).toBeGreaterThan(0);
    expect(result.markdown).toMatch(/No rows/i);
  });

  it("detects upward trend", () => {
    const rows = [
      { month: "Jan", revenue: 100 },
      { month: "Feb", revenue: 110 },
      { month: "Mar", revenue: 200 },
      { month: "Apr", revenue: 250 },
    ];
    const result = analyzeDataset(rows, { title: "Revenue" });
    expect(result.markdown).toMatch(/Revenue/);
    expect(result.insights.some((i) => i.type === "summary")).toBe(true);
  });

  it("flags outliers", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      value: i === 5 ? 1000 : 10,
    }));
    const result = analyzeDataset(rows);
    expect(result.insights.some((i) => i.type === "anomaly")).toBe(true);
  });
});

describe("rowsToMarkdownTable", () => {
  it("renders headers and rows", () => {
    const md = rowsToMarkdownTable([
      { Name: "A", Amount: 10.5 },
      { Name: "B", Amount: 20 },
    ]);
    expect(md).toContain("| Name | Amount |");
    expect(md).toContain("| A | 10.50 |");
    expect(md).toContain("| B | 20 |");
  });

  it("returns message for empty data", () => {
    expect(rowsToMarkdownTable([])).toMatch(/No data/i);
  });
});
