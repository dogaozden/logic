// Formula types - mirrors Rust Formula enum
export type Formula =
  | { type: 'Atom'; value: string }
  | { type: 'Not'; value: Formula }
  | { type: 'And'; value: [Formula, Formula] }
  | { type: 'Or'; value: [Formula, Formula] }
  | { type: 'Implies'; value: [Formula, Formula] }
  | { type: 'Biconditional'; value: [Formula, Formula] }
  | { type: 'Contradiction' };

// Difficulty levels
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

// Theorem themes
export type Theme =
  | 'modusPonens'
  | 'modusTollens'
  | 'hypotheticalSyllogism'
  | 'disjunctiveSyllogism'
  | 'constructiveDilemma'
  | 'conjunction'
  | 'disjunction'
  | 'doubleNegation'
  | 'biconditional'
  | 'conditionalProof'
  | 'indirectProof'
  | 'equivalence'
  | 'mixed';

// Theorem structure
export interface Theorem {
  id: string;
  premises: Formula[];
  conclusion: Formula;
  difficulty: Difficulty;
  theme?: Theme;
  name?: string;
  is_classic: boolean;
}

// Inference rules (consolidated - system tries all variants automatically)
export type InferenceRule =
  | 'modusPonens'
  | 'modusTollens'
  | 'hypotheticalSyllogism'
  | 'disjunctiveSyllogism'
  | 'constructiveDilemma'
  | 'conjunctionIntro'
  | 'conjunctionElim'      // tries both left and right
  | 'disjunctionIntro'     // tries both placements
  | 'disjunctionElim'
  | 'doubleNegation'       // tries both intro and elim
  | 'biconditionalIntro'
  | 'biconditionalElim'    // tries both directions
  | 'reiteration';

// Equivalence rules (consolidated - system tries all variants automatically)
export type EquivalenceRule =
  | 'deMorgan'             // tries both And and Or forms
  | 'commutation'
  | 'association'
  | 'distribution'         // tries both And/Or and Or/And forms
  | 'contraposition'
  | 'materialImplication'
  | 'materialEquivalence'
  | 'exportation'
  | 'tautology'
  | 'absorption'
  | 'doubleNegation';

// Proof techniques
export type ProofTechnique =
  | 'conditionalProof'
  | 'indirectProof'
  | 'negationIntroduction';

// Justification for proof lines
export type Justification =
  | { type: 'Premise' }
  | { type: 'Assumption'; technique: ProofTechnique }
  | { type: 'Inference'; rule: InferenceRule; lines: number[] }
  | { type: 'Equivalence'; rule: EquivalenceRule; line: number }
  | {
      type: 'SubproofConclusion';
      technique: ProofTechnique;
      subproof_start: number;
      subproof_end: number;
    };

// Proof line
export interface ProofLine {
  id: string;
  line_number: number;
  formula: Formula;
  justification: Justification;
  depth: number;
  scope_id?: string;
  is_valid: boolean;
  validation_message?: string;
}

// Proof scope
export interface ProofScope {
  id: string;
  start_line: number;
  end_line?: number;
  assumption: Formula;
  technique: ProofTechnique;
  depth: number;
  parent_scope_id?: string;
}

// Scope manager
export interface ScopeManager {
  scopes: ProofScope[];
  next_scope_id: number;
}

// Complete proof
export interface Proof {
  id: string;
  theorem: Theorem;
  lines: ProofLine[];
  scope_manager: ScopeManager;
  is_complete: boolean;
}

// Rule application for commands
export type RuleApplication =
  | {
      type: 'Inference';
      rule: InferenceRule;
      lines: number[];
      additional_formula?: string;
    }
  | {
      type: 'Equivalence';
      rule: EquivalenceRule;
      line: number;
    };

// Statistics types
export interface DifficultyStats {
  attempted: number;
  completed: number;
  average_time_secs?: number;
  average_steps?: number;
}

export interface ThemeStats {
  attempted: number;
  completed: number;
}

export interface ProofAttempt {
  theorem_id: string;
  started_at: string;
  completed_at?: string;
  completed: boolean;
  steps: number;
  hints_used: number;
  rules_used: string[];
}

export interface UserStatistics {
  total_proofs_attempted: number;
  total_proofs_completed: number;
  current_streak: number;
  longest_streak: number;
  last_proof_date?: string;
  difficulty_stats: Record<string, DifficultyStats>;
  theme_stats: Record<string, ThemeStats>;
  rule_usage: Record<string, number>;
  recent_attempts: ProofAttempt[];
}

// Helper functions for displaying formulas
// Uses bracket hierarchy: innermost () → [] → {} outermost
export function formulaToString(formula: Formula): string {
  const maxDepth = bracketDepth(formula);
  return formulaToStringWithDepth(formula, 0, maxDepth);
}

// Calculate maximum bracket nesting depth needed
function bracketDepth(formula: Formula): number {
  switch (formula.type) {
    case 'Atom':
    case 'Contradiction':
      return 0;
    case 'Not': {
      const needsParens = !['Atom', 'Not', 'Contradiction'].includes(formula.value.type);
      if (needsParens) {
        return 1 + bracketDepth(formula.value);
      }
      return bracketDepth(formula.value);
    }
    case 'And':
    case 'Or':
    case 'Implies':
    case 'Biconditional': {
      const [left, right] = formula.value;
      const leftNeeds = subformulaBracketDepth(left);
      const rightNeeds = subformulaBracketDepth(right);
      return Math.max(leftNeeds, rightNeeds);
    }
  }
}

function subformulaBracketDepth(formula: Formula): number {
  if (formula.type === 'Atom' || formula.type === 'Contradiction') {
    return 0;
  }
  if (formula.type === 'Not' && formula.value.type === 'Atom') {
    return 0;
  }
  return 1 + bracketDepth(formula);
}

function formulaToStringWithDepth(formula: Formula, currentDepth: number, maxDepth: number): string {
  switch (formula.type) {
    case 'Atom':
      return formula.value;
    case 'Contradiction':
      return '⊥';
    case 'Not': {
      const needsParens = !['Atom', 'Not', 'Contradiction'].includes(formula.value.type);
      if (needsParens) {
        const inner = formulaToStringWithDepth(formula.value, currentDepth + 1, maxDepth);
        const [open, close] = bracketsForLevel(currentDepth, maxDepth);
        return `~${open}${inner}${close}`;
      }
      const inner = formulaToStringWithDepth(formula.value, currentDepth, maxDepth);
      return `~${inner}`;
    }
    case 'And': {
      const [left, right] = formula.value;
      return `${wrapIfCompound(left, currentDepth, maxDepth)} . ${wrapIfCompound(right, currentDepth, maxDepth)}`;
    }
    case 'Or': {
      const [left, right] = formula.value;
      return `${wrapIfCompound(left, currentDepth, maxDepth)} ∨ ${wrapIfCompound(right, currentDepth, maxDepth)}`;
    }
    case 'Implies': {
      const [left, right] = formula.value;
      return `${wrapIfCompound(left, currentDepth, maxDepth)} ⊃ ${wrapIfCompound(right, currentDepth, maxDepth)}`;
    }
    case 'Biconditional': {
      const [left, right] = formula.value;
      return `${wrapIfCompound(left, currentDepth, maxDepth)} ≡ ${wrapIfCompound(right, currentDepth, maxDepth)}`;
    }
  }
}

// Get bracket pair based on level from inside out: () innermost, [] middle, {} outermost
function bracketsForLevel(currentDepth: number, maxDepth: number): [string, string] {
  const levelFromInside = maxDepth - currentDepth - 1;
  switch (levelFromInside % 3) {
    case 0: return ['(', ')'];
    case 1: return ['[', ']'];
    default: return ['{', '}'];
  }
}

// Wrap in brackets if compound
function wrapIfCompound(formula: Formula, currentDepth: number, maxDepth: number): string {
  if (formula.type === 'Atom' || formula.type === 'Contradiction') {
    return formulaToStringWithDepth(formula, currentDepth, maxDepth);
  }
  if (formula.type === 'Not' && formula.value.type === 'Atom') {
    return formulaToStringWithDepth(formula, currentDepth, maxDepth);
  }
  const [open, close] = bracketsForLevel(currentDepth, maxDepth);
  const inner = formulaToStringWithDepth(formula, currentDepth + 1, maxDepth);
  return `${open}${inner}${close}`;
}

// Rule display info (consolidated) with symbolic representations
export const inferenceRuleInfo: Record<InferenceRule, { name: string; abbrev: string; premises: number; symbol: string }> = {
  modusPonens: { name: 'Modus Ponens', abbrev: 'MP', premises: 2, symbol: 'P ⊃ Q, P ∴ Q' },
  modusTollens: { name: 'Modus Tollens', abbrev: 'MT', premises: 2, symbol: 'P ⊃ Q, ~Q ∴ ~P' },
  hypotheticalSyllogism: { name: 'Hypothetical Syllogism', abbrev: 'HS', premises: 2, symbol: 'P ⊃ Q, Q ⊃ R ∴ P ⊃ R' },
  disjunctiveSyllogism: { name: 'Disjunctive Syllogism', abbrev: 'DS', premises: 2, symbol: 'P ∨ Q, ~P ∴ Q' },
  constructiveDilemma: { name: 'Constructive Dilemma', abbrev: 'CD', premises: 2, symbol: '(P ⊃ Q) . (R ⊃ S), P ∨ R ∴ Q ∨ S' },
  conjunctionIntro: { name: 'Conjunction Introduction', abbrev: '∧I', premises: 2, symbol: 'P, Q ∴ P . Q' },
  conjunctionElim: { name: 'Conjunction Elimination', abbrev: '∧E', premises: 1, symbol: 'P . Q ∴ P or Q' },
  disjunctionIntro: { name: 'Disjunction Introduction', abbrev: '∨I', premises: 1, symbol: 'P ∴ P ∨ Q' },
  disjunctionElim: { name: 'Disjunction Elimination', abbrev: '∨E', premises: 3, symbol: 'P ∨ Q, P ⊃ R, Q ⊃ R ∴ R' },
  doubleNegation: { name: 'Double Negation', abbrev: 'DN', premises: 1, symbol: 'P ∴ ~~P or ~~P ∴ P' },
  biconditionalIntro: { name: 'Biconditional Introduction', abbrev: '≡I', premises: 2, symbol: 'P ⊃ Q, Q ⊃ P ∴ P ≡ Q' },
  biconditionalElim: { name: 'Biconditional Elimination', abbrev: '≡E', premises: 2, symbol: 'P ≡ Q, P ∴ Q' },
  reiteration: { name: 'Reiteration', abbrev: 'R', premises: 1, symbol: 'P ∴ P' },
};

export const equivalenceRuleInfo: Record<EquivalenceRule, { name: string; abbrev: string; symbol: string }> = {
  deMorgan: { name: "De Morgan's", abbrev: 'DeM', symbol: '~(P . Q) ≡ ~P ∨ ~Q' },
  commutation: { name: 'Commutation', abbrev: 'Com', symbol: 'P . Q ≡ Q . P' },
  association: { name: 'Association', abbrev: 'Assoc', symbol: '(P . Q) . R ≡ P . (Q . R)' },
  distribution: { name: 'Distribution', abbrev: 'Dist', symbol: 'P . (Q ∨ R) ≡ (P . Q) ∨ (P . R)' },
  contraposition: { name: 'Contraposition', abbrev: 'Contra', symbol: 'P ⊃ Q ≡ ~Q ⊃ ~P' },
  materialImplication: { name: 'Material Implication', abbrev: 'Impl', symbol: 'P ⊃ Q ≡ ~P ∨ Q' },
  materialEquivalence: { name: 'Material Equivalence', abbrev: 'Equiv', symbol: 'P ≡ Q ≡ (P ⊃ Q) . (Q ⊃ P)' },
  exportation: { name: 'Exportation', abbrev: 'Exp', symbol: '(P . Q) ⊃ R ≡ P ⊃ (Q ⊃ R)' },
  tautology: { name: 'Tautology', abbrev: 'Taut', symbol: 'P ≡ P . P ≡ P ∨ P' },
  absorption: { name: 'Absorption', abbrev: 'Abs', symbol: 'P . (P ∨ Q) ≡ P' },
  doubleNegation: { name: 'Double Negation', abbrev: 'DN', symbol: 'P ≡ ~~P' },
};

export const proofTechniqueInfo: Record<ProofTechnique, { name: string; abbrev: string }> = {
  conditionalProof: { name: 'Conditional Proof', abbrev: 'CP' },
  indirectProof: { name: 'Indirect Proof', abbrev: 'IP' },
  negationIntroduction: { name: 'Negation Introduction', abbrev: '~I' },
};

export function justificationToString(j: Justification): string {
  switch (j.type) {
    case 'Premise':
      return 'Premise';
    case 'Assumption':
      return `Assumption (${proofTechniqueInfo[j.technique].abbrev})`;
    case 'Inference':
      return `${inferenceRuleInfo[j.rule].abbrev} ${j.lines.join(', ')}`;
    case 'Equivalence':
      return `${equivalenceRuleInfo[j.rule].abbrev} ${j.line}`;
    case 'SubproofConclusion':
      return `${proofTechniqueInfo[j.technique].abbrev} ${j.subproof_start}-${j.subproof_end}`;
  }
}

export function difficultyColor(d: Difficulty): string {
  switch (d) {
    case 'easy':
      return '#4caf50';
    case 'medium':
      return '#ff9800';
    case 'hard':
      return '#f44336';
    case 'expert':
      return '#9c27b0';
  }
}
