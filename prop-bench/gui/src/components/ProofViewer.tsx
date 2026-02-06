import type { ProofLine, ProofResult } from "../types";

interface ProofViewerProps {
  model: string;
  lines: ProofLine[];
  result: ProofResult;
  parseErrors?: string[];
}

/** Render logic symbols in Unicode. */
function renderFormula(raw: string): string {
  return raw
    .replace(/->/g, "\u2283")
    .replace(/<->/g, "\u2261")
    .replace(/\|/g, " \u2228 ")
    .replace(/&/g, " \u00B7 ")
    .replace(/~/g, "\u007E")
    .replace(/_\|_/g, "\u22A5");
}

export default function ProofViewer({
  model,
  lines,
  result,
  parseErrors,
}: ProofViewerProps) {
  const hasErrors =
    result.errors.length > 0 || (parseErrors && parseErrors.length > 0);

  return (
    <div className="proof-viewer">
      <div className="proof-viewer-header">
        <span className="proof-viewer-model">{model}</span>
        <span className="proof-viewer-line-count">
          {result.line_count} lines
        </span>
        {result.valid ? (
          <span className="proof-viewer-valid">Valid</span>
        ) : (
          <span className="proof-viewer-invalid">Invalid</span>
        )}
      </div>

      <div className="proof-lines">
        {lines.map((line) => (
          <div
            key={line.line_number}
            className={`proof-line ${result.valid ? "proof-line--valid" : "proof-line--invalid"}`}
          >
            <span className="proof-line-number">{line.line_number}</span>
            <span className="proof-line-depth">
              {Array.from({ length: line.depth }, (_, i) => (
                <span key={i} className="proof-line-bar" />
              ))}
            </span>
            <span className="proof-line-formula">
              {renderFormula(line.formula)}
            </span>
            <span className="proof-line-justification">
              {line.justification}
            </span>
          </div>
        ))}
      </div>

      {hasErrors && (
        <div className="proof-errors">
          <h5>Errors</h5>
          <ul>
            {result.errors.map((err, i) => (
              <li key={`v-${i}`}>{err}</li>
            ))}
            {parseErrors?.map((err, i) => (
              <li key={`p-${i}`}>{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
