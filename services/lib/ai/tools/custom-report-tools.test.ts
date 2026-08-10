import { describe, it, expect } from "vitest";
import { createCustomReportTools } from "./custom-report-tools";
import type { AIUserContext } from "../context";

const cashier: AIUserContext = {
  userId: "c1",
  userName: "Cashier User",
  roleId: "r-cash",
  role: "Cashier",
  permissions: ["pos.access"],
};

const admin: AIUserContext = {
  userId: "a1",
  userName: "Admin",
  roleId: "r-admin",
  role: "superadmin",
  permissions: ["*"],
};

describe("createCustomReportTools RBAC", () => {
  it("denies schema access for unauthorized roles", async () => {
    const tools = createCustomReportTools(cashier);
    const schemaTool = tools.find((t) => t.name === "get_database_schema")!;
    const result = await schemaTool.handler({});
    expect(String(result)).toMatch(/Access denied/i);
  });

  it("denies SQL execution for unauthorized roles", async () => {
    const tools = createCustomReportTools(cashier);
    const runTool = tools.find((t) => t.name === "run_custom_sql_report")!;
    const result = await runTool.handler({
      sql: 'SELECT code FROM "Account" LIMIT 5',
    });
    expect(String(result)).toMatch(/Access denied/i);
  });

  it("allows schema access for superadmin", async () => {
    const tools = createCustomReportTools(admin);
    const schemaTool = tools.find((t) => t.name === "get_database_schema")!;
    const result = await schemaTool.handler({});
    expect(String(result)).toMatch(/Database Schema Catalog/i);
    expect(String(result)).toMatch(/Account/);
  });

  it("validates SQL for authorized roles without executing", async () => {
    const tools = createCustomReportTools(admin);
    const validate = tools.find((t) => t.name === "validate_custom_sql")!;
    const bad = await validate.handler({
      sql: 'DELETE FROM "Account"',
    });
    expect(String(bad)).toMatch(/"valid": false/);

    const good = await validate.handler({
      sql: 'SELECT code, name FROM "Account" WHERE "isActive" = true LIMIT 10',
    });
    expect(String(good)).toMatch(/"valid": true/);
  });
});
