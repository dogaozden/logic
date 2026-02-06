import { useState } from "react";
import { api } from "../api/client";

interface GenerateTheoremsProps {
  onClose: () => void;
  onGenerated: (setName: string) => void;
}

const DEFAULT_TOTAL = 100;
const DEFAULT_DIST = {
  easy: 30,
  medium: 30,
  hard: 20,
  expert: 15,
  nightmare: 5,
};

export default function GenerateTheorems({
  onClose,
  onGenerated,
}: GenerateTheoremsProps) {
  const [name, setName] = useState("");
  const [total, setTotal] = useState(DEFAULT_TOTAL);
  const [dist, setDist] = useState({ ...DEFAULT_DIST });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const sum = dist.easy + dist.medium + dist.hard + dist.expert + dist.nightmare;
  const isValid =
    name.length > 0 &&
    /^[a-zA-Z0-9_-]+$/.test(name) &&
    total > 0 &&
    sum === total;

  const handleGenerate = async () => {
    if (!isValid) return;
    setGenerating(true);
    setError("");

    const distribution = [
      `${dist.easy}:easy`,
      `${dist.medium}:medium`,
      `${dist.hard}:hard`,
      `${dist.expert}:expert`,
      `${dist.nightmare}:nightmare`,
    ].join(",");

    try {
      await api.generate({ count: total, distribution, name });
      onGenerated(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleDistChange = (tier: keyof typeof dist, value: number) => {
    setDist((prev) => ({ ...prev, [tier]: Math.max(0, value) }));
  };

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

          <div className="generate-field">
            <span className="generate-label">Difficulty Distribution</span>
            <div className="generate-dist-grid">
              {(
                ["easy", "medium", "hard", "expert", "nightmare"] as const
              ).map((tier) => (
                <label key={tier} className="generate-dist-item">
                  <span className={`difficulty-badge difficulty-badge--${tier}`}>
                    {tier}
                  </span>
                  <input
                    type="number"
                    className="theorem-search generate-dist-input"
                    min={0}
                    value={dist[tier]}
                    onChange={(e) =>
                      handleDistChange(tier, parseInt(e.target.value) || 0)
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
