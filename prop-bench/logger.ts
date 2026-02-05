/**
 * PropBench Logger — Structured JSON logging for benchmark runs.
 *
 * Logs every API call attempt to JSONL files with full context including
 * raw prompts, responses, parse results, validation results, and errors.
 * Failures are logged with equal detail to successes.
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogEntry {
  // Theorem info
  theoremId: string;
  formula: string;
  difficulty: string;
  difficultyValue: number;

  // Model info
  model: string;
  modelParameters?: Record<string, unknown>;

  // Prompt and response
  rawPrompt: string;
  rawResponse: string | null; // null if API call failed

  // Parse results
  parsedProof: unknown | null; // structured proof object, null if parse failed
  parseErrors?: string[];

  // Validation results
  validationResult: boolean | null; // null if not reached (parse failed or API failed)
  validationErrors?: string[];

  // Metrics
  lineCount: number | null; // null if proof invalid or not parsed
  latencyMs: number;
  timestamp: string; // ISO 8601

  // Failure tracking
  failureStage?: "api_call" | "parse" | "validation";
  errorMessage?: string;
}

export interface RunSummary {
  model: string;
  runTimestamp: string;
  totalTheorems: number;
  validProofs: number;
  invalidProofs: number;
  parseFailures: number;
  apiFailures: number;
  totalLines: number;
  avgLinesPerValidProof: number | null;
  avgLatencyMs: number;
  logFile: string;
}

// ---------------------------------------------------------------------------
// Logger class
// ---------------------------------------------------------------------------

export interface Logger {
  logAttempt(entry: LogEntry): void;
  flush(): void;
  getSummary(): RunSummary;
}

/**
 * Create a logger that writes JSONL to `{outputDir}/{modelName}/run-{timestamp}.jsonl`
 * and maintains a summary at `{outputDir}/{modelName}/latest-summary.json`.
 */
export function createLogger(outputDir: string, modelName: string): Logger {
  const runTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const modelDir = path.join(outputDir, sanitizeFilename(modelName));
  const logFileName = `run-${runTimestamp}.jsonl`;
  const logFilePath = path.join(modelDir, logFileName);
  const summaryPath = path.join(modelDir, "latest-summary.json");

  // Ensure output directory exists
  fs.mkdirSync(modelDir, { recursive: true });

  // Buffer for batching writes
  let buffer: string[] = [];
  const FLUSH_THRESHOLD = 10;

  // Running stats for summary
  let totalTheorems = 0;
  let validProofs = 0;
  let invalidProofs = 0;
  let parseFailures = 0;
  let apiFailures = 0;
  let totalLines = 0;
  let totalLatency = 0;

  function writeBuffer(): void {
    if (buffer.length === 0) return;
    fs.appendFileSync(logFilePath, buffer.join("") , "utf-8");
    buffer = [];
  }

  function updateSummary(): void {
    const summary: RunSummary = {
      model: modelName,
      runTimestamp,
      totalTheorems,
      validProofs,
      invalidProofs,
      parseFailures,
      apiFailures,
      totalLines,
      avgLinesPerValidProof:
        validProofs > 0 ? totalLines / validProofs : null,
      avgLatencyMs:
        totalTheorems > 0 ? totalLatency / totalTheorems : 0,
      logFile: logFileName,
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
  }

  const logger: Logger = {
    logAttempt(entry: LogEntry): void {
      totalTheorems++;
      totalLatency += entry.latencyMs;

      if (entry.failureStage === "api_call") {
        apiFailures++;
      } else if (entry.failureStage === "parse") {
        parseFailures++;
      } else if (entry.validationResult === false || entry.failureStage === "validation") {
        invalidProofs++;
      } else if (entry.validationResult === true) {
        validProofs++;
        if (entry.lineCount !== null) {
          totalLines += entry.lineCount;
        }
      } else {
        // Unknown state — count as invalid
        invalidProofs++;
      }

      buffer.push(JSON.stringify(entry) + "\n");

      if (buffer.length >= FLUSH_THRESHOLD) {
        writeBuffer();
        updateSummary();
      }
    },

    flush(): void {
      writeBuffer();
      updateSummary();
    },

    getSummary(): RunSummary {
      return {
        model: modelName,
        runTimestamp,
        totalTheorems,
        validProofs,
        invalidProofs,
        parseFailures,
        apiFailures,
        totalLines,
        avgLinesPerValidProof:
          validProofs > 0 ? totalLines / validProofs : null,
        avgLatencyMs:
          totalTheorems > 0 ? totalLatency / totalTheorems : 0,
        logFile: logFileName,
      };
    },
  };

  return logger;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
