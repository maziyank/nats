import { describe, it, expect } from "vitest";
import {
  canAccessCustomReports,
  isCustomReportRole,
  assertCustomReportAccess,
  toAIUserContext,
} from "./context";

describe("custom report RBAC", () => {
  it("allows superadmin and Accountant roles", () => {
    expect(isCustomReportRole("superadmin")).toBe(true);
    expect(isCustomReportRole("Accountant")).toBe(true);
    expect(isCustomReportRole("SUPERADMIN")).toBe(true);
    expect(isCustomReportRole("accountant")).toBe(true);
  });

  it("denies other roles", () => {
    expect(isCustomReportRole("Cashier")).toBe(false);
    expect(isCustomReportRole("Manager")).toBe(false);
    expect(isCustomReportRole("Customer")).toBe(false);
  });

  it("canAccessCustomReports respects role and wildcard permissions", () => {
    expect(
      canAccessCustomReports({
        userId: "1",
        userName: "Admin",
        roleId: "r1",
        role: "superadmin",
        permissions: ["*"],
      }),
    ).toBe(true);

    expect(
      canAccessCustomReports({
        userId: "2",
        userName: "Acc",
        roleId: "r2",
        role: "Accountant",
        permissions: ["accounting.view"],
      }),
    ).toBe(true);

    expect(
      canAccessCustomReports({
        userId: "3",
        userName: "Cash",
        roleId: "r3",
        role: "Cashier",
        permissions: ["pos.access"],
      }),
    ).toBe(false);

    // Wildcard still grants access even if role name is non-standard
    expect(
      canAccessCustomReports({
        userId: "4",
        userName: "Owner",
        roleId: "r4",
        role: "CustomOwner",
        permissions: ["*"],
      }),
    ).toBe(true);
  });

  it("assertCustomReportAccess throws for unauthorized roles", () => {
    expect(() =>
      assertCustomReportAccess({
        userId: "3",
        userName: "Cash",
        roleId: "r3",
        role: "Cashier",
        permissions: ["pos.access"],
      }),
    ).toThrow(/Access denied/i);
  });

  it("toAIUserContext maps session fields", () => {
    const ctx = toAIUserContext({
      userId: "u1",
      userName: "Test",
      roleId: "r1",
      role: "superadmin",
      permissions: ["*"],
    });
    expect(ctx.userId).toBe("u1");
    expect(ctx.role).toBe("superadmin");
    expect(ctx.permissions).toEqual(["*"]);
  });
});
