import { useState, useCallback } from "react";
import RunConfig from "../components/RunConfig";
import type { RunConfigValues } from "../components/RunConfig";
import RunProgress from "../components/RunProgress";
import RunHistory from "../components/RunHistory";
import type { RunRecord } from "../components/RunHistory";
import type { BenchmarkResult } from "../types";
import "../styles/runner.css";

const STORAGE_KEY = "propbench-run-history";

function loadHistory(): RunRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RunRecord[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(runs: RunRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
}

function buildCommand(cfg: RunConfigValues): string {
  const parts: string[] = ["npx ts-node harness.ts"];
  parts.push(`--theorems ${cfg.theoremsPath}`);
  parts.push(`--models ${cfg.models.join(",")}`);
  parts.push(`--output ${cfg.outputDir}`);
  parts.push(`--propbench-bin ${cfg.propbenchBin}`);
  parts.push(`--temperature ${cfg.temperature}`);
  parts.push(`--max-tokens ${cfg.maxTokens}`);
  if (cfg.startIndex > 0) {
    parts.push(`--start ${cfg.startIndex}`);
  }
  if (cfg.count.trim() !== "") {
    parts.push(`--count ${cfg.count.trim()}`);
  }
  return parts.join(" \\\n  ");
}

function BenchmarkRunner() {
  const [config, setConfig] = useState<RunConfigValues>({
    models: [],
    theoremsPath: "benchmarks/v1/theorems.json",
    temperature: 0.2,
    maxTokens: 4096,
    startIndex: 0,
    count: "",
    propbenchBin: "./target/release/propbench",
    outputDir: "results/",
  });

  const [command, setCommand] = useState<string | null>(null);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [history, setHistory] = useState<RunRecord[]>(loadHistory);
  const [loadError, setLoadError] = useState("");

  const handleStart = useCallback(() => {
    const cmd = buildCommand(config);
    setCommand(cmd);
    setResults([]);
    setLoadError("");
  }, [config]);

  const handleLoadResults = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setLoadError("");

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target?.result as string);

          // Accept either an array of BenchmarkResult or a summary.json
          let loaded: BenchmarkResult[];
          if (Array.isArray(data)) {
            loaded = data as BenchmarkResult[];
          } else if (data.results && Array.isArray(data.results)) {
            loaded = data.results as BenchmarkResult[];
          } else {
            setLoadError("Unrecognized results format. Expected an array of BenchmarkResult objects.");
            return;
          }

          setResults(loaded);

          // Build history record
          const models = [...new Set(loaded.map((r) => r.model))];
          const theoremIds = new Set(loaded.map((r) => r.theorem_id));
          const validCount = loaded.filter((r) => r.result.valid).length;
          const errorCount = loaded.filter((r) => r.result.errors.length > 0 && !r.result.valid).length;
          const invalidCount = loaded.length - validCount - errorCount;

          const record: RunRecord = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: loaded[0]?.timestamp ?? new Date().toISOString(),
            models,
            theoremCount: theoremIds.size,
            validCount,
            invalidCount,
            errorCount,
            fileName: file.name,
          };

          const updated = [record, ...history];
          setHistory(updated);
          saveHistory(updated);
        } catch {
          setLoadError("Failed to parse results JSON file.");
        }
      };
      reader.readAsText(file);

      // Reset so same file can be re-selected
      e.target.value = "";
    },
    [history]
  );

  const handleLoadRun = useCallback((_run: RunRecord) => {
    // In a static app we cannot reload the file contents from a record.
    // Show a hint to re-load the file.
    setLoadError("Re-select the results file using the file picker above.");
  }, []);

  const handleDeleteRun = useCallback(
    (id: string) => {
      const updated = history.filter((r) => r.id !== id);
      setHistory(updated);
      saveHistory(updated);
    },
    [history]
  );

  return (
    <div className="runner-page">
      <div className="runner-header">
        <h2>Benchmark Runner</h2>
        <p>Configure and launch PropBench benchmark runs.</p>
      </div>

      <div className="runner-layout">
        {/* Left column: config */}
        <div className="runner-left">
          <RunConfig
            config={config}
            onChange={setConfig}
            running={false}
            onStart={handleStart}
          />
        </div>

        {/* Right column: progress + history */}
        <div className="runner-right">
          <RunProgress
            command={command}
            results={results}
            totalExpected={null}
          />

          {/* File picker for loading results */}
          <div className="results-loader">
            <h3 className="results-loader-title">Load Results</h3>
            <div className="file-picker">
              <label>
                Load results JSON
                <input
                  type="file"
                  accept=".json"
                  onChange={handleLoadResults}
                />
              </label>
            </div>
            {loadError && (
              <p className="results-loader-error">{loadError}</p>
            )}
          </div>

          <RunHistory
            runs={history}
            onLoad={handleLoadRun}
            onDelete={handleDeleteRun}
          />
        </div>
      </div>
    </div>
  );
}

export default BenchmarkRunner;
