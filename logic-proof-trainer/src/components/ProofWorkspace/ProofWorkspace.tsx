import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useProof } from '../../hooks/useProof';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useScratchpad } from '../../hooks/useScratchpad';
import { FitchBox } from './FitchBox';
import { FormulaInput } from './FormulaInput';
import { RulePalette } from './RulePalette';
import type { InferenceRule, EquivalenceRule, ProofTechnique, TransformationResult } from '../../types';
import { inferenceRuleInfo, equivalenceRuleInfo, proofTechniqueInfo, formulaToString } from '../../types';
import { FormulaDisplay } from '../FormulaDisplay';

// Type for auto-close info from backend
interface AutoCloseInfo {
  technique: string;
  conclusion: string;
}

// Create reverse lookup maps from abbreviations to rule keys
// Includes official abbreviations plus common shorthands
const abbrevToInference: Record<string, InferenceRule> = {};
for (const [key, info] of Object.entries(inferenceRuleInfo)) {
  abbrevToInference[info.abbrev.toLowerCase()] = key as InferenceRule;
}
// Add shorthand aliases for inference rules - match rules.md abbreviations
const inferenceAliases: Record<string, InferenceRule> = {
  // Modus Ponens (MP)
  'modus': 'modusPonens',
  'ponens': 'modusPonens',
  // Modus Tollens (MT)
  'tollens': 'modusTollens',
  // Disjunctive Syllogism (DS)
  'disj': 'disjunctiveSyllogism',
  'disjsyl': 'disjunctiveSyllogism',
  // Simplification (Simp)
  'simple': 'simplification',
  // Conjunction (Conj)
  'and': 'conjunction',
  // Hypothetical Syllogism (HS)
  'hyp': 'hypotheticalSyllogism',
  'hypo': 'hypotheticalSyllogism',
  'syl': 'hypotheticalSyllogism',
  // Addition (Add)
  'or': 'addition',
  // Constructive Dilemma (CD)
  'dil': 'constructiveDilemma',
  'dilemma': 'constructiveDilemma',
};
Object.assign(abbrevToInference, inferenceAliases);

const abbrevToEquivalence: Record<string, EquivalenceRule> = {};
for (const [key, info] of Object.entries(equivalenceRuleInfo)) {
  abbrevToEquivalence[info.abbrev.toLowerCase()] = key as EquivalenceRule;
}
// Add shorthand aliases for equivalence rules - match rules.md abbreviations
const equivalenceAliases: Record<string, EquivalenceRule> = {
  // Double Negation (DN)
  'dn': 'doubleNegation',
  // DeMorgan's Theorem (DeM)
  'demorgan': 'deMorgan',
  'morgan': 'deMorgan',
  'dm': 'deMorgan',
  // Commutation (Comm)
  'com': 'commutation',
  // Association (Assoc)
  'associate': 'association',
  // Distribution (Dist)
  'distrib': 'distribution',
  'distribute': 'distribution',
  // Contraposition (Contra)
  'contrap': 'contraposition',
  'trans': 'contraposition',
  // Implication (Impl)
  'imp': 'implication',
  // Exportation (Exp)
  'export': 'exportation',
  // Tautology (Taut)
  // (abbrev is already 'taut')
  // Equivalence (Equiv)
  'eq': 'equivalence',
  'bicon': 'equivalence',
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
  // Legacy ~I aliases now map to IP (IP handles both directions)
  'negintro': 'indirectProof',
  'negi': 'indirectProof',
  '~i': 'indirectProof',
  'ni': 'indirectProof',
};
Object.assign(abbrevToTechnique, techniqueAliases);

// Unified parser for subproof close formats
// Returns { formula: string | null, technique: ProofTechnique } or null
function parseSubproofClose(input: string): { formula: string | null; technique: ProofTechnique } | null {
  const trimmed = input.trim();

  // Pattern 1: Just "CP" or "IP" (technique only - auto-close)
  const techOnlyMatch = trimmed.match(/^(cp|ip|~i|ni)$/i);
  if (techOnlyMatch) {
    const tech = abbrevToTechnique[techOnlyMatch[1].toLowerCase()];
    if (tech) return { formula: null, technique: tech };
  }

  // Pattern 2: "N-M TECH" or "N-M, TECH" or "//N-M, TECH" (range + technique, no formula)
  const rangeOnlyPattern = /^(?:\/\/\s*)?(\d+)\s*[-–]\s*(\d+)\s*,?\s*(cp|ip|~i|ni)$/i;
  const rangeOnlyMatch = trimmed.match(rangeOnlyPattern);
  if (rangeOnlyMatch) {
    const tech = abbrevToTechnique[rangeOnlyMatch[3].toLowerCase()];
    if (tech) return { formula: null, technique: tech };
  }

  // Pattern 3: "FORMULA N-M TECH" or "FORMULA //N-M TECH" etc. (formula + range + technique)
  // Use a greedy approach: find the technique at the end, then work backwards
  const withFormulaPattern = /^(.+?)\s+(?:\/\/\s*)?(\d+)\s*[-–]\s*(\d+)\s*,?\s*(cp|ip|~i|ni)$/i;
  const withFormulaMatch = trimmed.match(withFormulaPattern);
  if (withFormulaMatch) {
    const formula = withFormulaMatch[1].trim();
    const tech = abbrevToTechnique[withFormulaMatch[4].toLowerCase()];
    if (tech && formula) return { formula, technique: tech };
  }

  // Pattern 4: "FORMULA //TECH" or "FORMULA TECH" but NOT if formula contains a range
  // This catches "P > Q CP" style
  const simplePattern = /^(.+?)\s+(?:\/\/\s*)?(cp|ip|~i|ni)$/i;
  const simpleMatch = trimmed.match(simplePattern);
  if (simpleMatch) {
    const formula = simpleMatch[1].trim();
    const tech = abbrevToTechnique[simpleMatch[2].toLowerCase()];
    // Only use this if formula doesn't look like it contains line numbers
    if (tech && formula && !/\d+\s*[-–]\s*\d+/.test(formula)) {
      return { formula, technique: tech };
    }
  }

  return null;
}

// Helper to parse the "lines, rule" part
function parseRest(rest: string): { lines: number[]; rule: string } | null {
  const parts = rest.split(',').map(p => p.trim());
  if (parts.length < 2) return null;

  const rule = parts[parts.length - 1];
  const lineStrs = parts.slice(0, -1);
  const lines = lineStrs.map(s => parseInt(s, 10)).filter(n => !isNaN(n));

  if (lines.length === 0) return null;
  return { lines, rule };
}

// Parse input like "P //1, 2, MP" or "~Q //3, MT" or "Q 1,2 MP" or "Q 1, 2 MP"
function parseInput(input: string): {
  formula: string;
  lines: number[];
  rule: string;
} | null {
  // Try existing format first: "Q //1, 2, MP"
  const existingMatch = input.match(/^(.+?)\s*\/\/\s*(.+)$/);
  if (existingMatch) {
    const formula = existingMatch[1].trim();
    const parsed = parseRest(existingMatch[2].trim());
    if (parsed) {
      return { formula, ...parsed };
    }
  }

  // Try new format: "Q 1,2 MP" or "Q 1, 2 MP" or "Q 1,2, MP" or "Q 3 4 MP"
  // Pattern: formula + space + digits/commas/spaces (greedy, ending with digit) + space + rule
  const newMatch = input.match(/^(.+?)\s+(\d(?:[\d\s,]*\d)?)\s+([A-Za-z~]+)$/);
  if (newMatch) {
    const formula = newMatch[1].trim();
    const linesPart = newMatch[2];
    const rule = newMatch[3];

    // Parse line numbers: handle "1, 2" or "1,2" or "1 2"
    const lines = linesPart
      .split(/[\s,]+/)
      .map(s => parseInt(s, 10))
      .filter(n => !isNaN(n));

    if (lines.length > 0) {
      return { formula, lines, rule };
    }
  }

  // Format C: "MP 3,4" or "MP 3 4" (rule first, then lines, optional formula)
  const ruleFirstMatch = input.match(/^([A-Za-z~]+)\s+(\d(?:[\d\s,]*\d)?)\s*(?:,\s*)?(.*)$/);
  if (ruleFirstMatch) {
    const rule = ruleFirstMatch[1].trim();
    const linesPart = ruleFirstMatch[2];
    const formula = ruleFirstMatch[3]?.trim() || '';

    const lines = linesPart
      .split(/[\s,]+/)
      .map(s => parseInt(s, 10))
      .filter(n => !isNaN(n));

    if (lines.length > 0) {
      return { formula, lines, rule };
    }
  }

  return null;
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
    reorderProof,
    renameProof,
  } = useProof();

  const { saveToPortfolio } = usePortfolio();
  const { copiedFormula, clearCopiedFormula } = useScratchpad();

  const [formulaInput, setFormulaInput] = useState('');
  const [selectedInferenceRule, setSelectedInferenceRule] = useState<InferenceRule | null>(null);
  const [selectedEquivalenceRule, setSelectedEquivalenceRule] = useState<EquivalenceRule | null>(null);
  const [selectedTechnique, setSelectedTechnique] = useState<ProofTechnique | null>(null);
  const [mode, setMode] = useState<'apply' | 'open' | 'close'>('apply');

  // Goal tracking for subproofs
  const [scopeGoals, setScopeGoals] = useState<Record<string, string>>({});
  const [pendingGoalScopeId, setPendingGoalScopeId] = useState<string | null>(null);
  const [goalInput, setGoalInput] = useState('');

  // Proof renaming
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // Portfolio tracking
  const startTimeRef = useRef<number | null>(null);
  const hintsUsedRef = useRef(0);
  const savedToPortfolioRef = useRef<string | null>(null); // Track which proof was saved

  // Ref to track selectedLines for use in async handlers (avoids stale closure issues)
  const selectedLinesRef = useRef<number[]>(selectedLines);
  useEffect(() => {
    selectedLinesRef.current = selectedLines;
  }, [selectedLines]);

  // Auto-apply inference rule when we have the right number of lines selected
  const tryAutoApplyInference = useCallback(async (rule: InferenceRule, lines: number[]) => {
    const info = inferenceRuleInfo[rule];
    if (lines.length === info.premises) {
      // For rules that don't need additional input, auto-apply without formula
      if (!['addition'].includes(rule)) {
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
  const tryAutoApplyEquivalence = useCallback(async (rule: EquivalenceRule, line: number) => {
    if (!proof) return false;

    const proofLine = proof.lines.find(l => l.line_number === line);
    if (!proofLine) return false;

    try {
      // Get all possible transformations for this formula
      const allTransformations = await invoke<TransformationResult[]>('get_all_transformations', {
        formulaStr: formulaToString(proofLine.formula),
      });

      // Filter to only transformations matching the selected rule
      const matchingTransformations = allTransformations.filter(
        t => t.rule.toLowerCase() === rule.toLowerCase() ||
             t.rule_abbrev.toLowerCase() === equivalenceRuleInfo[rule].abbrev.toLowerCase()
      );

      // Auto-apply only if there's exactly one matching transformation
      if (matchingTransformations.length === 1) {
        const success = await applyEquivalenceRule(rule, line, matchingTransformations[0].result);
        if (success) {
          setSelectedEquivalenceRule(null);
          clearLineSelection();
        }
        return success;
      }

      // If multiple options, put first one in input field as suggestion
      if (matchingTransformations.length > 1) {
        setFormulaInput(matchingTransformations[0].result);
      }

      return false;
    } catch {
      return false;
    }
  }, [proof, applyEquivalenceRule, clearLineSelection]);

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

  // Start timer when proof begins
  useEffect(() => {
    if (proof && !proof.is_complete && startTimeRef.current === null) {
      startTimeRef.current = Date.now();
      hintsUsedRef.current = 0;
      savedToPortfolioRef.current = null;
    }
    // Reset when proof is cleared
    if (!proof) {
      startTimeRef.current = null;
      hintsUsedRef.current = 0;
      savedToPortfolioRef.current = null;
    }
  }, [proof]);

  // Save to portfolio when proof is completed
  useEffect(() => {
    if (proof?.is_complete && savedToPortfolioRef.current !== proof.id) {
      savedToPortfolioRef.current = proof.id;
      const timeSpent = startTimeRef.current
        ? Math.floor((Date.now() - startTimeRef.current) / 1000)
        : undefined;
      saveToPortfolio(proof, timeSpent, hintsUsedRef.current);
    }
  }, [proof, saveToPortfolio]);

  // Track hints used
  const handleGetHint = async () => {
    hintsUsedRef.current += 1;
    await getHint();
  };

  // Save incomplete proof progress to portfolio
  const handleSaveProgress = async () => {
    if (!proof || proof.is_complete) return;
    const timeSpent = startTimeRef.current
      ? Math.floor((Date.now() - startTimeRef.current) / 1000)
      : undefined;
    const entry = await saveToPortfolio(proof, timeSpent, hintsUsedRef.current);
    if (entry) {
      // Show brief success feedback (error state doubles as message)
      setError(null);
      // Could optionally add a success toast here
    }
  };

  // Populate formula input when a formula is copied from scratchpad
  useEffect(() => {
    if (copiedFormula) {
      setFormulaInput(copiedFormula);
      clearCopiedFormula();
    }
  }, [copiedFormula, clearCopiedFormula]);

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

    // FIRST: Check if this is a subproof close command
    const subproofClose = parseSubproofClose(formulaInput);
    if (subproofClose) {
      const { formula, technique } = subproofClose;
      if (formula) {
        // User provided a formula - use it directly
        const success = await closeSubproof(technique, formula);
        if (success) {
          setFormulaInput('');
        }
      } else {
        // No formula - try auto-close
        try {
          const autoClose = await invoke<AutoCloseInfo | null>('get_subproof_auto_close', { proof });
          if (autoClose) {
            const success = await closeSubproof(technique, autoClose.conclusion);
            if (success) {
              setFormulaInput('');
            }
          } else {
            if (technique === 'indirectProof') {
              setError('Cannot close: derive a contradiction (⊥) first');
            } else {
              setError('Cannot auto-close subproof - provide the conclusion formula');
            }
          }
        } catch (err) {
          setError(`Error closing subproof: ${err}`);
        }
      }
      return;
    }

    // Check for simple "Formula //technique" or "Formula technique" format for opening subproofs (e.g., "P //CP" or "P CP")
    const techMatch = formulaInput.match(/^(.+?)\s+(?:\/\/\s*)?(\w+)$/);
    if (techMatch) {
      const formula = techMatch[1].trim();
      const techAbbrev = techMatch[2].toLowerCase();
      // Only treat as subproof opening if it's a technique AND doesn't look like "Formula //lines, rule"
      if (abbrevToTechnique[techAbbrev] && !formulaInput.includes(',') && !formulaInput.includes('-')) {
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
      setError('Invalid format. Use: Q 1,2 MP  or  Q //1, 2, MP');
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

    // Check for format: "P //CP" or "~Q //IP" or "P CP" or "~Q IP"
    const match = formulaInput.match(/^(.+?)\s+(?:\/\/\s*)?(\w+)$/);
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
      setError('Select a proof technique (CP or IP) first');
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
      // No input - try auto-close with current technique
      const currentScope = proof?.scope_manager.scopes.find(s => s.end_line === undefined);
      const technique = selectedTechnique || (currentScope?.technique as ProofTechnique | undefined);

      if (!technique) {
        setError('No open subproof to close');
        return;
      }

      try {
        const autoClose = await invoke<AutoCloseInfo | null>('get_subproof_auto_close', { proof });
        if (autoClose) {
          const success = await closeSubproof(technique, autoClose.conclusion);
          if (success) {
            setFormulaInput('');
            setSelectedTechnique(null);
            setMode('apply');
          }
        } else {
          if (technique === 'indirectProof') {
            setError('Cannot close: derive a contradiction (⊥) first');
          } else {
            setError('Cannot auto-close subproof - provide the conclusion formula');
          }
        }
      } catch (err) {
        setError(`Error closing subproof: ${err}`);
      }
      return;
    }

    // Try parsing as subproof close
    const subproofClose = parseSubproofClose(formulaInput);
    if (subproofClose) {
      const { formula, technique } = subproofClose;
      if (formula) {
        const success = await closeSubproof(technique, formula);
        if (success) {
          setFormulaInput('');
          setSelectedTechnique(null);
          setMode('apply');
        }
      } else {
        // Auto-close
        try {
          const autoClose = await invoke<AutoCloseInfo | null>('get_subproof_auto_close', { proof });
          if (autoClose) {
            const success = await closeSubproof(technique, autoClose.conclusion);
            if (success) {
              setFormulaInput('');
              setSelectedTechnique(null);
              setMode('apply');
            }
          } else {
            if (technique === 'indirectProof') {
              setError('Cannot close: derive a contradiction (⊥) first');
            } else {
              setError('Cannot auto-close subproof');
            }
          }
        } catch (err) {
          setError(`Error closing subproof: ${err}`);
        }
      }
      return;
    }

    // Fall back: treat entire input as conclusion formula, use current scope's technique
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
      // Use ref to get latest selectedLines value (avoids stale closure)
      const lines = selectedLinesRef.current;
      if (lines.length > 0) {
        await tryAutoApplyInference(rule, lines);
      }
    }
  };

  const handleSelectEquivalenceRule = async (rule: EquivalenceRule | null) => {
    setSelectedEquivalenceRule(rule);
    setSelectedInferenceRule(null);
    setSelectedTechnique(null);
    if (rule) {
      setMode('apply');
      // Use ref to get latest selectedLines value (avoids stale closure)
      const lines = selectedLinesRef.current;
      if (lines.length === 1) {
        await tryAutoApplyEquivalence(rule, lines[0]);
      }
    }
  };

  const handleSelectTechnique = async (technique: ProofTechnique | null) => {
    if (!technique) {
      setSelectedTechnique(null);
      return;
    }

    // Get the innermost (current) open scope - this is what the backend uses
    const openScopes = proof?.scope_manager.scopes.filter(s => s.end_line === undefined) || [];
    const innermostScope = openScopes.length > 0 ? openScopes[openScopes.length - 1] : null;

    // Only try to auto-close if the innermost scope matches the clicked technique
    if (innermostScope && innermostScope.technique === technique) {
      // We're in an open subproof of the same type - try to auto-close
      try {
        const autoClose = await invoke<AutoCloseInfo | null>('get_subproof_auto_close', { proof });

        if (autoClose) {
          // Auto-close with computed conclusion
          const success = await closeSubproof(technique, autoClose.conclusion);
          if (success) {
            setSelectedTechnique(null);
            setMode('apply');
          }
        } else {
          // Can't auto-close (e.g., IP without contradiction)
          if (technique === 'indirectProof') {
            setError('Cannot close: derive a contradiction (⊥) first');
          } else {
            setError('Cannot auto-close subproof');
          }
        }
      } catch (err) {
        setError(`Error closing subproof: ${err}`);
      }
    } else {
      // Not in matching subproof - open new one or select technique
      setSelectedTechnique(technique);
      setSelectedInferenceRule(null);
      setSelectedEquivalenceRule(null);
      setMode('open');
    }
  };

  const currentDepth = proof.scope_manager.scopes.filter(s => s.end_line === undefined).length;
  const hasOpenSubproof = currentDepth > 0;

  // Get the current scope's technique if there's an open subproof
  const currentScopeTechnique = hasOpenSubproof
    ? proof.scope_manager.scopes.find(s => s.end_line === undefined)?.technique
    : null;

  const handleStartRename = () => {
    setNameInput(proof.theorem.name || '');
    setIsEditingName(true);
  };

  const handleSaveRename = () => {
    if (nameInput.trim()) {
      renameProof(nameInput.trim());
    }
    setIsEditingName(false);
  };

  const handleCancelRename = () => {
    setIsEditingName(false);
    setNameInput('');
  };

  return (
    <div className="main-content">
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isEditingName ? (
            <>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveRename();
                  if (e.key === 'Escape') handleCancelRename();
                }}
                autoFocus
                style={{
                  padding: '4px 8px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  border: '1px solid var(--accent)',
                  borderRadius: '4px',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  minWidth: '200px',
                }}
                placeholder="Enter name..."
              />
              <button className="btn btn-primary btn-small" onClick={handleSaveRename}>
                Save
              </button>
              <button className="btn btn-secondary btn-small" onClick={handleCancelRename}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <h1 style={{ cursor: 'pointer' }} onClick={handleStartRename} title="Click to rename">
                {proof.theorem.name || 'Untitled Proof'}
              </h1>
              <button
                className="btn-icon"
                onClick={handleStartRename}
                title="Rename proof"
                style={{ fontSize: '0.875rem' }}
              >
                ✏️
              </button>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!proof.is_complete && (
            <button className="btn btn-secondary" onClick={handleSaveProgress}>
              Save Progress
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleGetHint}>
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
                      <FormulaDisplay formula={p} />
                      {i < proof.theorem.premises.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                  {' ∴ '}
                </>
              )}
              <FormulaDisplay formula={proof.theorem.conclusion} />
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
            isComplete={proof.is_complete}
            onReorder={reorderProof}
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
            placeholder="Q 1,2 MP  or  Q //1, 2, MP"
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
          openSubproofTechnique={currentScopeTechnique as ProofTechnique | null}
          onSelectInferenceRule={handleSelectInferenceRule}
          onSelectEquivalenceRule={handleSelectEquivalenceRule}
          onSelectTechnique={handleSelectTechnique}
        />
      </div>
    </div>
  );
};
