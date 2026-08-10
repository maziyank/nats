"use server";

import { revalidatePath } from "next/cache";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { getSession } from "@/services/lib/auth/auth";
import { CreateJournalEntryData } from "../types";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { createJournalEntrySchema } from "@/services/lib/validation/schemas";
import { JournalService } from "@/services/modules/accounting/services/journal.service";
import { prisma } from "@/services/lib/prisma";

/**
 * Fetch journal entries with pagination and filtering.
 * Permission: "journal_entries.view"
 */
export const getJournalEntries = authorizedAction(
  "journal_entries.view",
  async ({
    page = 1,
    pageSize = 20,
    startDate,
    endDate,
    status,
    search,
  }: {
    page?: number;
    pageSize?: number;
    startDate?: string;
    endDate?: string;
    status?: string;
    search?: string;
  }) => {
    try {
      const result = await JournalService.getJournalEntries({
        page,
        pageSize,
        startDate,
        endDate,
        status,
        search,
      });

      return {
        success: true,
        data: {
          items: SuperJSON.serialize(result.items),
          pagination: result.pagination,
        },
      };
    } catch (error) {
      console.error("Failed to fetch journal entries:", error);
      return { success: false, error: "Failed to fetch journal entries" };
    }
  }
);

/**
 * Fetch a single journal entry by ID.
 * Permission: "journal_entries.view"
 */
export const getJournalEntry = authorizedAction(
  "journal_entries.view",
  async (id: string) => {
    try {
      const entry = await JournalService.getJournalEntry(id);
      if (!entry) return { success: false, error: "Journal entry not found" };

      return { success: true, data: SuperJSON.serialize(entry) };
    } catch (error) {
      console.error("Failed to fetch journal entry:", error);
      return { success: false, error: "Failed to fetch journal entry" };
    }
  }
);

/**
 * Create a new journal entry.
 * Permission: "journal_entries.create"
 */
export const createJournalEntry = authorizedAction(
  "journal_entries.create",
  async (rawData: SuperJSONResult) => {
    try {
      const data2 = SuperJSON.deserialize(
        rawData as unknown as unknown as SuperJSONResult
      );

      const parseResult = createJournalEntrySchema.safeParse(data2);
      if (!parseResult.success) {
        return { success: false, error: parseResult.error.message };
      }
      const data = parseResult.data;

      const session = await getSession();
      if (!session?.userId) {
        return { success: false, error: "User not authenticated" };
      }

      const entry = await JournalService.createJournalEntry(data, session.userId);

      revalidatePath("/accounting/journal-entries");
      return { success: true, data: SuperJSON.serialize(entry) };
    } catch (error: any) {
      console.error("Failed to create journal entry:", error);
      return {
        success: false,
        error: error.message || "Failed to create journal entry"
      };
    }
  }
);

export async function updateJournalEntry(
  id: string,
  data: CreateJournalEntryData | SuperJSONResult
) {
  try {
    const data2 = SuperJSON.deserialize(
      data as unknown as SuperJSONResult
    );

    const parseResult = createJournalEntrySchema.safeParse(data2);
    if (!parseResult.success) {
      return { success: false, error: parseResult.error.message };
    }
    const validatedData = parseResult.data;

    await JournalService.updateJournalEntry(id, validatedData);

    revalidatePath("/accounting/journal-entries");
    revalidatePath(`/accounting/journal-entries/${id}`);
    return { success: true };
  } catch (error: any) {
    console.error("Failed to update journal entry:", error);
    return {
      success: false,
      error: error.message || "Failed to update journal entry"
    };
  }
}

/**
 * Delete a journal entry.
 * Permission: "journal_entries.delete"
 */
export async function deleteJournalEntry(id: string) {
  try {
    await JournalService.deleteJournalEntry(id);

    revalidatePath("/accounting/journal-entries");
    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete journal entry:", error);
    return {
      success: false,
      error: error.message || "Failed to delete journal entry"
    };
  }
}

export async function postJournalEntry(id: string) {
  try {
    await JournalService.postJournalEntry(id);

    revalidatePath("/accounting/journal-entries");
    revalidatePath(`/accounting/journal-entries/${id}`);

    return { success: true };
  } catch (error: any) {
    console.error("Failed to post journal entry:", error);
    return {
      success: false,
      error: error.message || "Failed to post journal entry",
    };
  }
}

export async function getDepartments() {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { name: "asc" },
    });
    return departments;
  } catch (error) {
    console.error("Failed to fetch departments:", error);
    return [];
  }
}

export async function getProjects() {
  try {
    const projects = await prisma.project.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
    });
    return projects;
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return [];
  }
}
