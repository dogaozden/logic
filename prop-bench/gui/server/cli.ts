import { execFile, spawn, ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Root of the prop-bench project (one level up from gui/) */
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

/** Path to the compiled propbench binary */
const PROPBENCH_BIN = path.join(PROJECT_ROOT, "target", "release", "propbench");

/** Path to the harness entry point */
const HARNESS_PATH = path.join(PROJECT_ROOT, "harness.ts");

/** Benchmarks directory */
export const BENCHMARKS_DIR = path.join(PROJECT_ROOT, "benchmarks");

/** Results directory */
export const RESULTS_DIR = path.join(PROJECT_ROOT, "results");

// ---------------------------------------------------------------------------
// Generate theorems
// ---------------------------------------------------------------------------

export interface GenerateOpts {
  count: number;
  distribution: string;
  name: string;
}

export async function generate(opts: GenerateOpts): Promise<{ path: string; theorems: unknown[] }> {
  const outDir = path.join(BENCHMARKS_DIR, opts.name);
  const outFile = path.join(outDir, "theorems.json");

  fs.mkdirSync(outDir, { recursive: true });

  const { stderr } = await execFileAsync(PROPBENCH_BIN, [
    "generate",
    "--count", String(opts.count),
    "--difficulty-distribution", opts.distribution,
    "--output", outFile,
  ], { timeout: 120_000, cwd: PROJECT_ROOT });

  if (stderr) {
    // propbench writes progress to stderr, not errors
    console.log("[generate]", stderr.trim());
  }

  const theorems = JSON.parse(fs.readFileSync(outFile, "utf-8"));
  return { path: outFile, theorems };
}

// ---------------------------------------------------------------------------
// Validate a proof
// ---------------------------------------------------------------------------

export interface ValidateResult {
  valid: boolean;
  line_count: number;
  errors: string[];
}

export async function validate(
  theorem: unknown,
  proof: unknown[]
): Promise<ValidateResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "propbench-"));
  const theoremFile = path.join(tmpDir, "theorem.json");
  const proofFile = path.join(tmpDir, "proof.json");

  try {
    fs.writeFileSync(theoremFile, JSON.stringify(theorem), "utf-8");
    fs.writeFileSync(proofFile, JSON.stringify(proof), "utf-8");

    const { stdout, stderr } = await execFileAsync(PROPBENCH_BIN, [
      "validate",
      "--theorem", theoremFile,
      "--proof", proofFile,
    ], { timeout: 30_000 });

    if (stderr && stderr.trim()) {
      return { valid: false, line_count: 0, errors: [stderr.trim()] };
    }

    return JSON.parse(stdout) as ValidateResult;
  } finally {
    try {
      fs.unlinkSync(theoremFile);
      fs.unlinkSync(proofFile);
      fs.rmdirSync(tmpDir);
    } catch { /* ignore cleanup errors */ }
  }
}

// ---------------------------------------------------------------------------
// Spawn harness process
// ---------------------------------------------------------------------------

export interface HarnessOpts {
  theoremSet: string;
  models: string[];
  temperature: number;
  maxTokens: number;
  start?: number;
  count?: number;
}

export function spawnHarness(opts: HarnessOpts): ChildProcess {
  const theoremsPath = path.join(BENCHMARKS_DIR, opts.theoremSet, "theorems.json");

  const args = [
    "ts-node",
    HARNESS_PATH,
    "--theorems", theoremsPath,
    "--models", opts.models.join(","),
    "--output", path.join(RESULTS_DIR, opts.theoremSet),
    "--temperature", String(opts.temperature),
    "--max-tokens", String(opts.maxTokens),
    "--propbench-bin", PROPBENCH_BIN,
  ];

  if (opts.start !== undefined) {
    args.push("--start", String(opts.start));
  }
  if (opts.count !== undefined) {
    args.push("--count", String(opts.count));
  }

  const child = spawn("npx", args, {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  return child;
}
