"use server";

import { prisma } from "@/services/lib/prisma";
import { revalidatePath } from "next/cache";
import { authorizedAction } from "@/services/lib/permissions/protected-action";
import { z } from "zod";

const aiSettingsSchema = z.object({
  provider: z.enum(["openai", "anthropic", "google", "openrouter", "custom"]),
  customEndpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().min(100).max(32000),
  isActive: z.boolean(),
});

export type AISettingsInput = z.infer<typeof aiSettingsSchema>;

export async function getAISettings() {
  const settings = await prisma.aISettings.findFirst({
    orderBy: { createdAt: 'desc' },
  });
  
  // Ensure the data is JSON serializable
  if (settings) {
    return {
      ...settings,
      createdAt: settings.createdAt?.toISOString(),
      updatedAt: settings.updatedAt?.toISOString(),
    };
  }
  
  return settings;
}

export const saveAISettings = authorizedAction(
  "company.settings",
  async (data: AISettingsInput) => {
    // Validate data manually since authorizedAction only checks permission
    const validation = aiSettingsSchema.safeParse(data);
    if (!validation.success) {
      return { success: false, error: "Invalid data" };
    }

    const validData = validation.data;

    // Check if settings exist
    const existing = await prisma.aISettings.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      await prisma.aISettings.update({
        where: { id: existing.id },
        data: validData,
      });
    } else {
      await prisma.aISettings.create({
        data: validData,
      });
    }

    revalidatePath("/admin/settings/ai");
    return { success: true };
  }
);
