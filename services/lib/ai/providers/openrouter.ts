import {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from "../types";
import {
  normalizeChatCompletionsUrl,
  parseJsonResponse,
} from "./parse-response";

export class OpenRouterProvider implements AIProvider {
  private apiKey: string;
  private baseUrl = "https://openrouter.ai/api/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chatCompletion(
    request: AICompletionRequest,
  ): Promise<AICompletionResponse> {
    const config = request.config;
    const model = config?.model || "openai/gpt-3.5-turbo";
    const temperature = config?.temperature ?? 0.7;
    const apiKey = config?.apiKey || this.apiKey;
    const url = normalizeChatCompletionsUrl(this.baseUrl);

    const tools = request.tools?.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    const body: any = {
      model,
      messages: request.messages.map((msg) => {
        if (msg.role === "function") {
          return {
            role: "tool",
            tool_call_id: msg.name,
            content: msg.content,
          };
        }
        return {
          role: msg.role,
          content: msg.content,
        };
      }),
      temperature,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://nats.app",
          "X-Title": "NATS ERP",
        },
        body: JSON.stringify(body),
      });

      const data = await parseJsonResponse<any>(response, "OpenRouter");

      if (!response.ok) {
        throw new Error(
          `OpenRouter API Error: ${data?.error?.message || response.statusText}`,
        );
      }

      const choice = data?.choices?.[0];
      const message = choice?.message;
      if (!message) {
        throw new Error(
          "OpenRouter API Error: missing choices[0].message in response",
        );
      }

      let functionCall = undefined;
      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        functionCall = {
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        };
      }

      return {
        content: message.content ?? null,
        functionCall,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens ?? 0,
              completionTokens: data.usage.completion_tokens ?? 0,
              totalTokens: data.usage.total_tokens ?? 0,
            }
          : undefined,
      };
    } catch (error) {
      console.error("AI Service Error (OpenRouter):", error);
      throw error;
    }
  }

  async streamChatCompletion(
    request: AICompletionRequest,
  ): Promise<ReadableStream<Uint8Array>> {
    const config = request.config;
    const model = config?.model || "openai/gpt-3.5-turbo";
    const temperature = config?.temperature ?? 0.7;
    const apiKey = config?.apiKey || this.apiKey;
    const url = normalizeChatCompletionsUrl(this.baseUrl);

    const tools = request.tools?.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    const body: any = {
      model,
      messages: request.messages.map((msg) => {
        if (msg.role === "function") {
          return {
            role: "tool",
            tool_call_id: msg.name,
            content: msg.content,
          };
        }
        return {
          role: msg.role,
          content: msg.content,
        };
      }),
      temperature,
      stream: true,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://nats.app",
          "X-Title": "NATS ERP",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await parseJsonResponse<any>(response, "OpenRouter");
        throw new Error(
          `OpenRouter API Error: ${error?.error?.message || response.statusText}`,
        );
      }

      if (!response.body) {
        throw new Error("No response body received from OpenRouter");
      }

      return response.body;
    } catch (error) {
      console.error("AI Service Streaming Error (OpenRouter):", error);
      throw error;
    }
  }
}
