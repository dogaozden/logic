import { useState, useEffect } from "react";
import type { BenchmarkReport } from "../types";
import { api, type RunInfo } from "../api/client";
import RankingsTable from "../components/RankingsTable";
import DifficultyBreakdown from "../components/DifficultyBreakdown";
import EloChart from "../components/EloChart";

function Dashboard() {
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // Load available runs on mount
  useEffect(() => {
    loadRuns();
  }, []);

  const loadRuns = async () => {
    try {
      const data = await api.getRuns();
      setRuns(data);
      // Auto-select the most recent run
      if (data.length > 0 && !selectedRunId) {
        const mostRecent = data[0];
        setSelectedRunId(mostRecent.runId);
        loadRunResults(mostRecent.runId);
      }
    } catch (err) {
      // Silently fail — the user can still use the file picker
    }
  };

  const loadRunResults = async (runId: string) => {
    setLoading(true);
    setError("");
    try {
      const detail = await api.getRun(runId);
      const data = detail.summary as unknown as BenchmarkReport;
      if (!data.rankings || !data.models) {
        setError("Invalid report format: missing rankings or models.");
        setReport(null);
        return;
      }
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRunChange = (runId: string) => {
    setSelectedRunId(runId);
    if (runId) {
      loadRunResults(runId);
    } else {
      setReport(null);
    }
  };

  // Fallback file picker
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedRunId("");
    setError("");

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
      }
    };
    reader.readAsText(file);
  };

  // Compute aggregate stats from the report
  const totalTheorems = report
    ? Object.keys(report.perTheorem).length
    : 0;
  const totalModels = report ? report.models.length : 0;
  const totalValid = report
    ? report.models.reduce((sum, m) => sum + m.validCount, 0)
    : 0;
  const totalInvalid = report
    ? report.models.reduce((sum, m) => sum + m.invalidCount, 0)
    : 0;

  return (
    <div>
      <div className="dashboard-header">
        <h2>Dashboard</h2>
        <p>View benchmark results from past runs or load a results file.</p>
      </div>

      <div className="dashboard-controls">
        {runs.length > 0 && (
          <div className="run-picker">
            <label className="run-picker-label">Select Run</label>
            <select
              className="difficulty-filter"
              value={selectedRunId}
              onChange={(e) => handleRunChange(e.target.value)}
            >
              <option value="">-- Select a run --</option>
              {runs.map((r) => (
                <option key={r.runId} value={r.runId}>
                  {r.runId}
                  {r.timestamp
                    ? ` (${new Date(r.timestamp).toLocaleDateString()})`
                    : ""}
                  {r.models.length > 0 ? ` — ${r.models.join(", ")}` : ""}
                </option>
              ))}
            </select>
            <button
              className="generate-btn generate-btn--secondary"
              onClick={loadRuns}
              style={{ marginLeft: 8 }}
            >
              Refresh
            </button>
          </div>
        )}

        <div className="file-picker">
          <label>
            Or load results.json
            <input
              type="file"
              accept=".json"
              onChange={handleFileChange}
            />
          </label>
        </div>
      </div>

      {loading && (
        <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>Loading run data...</p>
      )}

      {error && (
        <p style={{ color: "var(--error)", marginBottom: 24 }}>{error}</p>
      )}

      {!report && !error && !loading && (
        <div className="empty-state">
          <h3>No Report Loaded</h3>
          <p>
            {runs.length > 0
              ? "Select a run above or load a PropBench results JSON file."
              : "No benchmark runs found. Load a PropBench results JSON file or run a benchmark first."}
          </p>
        </div>
      )}

      {report && (
        <>
          <div className="dashboard-stats">
            <div className="stat-card">
              <div className="stat-value">{totalModels}</div>
              <div className="stat-label">Models</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{totalTheorems}</div>
              <div className="stat-label">Theorems</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{totalValid}</div>
              <div className="stat-label">Valid Proofs</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{totalInvalid}</div>
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

export default Dashboard;
