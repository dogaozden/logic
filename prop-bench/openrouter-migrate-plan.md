# OpenRouter Migration Plan

Migrate PropBench from 3 separate model adapters (Gemini, Anthropic, OpenAI) to a single OpenRouter-based adapter, enabling benchmarking across hundreds of models with one API key.

---

## Why

Currently, adding a new model provider requires writing a new ~90-line adapter file with duplicated retry logic, error classification, and response packaging. We support 7 models across 3 providers. This won't scale to hundreds of models.

OpenRouter provides a single OpenAI-compatible API endpoint that routes to 200+ models from every major provider. One API key, one adapter, unlimited models.

---

## What Changes

### 1. New unified adapter: `models/openrouter.ts`

Replace all 3 adapters with a single one that uses the existing `openai` npm package pointed at OpenRouter:

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});
```

The `openai` SDK already supports custom base URLs, so this requires zero new dependencies.

**Adapter behavior:**
- Constructor takes `name` (OpenRouter model ID) and `displayName`
- `callModel()` uses `client.chat.completions.create()` — identical to current `openai.ts`
- Retry logic: keep the same pattern (5 retries for transient errors, throw immediately on rate limits for harness to handle)
- Response packaging: same `ModelResponse` interface, extract `raw_response`, `latency_ms`, `tokens_used`, `finish_reason`

**OpenRouter model ID format:** `provider/model-name` — e.g.:
- `anthropic/claude-sonnet-4-5` (Claude Sonnet 4.5)
- `google/gemini-2.5-flash` (Gemini 2.5 Flash)
- `openai/gpt-4o` (GPT-4o)
- `meta-llama/llama-4-maverick` (Llama 4 Maverick)
- `mistralai/mistral-large-2` (Mistral Large)
- `deepseek/deepseek-r1` (DeepSeek R1)

Full catalog: https://openrouter.ai/models

### 2. Update `models/index.ts`

**Remove:**
- `GeminiAdapter`, `AnthropicAdapter`, `OpenAIAdapter` imports
- `ADAPTER_ALIASES` hardcoded map

**New behavior:**
- `getModel(name)` creates an `OpenRouterAdapter` for ANY model string
- No more "Unknown model adapter" errors — any string is treated as an OpenRouter model ID
- Optional: maintain a small `DISPLAY_NAMES` map for common models (for dashboard readability), but don't gate on it

```typescript
export function getModel(name: string): ModelAdapter {
  const displayName = DISPLAY_NAMES[name] ?? name;
  return new OpenRouterAdapter(name, displayName);
}
```

### 3. Delete old adapter files

- Delete `models/gemini.ts`
- Delete `models/anthropic.ts`
- Delete `models/openai.ts`

### 4. Update environment config

**`.env` changes:**
```bash
# Before (3 keys):
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...

# After (1 key):
OPENROUTER_API_KEY=...
```

**Files to update:**
- `harness.ts` — no changes needed (doesn't reference env vars directly, adapters handle it)
- `gui/server/cli.ts` — update env var injection to pass `OPENROUTER_API_KEY` instead of 3 separate keys
- `gui/server/index.ts` — no changes (dotenv loads all vars)

### 5. Update `gui/src/components/RunConfig.tsx`

**Replace hardcoded `MODEL_OPTIONS` with a free-text input + preset dropdown.**

Before:
```typescript
const MODEL_OPTIONS = [
  { key: "gemini-2.5-pro", label: "Gemini 2.5 Pro", envVar: "GEMINI_API_KEY" },
  // ... 7 hardcoded options
];
```

After:
- **Preset dropdown** with commonly-used models (top ~15-20) for quick selection
- **Free-text input** where users can type any OpenRouter model ID
- **Multi-select** preserved — users can still run multiple models in one benchmark
- Remove `envVar` field from model options (only one key now)
- Consider: "Browse Models" link to https://openrouter.ai/models

Suggested preset list (update as needed):
```typescript
const MODEL_PRESETS = [
  { id: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "anthropic/claude-haiku-3-5", label: "Claude Haiku 3.5" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "openai/o3-mini", label: "o3-mini" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
  { id: "meta-llama/llama-4-scout", label: "Llama 4 Scout" },
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek V3" },
  { id: "mistralai/mistral-large-2", label: "Mistral Large 2" },
  { id: "qwen/qwen-2.5-72b-instruct", label: "Qwen 2.5 72B" },
];
```

### 6. Update `gui/server/cli.ts` — `spawnHarness()`

- Model names passed as-is (OpenRouter IDs go straight through CLI → harness → adapter)
- Env injection: pass `OPENROUTER_API_KEY` instead of 3 separate keys
- No other changes needed — the harness spawning logic is model-agnostic

### 7. Update `gui/server/routes/benchmark.ts`

- No changes needed — model names are passed through opaquely
- Progress parsing (`parseHarnessLine`) is model-name-agnostic

### 8. Update `COMMANDS.md`

- Replace "Model Identifiers" table with OpenRouter model ID format
- Replace "Environment Variables" section (one key instead of three)
- Add examples with OpenRouter model IDs
- Add link to OpenRouter model catalog

### 9. Update `DOCUMENTATION.md` (in logic-proof-trainer/)

- Update PropBench section: model adapters → single OpenRouter adapter
- Update environment variables section
- Update model list

### 10. Handle `package.json` dependencies

**Remove:**
- `@anthropic-ai/sdk` (no longer needed)
- `@google/genai` (no longer needed)

**Keep:**
- `openai` (used for OpenRouter via custom baseURL)

**No new dependencies required.**

---

## Migration Path for Existing Data

- Existing DB results reference old model slugs like `gemini-2.5-flash-lite-preview-09-2025` and `claude-sonnet-4-5-20250929`
- New results will use OpenRouter IDs like `google/gemini-2.5-flash-lite` and `anthropic/claude-sonnet-4-5`
- **No data migration needed** — old results keep their original model slugs, new results use new format
- Dashboard already handles arbitrary model name strings — no changes needed for display
- The scorer and Elo system treat each unique model string as a distinct model, which is correct

---

## Execution Order

1. Create `models/openrouter.ts` with the unified adapter
2. Update `models/index.ts` to use it
3. Test CLI: `npx ts-node harness.ts --theorems benchmarks/v8/theorems.json --models anthropic/claude-sonnet-4-5`
4. Delete old adapter files (`gemini.ts`, `anthropic.ts`, `openai.ts`)
5. Update `.env` (replace 3 keys with `OPENROUTER_API_KEY`)
6. Update `gui/server/cli.ts` env injection
7. Update `gui/src/components/RunConfig.tsx` model selection UI
8. Remove unused npm deps (`@anthropic-ai/sdk`, `@google/genai`)
9. Update `COMMANDS.md` and `DOCUMENTATION.md`
10. Test full pipeline: GUI start → SSE progress → results in DB → dashboard display

---

## Risks & Considerations

**OpenRouter token markup:** OpenRouter charges a small fee on top of provider costs. For a benchmark running hundreds of models, this is worth it for the coverage. If cost is a concern for high-volume runs on a specific model, we could add a "direct mode" flag later that uses provider APIs directly for that model.

**Rate limits:** OpenRouter has its own rate limits on top of provider limits. The existing retry logic (adapter: 5x transient, harness: 10x API errors) should handle this. May need to tune `--workers` down for some models.

**Model availability:** Not every model on OpenRouter supports all parameters (e.g., some don't support `temperature`). The adapter should gracefully handle these — OpenRouter returns clear error messages for unsupported params.

**Response format consistency:** Different models behind OpenRouter may format responses differently (e.g., some use `<think>` tags, some add preambles). The parser already handles significant variation (40+ rule aliases, multiple formats) so this should be fine. May need parser updates for edge cases from new model families.

**Latency:** OpenRouter adds a small routing overhead (~50-100ms). For benchmarking where we're measuring proof quality (not raw latency), this is acceptable. If we ever need accurate latency comparisons, we'd note the overhead in results.
