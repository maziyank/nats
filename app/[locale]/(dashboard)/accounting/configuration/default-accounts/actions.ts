"use server"

import { prisma } from "@/services/lib/prisma"
import { DefaultAccountPurpose } from "@/prisma/generated/prisma/client"
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache"
import { authorizedAction } from "@/services/lib/permissions/protected-action"
import { getSession } from "@/services/lib/auth/auth"
import { hasPermission } from "@/services/lib/permissions/utils"

export type DefaultAccountWithAccount = {
  id: string
  purpose: DefaultAccountPurpose
  accountId: string
  account: {
    id: string
    code: string
    name: string
  }
}

const fetchDefaultAccountsCached = unstable_cache(
  async () => {
    return prisma.defaultAccount.findMany({
      where: { isActive: true },
      include: {
        account: {
          select: { id: true, code: true, name: true },
        },
      },
    })
  },
  ["default-accounts"],
  { revalidate: 300, tags: ["default-accounts"] },
)

const fetchActiveAccountsCached = unstable_cache(
  async () => {
    return prisma.account.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
      },
      orderBy: { code: "asc" },
    })
  },
  ["active-accounts-select"],
  { revalidate: 300, tags: ["chart-of-accounts"] },
)

export async function getDefaultAccounts() {
  const session = await getSession()
  if (!session || !hasPermission(session.permissions, "default_accounts.view")) {
    return []
  }

  return fetchDefaultAccountsCached()
}

export async function getAccounts() {
  const session = await getSession()
  if (!session || !hasPermission(session.permissions, "accounts.view")) {
    return []
  }

  return fetchActiveAccountsCached()
}

export async function updateDefaultAccount(purpose: DefaultAccountPurpose, accountId: string) {
  const session = await getSession()
  if (!session || !hasPermission(session.permissions, "default_accounts.manage")) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    // Find current active default account for this purpose
    const current = await prisma.defaultAccount.findFirst({
      where: {
        purpose,
        isActive: true,
      },
    })

    // If same account, do nothing
    if (current?.accountId === accountId) {
      return { success: true }
    }

    // Transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // Deactivate current
      if (current) {
        await tx.defaultAccount.update({
          where: { id: current.id },
          data: { isActive: false },
        })
      }

      // Create new
      await tx.defaultAccount.create({
        data: {
          purpose,
          accountId,
          isActive: true,
        },
      })
    })

    revalidatePath("/accounting/configuration/default-accounts")
    revalidateTag("default-accounts", "max")
    return { success: true }
  } catch (error) {
    console.error("Error updating default account:", error)
    return { success: false, error: "Failed to update default account" }
  }
}

export const saveDefaultAccounts = authorizedAction(
  "default_accounts.manage",
  async (updates: { purpose: DefaultAccountPurpose; accountId: string }[]) => {
    try {
      await prisma.$transaction(async (tx) => {
        for (const update of updates) {
          const { purpose, accountId } = update

          // Find current active default account for this purpose
          const current = await tx.defaultAccount.findFirst({
            where: {
              purpose,
              isActive: true,
            },
          })

          // If same account, do nothing
          if (current?.accountId === accountId) {
            continue
          }

          // Deactivate current
          if (current) {
            await tx.defaultAccount.update({
              where: { id: current.id },
              data: { isActive: false },
            })
          }

          // Create new
          await tx.defaultAccount.create({
            data: {
              purpose,
              accountId,
              isActive: true,
            },
          })
        }
      })

      revalidatePath("/accounting/configuration/default-accounts")
      revalidateTag("default-accounts", "max")
      return { success: true }
    } catch (error) {
      console.error("Error saving default accounts:", error)
      return { success: false, error: "Failed to save default accounts" }
    }
  }
)
