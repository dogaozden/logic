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

/** Path to the local ts-node binary (avoids npx resolution issues) */
const TS_NODE_BIN = path.join(PROJECT_ROOT, "node_modules", ".bin", "ts-node");

/** Path to the .env file in the project root */
const DOT_ENV_PATH = path.join(PROJECT_ROOT, ".env");

/** Benchmarks directory */
export const BENCHMARKS_DIR = path.join(PROJECT_ROOT, "benchmarks");

/** Results directory */
export const RESULTS_DIR = path.join(PROJECT_ROOT, "results");

// ---------------------------------------------------------------------------
// Generate theorems
// ---------------------------------------------------------------------------

export interface DifficultySpec {
  variables: number;
  passes: number;
  transforms_per_pass: number;
  base_complexity: "simple" | "complex";
  substitution_depth: number;
}

export interface GenerateOpts {
  count: number;
  name: string;
  distribution?: string;   // legacy distribution mode
  tier?: string;            // tier preset mode
  spec?: DifficultySpec;    // custom spec mode
}

export async function generate(opts: GenerateOpts): Promise<{ path: string; theorems: unknown[] }> {
  const outDir = path.join(BENCHMARKS_DIR, opts.name);
  const outFile = path.join(outDir, "theorems.json");

  fs.mkdirSync(outDir, { recursive: true });

  // Build CLI args based on mode
  const args: string[] = [
    "generate",
    "--count", String(opts.count),
    "--output", outFile,
  ];

  if (opts.tier) {
    args.push("--tier", opts.tier);
  } else if (opts.spec) {
    args.push("--variables", String(opts.spec.variables));
    args.push("--passes", String(opts.spec.passes));
    args.push("--transforms", String(opts.spec.transforms_per_pass));
    args.push("--base", opts.spec.base_complexity);
    args.push("--substitution", String(opts.spec.substitution_depth));
  } else if (opts.distribution) {
    args.push("--difficulty-distribution", opts.distribution);
  }
  // If none set, CLI uses its own default distribution

  const { stderr } = await execFileAsync(PROPBENCH_BIN, args, {
    timeout: 120_000,
    cwd: PROJECT_ROOT,
  });

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
  workers?: number;
  start?: number;
  count?: number;
  force?: boolean;
  noRetryParse?: boolean;
}

export function spawnHarness(opts: HarnessOpts): ChildProcess {
  const theoremsPath = path.join(BENCHMARKS_DIR, opts.theoremSet, "theorems.json");

  // Validate that required files exist before spawning
  if (!fs.existsSync(theoremsPath)) {
    throw new Error(`Theorems file not found: ${theoremsPath}`);
  }
  if (!fs.existsSync(PROPBENCH_BIN)) {
    throw new Error(`propbench binary not found: ${PROPBENCH_BIN}`);
  }
  if (!fs.existsSync(HARNESS_PATH)) {
    throw new Error(`Harness entry point not found: ${HARNESS_PATH}`);
  }

  const args = [
    HARNESS_PATH,
    "--theorems", theoremsPath,
    "--models", opts.models.join(","),
    "--output", path.join(RESULTS_DIR, opts.theoremSet),
    "--temperature", String(opts.temperature),
    "--max-tokens", String(opts.maxTokens),
    "--propbench-bin", PROPBENCH_BIN,
  ];

  if (opts.workers !== undefined && opts.workers > 1) {
    args.push("--workers", String(opts.workers));
  }
  if (opts.start !== undefined) {
    args.push("--start", String(opts.start));
  }
  if (opts.count !== undefined) {
    args.push("--count", String(opts.count));
  }
  if (opts.force) {
    args.push("--force");
  }
  if (opts.noRetryParse) {
    args.push("--no-retry-parse");
  }

  // Build child env: inherit process.env and also load .env from project root
  // to ensure API keys are available even if the server's dotenv didn't load them.
  const childEnv = { ...process.env };
  if (fs.existsSync(DOT_ENV_PATH)) {
    const envContent = fs.readFileSync(DOT_ENV_PATH, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      childEnv[key] = val;
    }
  }

  // Use local ts-node binary directly — avoids npx resolution issues (npx may
  // prompt for install, fail to locate the package, or add startup latency).
  // ts-node is a devDependency of the root prop-bench package and its binary
  // lives at node_modules/.bin/ts-node.
  const bin = TS_NODE_BIN;
  if (!fs.existsSync(bin)) {
    throw new Error(`ts-node binary not found at ${bin}. Run 'npm install' in ${PROJECT_ROOT}`);
  }

  console.log(`[spawnHarness] bin: ${bin}`);
  console.log(`[spawnHarness] cwd: ${PROJECT_ROOT}`);
  console.log(`[spawnHarness] theorems: ${theoremsPath}`);

  const child = spawn(bin, args, {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: childEnv,
  });

  return child;
}
