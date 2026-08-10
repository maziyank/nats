import { describe, it, expect } from "vitest";
import { validateSelectSql } from "./validator";

describe("validateSelectSql", () => {
  it("rejects empty SQL", () => {
    const result = validateSelectSql("");
    expect(result.ok).toBe(false);
  });

  it("rejects non-SELECT statements", () => {
    const result = validateSelectSql('DELETE FROM "Account"');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/SELECT/i);
    }
  });

  it("rejects DROP / DDL", () => {
    const result = validateSelectSql('DROP TABLE "Account"');
    expect(result.ok).toBe(false);
  });

  it("rejects multiple statements", () => {
    const result = validateSelectSql(
      'SELECT id FROM "Account"; DROP TABLE "User"',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Multiple/i);
    }
  });

  it("rejects password column selection", () => {
    const result = validateSelectSql(
      'SELECT id, password FROM "User" LIMIT 10',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/password/i);
    }
  });

  it("rejects blocked tables", () => {
    const result = validateSelectSql(
      'SELECT * FROM "VerificationToken" LIMIT 5',
    );
    expect(result.ok).toBe(false);
  });

  it("requires approval for sensitive tables", () => {
    const result = validateSelectSql(
      'SELECT id, email, name FROM "User" LIMIT 5',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.requiresApproval).toBe(true);
      expect(result.sensitiveTables).toContain("User");
    }
  });

  it("allows sensitive tables when approved", () => {
    const result = validateSelectSql(
      'SELECT id, email, name FROM "User" LIMIT 5',
      { approved: true },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tables).toContain("User");
      expect(result.sql).toMatch(/LIMIT\s+5/i);
    }
  });

  it("allows safe Account queries and injects LIMIT", () => {
    const result = validateSelectSql(
      'SELECT code, name, type FROM "Account" WHERE "isActive" = true',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tables).toContain("Account");
      expect(result.sql).toMatch(/LIMIT/i);
      expect(result.requiresApproval).toBe(false);
    }
  });

  it("caps excessive LIMIT", () => {
    const result = validateSelectSql(
      'SELECT code FROM "Account" LIMIT 9999',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sql).toMatch(/LIMIT\s+500/i);
    }
  });

  it("rejects INSERT disguised with whitespace", () => {
    const result = validateSelectSql(
      '  INSERT INTO "Account" (code) VALUES (\'x\')',
    );
    expect(result.ok).toBe(false);
  });
});
