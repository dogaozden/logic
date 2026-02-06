/**
 * PropBench SQLite Database Module
 *
 * Single propbench.db file using better-sqlite3 with WAL mode.
 * CJS module — imported by harness (CJS) directly and by GUI server (ESM) via createRequire.
 */

import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import { Scorer } from "./scorer";
import type { TheoremResult, DifficultyTier, BenchmarkReport } from "./scorer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mirrors harness.ts BenchmarkResult */
export interface BenchmarkResult {
  theorem_id: string;
  model: string;
  model_name: string;
  raw_response: string;
  parsed_proof: { line_number: number; formula: string; justification: string; depth: number }[] | null;
  parse_error: string | null;
  validation_result: "valid" | "invalid" | "error";
  validation_errors: string[];
  line_count: number | null;
  latency_ms: number;
  tokens_used: number | undefined;
  timestamp: string;
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

export interface TheoremRow {
  theorem_id: string;
  premises: string;
  conclusion: string;
  difficulty: string;
  difficulty_value: number;
}

// ---------------------------------------------------------------------------
// Database path & singleton
// ---------------------------------------------------------------------------

export const DB_PATH = path.join(__dirname, "propbench.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
  }
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export function dbExists(): boolean {
  return fs.existsSync(DB_PATH);
}

// ---------------------------------------------------------------------------
// Schema initialization
// ---------------------------------------------------------------------------

export function initSchema(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS theorem_sets (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL UNIQUE,
      theorems_file TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS theorems (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id           INTEGER NOT NULL REFERENCES theorem_sets(id) ON DELETE CASCADE,
      theorem_id       TEXT NOT NULL,
      premises         TEXT NOT NULL DEFAULT '[]',
      conclusion       TEXT NOT NULL,
      difficulty       TEXT NOT NULL,
      difficulty_value INTEGER NOT NULL,
      UNIQUE(set_id, theorem_id)
    );

    CREATE TABLE IF NOT EXISTS results (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id            INTEGER NOT NULL REFERENCES theorem_sets(id) ON DELETE CASCADE,
      theorem_id        TEXT NOT NULL,
      model_slug        TEXT NOT NULL,
      model_display     TEXT NOT NULL,
      raw_response      TEXT NOT NULL DEFAULT '',
      parsed_proof      TEXT,
      parse_error       TEXT,
      validation_result TEXT NOT NULL CHECK(validation_result IN ('valid','invalid','error')),
      validation_errors TEXT NOT NULL DEFAULT '[]',
      line_count        INTEGER,
      latency_ms        INTEGER NOT NULL DEFAULT 0,
      tokens_used       INTEGER,
      timestamp         TEXT NOT NULL,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (set_id, theorem_id) REFERENCES theorems(set_id, theorem_id)
    );

    CREATE INDEX IF NOT EXISTS idx_results_set_model   ON results(set_id, model_slug);
    CREATE INDEX IF NOT EXISTS idx_results_set_theorem  ON results(set_id, theorem_id);

    CREATE TABLE IF NOT EXISTS reports_cache (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id     INTEGER NOT NULL REFERENCES theorem_sets(id) ON DELETE CASCADE,
      scope      TEXT NOT NULL,
      report     TEXT NOT NULL,
      summary    TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(set_id, scope)
    );
  `);
}

// ---------------------------------------------------------------------------
// Theorem sets & theorems
// ---------------------------------------------------------------------------

export function upsertTheoremSet(name: string, theoremsFile?: string): number {
  const db = getDb();

  const insertStmt = db.prepare(`
    INSERT INTO theorem_sets (name, theorems_file)
    VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET theorems_file = COALESCE(excluded.theorems_file, theorems_file)
  `);
  insertStmt.run(name, theoremsFile ?? null);

  const row = db.prepare("SELECT id FROM theorem_sets WHERE name = ?").get(name) as { id: number };
  return row.id;
}

export function upsertTheorem(
  setId: number,
  theorem: {
    id: string;
    premises: string[];
    conclusion: string;
    difficulty: string;
    difficulty_value: number;
  }
): void {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO theorems (set_id, theorem_id, premises, conclusion, difficulty, difficulty_value)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(set_id, theorem_id) DO UPDATE SET
      premises = excluded.premises,
      conclusion = excluded.conclusion,
      difficulty = excluded.difficulty,
      difficulty_value = excluded.difficulty_value
  `);

  stmt.run(
    setId,
    theorem.id,
    JSON.stringify(theorem.premises),
    theorem.conclusion,
    theorem.difficulty,
    theorem.difficulty_value
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export function insertResult(setName: string, result: BenchmarkResult): void {
  const db = getDb();

  const setRow = db.prepare("SELECT id FROM theorem_sets WHERE name = ?").get(setName) as { id: number } | undefined;
  if (!setRow) {
    throw new Error(`Theorem set '${setName}' not found in DB`);
  }

  const stmt = db.prepare(`
    INSERT INTO results (
      set_id, theorem_id, model_slug, model_display,
      raw_response, parsed_proof, parse_error,
      validation_result, validation_errors,
      line_count, latency_ms, tokens_used, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    setRow.id,
    result.theorem_id,
    result.model,
    result.model_name,
    result.raw_response,
    result.parsed_proof ? JSON.stringify(result.parsed_proof) : null,
    result.parse_error,
    result.validation_result,
    JSON.stringify(result.validation_errors),
    result.line_count,
    result.latency_ms,
    result.tokens_used ?? null,
    result.timestamp
  );
}

export function hasResult(setName: string, theoremId: string, modelSlug: string): boolean {
  const db = getDb();

  const row = db.prepare(`
    SELECT 1 FROM results r
    JOIN theorem_sets ts ON ts.id = r.set_id
    WHERE ts.name = ? AND r.theorem_id = ? AND r.model_slug = ?
    LIMIT 1
  `).get(setName, theoremId, modelSlug);

  return row !== undefined;
}

// ---------------------------------------------------------------------------
// Queries (server)
// ---------------------------------------------------------------------------

export function getRunsList(): RunInfo[] {
  const db = getDb();

  // Get per-model runs
  const modelRuns = db.prepare(`
    SELECT
      ts.name AS set_name,
      r.model_slug,
      r.model_display,
      MAX(r.timestamp) AS latest_timestamp,
      COUNT(*) AS total_run,
      SUM(CASE WHEN r.validation_result = 'valid' THEN 1 ELSE 0 END) AS total_valid,
      SUM(CASE WHEN r.validation_result = 'invalid' THEN 1 ELSE 0 END) AS total_invalid,
      SUM(CASE WHEN r.validation_result = 'error' THEN 1 ELSE 0 END) AS total_errors
    FROM results r
    JOIN theorem_sets ts ON ts.id = r.set_id
    GROUP BY ts.name, r.model_slug
    ORDER BY ts.name, r.model_slug
  `).all() as Array<{
    set_name: string;
    model_slug: string;
    model_display: string;
    latest_timestamp: string;
    total_run: number;
    total_valid: number;
    total_invalid: number;
    total_errors: number;
  }>;

  // Get combined set-level runs
  const setRuns = db.prepare(`
    SELECT
      ts.name AS set_name,
      MAX(r.timestamp) AS latest_timestamp,
      COUNT(*) AS total_run,
      SUM(CASE WHEN r.validation_result = 'valid' THEN 1 ELSE 0 END) AS total_valid,
      SUM(CASE WHEN r.validation_result = 'invalid' THEN 1 ELSE 0 END) AS total_invalid,
      SUM(CASE WHEN r.validation_result = 'error' THEN 1 ELSE 0 END) AS total_errors
    FROM results r
    JOIN theorem_sets ts ON ts.id = r.set_id
    GROUP BY ts.name
    HAVING COUNT(DISTINCT r.model_slug) > 0
    ORDER BY ts.name
  `).all() as Array<{
    set_name: string;
    latest_timestamp: string;
    total_run: number;
    total_valid: number;
    total_invalid: number;
    total_errors: number;
  }>;

  // Get models per set for combined runs
  const modelsPerSet = db.prepare(`
    SELECT ts.name AS set_name, r.model_display
    FROM results r
    JOIN theorem_sets ts ON ts.id = r.set_id
    GROUP BY ts.name, r.model_display
    ORDER BY ts.name, r.model_display
  `).all() as Array<{ set_name: string; model_display: string }>;

  const modelsMap = new Map<string, string[]>();
  for (const row of modelsPerSet) {
    if (!modelsMap.has(row.set_name)) modelsMap.set(row.set_name, []);
    modelsMap.get(row.set_name)!.push(row.model_display);
  }

  const runs: RunInfo[] = [];

  // Add per-model runs
  for (const row of modelRuns) {
    runs.push({
      runId: `${row.set_name}/${row.model_slug}`,
      timestamp: row.latest_timestamp,
      models: [row.model_display],
      stats: {
        total_run: row.total_run,
        total_valid: row.total_valid,
        total_invalid: row.total_invalid,
        total_errors: row.total_errors,
      },
    });
  }

  // Add combined set-level runs
  for (const row of setRuns) {
    runs.push({
      runId: row.set_name,
      timestamp: row.latest_timestamp,
      models: modelsMap.get(row.set_name) ?? [],
      stats: {
        total_run: row.total_run,
        total_valid: row.total_valid,
        total_invalid: row.total_invalid,
        total_errors: row.total_errors,
      },
    });
  }

  return runs;
}

export function getRunDetail(runId: string): { summary: unknown; results: unknown[] } {
  const db = getDb();

  // Determine if this is a set-level or model-level run
  const parts = runId.split("/");
  const setName = parts[0];
  const modelSlug = parts.length > 1 ? parts[1] : null;

  const setRow = db.prepare("SELECT id FROM theorem_sets WHERE name = ?").get(setName) as { id: number } | undefined;
  if (!setRow) {
    throw new Error(`Run '${runId}' not found`);
  }

  // Fetch results
  let rawResults: Array<{
    theorem_id: string;
    model_slug: string;
    model_display: string;
    raw_response: string;
    parsed_proof: string | null;
    parse_error: string | null;
    validation_result: string;
    validation_errors: string;
    line_count: number | null;
    latency_ms: number;
    tokens_used: number | null;
    timestamp: string;
  }>;

  if (modelSlug) {
    rawResults = db.prepare(`
      SELECT theorem_id, model_slug, model_display, raw_response, parsed_proof,
             parse_error, validation_result, validation_errors, line_count,
             latency_ms, tokens_used, timestamp
      FROM results
      WHERE set_id = ? AND model_slug = ?
      ORDER BY theorem_id
    `).all(setRow.id, modelSlug) as typeof rawResults;
  } else {
    rawResults = db.prepare(`
      SELECT theorem_id, model_slug, model_display, raw_response, parsed_proof,
             parse_error, validation_result, validation_errors, line_count,
             latency_ms, tokens_used, timestamp
      FROM results
      WHERE set_id = ?
      ORDER BY theorem_id, model_slug
    `).all(setRow.id) as typeof rawResults;
  }

  // Convert to BenchmarkResult shape
  const results = rawResults.map((r) => ({
    theorem_id: r.theorem_id,
    model: r.model_slug,
    model_name: r.model_display,
    raw_response: r.raw_response,
    parsed_proof: r.parsed_proof ? JSON.parse(r.parsed_proof) : null,
    parse_error: r.parse_error,
    validation_result: r.validation_result,
    validation_errors: JSON.parse(r.validation_errors),
    line_count: r.line_count,
    latency_ms: r.latency_ms,
    tokens_used: r.tokens_used ?? undefined,
    timestamp: r.timestamp,
  }));

  // Try cached report first
  const scope = modelSlug ?? "combined";
  const cached = getCachedReport(setRow.id, scope);
  if (cached) {
    return { summary: cached.report, results };
  }

  // Compute report via Scorer
  const summary = computeReport(setRow.id, scope, results);
  return { summary, results };
}

function computeReport(setId: number, scope: string, results: unknown[]): unknown {
  const db = getDb();

  // Load theorems for difficulty info
  const theoremRows = db.prepare(`
    SELECT theorem_id, difficulty, difficulty_value FROM theorems WHERE set_id = ?
  `).all(setId) as Array<{ theorem_id: string; difficulty: string; difficulty_value: number }>;

  const theoremMap = new Map<string, { difficulty: string; difficultyValue: number }>();
  for (const t of theoremRows) {
    theoremMap.set(t.theorem_id, { difficulty: t.difficulty, difficultyValue: t.difficulty_value });
  }

  const scorer = new Scorer();

  for (const raw of results as Array<Record<string, unknown>>) {
    const theoremId = raw.theorem_id as string;
    const modelDisplay = raw.model_name as string;
    const validationResult = raw.validation_result as string;
    const parseError = raw.parse_error as string | null;
    const validationErrors = (raw.validation_errors as string[]) ?? [];
    const lineCount = raw.line_count as number | null;

    const theoremInfo = theoremMap.get(theoremId);
    const difficulty = (theoremInfo?.difficulty?.toLowerCase() ?? "medium") as DifficultyTier;
    const difficultyValue = theoremInfo?.difficultyValue ?? 0;

    const valid = validationResult === "valid";

    let failureStage: "api_call" | "parse" | "validation" | undefined;
    if (!valid) {
      if (parseError !== null) failureStage = "parse";
      else if (validationErrors.some((e) => typeof e === "string" && e.includes("API"))) failureStage = "api_call";
      else failureStage = "validation";
    }

    const theoremResult: TheoremResult = {
      theoremId,
      valid,
      parseSuccess: parseError === null,
      lineCount,
      difficulty,
      difficultyValue,
      ...(failureStage !== undefined ? { failureStage } : {}),
    };

    scorer.recordResult(theoremId, modelDisplay, theoremResult);
  }

  const report = scorer.generateReport();

  // Cache it
  const summaryData = {
    timestamp: new Date().toISOString(),
    models: [...new Set((results as Array<Record<string, unknown>>).map((r) => r.model_name as string))],
    total_run: results.length,
    total_valid: (results as Array<Record<string, unknown>>).filter((r) => r.validation_result === "valid").length,
    total_invalid: (results as Array<Record<string, unknown>>).filter((r) => r.validation_result === "invalid").length,
    total_errors: (results as Array<Record<string, unknown>>).filter((r) => r.validation_result === "error").length,
  };

  try {
    cacheReport(setId, scope, report, summaryData);
  } catch {
    // Cache write failure is non-fatal
  }

  return report;
}

export function deleteRun(runId: string): void {
  const db = getDb();

  const parts = runId.split("/");
  const setName = parts[0];
  const modelSlug = parts.length > 1 ? parts[1] : null;

  const setRow = db.prepare("SELECT id FROM theorem_sets WHERE name = ?").get(setName) as { id: number } | undefined;
  if (!setRow) return;

  if (modelSlug) {
    db.prepare("DELETE FROM results WHERE set_id = ? AND model_slug = ?").run(setRow.id, modelSlug);
  } else {
    db.prepare("DELETE FROM results WHERE set_id = ?").run(setRow.id);
  }

  // Invalidate cache
  invalidateReportCache(setRow.id);
}

// ---------------------------------------------------------------------------
// Report cache
// ---------------------------------------------------------------------------

export function getCachedReport(setId: number, scope: string): { report: unknown; summary: unknown } | null {
  const db = getDb();

  const row = db.prepare(`
    SELECT report, summary FROM reports_cache
    WHERE set_id = ? AND scope = ?
  `).get(setId, scope) as { report: string; summary: string } | undefined;

  if (!row) return null;

  return {
    report: JSON.parse(row.report),
    summary: JSON.parse(row.summary),
  };
}

export function cacheReport(setId: number, scope: string, report: unknown, summary: unknown): void {
  const db = getDb();

  db.prepare(`
    INSERT INTO reports_cache (set_id, scope, report, summary, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(set_id, scope) DO UPDATE SET
      report = excluded.report,
      summary = excluded.summary,
      updated_at = excluded.updated_at
  `).run(setId, scope, JSON.stringify(report), JSON.stringify(summary));
}

export function invalidateReportCache(setId: number): void {
  const db = getDb();
  db.prepare("DELETE FROM reports_cache WHERE set_id = ?").run(setId);
}

// Convenience: invalidate by set name
export function invalidateReportCacheByName(setName: string): void {
  const db = getDb();
  const setRow = db.prepare("SELECT id FROM theorem_sets WHERE name = ?").get(setName) as { id: number } | undefined;
  if (setRow) {
    invalidateReportCache(setRow.id);
  }
}

// ---------------------------------------------------------------------------
// Dashboard stats queries
// ---------------------------------------------------------------------------

export interface DashboardOverview {
  totalSets: number;
  totalTheorems: number;
  totalResults: number;
  totalModels: number;
  modelSummaries: Array<{
    model_slug: string;
    model_display: string;
    total_attempted: number;
    total_valid: number;
    total_invalid: number;
    total_errors: number;
    valid_rate: number;
    avg_latency_ms: number;
    avg_lines: number | null;
    total_tokens: number;
  }>;
  sets: Array<{
    name: string;
    theorem_count: number;
    result_count: number;
    models: string[];
  }>;
}

export function getDashboardOverview(): DashboardOverview {
  const db = getDb();

  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM theorem_sets) AS totalSets,
      (SELECT COUNT(*) FROM theorems) AS totalTheorems,
      (SELECT COUNT(*) FROM results) AS totalResults,
      (SELECT COUNT(DISTINCT model_slug) FROM results) AS totalModels
  `).get() as { totalSets: number; totalTheorems: number; totalResults: number; totalModels: number };

  const modelSummaries = db.prepare(`
    SELECT
      model_slug,
      model_display,
      COUNT(*) AS total_attempted,
      SUM(CASE WHEN validation_result = 'valid' THEN 1 ELSE 0 END) AS total_valid,
      SUM(CASE WHEN validation_result = 'invalid' THEN 1 ELSE 0 END) AS total_invalid,
      SUM(CASE WHEN validation_result = 'error' THEN 1 ELSE 0 END) AS total_errors,
      ROUND(100.0 * SUM(CASE WHEN validation_result = 'valid' THEN 1 ELSE 0 END) / COUNT(*), 2) AS valid_rate,
      ROUND(AVG(latency_ms), 0) AS avg_latency_ms,
      ROUND(AVG(CASE WHEN validation_result = 'valid' THEN line_count ELSE NULL END), 1) AS avg_lines,
      COALESCE(SUM(tokens_used), 0) AS total_tokens
    FROM results
    GROUP BY model_slug
    ORDER BY valid_rate DESC
  `).all() as DashboardOverview["modelSummaries"];

  const setRows = db.prepare(`
    SELECT
      ts.name,
      (SELECT COUNT(*) FROM theorems t WHERE t.set_id = ts.id) AS theorem_count,
      (SELECT COUNT(*) FROM results r WHERE r.set_id = ts.id) AS result_count
    FROM theorem_sets ts
    ORDER BY ts.name
  `).all() as Array<{ name: string; theorem_count: number; result_count: number }>;

  const setModels = db.prepare(`
    SELECT ts.name, r.model_display
    FROM results r
    JOIN theorem_sets ts ON ts.id = r.set_id
    GROUP BY ts.name, r.model_display
    ORDER BY ts.name, r.model_display
  `).all() as Array<{ name: string; model_display: string }>;

  const modelsMap = new Map<string, string[]>();
  for (const row of setModels) {
    if (!modelsMap.has(row.name)) modelsMap.set(row.name, []);
    modelsMap.get(row.name)!.push(row.model_display);
  }

  const sets = setRows.map((s) => ({
    name: s.name,
    theorem_count: s.theorem_count,
    result_count: s.result_count,
    models: modelsMap.get(s.name) ?? [],
  }));

  return { ...totals, modelSummaries, sets };
}

export interface HeadToHeadCell {
  modelA: string;
  modelB: string;
  winsA: number;
  winsB: number;
  ties: number;
  total: number;
}

export function getHeadToHeadMatrix(setName: string): HeadToHeadCell[] {
  const db = getDb();

  const setRow = db.prepare("SELECT id FROM theorem_sets WHERE name = ?").get(setName) as { id: number } | undefined;
  if (!setRow) return [];

  // Get all results for this set, grouped by theorem and model
  const rows = db.prepare(`
    SELECT theorem_id, model_display, validation_result, line_count
    FROM results
    WHERE set_id = ?
    ORDER BY theorem_id, model_display
  `).all(setRow.id) as Array<{
    theorem_id: string;
    model_display: string;
    validation_result: string;
    line_count: number | null;
  }>;

  // Group by theorem
  const byTheorem = new Map<string, Map<string, { valid: boolean; lines: number | null }>>();
  for (const r of rows) {
    if (!byTheorem.has(r.theorem_id)) byTheorem.set(r.theorem_id, new Map());
    byTheorem.get(r.theorem_id)!.set(r.model_display, {
      valid: r.validation_result === "valid",
      lines: r.line_count,
    });
  }

  // Collect all models
  const allModels = [...new Set(rows.map((r) => r.model_display))].sort();

  // Compare each pair
  const cells: HeadToHeadCell[] = [];
  for (let i = 0; i < allModels.length; i++) {
    for (let j = i + 1; j < allModels.length; j++) {
      const modelA = allModels[i];
      const modelB = allModels[j];
      let winsA = 0, winsB = 0, ties = 0, total = 0;

      for (const [, modelResults] of byTheorem) {
        const a = modelResults.get(modelA);
        const b = modelResults.get(modelB);
        if (!a || !b) continue; // both must have attempted this theorem
        total++;

        if (a.valid && !b.valid) { winsA++; }
        else if (!a.valid && b.valid) { winsB++; }
        else if (a.valid && b.valid) {
          // Both valid: fewer lines wins
          if (a.lines !== null && b.lines !== null) {
            if (a.lines < b.lines) winsA++;
            else if (b.lines < a.lines) winsB++;
            else ties++;
          } else {
            ties++;
          }
        } else {
          // Both invalid
          ties++;
        }
      }

      cells.push({ modelA, modelB, winsA, winsB, ties, total });
    }
  }

  return cells;
}

export interface LatencyStats {
  model_slug: string;
  model_display: string;
  avg_ms: number;
  min_ms: number;
  max_ms: number;
  p50_ms: number;
  total_tokens: number;
  avg_tokens: number;
}

export function getLatencyStats(setName?: string): LatencyStats[] {
  const db = getDb();

  let setFilter = "";
  const params: unknown[] = [];

  if (setName) {
    const setRow = db.prepare("SELECT id FROM theorem_sets WHERE name = ?").get(setName) as { id: number } | undefined;
    if (!setRow) return [];
    setFilter = "WHERE r.set_id = ?";
    params.push(setRow.id);
  }

  const aggRows = db.prepare(`
    SELECT
      r.model_slug,
      r.model_display,
      ROUND(AVG(r.latency_ms), 0) AS avg_ms,
      MIN(r.latency_ms) AS min_ms,
      MAX(r.latency_ms) AS max_ms,
      COALESCE(SUM(r.tokens_used), 0) AS total_tokens,
      ROUND(COALESCE(AVG(r.tokens_used), 0), 0) AS avg_tokens,
      COUNT(*) AS cnt
    FROM results r
    ${setFilter}
    GROUP BY r.model_slug
    ORDER BY avg_ms ASC
  `).all(...params) as Array<{
    model_slug: string;
    model_display: string;
    avg_ms: number;
    min_ms: number;
    max_ms: number;
    total_tokens: number;
    avg_tokens: number;
    cnt: number;
  }>;

  // Compute p50 (median) for each model
  const stats: LatencyStats[] = [];
  for (const row of aggRows) {
    const medianParams: unknown[] = [];
    let medianFilter = "";
    if (setName) {
      const setRow = db.prepare("SELECT id FROM theorem_sets WHERE name = ?").get(setName) as { id: number };
      medianFilter = "AND r.set_id = ?";
      medianParams.push(row.model_slug, setRow.id);
    } else {
      medianParams.push(row.model_slug);
    }

    const medianRow = db.prepare(`
      SELECT r.latency_ms
      FROM results r
      WHERE r.model_slug = ? ${medianFilter}
      ORDER BY r.latency_ms
      LIMIT 1 OFFSET ?
    `).get(...medianParams, Math.floor(row.cnt / 2)) as { latency_ms: number } | undefined;

    stats.push({
      model_slug: row.model_slug,
      model_display: row.model_display,
      avg_ms: row.avg_ms,
      min_ms: row.min_ms,
      max_ms: row.max_ms,
      p50_ms: medianRow?.latency_ms ?? row.avg_ms,
      total_tokens: row.total_tokens,
      avg_tokens: row.avg_tokens,
    });
  }

  return stats;
}

export interface FailureAnalysis {
  model_slug: string;
  model_display: string;
  total: number;
  valid: number;
  parse_failures: number;
  validation_failures: number;
  api_errors: number;
}

export interface AvgLinesByDifficulty {
  model_slug: string;
  model_display: string;
  difficulty: string;
  avg_lines: number;
  count: number;
}

export function getAvgLinesByDifficulty(setName?: string): AvgLinesByDifficulty[] {
  const db = getDb();

  let setFilter = "";
  const params: unknown[] = [];

  if (setName) {
    const setRow = db.prepare("SELECT id FROM theorem_sets WHERE name = ?").get(setName) as { id: number } | undefined;
    if (!setRow) return [];
    setFilter = "AND r.set_id = ?";
    params.push(setRow.id);
  }

  return db.prepare(`
    SELECT
      r.model_slug,
      r.model_display,
      t.difficulty,
      ROUND(AVG(r.line_count), 1) AS avg_lines,
      COUNT(*) AS count
    FROM results r
    JOIN theorems t ON t.set_id = r.set_id AND t.theorem_id = r.theorem_id
    WHERE r.validation_result = 'valid'
      AND r.line_count IS NOT NULL
      ${setFilter}
    GROUP BY r.model_slug, t.difficulty
    ORDER BY r.model_display, t.difficulty_value
  `).all(...params) as AvgLinesByDifficulty[];
}

export function getFailureAnalysis(setName?: string): FailureAnalysis[] {
  const db = getDb();

  let setFilter = "";
  const params: unknown[] = [];

  if (setName) {
    const setRow = db.prepare("SELECT id FROM theorem_sets WHERE name = ?").get(setName) as { id: number } | undefined;
    if (!setRow) return [];
    setFilter = "WHERE r.set_id = ?";
    params.push(setRow.id);
  }

  return db.prepare(`
    SELECT
      r.model_slug,
      r.model_display,
      COUNT(*) AS total,
      SUM(CASE WHEN r.validation_result = 'valid' THEN 1 ELSE 0 END) AS valid,
      SUM(CASE WHEN r.validation_result = 'error' AND r.parse_error IS NOT NULL THEN 1 ELSE 0 END) AS parse_failures,
      SUM(CASE WHEN r.validation_result = 'invalid' THEN 1 ELSE 0 END) AS validation_failures,
      SUM(CASE WHEN r.validation_result = 'error' AND r.parse_error IS NULL THEN 1 ELSE 0 END) AS api_errors
    FROM results r
    ${setFilter}
    GROUP BY r.model_slug
    ORDER BY r.model_display
  `).all(...params) as FailureAnalysis[];
}
