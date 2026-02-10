import { GeminiAdapter } from "./gemini";
import { AnthropicAdapter } from "./anthropic";
import { OpenAIAdapter } from "./openai";

export interface ModelConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
}

export interface ModelResponse {
  raw_response: string;
  latency_ms: number;
  model: string;
  tokens_used?: number;
  finish_reason?: string;
}

export interface ModelAdapter {
  name: string;
  displayName: string;
  callModel(prompt: string, config: ModelConfig): Promise<ModelResponse>;
}

const ADAPTER_ALIASES: Record<string, () => ModelAdapter> = {
  "gemini-2.5-pro": () => new GeminiAdapter("gemini-2.5-pro", "Gemini 2.5 Pro", "gemini-2.5-pro"),
  "gemini-2.5-flash": () => new GeminiAdapter("gemini-2.5-flash", "Gemini 2.5 Flash", "gemini-2.5-flash"),
  "gemini-2.5-flash-lite-preview-09-2025": () => new GeminiAdapter(),
  "gemini-3-flash-preview": () => new GeminiAdapter("gemini-3-flash-preview", "Gemini 3 Flash", "gemini-3-flash-preview"),
  "gemini-3-pro-preview": () => new GeminiAdapter("gemini-3-pro-preview", "Gemini 3 Pro", "gemini-3-pro-preview"),
  "claude-sonnet-4-5-20250929": () => new AnthropicAdapter(),
  "gpt-4o": () => new OpenAIAdapter(),
};

export function getModel(name: string): ModelAdapter {
  const factory = ADAPTER_ALIASES[name.toLowerCase()];
  if (!factory) {
    const available = Object.keys(ADAPTER_ALIASES).join(", ");
    throw new Error(
      `Unknown model adapter: "${name}". Available: ${available}`
    );
  }
  return factory();
}

export { GeminiAdapter, AnthropicAdapter, OpenAIAdapter };
