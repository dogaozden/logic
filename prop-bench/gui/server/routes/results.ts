import { Router, Request, Response } from "express";
import * as fs from "node:fs";
import * as path from "node:path";
import { BENCHMARKS_DIR } from "../cli";

const router = Router();

/** Find all result directories — they live under benchmarks/{set}/results/ */
function findResultDirs(): { runId: string; dir: string; summaryPath: string }[] {
  const found: { runId: string; dir: string; summaryPath: string }[] = [];

  if (!fs.existsSync(BENCHMARKS_DIR)) return found;

  const sets = fs.readdirSync(BENCHMARKS_DIR, { withFileTypes: true });
  for (const set of sets) {
    if (!set.isDirectory()) continue;

    const resultsDir = path.join(BENCHMARKS_DIR, set.name, "results");
    if (!fs.existsSync(resultsDir)) continue;

    // Check if results dir itself has a summary.json (flat layout)
    const flatSummary = path.join(resultsDir, "summary.json");
    if (fs.existsSync(flatSummary)) {
      found.push({ runId: set.name, dir: resultsDir, summaryPath: flatSummary });
      continue;
    }

    // Otherwise check subdirectories (nested runs)
    const subDirs = fs.readdirSync(resultsDir, { withFileTypes: true });
    for (const sub of subDirs) {
      if (!sub.isDirectory()) continue;
      const summaryPath = path.join(resultsDir, sub.name, "summary.json");
      if (fs.existsSync(summaryPath)) {
        found.push({
          runId: `${set.name}/${sub.name}`,
          dir: path.join(resultsDir, sub.name),
          summaryPath,
        });
      }
    }
  }

  return found;
}

/** GET /api/runs — list all benchmark runs */
router.get("/", (_req: Request, res: Response) => {
  try {
    console.log("[runs] GET / - BENCHMARKS_DIR:", BENCHMARKS_DIR);
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

    const summary = JSON.parse(fs.readFileSync(match.summaryPath, "utf-8"));

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
