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
  gemini: () => new GeminiAdapter(),
  "gemini-flash": () => new GeminiAdapter(),
  "gemini-3-flash": () => new GeminiAdapter("gemini-3-flash", "Gemini 3 Flash", "gemini-3-flash-preview"),
  "gemini-3-pro": () => new GeminiAdapter("gemini-3-pro", "Gemini 3 Pro", "gemini-3-pro-preview"),
  claude: () => new AnthropicAdapter(),
  anthropic: () => new AnthropicAdapter(),
  gpt: () => new OpenAIAdapter(),
  openai: () => new OpenAIAdapter(),
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
