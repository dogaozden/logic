import { GoogleGenAI } from "@google/genai";
import type { ModelAdapter, ModelConfig, ModelResponse } from "./index";

const DEFAULT_MODEL = "gemini-2.5-flash-lite-preview-09-2025";
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

export class GeminiAdapter implements ModelAdapter {
  name: string;
  displayName: string;
  private defaultModel: string;

  constructor(name = "gemini", displayName = "Gemini 2.5 Flash Lite", defaultModel = DEFAULT_MODEL) {
    this.name = name;
    this.displayName = displayName;
    this.defaultModel = defaultModel;
  }

  async callModel(prompt: string, config: ModelConfig): Promise<ModelResponse> {
    const apiKey = config.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY not set. Provide it via env var or config.apiKey."
      );
    }

    const modelName = config.model || this.defaultModel;
    const client = new GoogleGenAI({ apiKey });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const start = performance.now();
        const response = await client.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            temperature: config.temperature ?? 0.2,
            maxOutputTokens: config.maxTokens ?? 4096,
          },
        });
        const latency_ms = Math.round(performance.now() - start);

        const finishReason = response.candidates?.[0]?.finishReason;

        // Extract text from response
        let text = response.text ?? "";
        if (!text && response.candidates) {
          for (const candidate of response.candidates) {
            for (const part of candidate.content?.parts ?? []) {
              if (part.text) {
                text += part.text;
              }
            }
          }
        }

        const usage = response.usageMetadata;

        return {
          raw_response: text,
          latency_ms,
          model: modelName,
          tokens_used: usage
            ? (usage.promptTokenCount ?? 0) +
              (usage.candidatesTokenCount ?? 0)
            : undefined,
          finish_reason: finishReason ?? undefined,
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const message = lastError.message.toLowerCase();

        const isRateLimit =
          message.includes("429") ||
          message.includes("rate") ||
          message.includes("quota") ||
          message.includes("resource_exhausted");

        if (!isRateLimit && attempt === 0) {
          throw lastError;
        }

        if (isRateLimit && attempt < MAX_RETRIES - 1) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          const jitter = Math.random() * delay * 0.1;
          console.warn(
            `[gemini] Rate limited, retrying in ${Math.round(delay + jitter)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
          );
          await sleep(delay + jitter);
        } else if (!isRateLimit) {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error("Gemini API call failed after retries");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
