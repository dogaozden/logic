import { Router, Request, Response } from "express";
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { RESULTS_DIR, BENCHMARKS_DIR } from "../cli";

// Import Scorer from the prop-bench root. We use createRequire to avoid
// rootDir issues (scorer.ts lives outside gui/server's tsconfig rootDir).
const require_ = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ScorerModule: any = require_("../../../scorer");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbModule: any = require_("../../../db");

type DifficultyTier =
  | "easy" | "medium" | "hard" | "expert" | "nightmare" | "marathon";

interface TheoremResult {
  theoremId: string;
  valid: boolean;
  parseSuccess: boolean;
  lineCount: number | null;
  difficulty: DifficultyTier;
  difficultyValue: number;
  failureStage?: "api_call" | "parse" | "validation";
}

/** Map adapter slug to human-readable display name */
const DISPLAY_NAMES: Record<string, string> = {
  gemini: "Gemini 2.5 Flash Lite",
  "gemini-3-flash": "Gemini 3 Flash",
  "gemini-3-pro": "Gemini 3 Pro",
  anthropic: "Claude Sonnet 4.5",
  openai: "GPT-4o",
};

const router = Router();

/** Find all result directories — they live under results/{set}/{model}/ */
function findResultDirs(): { runId: string; dir: string; summaryPath: string }[] {
  const found: { runId: string; dir: string; summaryPath: string }[] = [];

  if (!fs.existsSync(RESULTS_DIR)) return found;

  const sets = fs.readdirSync(RESULTS_DIR, { withFileTypes: true });
  for (const set of sets) {
    if (!set.isDirectory()) continue;

    const setDir = path.join(RESULTS_DIR, set.name);

    // Check for model subdirectories {set}/{model}/summary.json
    const subDirs = fs.readdirSync(setDir, { withFileTypes: true });
    let foundModelSubdirs = false;

    for (const sub of subDirs) {
      if (!sub.isDirectory()) continue;
      if (sub.name === "raw") continue;

      const summaryPath = path.join(setDir, sub.name, "summary.json");
      if (fs.existsSync(summaryPath)) {
        foundModelSubdirs = true;
        found.push({
          runId: `${set.name}/${sub.name}`,
          dir: path.join(setDir, sub.name),
          summaryPath,
        });
      }
    }

    // Combined set-level report (cross-model comparison with Elo)
    if (foundModelSubdirs) {
      const combinedSummary = path.join(setDir, "summary.json");
      if (fs.existsSync(combinedSummary)) {
        found.push({
          runId: set.name,
          dir: setDir,
          summaryPath: combinedSummary,
        });
      }
    }

    // Backward compat: old flat layout with summary.json directly in set dir
    if (!foundModelSubdirs) {
      const flatSummary = path.join(setDir, "summary.json");
      if (fs.existsSync(flatSummary)) {
        found.push({ runId: set.name, dir: setDir, summaryPath: flatSummary });
      }
    }
  }

  return found;
}

/** GET /api/runs — list all benchmark runs */
router.get("/", (_req: Request, res: Response) => {
  try {
    console.log("[runs] GET / - RESULTS_DIR:", RESULTS_DIR);

    // Try SQLite first
    if (dbModule.dbExists()) {
      try {
        const runs = dbModule.getRunsList();
        console.log(`[runs] Returning ${runs.length} runs (from DB)`);
        res.json(runs);
        return;
      } catch (dbErr) {
        console.warn("[runs] DB query failed, falling back to filesystem:", dbErr);
      }
    }

    // Filesystem fallback
    const dirs = findResultDirs();
    console.log(`[runs] Found ${dirs.length} result directories`);

    const runs = dirs.map(({ runId, summaryPath }) => {
      try {
        const summary = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
        return {
          runId,
          timestamp: summary.timestamp ?? null,
          models: summary.models ?? [],
          stats: {
            total_run: summary.total_run ?? 0,
            total_valid: summary.total_valid ?? 0,
            total_invalid: summary.total_invalid ?? 0,
            total_errors: summary.total_errors ?? 0,
          },
        };
      } catch (summaryErr) {
        console.error(`[runs] Failed to parse summary for ${runId}:`, summaryErr);
        return { runId, timestamp: null, models: [], stats: {} };
      }
    });

    console.log(`[runs] Returning ${runs.length} runs`);
    res.json(runs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[runs] ERROR:", err);
    res.status(500).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// Stats endpoints — MUST come before the /:runId(*) catch-all
// ---------------------------------------------------------------------------

/** GET /api/runs/stats/overview — Dashboard overview */
router.get("/stats/overview", (_req: Request, res: Response) => {
  try {
    if (!dbModule.dbExists()) {
      res.status(503).json({ error: "Database not available" });
      return;
    }
    const overview = dbModule.getDashboardOverview();
    res.json(overview);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/** GET /api/runs/stats/head-to-head/:setName — Head-to-head matrix */
router.get("/stats/head-to-head/:setName", (req: Request, res: Response) => {
  try {
    if (!dbModule.dbExists()) {
      res.status(503).json({ error: "Database not available" });
      return;
    }
    const cells = dbModule.getHeadToHeadMatrix(req.params.setName);
    res.json(cells);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/** GET /api/runs/stats/latency/:setName? — Latency stats */
router.get("/stats/latency/:setName", (req: Request, res: Response) => {
  try {
    if (!dbModule.dbExists()) {
      res.status(503).json({ error: "Database not available" });
      return;
    }
    const stats = dbModule.getLatencyStats(req.params.setName);
    res.json(stats);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/stats/latency", (_req: Request, res: Response) => {
  try {
    if (!dbModule.dbExists()) {
      res.status(503).json({ error: "Database not available" });
      return;
    }
    const stats = dbModule.getLatencyStats();
    res.json(stats);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/** GET /api/runs/stats/avg-lines-by-difficulty/:setName — Avg lines by difficulty */
router.get("/stats/avg-lines-by-difficulty/:setName", (req: Request, res: Response) => {
  try {
    if (!dbModule.dbExists()) {
      res.status(503).json({ error: "Database not available" });
      return;
    }
    const data = dbModule.getAvgLinesByDifficulty(req.params.setName);
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/stats/avg-lines-by-difficulty", (_req: Request, res: Response) => {
  try {
    if (!dbModule.dbExists()) {
      res.status(503).json({ error: "Database not available" });
      return;
    }
    const data = dbModule.getAvgLinesByDifficulty();
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/** GET /api/runs/stats/failures/:setName? — Failure analysis */
router.get("/stats/failures/:setName", (req: Request, res: Response) => {
  try {
    if (!dbModule.dbExists()) {
      res.status(503).json({ error: "Database not available" });
      return;
    }
    const analysis = dbModule.getFailureAnalysis(req.params.setName);
    res.json(analysis);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/stats/failures", (_req: Request, res: Response) => {
  try {
    if (!dbModule.dbExists()) {
      res.status(503).json({ error: "Database not available" });
      return;
    }
    const analysis = dbModule.getFailureAnalysis();
    res.json(analysis);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/** GET /api/runs/:runId — get full results for a run */
router.get("/:runId(*)", (req: Request, res: Response) => {
  try {
    const { runId } = req.params;

    // Try SQLite first
    if (dbModule.dbExists()) {
      try {
        const detail = dbModule.getRunDetail(runId);
        res.json(detail);
        return;
      } catch (dbErr) {
        console.warn(`[runs] DB query failed for ${runId}, falling back to filesystem:`, dbErr);
      }
    }

    // Filesystem fallback
    const dirs = findResultDirs();
    const match = dirs.find((d) => d.runId === runId);

    if (!match) {
      res.status(404).json({ error: `Run '${runId}' not found` });
      return;
    }

    // Read raw result files
    let results: unknown[] = [];

    const rawDir = path.join(match.dir, "raw");
    if (fs.existsSync(rawDir)) {
      // Single-model layout: raw/ directly in match.dir
      const files = fs.readdirSync(rawDir).filter((f) => f.endsWith(".json"));
      results = files.map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(rawDir, f), "utf-8"));
        } catch {
          return null;
        }
      }).filter(Boolean);
    } else {
      // Combined set-level: collect raw/ from all model subdirs
      const subDirs = fs.readdirSync(match.dir, { withFileTypes: true });
      for (const sub of subDirs) {
        if (!sub.isDirectory()) continue;
        const subRawDir = path.join(match.dir, sub.name, "raw");
        if (!fs.existsSync(subRawDir)) continue;
        const files = fs.readdirSync(subRawDir).filter((f) => f.endsWith(".json"));
        for (const f of files) {
          try {
            results.push(JSON.parse(fs.readFileSync(path.join(subRawDir, f), "utf-8")));
          } catch {
            // skip
          }
        }
      }
    }

    // Prefer report.json (full BenchmarkReport) if it exists
    const reportPath = path.join(match.dir, "report.json");
    let summary: unknown;

    if (fs.existsSync(reportPath)) {
      try {
        summary = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
      } catch {
        summary = JSON.parse(fs.readFileSync(match.summaryPath, "utf-8"));
      }
    } else {
      // Fall back: compute report on the fly using Scorer (for old-format data)
      const rawSummary = JSON.parse(fs.readFileSync(match.summaryPath, "utf-8"));
      summary = rawSummary;

      try {
        let theoremsPath: string | null = null;

        if (rawSummary.theorems_file) {
          const projectRoot = path.resolve(BENCHMARKS_DIR, "..");
          theoremsPath = path.resolve(projectRoot, rawSummary.theorems_file);
        }

        if (!theoremsPath || !fs.existsSync(theoremsPath)) {
          const setName = String(runId).split("/")[0];
          theoremsPath = path.join(BENCHMARKS_DIR, setName, "theorems.json");
        }

        if (fs.existsSync(theoremsPath) && results.length > 0) {
          const theorems: Array<{
            id: string;
            difficulty: string;
            difficulty_value: number;
          }> = JSON.parse(fs.readFileSync(theoremsPath, "utf-8"));

          const theoremMap = new Map<string, { difficulty: string; difficultyValue: number }>();
          for (const t of theorems) {
            theoremMap.set(t.id, {
              difficulty: t.difficulty,
              difficultyValue: t.difficulty_value,
            });
          }

          const scorer = new ScorerModule.Scorer();

          for (const raw of results as Array<Record<string, unknown>>) {
            const theoremId = raw.theorem_id as string;
            const model = raw.model as string;
            const validationResult = raw.validation_result as string;
            const parseError = raw.parse_error as string | null;
            const validationErrors = (raw.validation_errors as string[]) ?? [];
            const lineCount = raw.line_count as number | null;

            const theoremInfo = theoremMap.get(theoremId);
            const difficulty = (theoremInfo?.difficulty?.toLowerCase() ?? "medium") as DifficultyTier;
            const difficultyValue = theoremInfo?.difficultyValue ?? 0;

            const valid = validationResult === "valid";
            const parseSuccess = parseError === null;

            let failureStage: "api_call" | "parse" | "validation" | undefined;
            if (!valid) {
              if (validationResult === "error" && parseError !== null) {
                failureStage = "parse";
              } else if (validationErrors.some((e) => typeof e === "string" && e.includes("API error"))) {
                failureStage = "api_call";
              } else {
                failureStage = "validation";
              }
            }

            const theoremResult: TheoremResult = {
              theoremId,
              valid,
              parseSuccess,
              lineCount,
              difficulty,
              difficultyValue,
              ...(failureStage !== undefined ? { failureStage } : {}),
            };

            const displayModel = DISPLAY_NAMES[model] ?? model;
            scorer.recordResult(theoremId, displayModel, theoremResult);
          }

          summary = scorer.generateReport();
        }
      } catch (scorerErr) {
        console.error("[runs] Scorer failed, falling back to raw summary:", scorerErr);
      }
    }

    res.json({ summary, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/** DELETE /api/runs/:runId — delete a run's results */
router.delete("/:runId(*)", (req: Request, res: Response) => {
  try {
    const { runId } = req.params;

    // Delete from DB if available
    if (dbModule.dbExists()) {
      try {
        dbModule.deleteRun(runId);
      } catch (dbErr) {
        console.warn(`[runs] DB delete failed for ${runId}:`, dbErr);
      }
    }

    // Also delete from filesystem
    const dirs = findResultDirs();
    const match = dirs.find((d) => d.runId === runId);
    if (match) {
      fs.rmSync(match.dir, { recursive: true, force: true });
    }

    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
