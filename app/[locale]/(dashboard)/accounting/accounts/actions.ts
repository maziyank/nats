/**
 * accounts.ts
 * Server-side data layer for the Chart of Accounts.
 */

"use server";

import { z } from "zod";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { AccountType } from "@/prisma/generated/prisma/enums";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { getSession } from "@/services/lib/auth/auth";
import { hasPermission } from "@/services/lib/permissions/utils";
import { requiredIdSchema } from "@/services/lib/validation/schemas";
import { AccountService } from "@/services/modules/accounting/services/account.service";

const createAccountSchema = z.object({
  code: z.string().min(1, "Account code is required"),
  name: z.string().min(1, "Account name is required"),
  type: z.nativeEnum(AccountType),
  parentId: z.string().cuid().optional().nullable(),
});

const fetchAccountsCached = unstable_cache(
  async (page?: number, pageSize?: number) => {
    return AccountService.getAccounts(page, pageSize);
  },
  ["chart-of-accounts"],
  { revalidate: 300, tags: ["chart-of-accounts"] },
);

/**
 * Fetch accounts for list or tree display.
 */
export async function getAccounts(page?: number, pageSize?: number) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "accounts.view")) {
    if (!page || !pageSize) {
      return [];
    }
    return {
      data: [],
      pagination: {
        total: 0,
        page: page || 1,
        pageSize: pageSize || 10,
        totalPages: 0,
        hasMore: false,
      },
    };
  }

  try {
    return await fetchAccountsCached(page, pageSize);
  } catch (error) {
    console.error("Failed to fetch accounts:", error);
    if (!page || !pageSize) return [];
    return {
      data: [],
      pagination: {
        total: 0,
        page: page || 1,
        pageSize: pageSize || 10,
        totalPages: 0,
        hasMore: false,
      },
    };
  }
}

/**
 * Create a new account.
 * Permission: "accounts.create"
 */
export const createAccount = authorizedAction(
  "accounts.create",
  async (data: {
    code: string;
    name: string;
    type: AccountType;
    parentId?: string;
  }) => {
    try {
      const parseResult = createAccountSchema.safeParse(data);
      if (!parseResult.success) {
        return {
          success: false,
          error: parseResult.error.issues[0]?.message ?? "Invalid input",
        };
      }
      const parsed = parseResult.data;

      const session = await getSession();
      if (!session?.userId) {
        return { success: false, error: "User not authenticated" };
      }

      const account = await AccountService.createAccount(
        parsed as Parameters<typeof AccountService.createAccount>[0],
        session.userId,
      );

      revalidatePath("/accounting/accounts");
      revalidateTag("chart-of-accounts", "max");
      return { success: true, data: account };
    } catch (error: any) {
      console.error(error);
      return {
        success: false,
        error: error.message || "Failed to create account",
      };
    }
  }
);

/**
 * Generate the next available account code based on parent and type.
 */
export async function getNextAccountCode(
  parentId: string | null,
  type: AccountType
) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "accounts.create")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const code = await AccountService.getNextAccountCode(parentId, type);
    return { success: true, code };
  } catch (error: any) {
    console.error(error);
    return { success: false, error: "Failed to generate code" };
  }
}

/**
 * Update an existing account's name.
 */
export async function updateAccount(id: string, data: { name: string }) {
  try {
    const idResult = requiredIdSchema.safeParse(id);
    if (!idResult.success) {
      return { success: false, error: "Invalid account id" };
    }
    const dataResult = z
      .object({ name: z.string().min(1, "Account name is required") })
      .safeParse(data);
    if (!dataResult.success) {
      return {
        success: false,
        error: dataResult.error.issues[0]?.message ?? "Invalid input",
      };
    }
    await AccountService.updateAccount(idResult.data, dataResult.data);
    revalidatePath("/accounting/accounts");
    revalidateTag("chart-of-accounts", "max");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Failed to update account" };
  }
}

/**
 * Delete an account if it is not referenced by any journal entry.
 */
export async function deleteAccount(id: string) {
  const session = await getSession();
  if (!session || !hasPermission(session.permissions, "accounts.delete")) {
    return { success: false, error: "Unauthorized" };
  }

  const idResult = requiredIdSchema.safeParse(id);
  if (!idResult.success) {
    return { success: false, error: "Invalid account id" };
  }

  try {
    await AccountService.deleteAccount(idResult.data);
    revalidatePath("/accounting/accounts");
    revalidateTag("chart-of-accounts", "max");
    return { success: true };
  } catch (error: any) {
    console.error(error);
    return { success: false, error: error.message || "Failed to delete account" };
  }
}
