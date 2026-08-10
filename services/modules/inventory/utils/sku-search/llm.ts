import { getAIConfig } from "@/services/lib/ai/config";
import { OpenAIProvider } from "@/services/lib/ai/providers/openai";
import { OpenRouterProvider } from "@/services/lib/ai/providers/openrouter";

export async function callLLM(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const config = await getAIConfig();
  if (!config.apiKey) throw new Error("No API key configured");

  let provider;
  if (config.provider === "openrouter") {
    provider = new OpenRouterProvider(config.apiKey);
  } else if (config.provider === "custom" && config.customEndpoint) {
    provider = new OpenAIProvider(config.apiKey, config.customEndpoint);
  } else {
    provider = new OpenAIProvider(config.apiKey);
  }

  const response = await provider.chatCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    config: {
      model: config.model,
      temperature: 0.1,
      maxTokens: 4000,
    },
  });

  if (!response.content) throw new Error("Empty LLM response");
  return response.content;
}

export function parseJSON<T>(text: string): T | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try extracting a JSON array from surrounding text
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // Try recovering a truncated array by closing at last complete object
        const lastBrace = match[0].lastIndexOf("}");
        if (lastBrace !== -1) {
          try {
            return JSON.parse(match[0].substring(0, lastBrace + 1) + "]");
          } catch {
            // All attempts failed
          }
        }
      }
    }
    return null;
  }
}
