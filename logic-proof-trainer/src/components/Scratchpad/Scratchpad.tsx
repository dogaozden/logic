import React, { useState, useRef } from 'react';
import { useScratchpad } from '../../hooks/useScratchpad';

const SYMBOLS = [
  { symbol: '~', label: '~', description: 'Negation' },
  { symbol: '.', label: '.', description: 'Conjunction (AND)' },
  { symbol: '∨', label: '∨', description: 'Disjunction (OR)' },
  { symbol: '⊃', label: '⊃', description: 'Implication' },
  { symbol: '≡', label: '≡', description: 'Biconditional' },
  { symbol: '(', label: '(', description: 'Left paren' },
  { symbol: ')', label: ')', description: 'Right paren' },
];

const ATOMS = ['P', 'Q', 'R', 'S'];

const SYMBOL_REPLACEMENTS: Record<string, string> = {
  '>': '⊃',
  'v': '∨',
  'V': '∨',
  '&': '.',
  '<>': '≡',
  '!': '~',
};

export const Scratchpad: React.FC = () => {
  const {
    lines,
    selectedLineId,
    availableTransformations,
    isLoading,
    error,
    addFormula,
    applyTransformation,
    selectLine,
    removeLine,
    clearAll,
    copyToProof,
    clearError,
  } = useScratchpad();

  const [formulaInput, setFormulaInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (newValue: string) => {
    let result = newValue;
    for (const [ascii, symbol] of Object.entries(SYMBOL_REPLACEMENTS)) {
      if (ascii.length === 2) {
        result = result.replace(new RegExp(ascii.replace(/[<>]/g, '\\$&'), 'g'), symbol);
      }
    }
    for (const [ascii, symbol] of Object.entries(SYMBOL_REPLACEMENTS)) {
      if (ascii.length === 1) {
        result = result.replace(new RegExp(ascii.replace(/[&]/g, '\\$&'), 'g'), symbol);
      }
    }
    setFormulaInput(result);
  };

  const insertSymbol = (symbol: string) => {
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart ?? formulaInput.length;
      const end = input.selectionEnd ?? formulaInput.length;
      const newValue = formulaInput.slice(0, start) + symbol + formulaInput.slice(end);
      setFormulaInput(newValue);
      setTimeout(() => {
        input.selectionStart = input.selectionEnd = start + symbol.length;
        input.focus();
      }, 0);
    } else {
      setFormulaInput(formulaInput + symbol);
    }
  };

  const handleSubmit = async () => {
    if (!formulaInput.trim()) return;
    const success = await addFormula(formulaInput);
    if (success) {
      setFormulaInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && formulaInput.trim()) {
      handleSubmit();
    }
  };

  const handleCopyToProof = () => {
    if (selectedLineId) {
      copyToProof(selectedLineId);
    }
  };

  const selectedLine = lines.find(l => l.id === selectedLineId);

  return (
    <div className="scratchpad">
      {/* Formula Input */}
      <div className="scratchpad-input">
        <input
          ref={inputRef}
          type="text"
          className="formula-input"
          value={formulaInput}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter formula..."
          spellCheck={false}
          autoComplete="off"
        />
        <div className="symbol-toolbar" style={{ marginTop: '6px' }}>
          {ATOMS.map((atom) => (
            <button
              key={atom}
              className="symbol-button"
              onClick={() => insertSymbol(atom)}
              title={`Atom ${atom}`}
              style={{ padding: '4px 8px', fontSize: '0.875rem' }}
            >
              {atom}
            </button>
          ))}
          <span style={{ width: '4px' }} />
          {SYMBOLS.map((s) => (
            <button
              key={s.symbol}
              className="symbol-button"
              onClick={() => insertSymbol(s.symbol)}
              title={s.description}
              style={{ padding: '4px 8px', fontSize: '0.875rem' }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="scratchpad-error">
          {error}
          <button
            onClick={clearError}
            style={{
              marginLeft: '8px',
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            x
          </button>
        </div>
      )}

      {/* Lines List */}
      <div className="scratchpad-lines">
        {lines.length === 0 ? (
          <div className="scratchpad-empty">
            Enter a formula above to explore its equivalent forms
          </div>
        ) : (
          lines.map((line, index) => (
            <div
              key={line.id}
              className={`scratchpad-line ${selectedLineId === line.id ? 'selected' : ''}`}
              onClick={() => selectLine(line.id)}
            >
              <span className="line-number">{index + 1}.</span>
              <span className="formula">{line.formula}</span>
              {line.sourceRule && (
                <span className="rule-badge">{line.sourceRule}</span>
              )}
              <button
                className="remove-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  removeLine(line.id);
                }}
                title="Remove line"
              >
                x
              </button>
            </div>
          ))
        )}
      </div>

      {/* Transformations Section */}
      {selectedLine && (
        <div className="scratchpad-transformations">
          <div className="transformations-header">
            Transformations for line {lines.findIndex(l => l.id === selectedLineId) + 1}:
          </div>
          {isLoading ? (
            <div className="transformations-loading">Loading...</div>
          ) : availableTransformations.length === 0 ? (
            <div className="transformations-empty">No transformations available</div>
          ) : (
            <div className="transformations-list">
              {availableTransformations.map((t, idx) => (
                <button
                  key={`${t.rule}-${idx}`}
                  className="transformation-btn"
                  onClick={() => applyTransformation(selectedLineId!, t)}
                  title={t.rule_name}
                >
                  <span className="transformation-result">{t.result}</span>
                  <span className="transformation-rule">{t.rule_abbrev}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="scratchpad-actions">
        <button
          className="btn btn-secondary"
          onClick={clearAll}
          disabled={lines.length === 0}
        >
          Clear All
        </button>
        <button
          className="btn btn-primary"
          onClick={handleCopyToProof}
          disabled={!selectedLineId}
        >
          Copy to Proof
        </button>
      </div>
    </div>
  );
};
