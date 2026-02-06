import type { BenchmarkReport, DifficultyTier } from "../types";

interface Props {
  report: BenchmarkReport;
}

const TIERS: DifficultyTier[] = [
  "easy",
  "medium",
  "hard",
  "expert",
  "nightmare",
  "marathon",
];

function DifficultyBreakdown({ report }: Props) {
  if (report.models.length === 0) {
    return <p className="empty-state">No model data available.</p>;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Model</th>
          {TIERS.map((t) => (
            <th key={t}>{t}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {report.models.map((stats) => (
          <tr key={stats.model}>
            <td className="model-cell">{stats.model}</td>
            {TIERS.map((tier) => {
              const d = stats.linesByDifficulty[tier];
              if (!d || d.count === 0) {
                return (
                  <td key={tier} className="number-cell" style={{ color: "var(--text-muted)" }}>
                    --
                  </td>
                );
              }
              return (
                <td key={tier} className="number-cell">
                  {d.avg !== null ? d.avg.toFixed(1) : "--"}{" "}
                  <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                    ({d.count})
                  </span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default DifficultyBreakdown;
