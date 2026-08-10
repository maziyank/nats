import {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
  AITool,
} from "./types";
import { OpenAIProvider } from "./providers/openai";
import { OpenRouterProvider } from "./providers/openrouter";
import { createBusinessAgent, convertToLangChainMessages } from "./agent";
import type { AIUserContext } from "./context";

function extractMessageContent(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          if ("text" in part && typeof (part as any).text === "string") {
            return (part as any).text;
          }
          if ("content" in part && typeof (part as any).content === "string") {
            return (part as any).content;
          }
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof content === "object") {
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }
  return String(content);
}

export class AIService {
  private provider: AIProvider;
  private tools: Map<string, AITool> = new Map();

  constructor(
    apiKey: string,
    providerType:
      | "openai"
      | "anthropic"
      | "google"
      | "openrouter"
      | "custom" = "openai",
    customEndpoint?: string,
  ) {
    switch (providerType) {
      case "openrouter":
        this.provider = new OpenRouterProvider(apiKey);
        break;
      case "custom":
        this.provider = new OpenAIProvider(apiKey, customEndpoint);
        break;
      case "openai":
      default:
        this.provider = new OpenAIProvider(apiKey);
        break;
    }
  }

  registerTool(tool: AITool) {
    this.tools.set(tool.name, tool);
  }

  async generateResponse(
    request: AICompletionRequest,
    userContext?: AIUserContext,
  ): Promise<AICompletionResponse> {
    try {
      if (!userContext) {
        // Fallback provider path when no session context is available
        return this.provider.chatCompletion({
          ...request,
          tools: Array.from(this.tools.values()),
        });
      }

      const agent = await createBusinessAgent(userContext);
      const langChainMessages = convertToLangChainMessages(request.messages);

      const result = await agent.invoke({
        messages: langChainMessages,
      });

      const lastMessage = result.messages[result.messages.length - 1];
      return {
        content: extractMessageContent(lastMessage?.content),
      };
    } catch (error) {
      console.error("LangChain agent error:", error);
      return this.provider.chatCompletion({
        ...request,
        tools: Array.from(this.tools.values()),
      });
    }
  }

  async streamResponse(
    request: AICompletionRequest,
  ): Promise<ReadableStream<Uint8Array>> {
    let activeProvider = this.provider;
    if (request.config?.provider && request.config.provider !== "openai") {
      if (request.config.provider === "openrouter") {
        activeProvider = new OpenRouterProvider(request.config.apiKey || "");
      } else if (request.config.provider === "custom") {
        activeProvider = new OpenAIProvider(
          request.config.apiKey || "",
          request.config.customEndpoint,
        );
      }
    }

    return activeProvider.streamChatCompletion({
      ...request,
      tools: Array.from(this.tools.values()),
    });
  }
}

// Singleton instance management
let instance: AIService | null = null;

export function getAIService(
  apiKey?: string,
  provider?: "openai" | "anthropic" | "google" | "openrouter" | "custom",
  customEndpoint?: string,
): AIService {
  const key = apiKey || process.env.OPENAI_API_KEY || "mock-key";
  if (apiKey || provider) {
    return new AIService(key, provider, customEndpoint);
  }

  if (!instance) {
    instance = new AIService(key);
  }
  return instance;
}
