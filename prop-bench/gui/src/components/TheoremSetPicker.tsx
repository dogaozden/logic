import { useState, useEffect } from "react";
import { api, type TheoremSetInfo } from "../api/client";

interface TheoremSetPickerProps {
  selectedSet: string;
  onSelect: (name: string) => void;
  refreshKey?: number;
}

export default function TheoremSetPicker({
  selectedSet,
  onSelect,
  refreshKey,
}: TheoremSetPickerProps) {
  const [sets, setSets] = useState<TheoremSetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .getTheoremSets()
      .then((data) => {
        setSets(data);
        // Auto-select first set if none selected
        if (!selectedSet && data.length > 0) {
          const v1 = data.find((s) => s.name === "v1");
          onSelect(v1 ? v1.name : data[0].name);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) {
    return (
      <select className="difficulty-filter" disabled>
        <option>Loading sets...</option>
      </select>
    );
  }

  if (error) {
    return (
      <span style={{ color: "var(--error)", fontSize: 13 }}>
        Failed to load theorem sets: {error}
      </span>
    );
  }

  if (sets.length === 0) {
    return (
      <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
        No theorem sets found. Generate one to get started.
      </span>
    );
  }

  return (
    <select
      className="difficulty-filter"
      value={selectedSet}
      onChange={(e) => onSelect(e.target.value)}
    >
      {sets.map((s) => (
        <option key={s.name} value={s.name}>
          {s.name} ({s.count} theorems)
        </option>
      ))}
    </select>
  );
}
