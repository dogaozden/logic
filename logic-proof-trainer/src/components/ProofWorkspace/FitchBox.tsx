import React from 'react';
import { ProofLine } from './ProofLine';
import type { Proof, ProofScope } from '../../types';

interface FitchBoxProps {
  proof: Proof;
  selectedLines: number[];
  onLineClick: (lineNumber: number) => void;
  scopeGoals: Record<string, string>;
  pendingGoalScopeId: string | null;
  goalInput: string;
  onGoalInputChange: (value: string) => void;
  onGoalSubmit: () => void;
  onGoalSkip: () => void;
}

// Calculate which scopes are active at each line
function getScopeInfo(proof: Proof) {
  const scopeMap: Map<number, {
    activeScopes: ProofScope[];
    startsScope: ProofScope | null;
    endsScope: ProofScope | null;
  }> = new Map();

  // Initialize map for each line
  for (const line of proof.lines) {
    scopeMap.set(line.line_number, {
      activeScopes: [],
      startsScope: null,
      endsScope: null,
    });
  }

  // Process each scope
  for (const scope of proof.scope_manager.scopes) {
    const startInfo = scopeMap.get(scope.start_line);
    if (startInfo) {
      startInfo.startsScope = scope;
    }

    if (scope.end_line !== undefined) {
      const endInfo = scopeMap.get(scope.end_line);
      if (endInfo) {
        endInfo.endsScope = scope;
      }
    }

    // Mark all lines within the scope as having this scope active
    for (const line of proof.lines) {
      const lineNum = line.line_number;
      const endLine = scope.end_line ?? Infinity;

      if (lineNum >= scope.start_line && lineNum <= endLine) {
        const info = scopeMap.get(lineNum);
        if (info) {
          info.activeScopes.push(scope);
        }
      }
    }
  }

  return scopeMap;
}

export const FitchBox: React.FC<FitchBoxProps> = ({
  proof,
  selectedLines,
  onLineClick,
  scopeGoals,
  pendingGoalScopeId,
  goalInput,
  onGoalInputChange,
  onGoalSubmit,
  onGoalSkip,
}) => {
  const scopeInfo = getScopeInfo(proof);

  // Find the maximum number of active scopes (for calculating width)
  let maxScopes = 0;
  for (const info of scopeInfo.values()) {
    maxScopes = Math.max(maxScopes, info.activeScopes.length);
  }

  return (
    <div className="fitch-box">
      {proof.lines.map((line) => {
        const info = scopeInfo.get(line.line_number);
        const startsScope = info?.startsScope;
        const goal = startsScope ? scopeGoals[startsScope.id] : undefined;
        const showGoalInput = startsScope && pendingGoalScopeId === startsScope.id;

        return (
          <React.Fragment key={line.id}>
            <ProofLine
              line={line}
              isSelected={selectedLines.includes(line.line_number)}
              onClick={() => onLineClick(line.line_number)}
              activeScopes={info?.activeScopes || []}
              startsScope={startsScope || null}
              endsScope={info?.endsScope || null}
              maxScopes={maxScopes}
              goal={goal}
            />
            {showGoalInput && (
              <div
                className="goal-input-row"
                data-depth={line.depth}
                style={{ marginLeft: `${line.depth * 8}px` }}
              >
                <div className="goal-input-container">
                  <span className="goal-label">Goal:</span>
                  <input
                    type="text"
                    className="goal-input"
                    value={goalInput}
                    onChange={(e) => onGoalInputChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onGoalSubmit();
                      if (e.key === 'Escape') onGoalSkip();
                    }}
                    placeholder="What are you trying to derive?"
                    autoFocus
                  />
                  <button className="btn btn-small btn-primary" onClick={onGoalSubmit}>Set</button>
                  <button className="btn btn-small btn-secondary" onClick={onGoalSkip}>Skip</button>
                </div>
              </div>
            )}
          </React.Fragment>
        );
      })}

      {proof.lines.length === 0 && (
        <div className="empty-state">
          <p>No lines in proof yet.</p>
        </div>
      )}
    </div>
  );
};
