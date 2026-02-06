import { useState } from "react";
import type { BenchmarkReport } from "../types";
import RankingsTable from "../components/RankingsTable";
import DifficultyBreakdown from "../components/DifficultyBreakdown";
import EloChart from "../components/EloChart";

function Dashboard() {
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string>("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
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
        <p>Load a PropBench results file to view benchmark data.</p>
      </div>

      <div className="file-picker">
        <label>
          Load results.json
          <input
            type="file"
            accept=".json"
            onChange={handleFileChange}
          />
        </label>
        {fileName && <span className="file-name">{fileName}</span>}
      </div>

      {error && (
        <p style={{ color: "var(--error)", marginBottom: 24 }}>{error}</p>
      )}

      {!report && !error && (
        <div className="empty-state">
          <h3>No Report Loaded</h3>
          <p>
            Select a PropBench results JSON file to display rankings, stats,
            and per-difficulty breakdowns.
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
            <h3>Avg Lines by Difficulty Tier</h3>
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
