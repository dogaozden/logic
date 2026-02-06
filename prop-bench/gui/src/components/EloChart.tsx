import type { BenchmarkReport } from "../types";

interface Props {
  report: BenchmarkReport;
}

function EloChart({ report }: Props) {
  const rankings = report.rankings;

  if (rankings.length === 0) {
    return <p className="empty-state">No Elo data to display.</p>;
  }

  const elos = rankings.map((r) => r.eloRating);
  const maxElo = Math.max(...elos);
  const minElo = Math.min(...elos);
  const range = maxElo - minElo || 1;

  // Scale bars: minimum 10% height, max 100%
  const getBarHeight = (elo: number) => {
    const normalized = (elo - minElo) / range;
    return Math.max(10, normalized * 90 + 10);
  };

  return (
    <div className="elo-chart">
      {rankings.map((r) => (
        <div key={r.model} className="elo-bar-wrapper">
          <span className="elo-bar-value">{r.eloRating}</span>
          <div
            className="elo-bar"
            style={{ height: `${getBarHeight(r.eloRating)}%` }}
          />
          <span className="elo-bar-label" title={r.model}>
            {r.model}
          </span>
        </div>
      ))}
    </div>
  );
}

export default EloChart;
