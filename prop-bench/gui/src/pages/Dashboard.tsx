import { useState, useEffect } from "react";
import type { BenchmarkReport } from "../types";
import {
  api,
  type DashboardOverview,
  type HeadToHeadCell,
  type LatencyStats,
  type FailureAnalysis,
  type AvgLinesByDifficulty,
} from "../api/client";
import RankingsTable from "../components/RankingsTable";
import DifficultyBreakdown from "../components/DifficultyBreakdown";
import EloChart from "../components/EloChart";
import HeadToHeadMatrix from "../components/HeadToHeadMatrix";
import LatencyTable from "../components/LatencyTable";
import FailureChart from "../components/FailureChart";
import AvgLinesByDifficultyTable from "../components/AvgLinesByDifficultyTable";

function Dashboard() {
  // Overview data (loaded once on mount)
  const [overview, setOverview] = useState<DashboardOverview | null>(null);

  // Per-set detail data
  const [headToHead, setHeadToHead] = useState<HeadToHeadCell[]>([]);
  const [latencyStats, setLatencyStats] = useState<LatencyStats[]>([]);
  const [failures, setFailures] = useState<FailureAnalysis[]>([]);
  const [avgLinesByDifficulty, setAvgLinesByDifficulty] = useState<AvgLinesByDifficulty[]>([]);
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [selectedSet, setSelectedSet] = useState<string>("");

  // Fallback state (when DB is unavailable)
  const [dbAvailable, setDbAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // Load overview on mount
  useEffect(() => {
    api
      .getDashboardOverview()
      .then(setOverview)
      .catch(() => {
        setDbAvailable(false);
      });
  }, []);

  // When overview loads, auto-select first set with results
  useEffect(() => {
    if (overview && overview.sets.length > 0) {
      const firstSet = overview.sets.find((s) => s.result_count > 0);
      if (firstSet) setSelectedSet(firstSet.name);
    }
  }, [overview]);

  // When set changes, load detail data
  useEffect(() => {
    if (!selectedSet) return;
    api.getHeadToHead(selectedSet).then(setHeadToHead).catch(() => setHeadToHead([]));
    api.getLatencyStats(selectedSet).then(setLatencyStats).catch(() => setLatencyStats([]));
    api.getFailureAnalysis(selectedSet).then(setFailures).catch(() => setFailures([]));
    api.getAvgLinesByDifficulty(selectedSet).then(setAvgLinesByDifficulty).catch(() => setAvgLinesByDifficulty([]));
    api
      .getRun(selectedSet)
      .then((d) => setReport(d.summary as unknown as BenchmarkReport))
      .catch(() => setReport(null));
  }, [selectedSet]);

  // ─── Fallback: file upload when DB is unavailable ───────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setLoading(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string) as BenchmarkReport;
        if (!data.rankings || !data.models) {
          setError("Invalid report format: missing rankings or models.");
          setReport(null);
          return;
        }
        setReport(data);
      } catch {
        setError("Failed to parse JSON file.");
        setReport(null);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  // ─── Fallback UI (no DB) ────────────────────────────────────────────
  if (!dbAvailable) {
    return (
      <div>
        <div className="dashboard-header">
          <h2>PropBench Dashboard</h2>
          <p>Database unavailable — load a results file to view benchmark data.</p>
        </div>

        <div className="dashboard-controls">
          <div className="file-picker">
            <label>
              Load results.json
              <input type="file" accept=".json" onChange={handleFileChange} />
            </label>
          </div>
        </div>

        {loading && (
          <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>Loading...</p>
        )}
        {error && (
          <p style={{ color: "var(--error)", marginBottom: 24 }}>{error}</p>
        )}

        {!report && !error && !loading && (
          <div className="empty-state">
            <h3>No Report Loaded</h3>
            <p>Load a PropBench results JSON file or run a benchmark first.</p>
          </div>
        )}

        {report && (
          <>
            <div className="dashboard-stats">
              <div className="stat-card">
                <div className="stat-value">{report.models.length}</div>
                <div className="stat-label">Models</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{Object.keys(report.perTheorem).length}</div>
                <div className="stat-label">Theorems</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">
                  {report.models.reduce((s, m) => s + m.validCount, 0)}
                </div>
                <div className="stat-label">Valid Proofs</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">
                  {report.models.reduce((s, m) => s + m.invalidCount, 0)}
                </div>
                <div className="stat-label">Invalid Proofs</div>
              </div>
            </div>

            <div className="dashboard-section">
              <h3>Elo Ratings</h3>
              <EloChart report={report} />
            </div>
            <div className="dashboard-section">
              <h3>Model Rankings</h3>
              <RankingsTable report={report} />
            </div>
            <div className="dashboard-section">
              <h3>Results by Difficulty</h3>
              <DifficultyBreakdown report={report} />
            </div>
            <div className="dashboard-section" style={{ color: "var(--text-muted)", fontSize: "12px" }}>
              Report generated: {new Date(report.timestamp).toLocaleString()}
            </div>
          </>
        )}
      </div>
    );
  }

  // ─── Waiting for overview to load ───────────────────────────────────
  if (!overview) {
    return (
      <div>
        <div className="dashboard-header">
          <h2>PropBench Dashboard</h2>
          <p>Real-time benchmark analytics</p>
        </div>
        <p style={{ color: "var(--text-muted)" }}>Loading dashboard...</p>
      </div>
    );
  }

  // ─── Compute overview-level valid rate ──────────────────────────────
  const totalAttempted = overview.modelSummaries.reduce(
    (s, m) => s + m.total_attempted,
    0
  );
  const totalValid = overview.modelSummaries.reduce(
    (s, m) => s + m.total_valid,
    0
  );
  const overallValidRate =
    totalAttempted > 0 ? ((totalValid / totalAttempted) * 100).toFixed(1) : "0";

  const avgLatency =
    overview.modelSummaries.length > 0
      ? Math.round(
          overview.modelSummaries.reduce((s, m) => s + m.avg_latency_ms, 0) /
            overview.modelSummaries.length
        )
      : 0;

  // Sets that have results (for the selector)
  const setsWithResults = overview.sets.filter((s) => s.result_count > 0);

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="dashboard-header">
        <h2>PropBench Dashboard</h2>
        <p>Real-time benchmark analytics</p>
      </div>

      {/* ── Overview Stats Row ──────────────────────────────────────────── */}
      <div className="dashboard-stats">
        <div className="stat-card">
          <div className="stat-value">{overview.totalSets}</div>
          <div className="stat-label">Theorem Sets</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{overview.totalTheorems}</div>
          <div className="stat-label">Total Theorems</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{overview.totalResults}</div>
          <div className="stat-label">Total Results</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{overview.totalModels}</div>
          <div className="stat-label">Models Tested</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--success)" }}>
            {overallValidRate}%
          </div>
          <div className="stat-label">Overall Valid Rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {avgLatency.toLocaleString()}
            <span style={{ fontSize: "14px", color: "var(--text-muted)", marginLeft: 2 }}>
              ms
            </span>
          </div>
          <div className="stat-label">Avg Latency</div>
        </div>
      </div>

      {/* ── Model Comparison Cards ──────────────────────────────────────── */}
      {overview.modelSummaries.length > 0 && (
        <div className="dashboard-section">
          <h3>Model Comparison</h3>
          <div className="model-summary-cards">
            {overview.modelSummaries.map((m) => {
              const rate = Math.round(m.valid_rate);
              return (
                <div key={m.model_slug} className="model-summary-card">
                  <div className="model-name" title={m.model_display}>
                    {m.model_display}
                  </div>
                  <div className="valid-rate-big">{rate}%</div>
                  <div className="valid-rate-bar">
                    <div
                      className="valid-rate-bar-fill"
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                  <div className="model-detail-row">
                    <span>Attempted</span>
                    <span className="model-detail-value">
                      {m.total_attempted.toLocaleString()}
                    </span>
                  </div>
                  <div className="model-detail-row">
                    <span>Avg Latency</span>
                    <span className="model-detail-value">
                      {Math.round(m.avg_latency_ms).toLocaleString()} ms
                    </span>
                  </div>
                  <div className="model-detail-row">
                    <span>Avg Lines</span>
                    <span className="model-detail-value">
                      {m.avg_lines != null ? m.avg_lines.toFixed(1) : "--"}
                    </span>
                  </div>
                  <div className="model-detail-row">
                    <span>Total Tokens</span>
                    <span className="model-detail-value">
                      {m.total_tokens.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Set Selector ────────────────────────────────────────────────── */}
      {setsWithResults.length > 0 && (
        <div className="dashboard-controls">
          <div className="run-picker">
            <label className="run-picker-label">Theorem Set</label>
            <select
              className="difficulty-filter"
              value={selectedSet}
              onChange={(e) => setSelectedSet(e.target.value)}
            >
              {setsWithResults.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.result_count} results, {s.models.length} models)
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── Head-to-Head Wins Matrix ────────────────────────────────────── */}
      {selectedSet && (
        <div className="dashboard-section">
          <h3>Head-to-Head Wins</h3>
          <HeadToHeadMatrix data={headToHead} />
        </div>
      )}

      {/* ── Avg Lines by Difficulty ───────────────────────────────────────── */}
      {selectedSet && (
        <div className="dashboard-section">
          <h3>Avg Proof Length by Difficulty</h3>
          <AvgLinesByDifficultyTable data={avgLinesByDifficulty} />
        </div>
      )}

      {/* ── Latency Comparison ──────────────────────────────────────────── */}
      {selectedSet && (
        <div className="dashboard-section">
          <h3>Latency Comparison</h3>
          <LatencyTable data={latencyStats} />
        </div>
      )}

      {/* ── Failure Analysis ────────────────────────────────────────────── */}
      {selectedSet && (
        <div className="dashboard-section">
          <h3>Failure Analysis</h3>
          <FailureChart data={failures} />
        </div>
      )}

      {/* ── Existing detail sections (from run report) ──────────────────── */}
      {report && (
        <>
          <div className="dashboard-section">
            <h3>Elo Ratings</h3>
            <EloChart report={report} />
          </div>

          <div className="dashboard-section">
            <h3>Model Rankings</h3>
            <RankingsTable report={report} />
          </div>

          <div className="dashboard-section">
            <h3>Results by Difficulty</h3>
            <DifficultyBreakdown report={report} />
          </div>
        </>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div
        className="dashboard-section"
        style={{ color: "var(--text-muted)", fontSize: "12px" }}
      >
        Last updated: {new Date().toLocaleString()}
      </div>
    </div>
  );
}

export default Dashboard;
