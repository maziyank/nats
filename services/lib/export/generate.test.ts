import { describe, it, expect, beforeEach } from "vitest";
import { generateExportFile } from "./generate";
import { _resetExportRateLimits } from "./rate-limit";
import { EXPORT_LIMITS } from "./types";
import { flattenTreeRows } from "./utils";
import { buildCsv } from "./csv";

describe("generateExportFile", () => {
  beforeEach(() => {
    _resetExportRateLimits();
  });

  const columns = [
    { key: "name", header: "Name" },
    { key: "amount", header: "Amount" },
  ];

  const rows = [
    { name: "Alpha", amount: 100 },
    { name: "Beta, Inc", amount: 200.5 },
    { name: 'Quote "Me"', amount: 0 },
  ];

  it("generates CSV with all rows and UTF-8 BOM", async () => {
    const result = await generateExportFile({
      rows,
      columns,
      format: "csv",
      filename: "test-report",
      skipRateLimit: true,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.filename).toBe("test-report.csv");
    expect(result.rowCount).toBe(3);
    expect(result.mimeType).toContain("text/csv");

    const content = Buffer.from(result.base64, "base64").toString("utf-8");
    expect(content.startsWith("\uFEFF")).toBe(true);
    expect(content).toContain("Name,Amount");
    expect(content).toContain("Alpha,100");
    expect(content).toContain('"Beta, Inc",200.5');
    expect(content).toContain('"Quote ""Me""",0');
  });

  it("generates Excel xlsx buffer", async () => {
    const result = await generateExportFile({
      rows,
      columns,
      format: "xlsx",
      filename: "test-report",
      sheetName: "Sheet1",
      skipRateLimit: true,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.filename).toBe("test-report.xlsx");
    expect(result.rowCount).toBe(3);
    expect(result.mimeType).toContain("spreadsheetml");
    // XLSX files are ZIP archives starting with PK
    const buffer = Buffer.from(result.base64, "base64");
    expect(buffer[0]).toBe(0x50); // P
    expect(buffer[1]).toBe(0x4b); // K
  });

  it("rejects empty datasets", async () => {
    const result = await generateExportFile({
      rows: [],
      columns,
      format: "csv",
      filename: "empty",
      skipRateLimit: true,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("EMPTY");
  });

  it("rejects datasets exceeding max row count", async () => {
    const bigRows = Array.from(
      { length: EXPORT_LIMITS.MAX_ROW_COUNT + 1 },
      (_, i) => ({ name: `R${i}`, amount: i }),
    );

    const result = await generateExportFile({
      rows: bigRows,
      columns,
      format: "csv",
      filename: "huge",
      skipRateLimit: true,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("TOO_LARGE");
  });

  it("enforces rate limiting per user", async () => {
    const userId = "user-rate-test";

    for (let i = 0; i < EXPORT_LIMITS.RATE_LIMIT_MAX; i++) {
      const ok = await generateExportFile({
        rows,
        columns,
        format: "csv",
        filename: `ok-${i}`,
        userId,
      });
      expect(ok.success).toBe(true);
    }

    const blocked = await generateExportFile({
      rows,
      columns,
      format: "csv",
      filename: "blocked",
      userId,
    });

    expect(blocked.success).toBe(false);
    if (blocked.success) return;
    expect(blocked.code).toBe("RATE_LIMITED");
  });
});

describe("buildCsv", () => {
  it("escapes special characters correctly", () => {
    const csv = buildCsv(
      [{ a: "hello, world", b: 'say "hi"', c: "line\nbreak" }],
      [
        { key: "a", header: "A" },
        { key: "b", header: "B" },
        { key: "c", header: "C" },
      ],
    );
    expect(csv).toContain('"hello, world"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"line\nbreak"');
  });
});

describe("flattenTreeRows", () => {
  it("flattens nested account trees preserving order", () => {
    type Node = { code: string; name: string; children?: Node[] };
    const tree: Node[] = [
      {
        code: "1",
        name: "Assets",
        children: [
          { code: "1.1", name: "Cash" },
          {
            code: "1.2",
            name: "Receivables",
            children: [{ code: "1.2.1", name: "Trade AR" }],
          },
        ],
      },
    ];

    const flat = flattenTreeRows(tree, (node, depth) => ({
      code: node.code,
      name: node.name,
      depth,
    }));

    expect(flat).toEqual([
      { code: "1", name: "Assets", depth: 0 },
      { code: "1.1", name: "Cash", depth: 1 },
      { code: "1.2", name: "Receivables", depth: 1 },
      { code: "1.2.1", name: "Trade AR", depth: 2 },
    ]);
  });
});
