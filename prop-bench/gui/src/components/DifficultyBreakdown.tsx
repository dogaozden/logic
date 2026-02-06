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
  "absurd",
  "cosmic",
  "mind",
];

function DifficultyBreakdown({ report }: Props) {
  if (report.models.length === 0) {
    return <p className="empty-state">No model data available.</p>;
  }

  // Only show tiers that have data across any model
  const activeTiers = TIERS.filter((tier) =>
    report.models.some((stats) => {
      const d = stats.linesByDifficulty[tier];
      return d && (d.attempted > 0 || d.count > 0);
    })
  );

  if (activeTiers.length === 0) {
    return <p className="empty-state">No difficulty data available.</p>;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Model</th>
          {activeTiers.map((t) => (
            <th key={t} style={{ textTransform: "capitalize" }}>{t}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {report.models.map((stats) => (
          <tr key={stats.model}>
            <td className="model-cell">{stats.model}</td>
            {activeTiers.map((tier) => {
              const d = stats.linesByDifficulty[tier];
              // Support old report format (no attempted/valid/invalid fields)
              const attempted = d?.attempted ?? 0;
              const valid = d?.valid ?? d?.count ?? 0;

              if (!d || (attempted === 0 && d.count === 0)) {
                return (
                  <td key={tier} className="number-cell" style={{ color: "var(--text-muted)" }}>
                    --
                  </td>
                );
              }

              // Old format only has count (valid proofs) — show what we have
              if (attempted === 0) {
                return (
                  <td key={tier} className="number-cell">
                    {d.avg !== null ? d.avg.toFixed(1) : "--"}{" "}
                    <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                      ({d.count})
                    </span>
                  </td>
                );
              }

              const pct = Math.round((valid / attempted) * 100);

              return (
                <td key={tier} className="number-cell">
                  <span className="difficulty-valid">{valid}</span>
                  <span className="difficulty-sep">/</span>
                  <span className="difficulty-attempted">{attempted}</span>
                  <span className="difficulty-pct" style={{
                    color: pct >= 80
                      ? "var(--color-success, #4caf50)"
                      : pct >= 40
                        ? "var(--color-warning, #ff9800)"
                        : "var(--color-error, #f44336)",
                  }}>
                    {pct}%
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
