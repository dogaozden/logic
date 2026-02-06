import type { BenchmarkResult } from "../types";

interface RunProgressProps {
  command: string | null;
  results: BenchmarkResult[];
  totalExpected: number | null;
}

function RunProgress({ command, results, totalExpected }: RunProgressProps) {
  if (!command && results.length === 0) {
    return null;
  }

  const validCount = results.filter((r) => r.result.valid).length;
  const invalidCount = results.filter((r) => !r.result.valid && r.result.errors.length === 0).length;
  const errorCount = results.filter((r) => r.result.errors.length > 0 && !r.result.valid).length;
  const total = totalExpected ?? results.length;
  const pct = total > 0 ? Math.round((results.length / total) * 100) : 0;

  return (
    <div className="run-progress">
      <h3 className="run-progress-title">Run Progress</h3>

      {/* Generated command */}
      {command && (
        <div className="command-block">
          <div className="command-block-header">
            <span>CLI Command</span>
            <button
              className="btn-copy"
              onClick={() => navigator.clipboard.writeText(command)}
            >
              Copy
            </button>
          </div>
          <pre className="command-text">{command}</pre>
        </div>
      )}

      {/* Progress bar */}
      {results.length > 0 && (
        <>
          <div className="progress-bar-wrapper">
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="progress-label">
              {results.length} / {total} ({pct}%)
            </span>
          </div>

          {/* Stats row */}
          <div className="progress-stats">
            <span className="progress-stat progress-stat--valid">
              Valid: {validCount}
            </span>
            <span className="progress-stat progress-stat--invalid">
              Invalid: {invalidCount}
            </span>
            <span className="progress-stat progress-stat--error">
              Errors: {errorCount}
            </span>
          </div>
        </>
      )}

      {/* If no results loaded yet but command exists */}
      {command && results.length === 0 && (
        <p className="progress-hint">
          Run the command above in your terminal, then load the output file below to view results.
        </p>
      )}
    </div>
  );
}

export default RunProgress;
