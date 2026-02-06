import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import RunConfig from "../components/RunConfig";
import type { RunConfigValues } from "../components/RunConfig";
import RunProgress from "../components/RunProgress";
import type { SSEProgressEvent } from "../components/RunProgress";
import RunHistory from "../components/RunHistory";
import { api } from "../api/client";
import "../styles/runner.css";

function BenchmarkRunner() {
  const navigate = useNavigate();

  const [config, setConfig] = useState<RunConfigValues>({
    models: [],
    theoremSet: "v1",
    temperature: 0.2,
    maxTokens: 4096,
    workers: 1,
    startIndex: 0,
    count: "",
  });

  const [isRunning, setIsRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [progress, setProgress] = useState<SSEProgressEvent | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState("");
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const runningRef = useRef(false);

  // Cleanup SSE + timer on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    setElapsedMs(0);
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (startTimeRef.current > 0) {
      setElapsedMs(Date.now() - startTimeRef.current);
    }
  }, []);

  const connectSSE = useCallback(
    (id: string) => {
      const es = api.getBenchmarkStatus(id);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as SSEProgressEvent;

          if (data.type === "progress") {
            setProgress(data);
          } else if (data.type === "log") {
            if (data.message) {
              setLogs((prev) => [...prev, data.message!]);
            }
          } else if (data.type === "complete") {
            runningRef.current = false;
            setIsRunning(false);
            setProgress(data);
            stopTimer();
            es.close();
            eventSourceRef.current = null;
            setHistoryRefresh((v) => v + 1);
          } else if (data.type === "error") {
            runningRef.current = false;
            setError(data.error ?? "Unknown error during benchmark");
            setIsRunning(false);
            stopTimer();
            es.close();
            eventSourceRef.current = null;
          }
        } catch {
          setLogs((prev) => [...prev, event.data]);
        }
      };

      es.onerror = () => {
        // EventSource reconnects automatically; only close if run is finished
        if (!runningRef.current) {
          es.close();
          eventSourceRef.current = null;
        }
      };
    },
    [stopTimer],
  );

  const handleStart = useCallback(async () => {
    setError("");
    setProgress(null);
    setLogs([]);
    setElapsedMs(0);

    try {
      runningRef.current = true;
      setIsRunning(true);
      const countNum = config.count.trim()
        ? parseInt(config.count.trim(), 10)
        : undefined;

      const { runId: id } = await api.startBenchmark({
        models: config.models,
        theoremSet: config.theoremSet,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        workers: config.workers > 1 ? config.workers : undefined,
        start: config.startIndex > 0 ? config.startIndex : undefined,
        count: Number.isFinite(countNum) ? countNum : undefined,
      });
      setRunId(id);
      startTimer();
      connectSSE(id);
    } catch (err) {
      runningRef.current = false;
      setIsRunning(false);
      setError(
        err instanceof Error ? err.message : "Failed to start benchmark",
      );
    }
  }, [config, startTimer, connectSSE]);

  const handleStop = useCallback(async () => {
    if (!runId) return;
    runningRef.current = false;
    try {
      await api.stopBenchmark(runId);
    } catch {
      // Best-effort stop
    }
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsRunning(false);
    stopTimer();
    setHistoryRefresh((v) => v + 1);
  }, [runId, stopTimer]);

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

      {error && (
        <div className="runner-error">
          <span>{error}</span>
          <button className="btn-sm" onClick={() => setError("")}>
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
            running={isRunning}
            onStart={handleStart}
          />
        </div>

        {/* Right column: progress + history */}
        <div className="runner-right">
          <RunProgress
            isRunning={isRunning}
            progress={progress}
            logs={logs}
            elapsedMs={elapsedMs}
            onStop={handleStop}
          />

          <RunHistory
            refreshTrigger={historyRefresh}
            onViewResults={handleViewResults}
          />
        </div>
      </div>
    </div>
  );
}

export default BenchmarkRunner;
