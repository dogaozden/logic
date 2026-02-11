import OpenAI from "openai";
import type { ModelAdapter, ModelConfig, ModelResponse } from "./index";

const DEFAULT_MODEL = "gpt-4o";
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

export class OpenAIAdapter implements ModelAdapter {
  name = "gpt-4o";
  displayName = "GPT-4o";

  async callModel(prompt: string, config: ModelConfig): Promise<ModelResponse> {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY not set. Provide it via env var or config.apiKey."
      );
    }

    const modelName = config.model || DEFAULT_MODEL;
    const client = new OpenAI({ apiKey });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const start = performance.now();
        const completion = await client.chat.completions.create({
          model: modelName,
          temperature: config.temperature ?? 0.2,
          max_tokens: config.maxTokens ?? 4096,
          messages: [{ role: "user", content: prompt }],
        });
        const latency_ms = Math.round(performance.now() - start);

        const raw_response =
          completion.choices[0]?.message?.content ?? "";

        const tokens_used = completion.usage
          ? (completion.usage.prompt_tokens ?? 0) +
            (completion.usage.completion_tokens ?? 0)
          : undefined;

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
          message.includes("quota");

        const isTransient =
          message.includes("fetch failed") ||
          message.includes("econnreset") ||
          message.includes("etimedout") ||
          message.includes("enotfound") ||
          message.includes("socket hang up") ||
          message.includes("network") ||
          message.includes("503") ||
          message.includes("502");

        // Rate limit errors: throw immediately, let the harness handle retries
        if (isRateLimit) {
          throw lastError;
        }

        if (!isTransient) {
          throw lastError;
        }

        if (attempt < MAX_RETRIES - 1) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          const jitter = Math.random() * delay * 0.1;
          console.warn(
            `[openai] Transient error: ${lastError.message} — retrying in ${Math.round(delay + jitter)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
          );
          await sleep(delay + jitter);
        }
      }
    }

    throw lastError ?? new Error("OpenAI API call failed after retries");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
