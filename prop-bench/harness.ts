#!/usr/bin/env npx ts-node

import * as dotenv from "dotenv";
dotenv.config({ override: true });
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { getModel } from "./models/index";
import type { ModelConfig, ModelResponse } from "./models/index";
import type { Theorem, ProofLine } from "./config";
import { Scorer } from "./scorer";
import type { TheoremResult, DifficultyTier } from "./scorer";
import * as db from "./db";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Theorem as stored in the benchmark JSON (from Rust CLI output) */
interface BenchTheorem {
  id: string;
  premises: string[];
  conclusion: string;
  difficulty: string;
  difficulty_value: number;
}

export interface BenchmarkResult {
  theorem_id: string;
  model: string;
  model_name: string;
  raw_response: string;
  parsed_proof: ProofLine[] | null;
  parse_error: string | null;
  validation_result: "valid" | "invalid" | "error";
  validation_errors: string[];
  line_count: number | null;
  latency_ms: number;
  tokens_used: number | undefined;
  timestamp: string;
}

interface RunState {
  completed: Set<string>;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  theorems: string;
  models: string[];
  output: string;
  start: number;
  count: number | null;
  propbenchBin: string;
  temperature: number;
  maxTokens: number;
  workers: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: CliArgs = {
    theorems: "",
    models: [],
    output: "results/",
    start: 0,
    count: null,
    propbenchBin: "propbench",
    temperature: 0.2,
    maxTokens: 4096,
    workers: 1,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--theorems":
        parsed.theorems = args[++i];
        break;
      case "--models":
        parsed.models = args[++i].split(",").map((m) => m.trim());
        break;
      case "--output":
        parsed.output = args[++i];
        break;
      case "--start":
        parsed.start = parseInt(args[++i], 10);
        break;
      case "--count":
        parsed.count = parseInt(args[++i], 10);
        break;
      case "--propbench-bin":
        parsed.propbenchBin = args[++i];
        break;
      case "--temperature":
        parsed.temperature = parseFloat(args[++i]);
        break;
      case "--max-tokens":
        parsed.maxTokens = parseInt(args[++i], 10);
        break;
      case "--workers":
        parsed.workers = parseInt(args[++i], 10);
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  if (!parsed.theorems || parsed.models.length === 0) {
    printUsage();
    process.exit(1);
  }

  return parsed;
}

function printUsage(): void {
  console.log(`
Usage: npx ts-node harness.ts --theorems <path> --models <list> [options]

Required:
  --theorems <path>         Path to theorems JSON file
  --models <list>           Comma-separated model names (gemini,claude,gpt)

Options:
  --output <dir>            Output directory (default: results/)
  --start <n>               Start at theorem index n (default: 0)
  --count <n>               Process only n theorems (default: all)
  --propbench-bin <path>    Path to propbench CLI binary (default: propbench)
  --temperature <n>         Model temperature (default: 0.2)
  --max-tokens <n>          Max tokens for model response (default: 4096)
  --workers <n>             Number of parallel API calls (default: 1)
`);
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

function loadTheorems(filepath: string): BenchTheorem[] {
  const raw = fs.readFileSync(filepath, "utf-8");
  return JSON.parse(raw) as BenchTheorem[];
}

/** Convert BenchTheorem to the Theorem type expected by prompt/parser */
function toTheorem(bt: BenchTheorem): Theorem {
  return {
    id: bt.id,
    premises: bt.premises,
    conclusion: bt.conclusion,
    difficulty: bt.difficulty as Theorem["difficulty"],
    difficulty_value: bt.difficulty_value,
  };
}

function loadRunState(outputDir: string): RunState {
  const completed = new Set<string>();

  if (!fs.existsSync(outputDir)) {
    return { completed };
  }

  // Scan model subdirectories: {outputDir}/{model}/raw/*.json
  const entries = fs.readdirSync(outputDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const rawDir = path.join(outputDir, entry.name, "raw");
    if (!fs.existsSync(rawDir)) continue;

    const files = fs.readdirSync(rawDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(rawDir, file), "utf-8")
        ) as BenchmarkResult;
        completed.add(`${data.theorem_id}::${data.model}`);
      } catch {
        // Skip corrupt files
      }
    }
  }

  // Also scan old flat layout: {outputDir}/raw/*.json for backward compat
  const flatRawDir = path.join(outputDir, "raw");
  if (fs.existsSync(flatRawDir)) {
    const files = fs.readdirSync(flatRawDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(flatRawDir, file), "utf-8")
        ) as BenchmarkResult;
        completed.add(`${data.theorem_id}::${data.model}`);
      } catch {
        // Skip corrupt files
      }
    }
  }

  return { completed };
}

function resultKey(theoremId: string, modelName: string): string {
  return `${theoremId}::${modelName}`;
}

function promptForTheorem(theorem: Theorem): string {
  // Use the dedicated prompt builder from prompt.ts
  const { buildPrompt: build } = require("./prompt");
  return build(theorem);
}

function parseModelResponse(
  rawResponse: string,
  theorem: Theorem
): { proof: ProofLine[] | null; error: string | null } {
  try {
    const { parseProof } = require("./parser");
    const result = parseProof(rawResponse, theorem);
    if (result.errors && result.errors.length > 0) {
      return { proof: null, error: result.errors.map((e: any) => e.message).join("; ") };
    }
    // Convert ParsedLine[] to ProofLine[]
    const proof: ProofLine[] = result.lines.map((l: any) => ({
      line_number: l.line_number,
      formula: l.formula,
      justification: l.justification,
      depth: l.depth,
    }));
    return { proof, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { proof: null, error: `Parse error: ${msg}` };
  }
}

async function validateProof(
  benchTheorem: BenchTheorem,
  proof: ProofLine[],
  propbenchBin: string
): Promise<{ valid: boolean; line_count: number; errors: string[] }> {
  // The Rust CLI expects file paths, so write temp files
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "propbench-"));
  const theoremFile = path.join(tmpDir, "theorem.json");
  const proofFile = path.join(tmpDir, "proof.json");

  try {
    fs.writeFileSync(theoremFile, JSON.stringify(benchTheorem), "utf-8");
    fs.writeFileSync(proofFile, JSON.stringify(proof), "utf-8");

    const { stdout, stderr } = await execFileAsync(propbenchBin, [
      "validate",
      "--theorem", theoremFile,
      "--proof", proofFile,
    ], { timeout: 30_000 });

    if (stderr && stderr.trim()) {
      return { valid: false, line_count: 0, errors: [stderr.trim()] };
    }

    const result = JSON.parse(stdout) as {
      valid: boolean;
      line_count: number;
      errors: string[];
    };
    return { valid: result.valid, line_count: result.line_count, errors: result.errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, line_count: 0, errors: [`Validation process error: ${msg}`] };
  } finally {
    // Clean up temp files
    try {
      fs.unlinkSync(theoremFile);
      fs.unlinkSync(proofFile);
      fs.rmdirSync(tmpDir);
    } catch { /* ignore cleanup errors */ }
  }
}

function saveResult(result: BenchmarkResult, outputDir: string): void {
  const rawDir = path.join(outputDir, result.model, "raw");
  fs.mkdirSync(rawDir, { recursive: true });

  const filename = `${result.theorem_id}_${result.model}_${Date.now()}.json`;
  const filepath = path.join(rawDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Concurrency helpers
// ---------------------------------------------------------------------------

interface WorkItem {
  theoremIndex: number;  // index into benchTheorems array
  adapterIndex: number;  // index into adapters array
  itemNumber: number;    // 1-based sequential number for progress display
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Main orchestration loop
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const args = parseArgs();

  console.log("=== PropBench Harness ===");
  console.log(`Theorems: ${args.theorems}`);
  console.log(`Models:   ${args.models.join(", ")}`);
  console.log(`Output:   ${args.output}`);
  console.log(`Workers:  ${args.workers}`);
  console.log();

  // Load theorems
  const allBenchTheorems = loadTheorems(args.theorems);
  console.log(`Loaded ${allBenchTheorems.length} theorems`);

  // Apply --start and --count
  const startIdx = args.start;
  const endIdx =
    args.count !== null
      ? Math.min(startIdx + args.count, allBenchTheorems.length)
      : allBenchTheorems.length;
  const benchTheorems = allBenchTheorems.slice(startIdx, endIdx);
  console.log(
    `Processing theorems ${startIdx} to ${endIdx - 1} (${benchTheorems.length} total)`
  );

  // Load run state for resume support
  const state = loadRunState(args.output);
  console.log(`Found ${state.completed.size} already-completed results`);
  console.log();

  // Ensure output directory
  fs.mkdirSync(args.output, { recursive: true });

  // Initialize SQLite DB
  let setName = "";
  let setId = 0;
  try {
    db.initSchema();
    setName = path.basename(path.dirname(args.theorems));
    setId = db.upsertTheoremSet(setName, args.theorems);
    for (const bt of allBenchTheorems) {
      db.upsertTheorem(setId, {
        id: bt.id,
        premises: bt.premises,
        conclusion: bt.conclusion,
        difficulty: bt.difficulty,
        difficulty_value: bt.difficulty_value,
      });
    }
    console.log(`SQLite DB initialized (set: ${setName}, id: ${setId})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`SQLite init warning (continuing with file-only mode): ${msg}`);
  }

  // Initialize model adapters
  const adapters = args.models.map((name) => {
    try {
      return getModel(name);
    } catch (err) {
      console.error(
        `Failed to initialize model "${name}": ${err instanceof Error ? err.message : err}`
      );
      process.exit(1);
    }
  });

  // Stats
  let totalRun = 0;
  let totalSkipped = 0;
  let totalValid = 0;
  let totalInvalid = 0;
  let totalErrors = 0;

  // Build flat list of all work items
  const workItems: WorkItem[] = [];
  let itemNumber = 0;
  for (let ti = 0; ti < benchTheorems.length; ti++) {
    for (let ai = 0; ai < adapters.length; ai++) {
      itemNumber++;
      const key = resultKey(benchTheorems[ti].id, adapters[ai].name);
      if (state.completed.has(key)) {
        totalSkipped++;
        console.log(
          `[${itemNumber}/${benchTheorems.length * adapters.length}] ${benchTheorems[ti].id} x ${adapters[ai].name} — SKIPPED (already done)`
        );
        continue;
      }
      workItems.push({ theoremIndex: ti, adapterIndex: ai, itemNumber });
    }
  }

  const totalItems = benchTheorems.length * adapters.length;

  // Process work items with concurrency limiter
  async function processWorkItem(item: WorkItem): Promise<void> {
    const benchThm = benchTheorems[item.theoremIndex];
    const adapter = adapters[item.adapterIndex];
    const theorem = toTheorem(benchThm);
    const progress = `[${item.itemNumber}/${totalItems}]`;

    console.log(
      `${progress} ${benchThm.id} x ${adapter.displayName} — running...`
    );

    const result: BenchmarkResult = {
      theorem_id: benchThm.id,
      model: adapter.name,
      model_name: "",
      raw_response: "",
      parsed_proof: null,
      parse_error: null,
      validation_result: "error",
      validation_errors: [],
      line_count: null,
      latency_ms: 0,
      tokens_used: undefined,
      timestamp: new Date().toISOString(),
    };

    const modelConfig: ModelConfig = {
      model: "",
      temperature: args.temperature,
      maxTokens: args.maxTokens,
    };

    // Step 1: Build prompt
    let prompt: string;
    try {
      prompt = promptForTheorem(theorem);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.validation_errors = [`Prompt build error: ${msg}`];
      saveResult(result, args.output);
      // DB dual-write
      if (setName) {
        try { db.insertResult(setName, result); } catch {}
      }
      totalErrors++;
      console.log(`  -> PROMPT ERROR: ${msg}`);
      return;
    }

    // Step 2: Call model API
    let response: ModelResponse;
    try {
      response = await adapter.callModel(prompt, modelConfig);
      result.raw_response = response.raw_response;
      result.latency_ms = response.latency_ms;
      result.model_name = response.model;
      result.tokens_used = response.tokens_used;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.validation_errors = [`API error: ${msg}`];
      saveResult(result, args.output);
      // DB dual-write
      if (setName) {
        try { db.insertResult(setName, result); } catch {}
      }
      totalErrors++;
      console.log(`  -> API ERROR: ${msg}`);
      return;
    }

    // Step 3: Parse response
    const { proof, error: parseError } = parseModelResponse(
      response.raw_response,
      theorem
    );
    if (parseError || !proof) {
      result.parse_error = parseError;
      result.validation_result = "error";
      result.validation_errors = [parseError ?? "Unknown parse error"];
      saveResult(result, args.output);
      // DB dual-write
      if (setName) {
        try { db.insertResult(setName, result); } catch {}
      }
      totalErrors++;
      console.log(`  -> PARSE ERROR: ${parseError}`);
      return;
    }
    result.parsed_proof = proof;

    // Step 4: Validate via CLI
    const { valid, line_count, errors } = await validateProof(
      benchThm,
      proof,
      args.propbenchBin
    );
    result.validation_result = valid ? "valid" : "invalid";
    result.validation_errors = errors;
    result.line_count = valid ? line_count : null;

    saveResult(result, args.output);
    // DB dual-write
    if (setName) {
      try { db.insertResult(setName, result); } catch {}
    }
    totalRun++;

    if (valid) {
      totalValid++;
      console.log(`  -> VALID (${proof.length} lines, ${result.latency_ms}ms)`);
    } else {
      totalInvalid++;
      console.log(
        `  -> INVALID: ${errors.slice(0, 2).join("; ")}${errors.length > 2 ? ` (+${errors.length - 2} more)` : ""}`
      );
    }
  }

  await runWithConcurrency(workItems, args.workers, processWorkItem);

  // Summary
  console.log();
  console.log("=== Summary ===");
  console.log(`Run:     ${totalRun}`);
  console.log(`Skipped: ${totalSkipped}`);
  console.log(`Valid:   ${totalValid}`);
  console.log(`Invalid: ${totalInvalid}`);
  console.log(`Errors:  ${totalErrors}`);
  console.log();

  // Write per-model summaries and reports
  // Build a lookup map from theorem id -> BenchTheorem for difficulty info
  const theoremMap = new Map<string, BenchTheorem>();
  for (const bt of allBenchTheorems) {
    theoremMap.set(bt.id, bt);
  }

  for (const adapter of adapters) {
    const modelDir = path.join(args.output, adapter.name);
    const rawDir = path.join(modelDir, "raw");

    if (!fs.existsSync(rawDir)) continue;

    // Collect all raw results for this model
    const rawFiles = fs.readdirSync(rawDir).filter((f) => f.endsWith(".json"));
    const rawResults: BenchmarkResult[] = [];
    let modelValid = 0;
    let modelInvalid = 0;
    let modelErrors = 0;

    for (const file of rawFiles) {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(rawDir, file), "utf-8")
        ) as BenchmarkResult;
        rawResults.push(data);
        if (data.validation_result === "valid") modelValid++;
        else if (data.validation_result === "invalid") modelInvalid++;
        else modelErrors++;
      } catch {
        // Skip corrupt files
      }
    }

    // Write per-model summary.json
    const modelSummary = {
      timestamp: new Date().toISOString(),
      theorems_file: args.theorems,
      models: [adapter.displayName],
      total_run: rawResults.length,
      total_skipped: 0,
      total_valid: modelValid,
      total_invalid: modelInvalid,
      total_errors: modelErrors,
    };
    const modelSummaryPath = path.join(modelDir, "summary.json");
    fs.writeFileSync(modelSummaryPath, JSON.stringify(modelSummary, null, 2), "utf-8");
    console.log(`Model summary written to ${modelSummaryPath}`);

    // Generate and write report.json using Scorer
    try {
      const scorer = new Scorer();
      for (const raw of rawResults) {
        const bt = theoremMap.get(raw.theorem_id);
        const difficulty = (bt?.difficulty?.toLowerCase() ?? "medium") as DifficultyTier;
        const difficultyValue = bt?.difficulty_value ?? 0;

        let failureStage: "api_call" | "parse" | "validation" | undefined;
        if (raw.validation_result !== "valid") {
          if (raw.parse_error !== null) {
            failureStage = "parse";
          } else if (raw.validation_errors.some((e) => e.includes("API"))) {
            failureStage = "api_call";
          } else {
            failureStage = "validation";
          }
        }

        const theoremResult: TheoremResult = {
          theoremId: raw.theorem_id,
          valid: raw.validation_result === "valid",
          parseSuccess: raw.parse_error === null,
          lineCount: raw.line_count,
          difficulty,
          difficultyValue,
          ...(failureStage !== undefined ? { failureStage } : {}),
        };

        scorer.recordResult(raw.theorem_id, adapter.displayName, theoremResult);
      }

      const report = scorer.generateReport();
      const reportPath = path.join(modelDir, "report.json");
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
      console.log(`Model report written to ${reportPath}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to generate report for ${adapter.displayName}: ${msg}`);
    }
  }

  // Generate combined cross-model report at the set level (for Elo comparison)
  // Scans ALL model subdirectories, not just current run's adapters
  try {
    const combinedScorer = new Scorer();
    const allModelNames: string[] = [];
    let combinedValid = 0;
    let combinedInvalid = 0;
    let combinedErrors = 0;

    // Build display-name lookup from current adapters
    const displayNameMap = new Map<string, string>();
    for (const adapter of adapters) {
      displayNameMap.set(adapter.name, adapter.displayName);
    }

    // Scan all model subdirectories in the output dir
    const allSubDirs = fs.readdirSync(args.output, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const subDir of allSubDirs) {
      const rawDir = path.join(args.output, subDir.name, "raw");
      if (!fs.existsSync(rawDir)) continue;

      // Resolve display name: adapter lookup → per-model summary → dir name
      let displayName = displayNameMap.get(subDir.name);
      if (!displayName) {
        const modelSummaryPath = path.join(args.output, subDir.name, "summary.json");
        if (fs.existsSync(modelSummaryPath)) {
          try {
            const ms = JSON.parse(fs.readFileSync(modelSummaryPath, "utf-8"));
            displayName = ms.models?.[0] ?? subDir.name;
          } catch {
            displayName = subDir.name;
          }
        } else {
          displayName = subDir.name;
        }
      }
      allModelNames.push(displayName);

      const rawFiles = fs.readdirSync(rawDir).filter((f) => f.endsWith(".json"));
      for (const file of rawFiles) {
        try {
          const raw = JSON.parse(
            fs.readFileSync(path.join(rawDir, file), "utf-8")
          ) as BenchmarkResult;
          const bt = theoremMap.get(raw.theorem_id);
          const difficulty = (bt?.difficulty?.toLowerCase() ?? "medium") as DifficultyTier;
          const difficultyValue = bt?.difficulty_value ?? 0;

          const valid = raw.validation_result === "valid";
          if (valid) combinedValid++;
          else if (raw.validation_result === "invalid") combinedInvalid++;
          else combinedErrors++;

          let failureStage: "api_call" | "parse" | "validation" | undefined;
          if (!valid) {
            if (raw.parse_error !== null) failureStage = "parse";
            else if (raw.validation_errors.some((e) => e.includes("API"))) failureStage = "api_call";
            else failureStage = "validation";
          }

          combinedScorer.recordResult(raw.theorem_id, displayName, {
            theoremId: raw.theorem_id,
            valid,
            parseSuccess: raw.parse_error === null,
            lineCount: raw.line_count,
            difficulty,
            difficultyValue,
            ...(failureStage !== undefined ? { failureStage } : {}),
          });
        } catch {
          // Skip corrupt files
        }
      }
    }

    if (allModelNames.length > 0) {
      const combinedReport = combinedScorer.generateReport();
      const combinedSummary = {
        timestamp: new Date().toISOString(),
        theorems_file: args.theorems,
        models: allModelNames,
        total_run: combinedValid + combinedInvalid + combinedErrors,
        total_skipped: 0,
        total_valid: combinedValid,
        total_invalid: combinedInvalid,
        total_errors: combinedErrors,
      };

      fs.writeFileSync(
        path.join(args.output, "report.json"),
        JSON.stringify(combinedReport, null, 2),
        "utf-8"
      );
      fs.writeFileSync(
        path.join(args.output, "summary.json"),
        JSON.stringify(combinedSummary, null, 2),
        "utf-8"
      );
      console.log(`Combined report written to ${path.join(args.output, "report.json")}`);

      combinedScorer.printSummary(combinedReport);
    }

    // Invalidate DB report cache so next server query recomputes
    if (setId) {
      try { db.invalidateReportCache(setId); } catch {}
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to generate combined report: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
