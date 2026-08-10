import { z } from "zod";

export type AIModel = "gpt-4o" | "gpt-4o-mini" | "claude-3-5-sonnet-20240620" | "gemini-1.5-pro";

export interface AIConfig {
    provider: "openai" | "anthropic" | "google" | "openrouter" | "custom";
    customEndpoint?: string;
    apiKey: string;
    model: AIModel | string;
    temperature?: number;
    maxTokens?: number;
}

export interface AIChatMessage {
    role: "system" | "user" | "assistant" | "function";
    content: string;
    name?: string;
    function_call?: {
        name: string;
        arguments: string;
    };
}

export interface AICompletionRequest {
    messages: AIChatMessage[];
    config?: Partial<AIConfig>;
    tools?: AITool[];
}

export interface AICompletionResponse {
    content: string | null;
    functionCall?: {
        name: string;
        arguments: string;
    };
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface AITool {
    name: string;
    description: string;
    parameters: Record<string, any>; // JSON Schema
    handler: (args: any) => Promise<any>;
}

export interface AIProvider {
    chatCompletion(request: AICompletionRequest): Promise<AICompletionResponse>;
    streamChatCompletion(request: AICompletionRequest): Promise<ReadableStream<Uint8Array>>;
}
