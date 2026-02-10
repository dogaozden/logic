import Anthropic from "@anthropic-ai/sdk";
import type { ModelAdapter, ModelConfig, ModelResponse } from "./index";

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

export class AnthropicAdapter implements ModelAdapter {
  name = "claude-sonnet-4-5-20250929";
  displayName = "Claude Sonnet 4.5";

  async callModel(prompt: string, config: ModelConfig): Promise<ModelResponse> {
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY not set. Provide it via env var or config.apiKey."
      );
    }

    const modelName = config.model || DEFAULT_MODEL;
    const client = new Anthropic({ apiKey });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const start = performance.now();
        const message = await client.messages.create({
          model: modelName,
          max_tokens: config.maxTokens ?? 4096,
          temperature: config.temperature ?? 0.2,
          messages: [{ role: "user", content: prompt }],
        });
        const latency_ms = Math.round(performance.now() - start);

        const textBlock = message.content.find((b) => b.type === "text");
        const raw_response = textBlock ? textBlock.text : "";

        const tokens_used =
          (message.usage.input_tokens ?? 0) +
          (message.usage.output_tokens ?? 0);

        return {
          raw_response,
          latency_ms,
          model: modelName,
          tokens_used,
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const message = lastError.message.toLowerCase();

        const isRateLimit =
          message.includes("429") ||
          message.includes("rate") ||
          message.includes("overloaded");

        if (!isRateLimit && attempt === 0) {
          throw lastError;
        }

        if (isRateLimit && attempt < MAX_RETRIES - 1) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          const jitter = Math.random() * delay * 0.1;
          console.warn(
            `[anthropic] Rate limited, retrying in ${Math.round(delay + jitter)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
          );
          await sleep(delay + jitter);
        } else if (!isRateLimit) {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error("Anthropic API call failed after retries");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
