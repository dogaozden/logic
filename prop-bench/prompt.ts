// PropBench — Prompt template builder
//
// Builds a complete prompt for an LLM to produce a Fitch-style natural
// deduction proof. Includes all 19 rules, CP/IP techniques, symbol
// reference, and strict output format specification.

import { Theorem } from "./config";

// ─── Rule reference (included verbatim in every prompt) ─────────────────────

const INFERENCE_RULES = `\
VALID ARGUMENT FORMS (Inference Rules)
These rules derive a NEW formula from cited premise lines.

 #  Name                     Abbrev  Pattern
 1  Modus Ponens             MP      p > q, p           ∴ q
 2  Modus Tollens            MT      p > q, ~q          ∴ ~p
 3  Disjunctive Syllogism    DS      p v q, ~p          ∴ q
 4  Simplification           Simp    p . q              ∴ p  (or q)
 5  Conjunction              Conj    p, q               ∴ p . q
 6  Hypothetical Syllogism   HS      p > q, q > r       ∴ p > r
 7  Addition                 Add     p                  ∴ p v q
 8  Constructive Dilemma     CD      p v q, p > r, q > s  ∴ r v s
 9  Negation Elimination     NegE    p, ~p              ∴ ⊥`;

const EQUIVALENCE_RULES = `\
VALID EQUIVALENCE FORMS (Replacement Rules)
These rules REPLACE a formula (or subformula) with a logically
equivalent form. They work bidirectionally and on subformulas.

 #   Name              Abbrev   Equivalence
 10  Double Negation   DN       p  ::  ~~p
 11  DeMorgan's        DeM      ~(p . q)  ::  ~p v ~q
                                ~(p v q)  ::  ~p . ~q
 12  Commutation       Comm     p v q  ::  q v p
                                p . q  ::  q . p
 13  Association       Assoc    p v (q v r)  ::  (p v q) v r
                                p . (q . r)  ::  (p . q) . r
 14  Distribution      Dist     p . (q v r)  ::  (p . q) v (p . r)
                                p v (q . r)  ::  (p v q) . (p v r)
 15  Contraposition    Contra   p > q  ::  ~q > ~p
 16  Implication       Impl     p > q  ::  ~p v q
 17  Exportation       Exp      (p . q) > r  ::  p > (q > r)
 18  Tautology         Taut     p  ::  p . p
                                p  ::  p v p
 19  Equivalence       Equiv    p ≡ q  ::  (p > q) . (q > p)`;

const TECHNIQUES = `\
PROOF TECHNIQUES (Subproofs)

Conditional Proof (CP):
  1. Assume p              (opens a subproof — write "Assumption (CP)")
  2. Derive q              (within the subproof, using any rules)
  3. Close: p > q          (write "CP start-end" where start-end are
                            the line numbers of the subproof)

Indirect Proof (IP):
  1. Assume p (or ~p)      (opens a subproof — write "Assumption (IP)")
  2. Derive a contradiction (⊥, or any A . ~A)
  3. Close: ~p (or p)      (write "IP start-end" — negation of assumption)

Subproofs can be nested. Lines inside a closed subproof cannot be
cited from outside it.`;

const SYMBOLS = `\
SYMBOL REFERENCE
  >   conditional (if...then)
  v   disjunction (or)
  .   conjunction (and)
  ~   negation (not)
  ≡   biconditional (if and only if)
  ⊥   contradiction (bottom / falsum)
Use standard parentheses for grouping.`;

const OUTPUT_FORMAT = `\
OUTPUT FORMAT
Write each proof line as:
  N. FORMULA JUSTIFICATION

Where JUSTIFICATION is one of:
  Premise                    — for given premises
  Assumption (CP)            — opens a CP subproof
  Assumption (IP)            — opens an IP subproof
  RULE LINE_NUMBERS          — e.g. MP 1,2  or  Simp 3  or  DeM 5
  CP START-END               — closes a CP subproof (e.g. CP 3-7)
  IP START-END               — closes an IP subproof (e.g. IP 4-9)

Indent lines inside subproofs with 2 extra spaces per nesting level.
Minimize the total number of proof lines.`;

// ─── Prompt builder ─────────────────────────────────────────────────────────

/**
 * Build a complete benchmark prompt for a given theorem.
 *
 * - Easy theorems (difficulty_value 1-25) have explicit premises + conclusion.
 * - Medium+ theorems (26-100) are standalone tautologies with no premises.
 */
export function buildPrompt(theorem: Theorem): string {
  const hasPremises = theorem.premises.length > 0;

  const theoremSection = hasPremises
    ? formatTheoremWithPremises(theorem)
    : formatTautology(theorem);

  return `\
You are a formal logic proof assistant. Given a theorem, produce a
correct Fitch-style natural deduction proof using ONLY the rules and
techniques listed below. Minimize the number of proof lines.

${SYMBOLS}

${INFERENCE_RULES}

${EQUIVALENCE_RULES}

${TECHNIQUES}

${OUTPUT_FORMAT}

─────────────────────────────────────
THEOREM TO PROVE
${theoremSection}
─────────────────────────────────────

Write your proof below. Output ONLY the numbered proof lines.
Do not include any explanation, commentary, or extra text.`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTheoremWithPremises(theorem: Theorem): string {
  const premiseList = theorem.premises
    .map((p, i) => `  ${i + 1}. ${p}`)
    .join("\n");

  return `\
Premises:
${premiseList}
Conclusion: ${theorem.conclusion}

Your proof must begin with the premises as given (justified as "Premise"),
then derive the conclusion.`;
}

function formatTautology(theorem: Theorem): string {
  return `\
Prove the following tautology (no premises):
  ${theorem.conclusion}

Since there are no premises, you will need to use Conditional Proof (CP)
and/or Indirect Proof (IP) to derive the formula.`;
}
