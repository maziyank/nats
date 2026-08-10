import { AIConfig, AIModel } from "./types";
import { prisma } from "@/services/lib/prisma";

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY || "",
  model: "gpt-4o-mini",
  temperature: 0.7,
  maxTokens: 1000,
};

export async function getAIConfig(userId?: string): Promise<AIConfig> {
  try {
    // Fetch global AI settings
    // We use findFirst to get the single configuration record
    // In a real multi-tenant app, we might filter by tenantId or userId
    const settings = await prisma.aISettings.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (settings && settings.isActive) {
      return {
        provider: settings.provider as "openai" | "anthropic" | "google" | "openrouter" | "custom",
        customEndpoint: settings.customEndpoint || undefined,
        apiKey: settings.apiKey || process.env.OPENAI_API_KEY || "",
        model: settings.model as AIModel,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
      };
    }
  } catch (error) {
    console.error("Failed to fetch AI config from DB:", error);
    // Fallback to default
  }

  return DEFAULT_AI_CONFIG;
}
