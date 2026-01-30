import React from 'react';
import type { ProofLine as ProofLineType, ProofScope } from '../../types';
import { formulaToString, justificationToString } from '../../types';

interface ProofLineProps {
  line: ProofLineType;
  isSelected: boolean;
  onClick: () => void;
  activeScopes: ProofScope[];
  startsScope: ProofScope | null;
  endsScope: ProofScope | null;
  maxScopes: number;
  goal?: string;
  readOnly?: boolean;
}

export const ProofLine: React.FC<ProofLineProps> = ({
  line,
  isSelected,
  onClick,
  activeScopes,
  startsScope,
  endsScope,
  maxScopes,
  goal,
  readOnly = false,
}) => {
  const classNames = [
    'proof-line',
    isSelected ? 'selected' : '',
    !line.is_valid ? 'invalid' : '',
    readOnly ? 'read-only' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Render scope brackets on the right side
  // Each active scope gets a vertical line
  // Scopes that start here get a top corner (┐)
  // Scopes that end here get a bottom corner (┘)
  const renderScopeBrackets = () => {
    if (maxScopes === 0) return null;

    const bracketWidth = 12; // Width per scope level
    const totalWidth = maxScopes * bracketWidth;

    return (
      <div className="scope-brackets" style={{ width: totalWidth }}>
        {activeScopes.map((scope, index) => {
          const isStart = startsScope?.id === scope.id;
          const isEnd = endsScope?.id === scope.id;
          const left = index * bracketWidth;

          return (
            <div
              key={scope.id}
              className="scope-bracket"
              style={{ left }}
            >
              {/* Vertical line */}
              <div className="scope-line-vertical" />

              {/* Top hook (arrow pointing left) for scope start */}
              {isStart && (
                <div className="scope-line-top">
                  <span className="scope-arrow">←</span>
                </div>
              )}

              {/* Bottom hook for scope end */}
              {isEnd && (
                <div className="scope-line-bottom">
                  <span className="scope-arrow">←</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className={classNames}
      data-depth={line.depth}
      onClick={readOnly ? undefined : onClick}
      title={line.validation_message || undefined}
    >
      {goal && (
        <span className="scope-goal">{goal}</span>
      )}
      <span className="line-number">{line.line_number}.</span>
      <span className="formula" style={{ color: line.is_valid ? 'inherit' : 'var(--error)' }}>
        {formulaToString(line.formula)}
      </span>
      <span className="justification">{justificationToString(line.justification)}</span>
      {renderScopeBrackets()}
    </div>
  );
};
