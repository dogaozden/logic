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

const router = Router();

/** Find all result directories — they live under results/{set}/{model}/ */
function findResultDirs(): { runId: string; dir: string; summaryPath: string }[] {
  const found: { runId: string; dir: string; summaryPath: string }[] = [];

  if (!fs.existsSync(RESULTS_DIR)) return found;

  const sets = fs.readdirSync(RESULTS_DIR, { withFileTypes: true });
  for (const set of sets) {
    if (!set.isDirectory()) continue;

    const setDir = path.join(RESULTS_DIR, set.name);

    // New layout: check model subdirectories {set}/{model}/summary.json
    const subDirs = fs.readdirSync(setDir, { withFileTypes: true });
    let foundModelSubdirs = false;

    for (const sub of subDirs) {
      if (!sub.isDirectory()) continue;
      // Skip "raw" dir — that belongs to old flat layout
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

/** GET /api/runs/:runId — get full results for a run */
router.get("/:runId(*)", (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const dirs = findResultDirs();
    const match = dirs.find((d) => d.runId === runId);

    if (!match) {
      res.status(404).json({ error: `Run '${runId}' not found` });
      return;
    }

    // Read raw result files
    const rawDir = path.join(match.dir, "raw");
    let results: unknown[] = [];

    if (fs.existsSync(rawDir)) {
      const files = fs.readdirSync(rawDir).filter((f) => f.endsWith(".json"));
      results = files.map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(rawDir, f), "utf-8"));
        } catch {
          return null;
        }
      }).filter(Boolean);
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

            scorer.recordResult(theoremId, model, theoremResult);
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
    const dirs = findResultDirs();
    const match = dirs.find((d) => d.runId === runId);

    if (!match) {
      res.status(404).json({ error: `Run '${runId}' not found` });
      return;
    }

    fs.rmSync(match.dir, { recursive: true, force: true });
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
