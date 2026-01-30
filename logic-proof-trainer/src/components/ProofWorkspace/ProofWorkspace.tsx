import { useState, useEffect, useCallback, useRef } from 'react';
import { useProof } from '../../hooks/useProof';
import { FitchBox } from './FitchBox';
import { FormulaInput } from './FormulaInput';
import { RulePalette } from './RulePalette';
import type { InferenceRule, EquivalenceRule, ProofTechnique } from '../../types';
import { formulaToString, inferenceRuleInfo, equivalenceRuleInfo, proofTechniqueInfo } from '../../types';

// Create reverse lookup maps from abbreviations to rule keys
// Includes official abbreviations plus common shorthands
const abbrevToInference: Record<string, InferenceRule> = {};
for (const [key, info] of Object.entries(inferenceRuleInfo)) {
  abbrevToInference[info.abbrev.toLowerCase()] = key as InferenceRule;
}
// Add shorthand aliases for inference rules
const inferenceAliases: Record<string, InferenceRule> = {
  // Modus Ponens
  'modus': 'modusPonens',
  'ponens': 'modusPonens',
  // Modus Tollens
  'tollens': 'modusTollens',
  // Hypothetical Syllogism
  'hyp': 'hypotheticalSyllogism',
  'hypo': 'hypotheticalSyllogism',
  'syl': 'hypotheticalSyllogism',
  // Disjunctive Syllogism
  'disj': 'disjunctiveSyllogism',
  'disjsyl': 'disjunctiveSyllogism',
  // Constructive Dilemma
  'dil': 'constructiveDilemma',
  'dilemma': 'constructiveDilemma',
  // Conjunction
  'conj': 'conjunctionIntro',
  'conji': 'conjunctionIntro',
  'and': 'conjunctionIntro',
  'andi': 'conjunctionIntro',
  'conjunction': 'conjunctionIntro',
  'conjintro': 'conjunctionIntro',
  'conjelim': 'conjunctionElim',
  'conje': 'conjunctionElim',
  'ande': 'conjunctionElim',
  'simp': 'conjunctionElim',
  'simplification': 'conjunctionElim',
  // Disjunction
  'or': 'disjunctionIntro',
  'ori': 'disjunctionIntro',
  'add': 'disjunctionIntro',
  'addition': 'disjunctionIntro',
  'disjintro': 'disjunctionIntro',
  'disjelim': 'disjunctionElim',
  'ore': 'disjunctionElim',
  // Double Negation
  'dne': 'doubleNegation',
  'dni': 'doubleNegation',
  'neg': 'doubleNegation',
  'doubleneg': 'doubleNegation',
  // Biconditional
  'bicon': 'biconditionalIntro',
  'biconi': 'biconditionalIntro',
  'bicone': 'biconditionalElim',
  'equiv': 'biconditionalElim',
  'iff': 'biconditionalElim',
  // Reiteration
  'reit': 'reiteration',
  'rep': 'reiteration',
  'repeat': 'reiteration',
};
Object.assign(abbrevToInference, inferenceAliases);

const abbrevToEquivalence: Record<string, EquivalenceRule> = {};
for (const [key, info] of Object.entries(equivalenceRuleInfo)) {
  abbrevToEquivalence[info.abbrev.toLowerCase()] = key as EquivalenceRule;
}
// Add shorthand aliases for equivalence rules
const equivalenceAliases: Record<string, EquivalenceRule> = {
  // De Morgan
  'demorgan': 'deMorgan',
  'morgan': 'deMorgan',
  'dm': 'deMorgan',
  // Commutation
  'comm': 'commutation',
  'commute': 'commutation',
  // Association
  'assoc': 'association',
  'associate': 'association',
  // Distribution
  'dist': 'distribution',
  'distrib': 'distribution',
  'distribute': 'distribution',
  // Contraposition
  'contra': 'contraposition',
  'contrap': 'contraposition',
  'trans': 'contraposition',
  'transpose': 'contraposition',
  'transposition': 'contraposition',
  // Material Implication
  'impl': 'materialImplication',
  'imp': 'materialImplication',
  'matimpl': 'materialImplication',
  // Material Equivalence
  'mateq': 'materialEquivalence',
  'matequiv': 'materialEquivalence',
  // Exportation
  'exp': 'exportation',
  'export': 'exportation',
  // Tautology
  'taut': 'tautology',
  // Absorption
  'abs': 'absorption',
  'absorb': 'absorption',
  // Double Negation (equivalence version)
  'dn': 'doubleNegation',
};
Object.assign(abbrevToEquivalence, equivalenceAliases);

const abbrevToTechnique: Record<string, ProofTechnique> = {};
for (const [key, info] of Object.entries(proofTechniqueInfo)) {
  abbrevToTechnique[info.abbrev.toLowerCase()] = key as ProofTechnique;
}
// Add shorthand aliases for proof techniques
const techniqueAliases: Record<string, ProofTechnique> = {
  'conditional': 'conditionalProof',
  'cond': 'conditionalProof',
  'condproof': 'conditionalProof',
  'indirect': 'indirectProof',
  'ind': 'indirectProof',
  'indproof': 'indirectProof',
  'raa': 'indirectProof',  // Reductio ad absurdum
  'negintro': 'negationIntroduction',
  'negi': 'negationIntroduction',
  '~i': 'negationIntroduction',
};
Object.assign(abbrevToTechnique, techniqueAliases);

// Parse input like "P //1, 2, MP" or "~Q //3, MT"
function parseInput(input: string): {
  formula: string;
  lines: number[];
  rule: string;
} | null {
  const match = input.match(/^(.+?)\s*\/\/\s*(.+)$/);
  if (!match) return null;

  const formula = match[1].trim();
  const rest = match[2].trim();

  // Parse "1, 2, MP" or "3, MT" or just "1, MP"
  const parts = rest.split(',').map(p => p.trim());
  if (parts.length < 2) return null;

  const rule = parts[parts.length - 1];
  const lineStrs = parts.slice(0, -1);
  const lines = lineStrs.map(s => parseInt(s, 10)).filter(n => !isNaN(n));

  if (lines.length === 0) return null;

  return { formula, lines, rule };
}

export const ProofWorkspace: React.FC = () => {
  const {
    proof,
    selectedLines,
    error,
    hint,
    toggleLineSelection,
    clearLineSelection,
    applyInferenceRule,
    applyEquivalenceRule,
    openSubproof,
    closeSubproof,
    undoLine,
    getHint,
    clearProof,
    clearError,
    setError,
  } = useProof();

  const [formulaInput, setFormulaInput] = useState('');
  const [selectedInferenceRule, setSelectedInferenceRule] = useState<InferenceRule | null>(null);
  const [selectedEquivalenceRule, setSelectedEquivalenceRule] = useState<EquivalenceRule | null>(null);
  const [selectedTechnique, setSelectedTechnique] = useState<ProofTechnique | null>(null);
  const [mode, setMode] = useState<'apply' | 'open' | 'close'>('apply');

  // Goal tracking for subproofs
  const [scopeGoals, setScopeGoals] = useState<Record<string, string>>({});
  const [pendingGoalScopeId, setPendingGoalScopeId] = useState<string | null>(null);
  const [goalInput, setGoalInput] = useState('');

  // Auto-apply inference rule when we have the right number of lines selected
  const tryAutoApplyInference = useCallback(async (rule: InferenceRule, lines: number[]) => {
    const info = inferenceRuleInfo[rule];
    if (lines.length === info.premises) {
      // For rules that don't need additional input, auto-apply without formula
      if (!['disjunctionIntro'].includes(rule)) {
        const success = await applyInferenceRule(rule, lines, '');
        if (success) {
          setSelectedInferenceRule(null);
          clearLineSelection();
        }
        // Don't clear selection on failure so user can see what went wrong
        return success;
      }
    }
    return false;
  }, [applyInferenceRule, clearLineSelection]);

  // Auto-apply equivalence rule when we have 1 line selected
  const tryAutoApplyEquivalence = useCallback(async (_rule: EquivalenceRule, _line: number) => {
    // Equivalence rules need the user to specify the result formula
    // But we can still make it easier by auto-filling possible results
    return false;
  }, []);

  // Effect to auto-apply when lines + rule are ready
  useEffect(() => {
    if (selectedInferenceRule && selectedLines.length > 0) {
      tryAutoApplyInference(selectedInferenceRule, selectedLines);
    }
  }, [selectedLines, selectedInferenceRule, tryAutoApplyInference]);

  // Effect to auto-apply equivalence when line + rule are ready
  useEffect(() => {
    if (selectedEquivalenceRule && selectedLines.length === 1) {
      tryAutoApplyEquivalence(selectedEquivalenceRule, selectedLines[0]);
    }
  }, [selectedLines, selectedEquivalenceRule, tryAutoApplyEquivalence]);

  // Track previous scope count to detect new subproofs
  const prevScopeCountRef = useRef(0);
  useEffect(() => {
    if (!proof) return;
    const currentScopeCount = proof.scope_manager.scopes.length;
    if (currentScopeCount > prevScopeCountRef.current) {
      // New scope was added - find the newest open scope
      const newestOpenScope = proof.scope_manager.scopes.find(s => s.end_line === undefined);
      if (newestOpenScope && !scopeGoals[newestOpenScope.id]) {
        setPendingGoalScopeId(newestOpenScope.id);
        setGoalInput('');
      }
    }
    prevScopeCountRef.current = currentScopeCount;
  }, [proof, scopeGoals]);

  // Handle goal submission
  const handleGoalSubmit = () => {
    if (pendingGoalScopeId && goalInput.trim()) {
      setScopeGoals(prev => ({ ...prev, [pendingGoalScopeId]: goalInput.trim() }));
    }
    setPendingGoalScopeId(null);
    setGoalInput('');
  };

  const handleGoalSkip = () => {
    setPendingGoalScopeId(null);
    setGoalInput('');
  };

  if (!proof) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <h2>No Proof Active</h2>
          <p>Select a theorem from the sidebar and click "Start Proof" to begin.</p>
        </div>
      </div>
    );
  }

  const handleLineClick = (lineNumber: number) => {
    toggleLineSelection(lineNumber);
  };

  const handleApply = async () => {
    if (!formulaInput.trim()) return;

    // Check for simple "Formula //technique" format for opening subproofs (e.g., "P //CP")
    const techMatch = formulaInput.match(/^(.+?)\s*\/\/\s*(\w+)$/);
    if (techMatch) {
      const formula = techMatch[1].trim();
      const techAbbrev = techMatch[2].toLowerCase();
      // Only treat as subproof opening if it's a technique AND doesn't look like "Formula //lines, rule"
      if (abbrevToTechnique[techAbbrev] && !formulaInput.includes(',')) {
        const success = await openSubproof(abbrevToTechnique[techAbbrev], formula);
        if (success) {
          setFormulaInput('');
        }
        return;
      }
    }

    // Try to parse the text format first: "P //1, 2, MP"
    const parsed = parseInput(formulaInput);
    if (parsed) {
      const ruleLower = parsed.rule.toLowerCase();

      // Check if it's an inference rule
      if (abbrevToInference[ruleLower]) {
        const rule = abbrevToInference[ruleLower];
        const success = await applyInferenceRule(rule, parsed.lines, parsed.formula);
        if (success) {
          setFormulaInput('');
        }
        return;
      }

      // Check if it's an equivalence rule
      if (abbrevToEquivalence[ruleLower]) {
        const rule = abbrevToEquivalence[ruleLower];
        if (parsed.lines.length === 1) {
          const success = await applyEquivalenceRule(rule, parsed.lines[0], parsed.formula);
          if (success) {
            setFormulaInput('');
          }
          return;
        } else {
          setError('Equivalence rules require exactly 1 line');
          return;
        }
      }

      // Check if it's a technique (for closing subproofs)
      if (abbrevToTechnique[ruleLower]) {
        const technique = abbrevToTechnique[ruleLower];
        const success = await closeSubproof(technique, parsed.formula);
        if (success) {
          setFormulaInput('');
        }
        return;
      }

      // Parsed but unknown rule
      setError(`Unknown rule: "${parsed.rule}"`);
      return;
    }

    // Check if input looks like it should have been parsed (has //)
    if (formulaInput.includes('//')) {
      setError('Invalid format. Use: Formula //lines, RULE (e.g., "Q //1, 2, MP")');
      return;
    }

    // Fall back to the old behavior using selected rule and lines
    if (selectedInferenceRule) {
      const info = inferenceRuleInfo[selectedInferenceRule];
      if (selectedLines.length !== info.premises) {
        setError(`${info.name} requires ${info.premises} premise(s), but ${selectedLines.length} line(s) selected`);
        return;
      }
      const success = await applyInferenceRule(selectedInferenceRule, selectedLines, formulaInput);
      if (success) {
        setFormulaInput('');
        setSelectedInferenceRule(null);
        setSelectedEquivalenceRule(null);
      }
    } else if (selectedEquivalenceRule && selectedLines.length === 1) {
      const success = await applyEquivalenceRule(selectedEquivalenceRule, selectedLines[0], formulaInput);
      if (success) {
        setFormulaInput('');
        setSelectedInferenceRule(null);
        setSelectedEquivalenceRule(null);
      }
    } else if (selectedEquivalenceRule) {
      setError('Equivalence rules require exactly 1 line selected');
    } else {
      setError('Select a rule from the palette or use format: Formula //lines, RULE');
    }
  };

  const handleOpenSubproof = async () => {
    if (!formulaInput.trim()) {
      setError('Enter a formula to assume');
      return;
    }

    // Check for format: "P //CP" or "~Q //IP"
    const match = formulaInput.match(/^(.+?)\s*\/\/\s*(\w+)$/);
    if (match) {
      const formula = match[1].trim();
      const techAbbrev = match[2].toLowerCase();
      if (abbrevToTechnique[techAbbrev]) {
        const success = await openSubproof(abbrevToTechnique[techAbbrev], formula);
        if (success) {
          setFormulaInput('');
          setSelectedTechnique(null);
          setMode('apply');
        }
        return;
      } else {
        setError(`Unknown technique: "${match[2]}"`);
        return;
      }
    }

    // Fall back to selected technique
    if (!selectedTechnique) {
      setError('Select a proof technique (CP, IP, ~I) first');
      return;
    }
    const success = await openSubproof(selectedTechnique, formulaInput);
    if (success) {
      setFormulaInput('');
      setSelectedTechnique(null);
      setMode('apply');
    }
  };

  const handleCloseSubproof = async () => {
    if (!formulaInput.trim()) {
      setError('Enter the conclusion formula');
      return;
    }

    // Check for format: "P -> Q //1-3, CP"
    const match = formulaInput.match(/^(.+?)\s*\/\/\s*(\d+)\s*-\s*(\d+)\s*,\s*(\w+)$/);
    if (match) {
      const formula = match[1].trim();
      const techAbbrev = match[4].toLowerCase();
      if (abbrevToTechnique[techAbbrev]) {
        const success = await closeSubproof(abbrevToTechnique[techAbbrev], formula);
        if (success) {
          setFormulaInput('');
          setSelectedTechnique(null);
          setMode('apply');
        }
        return;
      } else {
        setError(`Unknown technique: "${match[4]}"`);
        return;
      }
    }

    // Get the current scope's technique for the simple format
    const currentScope = proof?.scope_manager.scopes.find(s => s.end_line === undefined);
    const currentTechnique = selectedTechnique || (currentScope?.technique as ProofTechnique | undefined);

    if (!currentTechnique) {
      setError('No open subproof to close');
      return;
    }

    const success = await closeSubproof(currentTechnique, formulaInput);
    if (success) {
      setFormulaInput('');
      setSelectedTechnique(null);
      setMode('apply');
    }
  };

  const handleSubmit = () => {
    if (mode === 'open') {
      handleOpenSubproof();
    } else if (mode === 'close') {
      handleCloseSubproof();
    } else {
      handleApply();
    }
  };

  // Handle rule selection - also try to auto-apply if lines are already selected
  const handleSelectInferenceRule = async (rule: InferenceRule | null) => {
    setSelectedInferenceRule(rule);
    setSelectedEquivalenceRule(null);
    setSelectedTechnique(null);
    if (rule) {
      setMode('apply');
      // Try to auto-apply immediately if we have the right lines
      if (selectedLines.length > 0) {
        await tryAutoApplyInference(rule, selectedLines);
      }
    }
  };

  const handleSelectEquivalenceRule = (rule: EquivalenceRule | null) => {
    setSelectedEquivalenceRule(rule);
    setSelectedInferenceRule(null);
    setSelectedTechnique(null);
    if (rule) setMode('apply');
  };

  const handleSelectTechnique = (technique: ProofTechnique | null) => {
    setSelectedTechnique(technique);
    setSelectedInferenceRule(null);
    setSelectedEquivalenceRule(null);
    if (technique) setMode('open');
  };

  const currentDepth = proof.scope_manager.scopes.filter(s => s.end_line === undefined).length;
  const hasOpenSubproof = currentDepth > 0;

  // Get the current scope's technique if there's an open subproof
  const currentScopeTechnique = hasOpenSubproof
    ? proof.scope_manager.scopes.find(s => s.end_line === undefined)?.technique
    : null;

  return (
    <div className="main-content">
      <div className="header">
        <h1>Proof Workspace</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={getHint}>
            Hint
          </button>
          <button className="btn btn-secondary" onClick={undoLine}>
            Undo
          </button>
          <button className="btn btn-secondary" onClick={clearProof}>
            Close
          </button>
        </div>
      </div>

      <div className="workspace-layout">
        <div className="proof-area">
          {/* Theorem Display */}
          <div className="theorem-display">
            <div className="label">Prove:</div>
            <div className="formula">
              {proof.theorem.premises.length > 0 && (
                <>
                  {proof.theorem.premises.map((p, i) => (
                    <span key={i}>
                      {formulaToString(p)}
                      {i < proof.theorem.premises.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                  {' ∴ '}
                </>
              )}
              {formulaToString(proof.theorem.conclusion)}
            </div>
          </div>

          {/* Proof Complete Message */}
          {proof.is_complete && (
            <div className="success-message fade-in">
              Proof Complete! The conclusion has been derived.
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="error-message">
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
                ×
              </button>
            </div>
          )}

          {/* Hint Message */}
          {hint && (
            <div className="hint-message">
              {hint}
            </div>
          )}

          {/* Fitch-style Proof Box */}
          <FitchBox
            proof={proof}
            selectedLines={selectedLines}
            onLineClick={handleLineClick}
            scopeGoals={scopeGoals}
            pendingGoalScopeId={pendingGoalScopeId}
            goalInput={goalInput}
            onGoalInputChange={setGoalInput}
            onGoalSubmit={handleGoalSubmit}
            onGoalSkip={handleGoalSkip}
          />

          {/* Mode Selector for Subproofs */}
          {(selectedTechnique || hasOpenSubproof) && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button
                className={`btn ${mode === 'apply' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMode('apply')}
              >
                Apply Rule
              </button>
              <button
                className={`btn ${mode === 'open' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMode('open')}
              >
                Open Subproof
              </button>
              {hasOpenSubproof && (
                <button
                  className={`btn ${mode === 'close' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setMode('close')}
                >
                  Close Subproof
                </button>
              )}
            </div>
          )}

          {/* Formula Input */}
          <FormulaInput
            value={formulaInput}
            onChange={setFormulaInput}
            onSubmit={handleSubmit}
            placeholder="Formula //lines, RULE  (e.g., Q //1, 2, MP)"
          />

          {/* Selection Info */}
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
            {selectedLines.length > 0 && (
              <span>Selected lines: {selectedLines.join(', ')}</span>
            )}
            {selectedInferenceRule && (
              <span style={{ marginLeft: selectedLines.length > 0 ? '16px' : 0 }}>
                Rule: {inferenceRuleInfo[selectedInferenceRule].name}
                (needs {inferenceRuleInfo[selectedInferenceRule].premises} premise(s))
              </span>
            )}
            {selectedEquivalenceRule && (
              <span style={{ marginLeft: selectedLines.length > 0 ? '16px' : 0 }}>
                Rule: {equivalenceRuleInfo[selectedEquivalenceRule].name} (select 1 line, enter result)
              </span>
            )}
            {mode === 'open' && selectedTechnique && (
              <span>Opening subproof with {proofTechniqueInfo[selectedTechnique].name}</span>
            )}
            {mode === 'close' && (
              <span>Closing subproof (technique: {currentScopeTechnique})</span>
            )}
          </div>
        </div>

        {/* Rule Palette */}
        <RulePalette
          selectedInferenceRule={selectedInferenceRule}
          selectedEquivalenceRule={selectedEquivalenceRule}
          selectedTechnique={selectedTechnique}
          onSelectInferenceRule={handleSelectInferenceRule}
          onSelectEquivalenceRule={handleSelectEquivalenceRule}
          onSelectTechnique={handleSelectTechnique}
        />
      </div>
    </div>
  );
};
