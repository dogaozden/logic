import { useState } from "react";
import type { Theorem, Difficulty, BenchmarkResult } from "../types";
import TheoremList from "../components/TheoremList";
import TheoremDetail from "../components/TheoremDetail";
import "../styles/theorems.css";

// Import theorems JSON statically (Vite handles JSON imports)
import theoremsData from "../../../benchmarks/v1/theorems.json";

export default function TheoremExplorer() {
  const theorems = theoremsData as Theorem[];

  // Benchmark results state (optional, loaded from file)
  const [benchmarkResults, setBenchmarkResults] = useState<
    BenchmarkResult[] | null
  >(null);
  const [resultsFileName, setResultsFileName] = useState("");

  // Selection / filter state
  const [selectedTheorem, setSelectedTheorem] = useState<Theorem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | "All">(
    "All"
  );

  // Handle loading benchmark results file
  const handleResultsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResultsFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string);
        // Accept either an array of BenchmarkResult or a report with .results
        if (Array.isArray(data)) {
          setBenchmarkResults(data as BenchmarkResult[]);
        } else if (data.results && Array.isArray(data.results)) {
          setBenchmarkResults(data.results as BenchmarkResult[]);
        } else if (data.models && Array.isArray(data.models)) {
          // BenchmarkReport format — collect results from all model summaries
          const allResults: BenchmarkResult[] = [];
          for (const modelSummary of data.models) {
            if (modelSummary.results && Array.isArray(modelSummary.results)) {
              allResults.push(...modelSummary.results);
            }
          }
          setBenchmarkResults(allResults.length > 0 ? allResults : null);
        } else {
          setBenchmarkResults(null);
        }
      } catch {
        setBenchmarkResults(null);
      }
    };
    reader.readAsText(file);
  };

  // Build per-theorem results map for the selected theorem
  const getResultsForTheorem = (
    theoremId: string
  ): Record<string, BenchmarkResult> | undefined => {
    if (!benchmarkResults) return undefined;
    const map: Record<string, BenchmarkResult> = {};
    for (const r of benchmarkResults) {
      if (r.theorem_id === theoremId) {
        map[r.model] = r;
      }
    }
    return Object.keys(map).length > 0 ? map : undefined;
  };

  return (
    <div className="theorem-explorer">
      <div className="theorem-explorer-header">
        <h2>Theorem Explorer</h2>
        <p>
          Browse all {theorems.length} theorems from the PropBench v1 suite.
        </p>
      </div>

      <div className="file-picker">
        <label>
          Load benchmark results
          <input type="file" accept=".json" onChange={handleResultsFile} />
        </label>
        {resultsFileName && (
          <span className="file-name">{resultsFileName}</span>
        )}
        {benchmarkResults && (
          <span className="file-name" style={{ color: "var(--success)" }}>
            {benchmarkResults.length} results loaded
          </span>
        )}
      </div>

      <div className="theorem-explorer-body">
        <div className="theorem-explorer-list">
          <TheoremList
            theorems={theorems}
            selectedId={selectedTheorem?.id ?? null}
            onSelect={setSelectedTheorem}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            difficultyFilter={difficultyFilter}
            onDifficultyChange={setDifficultyFilter}
          />
        </div>

        <div className="theorem-explorer-detail">
          {selectedTheorem ? (
            <TheoremDetail
              theorem={selectedTheorem}
              resultsByModel={getResultsForTheorem(selectedTheorem.id)}
            />
          ) : (
            <div className="theorem-detail-empty">
              Select a theorem from the list to view details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
