import { describe, it, expect } from "vitest";
import {
  parsePrismaSchema,
  getSchemaCatalog,
  formatSchemaForLLM,
  BLOCKED_TABLES,
  SENSITIVE_TABLES,
} from "./parser";

describe("schema parser", () => {
  it("parses prisma schema models from the project", () => {
    const catalog = parsePrismaSchema();
    expect(catalog.models.length).toBeGreaterThan(10);
    const names = catalog.models.map((m) => m.name);
    expect(names).toContain("Account");
    expect(names).toContain("JournalEntry");
    expect(names).toContain("SalesInvoice");
  });

  it("includes scalar fields for Account", () => {
    const catalog = getSchemaCatalog(true);
    const account = catalog.models.find((m) => m.name === "Account");
    expect(account).toBeDefined();
    const fieldNames = account!.fields.map((f) => f.name);
    expect(fieldNames).toContain("code");
    expect(fieldNames).toContain("name");
    expect(fieldNames).toContain("type");
  });

  it("formatSchemaForLLM includes security rules", () => {
    const text = formatSchemaForLLM({ includeSensitive: true });
    expect(text).toMatch(/Database Schema Catalog/i);
    expect(text).toMatch(/Security Rules/i);
    expect(text).toMatch(/Account/);
    for (const t of BLOCKED_TABLES) {
      expect(text).toMatch(t);
    }
  });

  it("marks known sensitive tables", () => {
    expect(SENSITIVE_TABLES.has("User")).toBe(true);
    expect(SENSITIVE_TABLES.has("JournalEntry")).toBe(true);
  });
});
