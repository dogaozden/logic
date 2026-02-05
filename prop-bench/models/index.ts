import { GeminiAdapter } from "./gemini.js";
import { AnthropicAdapter } from "./anthropic.js";
import { OpenAIAdapter } from "./openai.js";

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
}

export interface ModelAdapter {
  name: string;
  callModel(prompt: string, config: ModelConfig): Promise<ModelResponse>;
}

const ADAPTER_ALIASES: Record<string, () => ModelAdapter> = {
  gemini: () => new GeminiAdapter(),
  "gemini-flash": () => new GeminiAdapter(),
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
