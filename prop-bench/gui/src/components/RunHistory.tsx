interface RunRecord {
  id: string;
  timestamp: string;
  models: string[];
  theoremCount: number;
  validCount: number;
  invalidCount: number;
  errorCount: number;
  fileName: string;
}

interface RunHistoryProps {
  runs: RunRecord[];
  onLoad: (run: RunRecord) => void;
  onDelete: (id: string) => void;
}

function RunHistory({ runs, onLoad, onDelete }: RunHistoryProps) {
  if (runs.length === 0) {
    return (
      <div className="run-history">
        <h3 className="run-history-title">Run History</h3>
        <p className="run-history-empty">No past runs. Load result files to build history.</p>
      </div>
    );
  }

  return (
    <div className="run-history">
      <h3 className="run-history-title">Run History</h3>
      <div className="run-history-list">
        {runs.map((run) => (
          <div key={run.id} className="run-history-item">
            <div className="run-history-item-info">
              <span className="run-history-ts">
                {new Date(run.timestamp).toLocaleString()}
              </span>
              <span className="run-history-models">
                {run.models.join(", ")}
              </span>
              <span className="run-history-counts">
                {run.theoremCount} theorems &mdash;{" "}
                <span className="text-success">{run.validCount}v</span>{" / "}
                <span className="text-error">{run.invalidCount}i</span>{" / "}
                <span className="text-warning">{run.errorCount}e</span>
              </span>
            </div>
            <div className="run-history-actions">
              <button className="btn-sm" onClick={() => onLoad(run)}>
                Load
              </button>
              <button className="btn-sm btn-sm--danger" onClick={() => onDelete(run.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export type { RunRecord };
export default RunHistory;
