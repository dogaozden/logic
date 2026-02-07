import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { TheoremSetInfo } from "../api/client";

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
}

const MODEL_OPTIONS = [
  { key: "gemini", label: "Gemini Flash Lite", envVar: "GEMINI_API_KEY", model: "gemini-2.5-flash-lite-preview-09-2025" },
  { key: "gemini-3-flash", label: "Gemini 3 Flash", envVar: "GEMINI_API_KEY", model: "gemini-3-flash-preview" },
  { key: "gemini-3-pro", label: "Gemini 3 Pro", envVar: "GEMINI_API_KEY", model: "gemini-3-pro-preview" },
  { key: "claude", label: "Claude", envVar: "ANTHROPIC_API_KEY", model: "claude-sonnet-4-5-20250929" },
  { key: "gpt", label: "GPT", envVar: "OPENAI_API_KEY", model: "gpt-4o" },
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
  return parts.join(" \\\n  ");
}

function RunConfig({ config, onChange, running, onStart }: RunConfigProps) {
  const [theoremSets, setTheoremSets] = useState<TheoremSetInfo[]>([]);
  const [showCommand, setShowCommand] = useState(false);

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

  const toggleModel = (key: string) => {
    const next = config.models.includes(key)
      ? config.models.filter((m) => m !== key)
      : [...config.models, key];
    onChange({ ...config, models: next });
  };

  return (
    <div className="run-config">
      <h3 className="run-config-title">Run Configuration</h3>

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
                disabled={running}
              />
              <span className="model-checkbox-name">{m.label}</span>
              <span className="model-checkbox-detail">{m.model}</span>
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
            disabled={running}
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
            disabled={running}
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
          disabled={running}
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
          disabled={running}
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
            disabled={running}
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
            disabled={running}
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
            disabled={running}
          />
          <span className="model-checkbox-name">Force new run</span>
          <span className="model-checkbox-detail">Don't skip completed theorems</span>
        </label>
        <label className="model-checkbox">
          <input
            type="checkbox"
            checked={config.noRetryParse}
            onChange={(e) => onChange({ ...config, noRetryParse: e.target.checked })}
            disabled={running}
          />
          <span className="model-checkbox-name">Don't retry parse errors</span>
          <span className="model-checkbox-detail">Treat unparseable output as final</span>
        </label>
      </div>

      {/* Start button */}
      <button
        className="btn-start"
        disabled={running || config.models.length === 0}
        onClick={onStart}
      >
        {running ? "Running..." : "Start Benchmark"}
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
