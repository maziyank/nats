import { describe, it, expect, vi } from "vitest";

vi.mock("./tools", () => ({
  businessTools: [
    {
      name: "get_sales_orders",
      description: "mock",
      parameters: {},
      handler: async () => "ok",
    },
  ],
}));

vi.mock("./tools/report-tools", () => ({
  standardReportTools: [
    {
      name: "list_available_reports",
      description: "mock",
      parameters: {},
      handler: async () => "ok",
    },
    {
      name: "run_standard_report",
      description: "mock",
      parameters: {},
      handler: async () => "ok",
    },
  ],
}));

vi.mock("./tools/chart-tools", () => ({
  chartTools: [
    {
      name: "create_chart",
      description: "mock",
      parameters: {},
      handler: async () => "ok",
    },
  ],
}));

import { getToolsForUser } from "./tool-registry";
import type { AIUserContext } from "./context";

describe("getToolsForUser", () => {
  const base = {
    userId: "u1",
    userName: "Test",
    roleId: "r1",
    permissions: [] as string[],
  };

  it("includes standard report tools for all roles", () => {
    const tools = getToolsForUser({
      ...base,
      role: "Cashier",
      permissions: ["pos.access"],
    });
    const names = tools.map((t) => t.name);
    expect(names).toContain("list_available_reports");
    expect(names).toContain("run_standard_report");
    expect(names).toContain("get_sales_orders");
    expect(names).toContain("create_chart");
  });

  it("includes custom SQL tools for superadmin", () => {
    const tools = getToolsForUser({
      ...base,
      role: "superadmin",
      permissions: ["*"],
    } satisfies AIUserContext);
    const names = tools.map((t) => t.name);
    expect(names).toContain("get_database_schema");
    expect(names).toContain("run_custom_sql_report");
    expect(names).toContain("validate_custom_sql");
    expect(names).toContain("generate_custom_report");
  });

  it("includes custom SQL tools for Accountant", () => {
    const tools = getToolsForUser({
      ...base,
      role: "Accountant",
      permissions: ["accounting.view", "reports.view"],
    });
    const names = tools.map((t) => t.name);
    expect(names).toContain("run_custom_sql_report");
  });
});
