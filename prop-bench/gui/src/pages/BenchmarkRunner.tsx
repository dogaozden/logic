import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import RunConfig from "../components/RunConfig";
import type { RunConfigValues } from "../components/RunConfig";
import RunProgress from "../components/RunProgress";
import RunHistory from "../components/RunHistory";
import { useRunner } from "../context/RunnerContext";
import "../styles/runner.css";

function BenchmarkRunner() {
  const navigate = useNavigate();
  const runner = useRunner();

  const [config, setConfig] = useState<RunConfigValues>({
    models: [],
    theoremSet: "v1",
    temperature: 0.2,
    maxTokens: 16384,
    workers: null,
    startIndex: null,
    count: "",
    force: false,
    noRetryParse: true,
    runs: 1,
    continueRunId: null,
  });

  const handleStart = useCallback(async () => {
    // Continue-run mode: only pass continueRunId and workers
    if (config.continueRunId != null) {
      await runner.start({
        continueRunId: config.continueRunId,
        retryApiErrors: true,
        workers: config.workers != null && config.workers > 1 ? config.workers : undefined,
        // These are required by the type but ignored by the server in continue mode
        models: [],
        theoremSet: "",
        temperature: 0,
        maxTokens: 0,
      });
      return;
    }

    const countNum = config.count.trim()
      ? parseInt(config.count.trim(), 10)
      : undefined;

    await runner.start({
      models: config.models,
      theoremSet: config.theoremSet,
      temperature: config.temperature,
      maxTokens: config.maxTokens ?? 16384,
      workers: config.workers != null && config.workers > 1 ? config.workers : undefined,
      start: config.startIndex != null && config.startIndex > 0 ? config.startIndex : undefined,
      count: Number.isFinite(countNum) ? countNum : undefined,
      force: config.force || undefined,
      noRetryParse: config.noRetryParse || undefined,
      runs: config.runs > 1 ? config.runs : undefined,
    });
  }, [config, runner]);

  const handleViewResults = useCallback(
    (id: string) => {
      navigate(`/?runId=${encodeURIComponent(id)}`);
    },
    [navigate],
  );

  return (
    <div className="runner-page">
      <div className="runner-header">
        <h2>Benchmark Runner</h2>
        <p>Configure and launch PropBench benchmark runs.</p>
      </div>

      {runner.error && (
        <div className="runner-error">
          <span>{runner.error}</span>
          <button className="btn-sm" onClick={runner.clearError}>
            Dismiss
          </button>
        </div>
      )}

      <div className="runner-layout">
        {/* Left column: config */}
        <div className="runner-left">
          <RunConfig
            config={config}
            onChange={setConfig}
            running={runner.isRunning}
            onStart={handleStart}
          />
        </div>

        {/* Right column: progress + history */}
        <div className="runner-right">
          <RunProgress
            isRunning={runner.isRunning}
            progress={runner.progress}
            logs={runner.logs}
            elapsedMs={runner.elapsedMs}
            onStop={runner.stop}
          />

          <RunHistory
            refreshTrigger={runner.historyRefresh}
            onViewResults={handleViewResults}
          />
        </div>
      </div>
    </div>
  );
}

export default BenchmarkRunner;
