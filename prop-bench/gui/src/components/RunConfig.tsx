import { useState } from "react";

export interface RunConfigValues {
  models: string[];
  theoremsPath: string;
  temperature: number;
  maxTokens: number;
  startIndex: number;
  count: string;
  propbenchBin: string;
  outputDir: string;
}

const MODEL_OPTIONS = [
  { key: "gemini", label: "Gemini", envVar: "GEMINI_API_KEY", model: "gemini-2.0-flash" },
  { key: "claude", label: "Claude", envVar: "ANTHROPIC_API_KEY", model: "claude-sonnet-4-5-20250929" },
  { key: "gpt", label: "GPT", envVar: "OPENAI_API_KEY", model: "gpt-4o" },
] as const;

interface RunConfigProps {
  config: RunConfigValues;
  onChange: (config: RunConfigValues) => void;
  running: boolean;
  onStart: () => void;
}

function RunConfig({ config, onChange, running, onStart }: RunConfigProps) {
  const [apiKeyStatus] = useState<Record<string, boolean>>(() => {
    // In a browser environment we cannot read env vars.
    // This is a placeholder; status is unknown.
    return { gemini: false, claude: false, gpt: false };
  });

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
                className={`api-dot ${apiKeyStatus[m.key] ? "api-dot--ok" : "api-dot--missing"}`}
                title={`${m.envVar}: ${apiKeyStatus[m.key] ? "set" : "not detected (check terminal env)"}`}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Theorem file */}
      <div className="config-section">
        <label className="config-label" htmlFor="cfg-theorems">Theorem file</label>
        <input
          id="cfg-theorems"
          className="config-input"
          type="text"
          value={config.theoremsPath}
          onChange={(e) => onChange({ ...config, theoremsPath: e.target.value })}
          disabled={running}
        />
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
          onChange={(e) => onChange({ ...config, temperature: parseFloat(e.target.value) })}
          disabled={running}
        />
      </div>

      {/* Max tokens */}
      <div className="config-section">
        <label className="config-label" htmlFor="cfg-tokens">Max tokens</label>
        <input
          id="cfg-tokens"
          className="config-input config-input--sm"
          type="number"
          min={256}
          max={32768}
          value={config.maxTokens}
          onChange={(e) => onChange({ ...config, maxTokens: parseInt(e.target.value, 10) || 4096 })}
          disabled={running}
        />
      </div>

      {/* Theorem range */}
      <div className="config-section config-section--row">
        <div>
          <label className="config-label" htmlFor="cfg-start">Start index</label>
          <input
            id="cfg-start"
            className="config-input config-input--sm"
            type="number"
            min={0}
            value={config.startIndex}
            onChange={(e) => onChange({ ...config, startIndex: parseInt(e.target.value, 10) || 0 })}
            disabled={running}
          />
        </div>
        <div>
          <label className="config-label" htmlFor="cfg-count">Count (blank = all)</label>
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

      {/* PropBench binary */}
      <div className="config-section">
        <label className="config-label" htmlFor="cfg-bin">PropBench binary</label>
        <input
          id="cfg-bin"
          className="config-input"
          type="text"
          value={config.propbenchBin}
          onChange={(e) => onChange({ ...config, propbenchBin: e.target.value })}
          disabled={running}
        />
      </div>

      {/* Output dir */}
      <div className="config-section">
        <label className="config-label" htmlFor="cfg-output">Output directory</label>
        <input
          id="cfg-output"
          className="config-input"
          type="text"
          value={config.outputDir}
          onChange={(e) => onChange({ ...config, outputDir: e.target.value })}
          disabled={running}
        />
      </div>

      {/* Start button */}
      <button
        className="btn-start"
        disabled={running || config.models.length === 0}
        onClick={onStart}
      >
        {running ? "Running..." : "Generate Command"}
      </button>
    </div>
  );
}

export default RunConfig;
