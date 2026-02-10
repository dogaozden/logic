import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { TheoremSetInfo, IndividualRun } from "../api/client";

export interface RunConfigValues {
  models: string[];
  theoremSet: string;
  temperature: number;
  maxTokens: number | null;
  workers: number | null;
  startIndex: number | null;
  count: string;
  force: boolean;
  noRetryParse: boolean;
  runs: number;
  continueRunId: number | null;
}

const MODEL_OPTIONS = [
  { key: "gemini-2.5-pro", label: "Gemini 2.5 Pro", envVar: "GEMINI_API_KEY" },
  { key: "gemini-2.5-flash", label: "Gemini 2.5 Flash", envVar: "GEMINI_API_KEY" },
  { key: "gemini-2.5-flash-lite-preview-09-2025", label: "Gemini 2.5 Flash Lite", envVar: "GEMINI_API_KEY" },
  { key: "gemini-3-flash-preview", label: "Gemini 3 Flash", envVar: "GEMINI_API_KEY" },
  { key: "gemini-3-pro-preview", label: "Gemini 3 Pro", envVar: "GEMINI_API_KEY" },
  { key: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5", envVar: "ANTHROPIC_API_KEY" },
  { key: "gpt-4o", label: "GPT-4o", envVar: "OPENAI_API_KEY" },
] as const;

interface RunConfigProps {
  config: RunConfigValues;
  onChange: (config: RunConfigValues) => void;
  running: boolean;
  onStart: () => void;
}

function buildCommand(cfg: RunConfigValues): string {
  const parts: string[] = ["npx ts-node harness.ts"];
  parts.push(`--theorems ${cfg.theoremSet}`);
  parts.push(`--models ${cfg.models.join(",")}`);
  parts.push(`--temperature ${cfg.temperature}`);
  if (cfg.maxTokens != null) {
    parts.push(`--max-tokens ${cfg.maxTokens}`);
  }
  if (cfg.workers != null && cfg.workers > 1) {
    parts.push(`--workers ${cfg.workers}`);
  }
  if (cfg.startIndex != null && cfg.startIndex > 0) {
    parts.push(`--start ${cfg.startIndex}`);
  }
  if (cfg.count.trim() !== "") {
    parts.push(`--count ${cfg.count.trim()}`);
  }
  if (cfg.force) {
    parts.push("--force");
  }
  if (cfg.noRetryParse) {
    parts.push("--no-retry-parse");
  }
  if (cfg.runs > 1) {
    parts.push(`--runs ${cfg.runs}`);
  }
  return parts.join(" \\\n  ");
}

function RunConfig({ config, onChange, running, onStart }: RunConfigProps) {
  const [theoremSets, setTheoremSets] = useState<TheoremSetInfo[]>([]);
  const [showCommand, setShowCommand] = useState(false);
  const [incompleteRuns, setIncompleteRuns] = useState<IndividualRun[]>([]);
  const [continueMode, setContinueMode] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getTheoremSets().catch(() => [] as TheoremSetInfo[]),
      api.getRuns().catch(() => []),
    ]).then(([sets, runs]) => {
      setTheoremSets(sets);
      if (sets.length > 0) {
        // Pick the set with the most recent run
        const setNames = new Set(sets.map((s) => s.name));
        let latestSet = "";
        let latestTime = "";
        for (const run of runs) {
          const setName = run.runId.split("/")[0];
          if (setNames.has(setName) && run.timestamp && run.timestamp > latestTime) {
            latestTime = run.timestamp;
            latestSet = setName;
          }
        }
        const best = latestSet || sets.find((s) => s.count > 0)?.name || sets[0].name;
        onChange({ ...config, theoremSet: best });
      }
    });
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch incomplete runs when continue mode is enabled
  useEffect(() => {
    if (continueMode) {
      api.getIndividualRuns().then((runs) => {
        setIncompleteRuns(runs.filter((r) => r.status === "Incomplete"));
      }).catch(() => setIncompleteRuns([]));
    }
  }, [continueMode]);

  const handleContinueModeToggle = (enabled: boolean) => {
    setContinueMode(enabled);
    if (!enabled) {
      onChange({ ...config, continueRunId: null });
    }
  };

  const handleContinueRunSelect = (runId: number) => {
    onChange({ ...config, continueRunId: runId });
  };

  const selectedContinueRun = incompleteRuns.find((r) => r.runId === config.continueRunId);
  const continueLocked = continueMode && config.continueRunId != null;

  const toggleModel = (key: string) => {
    const next = config.models.includes(key)
      ? config.models.filter((m) => m !== key)
      : [...config.models, key];
    onChange({ ...config, models: next });
  };

  return (
    <div className="run-config">
      <h3 className="run-config-title">Run Configuration</h3>

      {/* Continue incomplete run */}
      <div className="config-section">
        <label className="model-checkbox">
          <input
            type="checkbox"
            checked={continueMode}
            onChange={(e) => handleContinueModeToggle(e.target.checked)}
            disabled={running}
          />
          <span className="model-checkbox-name">Continue incomplete run</span>
          <span className="model-checkbox-detail">Resume a previously interrupted run</span>
        </label>

        {continueMode && (
          <div style={{ marginTop: "0.5rem" }}>
            {incompleteRuns.length === 0 ? (
              <div className="config-detail">No incomplete runs found</div>
            ) : (
              <>
                <select
                  className="config-input"
                  value={config.continueRunId ?? ""}
                  onChange={(e) => handleContinueRunSelect(parseInt(e.target.value, 10))}
                  disabled={running}
                >
                  <option value="" disabled>Select an incomplete run...</option>
                  {incompleteRuns.map((r) => (
                    <option key={r.runId} value={r.runId}>
                      #{r.runId} — {r.modelDisplay} on {r.setName} ({r.stats.total} done, {r.startedAt.slice(0, 16).replace("T", " ")})
                    </option>
                  ))}
                </select>

                {selectedContinueRun && (
                  <div className="continue-run-info" style={{ marginTop: "0.5rem", padding: "0.5rem", background: "var(--surface-2, #1a1a2e)", borderRadius: "6px", fontSize: "0.85rem" }}>
                    <div><strong>Model:</strong> {selectedContinueRun.modelDisplay}</div>
                    <div><strong>Theorem set:</strong> {selectedContinueRun.setName}</div>
                    <div><strong>Temperature:</strong> {selectedContinueRun.temperature}</div>
                    <div><strong>Max tokens:</strong> {selectedContinueRun.maxTokens}</div>
                    <div><strong>Progress:</strong> {selectedContinueRun.stats.total} theorems completed ({selectedContinueRun.stats.valid} valid, {selectedContinueRun.stats.invalid} invalid, {selectedContinueRun.stats.errors} errors)</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Model selection */}
      <div className="config-section">
        <label className="config-label">Models</label>
        <div className="model-checkboxes">
          {MODEL_OPTIONS.map((m) => (
            <label key={m.key} className="model-checkbox">
              <input
                type="checkbox"
                checked={config.models.includes(m.key)}
                onChange={() => toggleModel(m.key)}
                disabled={running || continueLocked}
              />
              <span className="model-checkbox-name">{m.label}</span>
              <span className="model-checkbox-detail">{m.key}</span>
              <span
                className="api-dot api-dot--missing"
                title={`${m.envVar}: check server env`}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Theorem set picker */}
      <div className="config-section">
        <label className="config-label" htmlFor="cfg-theorem-set">
          Theorem set
        </label>
        {theoremSets.length > 0 ? (
          <select
            id="cfg-theorem-set"
            className="config-input"
            value={config.theoremSet}
            onChange={(e) => onChange({ ...config, theoremSet: e.target.value })}
            disabled={running || continueLocked}
          >
            {theoremSets.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.count} theorems)
              </option>
            ))}
          </select>
        ) : (
          <input
            id="cfg-theorem-set"
            className="config-input"
            type="text"
            value={config.theoremSet}
            onChange={(e) => onChange({ ...config, theoremSet: e.target.value })}
            disabled={running || continueLocked}
            placeholder="v1"
          />
        )}
      </div>

      {/* Temperature */}
      <div className="config-section">
        <label className="config-label" htmlFor="cfg-temp">
          Temperature: {config.temperature.toFixed(2)}
        </label>
        <input
          id="cfg-temp"
          className="config-slider"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={config.temperature}
          onChange={(e) =>
            onChange({ ...config, temperature: parseFloat(e.target.value) })
          }
          disabled={running || continueLocked}
        />
      </div>

      {/* Max tokens */}
      <div className="config-section">
        <label className="config-label" htmlFor="cfg-tokens">
          Max tokens
        </label>
        <input
          id="cfg-tokens"
          className="config-input config-input--sm"
          type="number"
          min={256}
          max={32768}
          value={config.maxTokens ?? ""}
          onChange={(e) =>
            onChange({
              ...config,
              maxTokens: e.target.value === "" ? null : parseInt(e.target.value, 10),
            })
          }
          disabled={running || continueLocked}
          placeholder="default"
        />
      </div>

      {/* Parallel workers */}
      <div className="config-section">
        <label className="config-label" htmlFor="cfg-workers">
          Parallel workers
        </label>
        <input
          id="cfg-workers"
          className="config-input config-input--sm"
          type="number"
          min={1}
          max={10}
          value={config.workers ?? ""}
          onChange={(e) =>
            onChange({
              ...config,
              workers: e.target.value === "" ? null : parseInt(e.target.value, 10),
            })
          }
          disabled={running}
          placeholder="1"
        />
      </div>

      {/* Theorem range */}
      <div className="config-section config-section--row">
        <div>
          <label className="config-label" htmlFor="cfg-start">
            Start index
          </label>
          <input
            id="cfg-start"
            className="config-input config-input--sm"
            type="number"
            min={0}
            value={config.startIndex ?? ""}
            onChange={(e) =>
              onChange({
                ...config,
                startIndex: e.target.value === "" ? null : parseInt(e.target.value, 10),
              })
            }
            disabled={running || continueLocked}
            placeholder="0"
          />
        </div>
        <div>
          <label className="config-label" htmlFor="cfg-count">
            Count (blank = all)
          </label>
          <input
            id="cfg-count"
            className="config-input config-input--sm"
            type="text"
            placeholder="all"
            value={config.count}
            onChange={(e) => onChange({ ...config, count: e.target.value })}
            disabled={running || continueLocked}
          />
        </div>
      </div>

      {/* Force new run */}
      <div className="config-section">
        <label className="model-checkbox">
          <input
            type="checkbox"
            checked={config.force}
            onChange={(e) => onChange({ ...config, force: e.target.checked })}
            disabled={running || continueLocked}
          />
          <span className="model-checkbox-name">Force new run</span>
          <span className="model-checkbox-detail">Don't skip completed theorems</span>
        </label>
        <label className="model-checkbox">
          <input
            type="checkbox"
            checked={config.noRetryParse}
            onChange={(e) => onChange({ ...config, noRetryParse: e.target.checked })}
            disabled={running || continueLocked}
          />
          <span className="model-checkbox-name">Don't retry parse errors</span>
          <span className="model-checkbox-detail">Treat unparseable output as final</span>
        </label>
      </div>

      {/* Sequential runs */}
      <div className="config-section">
        <label className="config-label" htmlFor="cfg-runs">
          Sequential Runs
        </label>
        <input
          id="cfg-runs"
          className="config-input config-input--sm"
          type="number"
          min={1}
          max={100}
          value={config.runs}
          onChange={(e) =>
            onChange({
              ...config,
              runs: Math.max(1, parseInt(e.target.value, 10) || 1),
            })
          }
          disabled={running || continueLocked}
          placeholder="1"
        />
        <span className="config-detail">Run the benchmark N times back-to-back</span>
      </div>

      {/* Start button */}
      <button
        className="btn-start"
        disabled={running || (continueLocked ? false : config.models.length === 0) || (continueMode && config.continueRunId == null)}
        onClick={onStart}
      >
        {running ? "Running..." : continueLocked ? "Continue Run" : "Start Benchmark"}
      </button>

      {/* CLI command reference (collapsible) */}
      <button
        className="btn-toggle-command"
        onClick={() => setShowCommand((v) => !v)}
      >
        {showCommand ? "Hide" : "Show"} CLI command
      </button>
      {showCommand && (
        <div className="command-block">
          <div className="command-block-header">
            <span>CLI Command</span>
            <button
              className="btn-copy"
              onClick={() =>
                navigator.clipboard.writeText(buildCommand(config))
              }
            >
              Copy
            </button>
          </div>
          <pre className="command-text">{buildCommand(config)}</pre>
        </div>
      )}
    </div>
  );
}

export default RunConfig;
