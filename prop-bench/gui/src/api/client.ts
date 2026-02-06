// PropBench GUI — API client
// Typed wrapper around the backend API endpoints.

import type { Theorem, ProofLine, DifficultySpec } from "../types";

const BASE = "/api";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Types used by the API client
// ---------------------------------------------------------------------------

export interface GenerateOpts {
  count: number;
  name: string;
  distribution?: string;   // legacy distribution mode
  tier?: string;            // tier preset mode
  spec?: DifficultySpec;    // custom spec mode
}

export interface GenerateResult {
  success: boolean;
  path: string;
  theorems: Theorem[];
}

export interface TheoremSetInfo {
  name: string;
  path: string;
  count: number;
}

export interface ValidateResult {
  valid: boolean;
  line_count: number;
  errors: string[];
}

export interface StartBenchmarkOpts {
  theoremSet: string;
  models: string[];
  temperature: number;
  maxTokens: number;
  workers?: number;
  start?: number;
  count?: number;
}

export interface RunInfo {
  runId: string;
  timestamp: string | null;
  models: string[];
  stats: {
    total_run: number;
    total_valid: number;
    total_invalid: number;
    total_errors: number;
  };
}

export interface RunDetail {
  summary: Record<string, unknown>;
  results: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export const api = {
  /** Generate a new theorem set */
  generate(opts: GenerateOpts): Promise<GenerateResult> {
    return json<GenerateResult>("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
  },

  /** List all available theorem sets */
  getTheoremSets(): Promise<TheoremSetInfo[]> {
    return json<TheoremSetInfo[]>("/theorem-sets");
  },

  /** Get all theorems in a theorem set */
  getTheorems(name: string): Promise<Theorem[]> {
    return json<Theorem[]>(`/theorem-sets/${encodeURIComponent(name)}`);
  },

  /** Validate a proof against a theorem */
  validate(theorem: Theorem, proof: ProofLine[]): Promise<ValidateResult> {
    return json<ValidateResult>("/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theorem, proof }),
    });
  },

  /** Start a benchmark run, returns a runId */
  startBenchmark(opts: StartBenchmarkOpts): Promise<{ runId: string }> {
    return json<{ runId: string }>("/benchmark/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
  },

  /** Get an SSE EventSource for live benchmark progress */
  getBenchmarkStatus(runId: string): EventSource {
    return new EventSource(`${BASE}/benchmark/status/${encodeURIComponent(runId)}`);
  },

  /** Stop a running benchmark */
  async stopBenchmark(runId: string): Promise<void> {
    await json<{ success: boolean }>(`/benchmark/stop/${encodeURIComponent(runId)}`, {
      method: "POST",
    });
  },

  /** List all past benchmark runs */
  getRuns(): Promise<RunInfo[]> {
    return json<RunInfo[]>("/runs");
  },

  /** Get full details for a specific run */
  getRun(runId: string): Promise<RunDetail> {
    return json<RunDetail>(`/runs/${encodeURIComponent(runId)}`);
  },

  /** Delete a benchmark run's results */
  async deleteRun(runId: string): Promise<void> {
    await json<{ success: boolean }>(`/runs/${encodeURIComponent(runId)}`, {
      method: "DELETE",
    });
  },
};
