import { useState } from "react";
import { api } from "../api/client";
import type { DifficultySpec, BaseComplexity } from "../types";

interface GenerateTheoremsProps {
  onClose: () => void;
  onGenerated: (setName: string) => void;
}

type GenerateMode = "distribution" | "tier" | "custom";

const DEFAULT_TOTAL = 100;
const DEFAULT_DIST = {
  easy: 30,
  medium: 30,
  hard: 20,
  expert: 15,
  nightmare: 5,
};

const TIER_OPTIONS = [
  "easy", "medium", "hard", "expert", "nightmare",
  "marathon", "absurd", "cosmic", "mind",
] as const;

const TIER_PRESETS: Record<string, DifficultySpec> = {
  easy:      { variables: 2,  passes: 1,  transforms_per_pass: 2,  base_complexity: "simple",  substitution_depth: 0 },
  medium:    { variables: 3,  passes: 1,  transforms_per_pass: 5,  base_complexity: "simple",  substitution_depth: 0 },
  hard:      { variables: 4,  passes: 1,  transforms_per_pass: 10, base_complexity: "complex", substitution_depth: 0 },
  expert:    { variables: 5,  passes: 1,  transforms_per_pass: 15, base_complexity: "complex", substitution_depth: 2 },
  nightmare: { variables: 5,  passes: 2,  transforms_per_pass: 12, base_complexity: "complex", substitution_depth: 3 },
  marathon:  { variables: 5,  passes: 3,  transforms_per_pass: 15, base_complexity: "complex", substitution_depth: 4 },
  absurd:    { variables: 8,  passes: 5,  transforms_per_pass: 20, base_complexity: "complex", substitution_depth: 4 },
  cosmic:    { variables: 15, passes: 10, transforms_per_pass: 20, base_complexity: "complex", substitution_depth: 4 },
  mind:      { variables: 20, passes: 20, transforms_per_pass: 24, base_complexity: "complex", substitution_depth: 4 },
};

export default function GenerateTheorems({
  onClose,
  onGenerated,
}: GenerateTheoremsProps) {
  const [name, setName] = useState("");
  const [total, setTotal] = useState(DEFAULT_TOTAL);
  const [mode, setMode] = useState<GenerateMode>("distribution");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  // Distribution mode state
  const [dist, setDist] = useState({ ...DEFAULT_DIST });

  // Tier mode state
  const [tier, setTier] = useState("easy");

  // Custom spec mode state
  const [spec, setSpec] = useState<DifficultySpec>({
    variables: 3,
    passes: 1,
    transforms_per_pass: 5,
    base_complexity: "simple",
    substitution_depth: 0,
  });

  const sum = dist.easy + dist.medium + dist.hard + dist.expert + dist.nightmare;

  const isValid = (() => {
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || total < 1) return false;
    if (mode === "distribution") return sum === total;
    return true;
  })();

  const handleGenerate = async () => {
    if (!isValid) return;
    setGenerating(true);
    setError("");

    try {
      if (mode === "distribution") {
        const distribution = [
          `${dist.easy}:easy`,
          `${dist.medium}:medium`,
          `${dist.hard}:hard`,
          `${dist.expert}:expert`,
          `${dist.nightmare}:nightmare`,
        ].join(",");
        await api.generate({ count: total, distribution, name });
      } else if (mode === "tier") {
        await api.generate({ count: total, tier, name });
      } else {
        await api.generate({ count: total, spec, name });
      }
      onGenerated(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleDistChange = (t: keyof typeof dist, value: number) => {
    setDist((prev) => ({ ...prev, [t]: Math.max(0, value) }));
  };

  const tierPreview = TIER_PRESETS[tier];

  return (
    <div className="generate-modal-backdrop" onClick={onClose}>
      <div
        className="generate-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="generate-modal-header">
          <h3>Generate New Theorem Set</h3>
          <button className="generate-modal-close" onClick={onClose}>
            X
          </button>
        </div>

        <div className="generate-form">
          <label className="generate-field">
            <span className="generate-label">Set Name</span>
            <input
              type="text"
              className="theorem-search"
              placeholder="e.g. v2, test-set"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={generating}
            />
            {name && !/^[a-zA-Z0-9_-]+$/.test(name) && (
              <span className="generate-error">
                Alphanumeric, dashes, and underscores only
              </span>
            )}
          </label>

          <label className="generate-field">
            <span className="generate-label">Total Count</span>
            <input
              type="number"
              className="theorem-search"
              min={1}
              value={total}
              onChange={(e) => setTotal(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={generating}
            />
          </label>

          {/* Mode selector tabs */}
          <div className="generate-field">
            <span className="generate-label">Generation Mode</span>
            <div className="generate-mode-tabs">
              {(["distribution", "tier", "custom"] as const).map((m) => (
                <button
                  key={m}
                  className={`generate-mode-tab${mode === m ? " generate-mode-tab--active" : ""}`}
                  onClick={() => setMode(m)}
                  disabled={generating}
                >
                  {m === "distribution" ? "Distribution" : m === "tier" ? "Tier Preset" : "Custom Spec"}
                </button>
              ))}
            </div>
          </div>

          {/* Distribution mode */}
          {mode === "distribution" && (
            <div className="generate-field">
              <span className="generate-label">Difficulty Distribution</span>
              <div className="generate-dist-grid">
                {(
                  ["easy", "medium", "hard", "expert", "nightmare"] as const
                ).map((t) => (
                  <label key={t} className="generate-dist-item">
                    <span className={`difficulty-badge difficulty-badge--${t}`}>
                      {t}
                    </span>
                    <input
                      type="number"
                      className="theorem-search generate-dist-input"
                      min={0}
                      value={dist[t]}
                      onChange={(e) =>
                        handleDistChange(t, parseInt(e.target.value) || 0)
                      }
                      disabled={generating}
                    />
                  </label>
                ))}
              </div>
              <div
                className="generate-dist-sum"
                style={{ color: sum === total ? "var(--success)" : "var(--error)" }}
              >
                Sum: {sum} / {total}
                {sum !== total && " (must equal total)"}
              </div>
            </div>
          )}

          {/* Tier mode */}
          {mode === "tier" && (
            <div className="generate-field">
              <span className="generate-label">Difficulty Tier</span>
              <select
                className="difficulty-filter"
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                disabled={generating}
                style={{ width: "100%", marginBottom: 12 }}
              >
                {TIER_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
              {tierPreview && (
                <div className="generate-spec-preview">
                  <div className="generate-spec-row">
                    <span className="generate-spec-label">Variables</span>
                    <span className="generate-spec-value">{tierPreview.variables}</span>
                  </div>
                  <div className="generate-spec-row">
                    <span className="generate-spec-label">Passes</span>
                    <span className="generate-spec-value">{tierPreview.passes}</span>
                  </div>
                  <div className="generate-spec-row">
                    <span className="generate-spec-label">Transforms/pass</span>
                    <span className="generate-spec-value">{tierPreview.transforms_per_pass}</span>
                  </div>
                  <div className="generate-spec-row">
                    <span className="generate-spec-label">Base complexity</span>
                    <span className="generate-spec-value">{tierPreview.base_complexity}</span>
                  </div>
                  <div className="generate-spec-row">
                    <span className="generate-spec-label">Substitution depth</span>
                    <span className="generate-spec-value">{tierPreview.substitution_depth}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Custom spec mode */}
          {mode === "custom" && (
            <div className="generate-field">
              <span className="generate-label">Custom Spec</span>
              <div className="generate-spec-grid">
                <label className="generate-spec-input-item">
                  <span className="generate-spec-label">Variables (2-20)</span>
                  <input
                    type="number"
                    className="theorem-search"
                    min={2}
                    max={20}
                    value={spec.variables}
                    onChange={(e) =>
                      setSpec((s) => ({ ...s, variables: Math.max(2, Math.min(20, parseInt(e.target.value) || 2)) }))
                    }
                    disabled={generating}
                  />
                </label>
                <label className="generate-spec-input-item">
                  <span className="generate-spec-label">Passes (1-20)</span>
                  <input
                    type="number"
                    className="theorem-search"
                    min={1}
                    max={20}
                    value={spec.passes}
                    onChange={(e) =>
                      setSpec((s) => ({ ...s, passes: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) }))
                    }
                    disabled={generating}
                  />
                </label>
                <label className="generate-spec-input-item">
                  <span className="generate-spec-label">Transforms/pass (1-24)</span>
                  <input
                    type="number"
                    className="theorem-search"
                    min={1}
                    max={24}
                    value={spec.transforms_per_pass}
                    onChange={(e) =>
                      setSpec((s) => ({ ...s, transforms_per_pass: Math.max(1, Math.min(24, parseInt(e.target.value) || 1)) }))
                    }
                    disabled={generating}
                  />
                </label>
                <label className="generate-spec-input-item">
                  <span className="generate-spec-label">Base complexity</span>
                  <div className="generate-radio-group">
                    {(["simple", "complex"] as const).map((bc) => (
                      <label key={bc} className="generate-radio-item">
                        <input
                          type="radio"
                          name="base_complexity"
                          checked={spec.base_complexity === bc}
                          onChange={() =>
                            setSpec((s) => ({ ...s, base_complexity: bc as BaseComplexity }))
                          }
                          disabled={generating}
                        />
                        <span>{bc}</span>
                      </label>
                    ))}
                  </div>
                </label>
                <label className="generate-spec-input-item">
                  <span className="generate-spec-label">Substitution depth (0-4)</span>
                  <input
                    type="number"
                    className="theorem-search"
                    min={0}
                    max={4}
                    value={spec.substitution_depth}
                    onChange={(e) =>
                      setSpec((s) => ({ ...s, substitution_depth: Math.max(0, Math.min(4, parseInt(e.target.value) || 0)) }))
                    }
                    disabled={generating}
                  />
                </label>
              </div>
            </div>
          )}

          {error && (
            <div className="generate-error" style={{ marginTop: 8 }}>
              {error}
            </div>
          )}

          <div className="generate-actions">
            <button
              className="generate-btn generate-btn--secondary"
              onClick={onClose}
              disabled={generating}
            >
              Cancel
            </button>
            <button
              className="generate-btn generate-btn--primary"
              onClick={handleGenerate}
              disabled={!isValid || generating}
            >
              {generating ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
