/-
  Inference Rules and Equivalence Rules
  Defines the rules of natural deduction for propositional logic
-/

import LogicProofTrainer.Formula

namespace LogicProofTrainer

/-- Inference rule identifiers -/
inductive InferenceRule where
  | conjunctionIntro    -- ∧I: From P, Q derive P ∧ Q
  | conjunctionElimL    -- ∧E: From P ∧ Q derive P
  | conjunctionElimR    -- ∧E': From P ∧ Q derive Q
  | disjunctionIntroL   -- ∨I: From P derive P ∨ Q
  | disjunctionIntroR   -- ∨I': From Q derive P ∨ Q
  | disjunctionElim     -- ∨E: From P ∨ Q, P → R, Q → R derive R
  | modusPonens         -- MP: From P → Q, P derive Q
  | modusTollens        -- MT: From P → Q, ¬Q derive ¬P
  | doubleNegIntro      -- DNI: From P derive ¬¬P
  | doubleNegElim       -- DNE: From ¬¬P derive P
  | biconditionalIntro  -- ≡I: From P → Q, Q → P derive P ≡ Q
  | biconditionalElimL  -- ≡E: From P ≡ Q, P derive Q
  | biconditionalElimR  -- ≡E': From P ≡ Q, Q derive P
  | hypotheticalSyll    -- HS: From P → Q, Q → R derive P → R
  | disjunctiveSyll     -- DS: From P ∨ Q, ¬P derive Q
  | constructiveDilemma -- CD: From P ∨ Q, P → R, Q → S derive R ∨ S
  | reiteration         -- R: From P derive P
  deriving Repr, BEq

namespace InferenceRule

def name : InferenceRule → String
  | conjunctionIntro => "Conjunction Introduction"
  | conjunctionElimL => "Conjunction Elimination (Left)"
  | conjunctionElimR => "Conjunction Elimination (Right)"
  | disjunctionIntroL => "Disjunction Introduction (Left)"
  | disjunctionIntroR => "Disjunction Introduction (Right)"
  | disjunctionElim => "Disjunction Elimination"
  | modusPonens => "Modus Ponens"
  | modusTollens => "Modus Tollens"
  | doubleNegIntro => "Double Negation Introduction"
  | doubleNegElim => "Double Negation Elimination"
  | biconditionalIntro => "Biconditional Introduction"
  | biconditionalElimL => "Biconditional Elimination (Left)"
  | biconditionalElimR => "Biconditional Elimination (Right)"
  | hypotheticalSyll => "Hypothetical Syllogism"
  | disjunctiveSyll => "Disjunctive Syllogism"
  | constructiveDilemma => "Constructive Dilemma"
  | reiteration => "Reiteration"

def abbreviation : InferenceRule → String
  | conjunctionIntro => "∧I"
  | conjunctionElimL => "∧E"
  | conjunctionElimR => "∧E'"
  | disjunctionIntroL => "∨I"
  | disjunctionIntroR => "∨I'"
  | disjunctionElim => "∨E"
  | modusPonens => "MP"
  | modusTollens => "MT"
  | doubleNegIntro => "DNI"
  | doubleNegElim => "DNE"
  | biconditionalIntro => "≡I"
  | biconditionalElimL => "≡E"
  | biconditionalElimR => "≡E'"
  | hypotheticalSyll => "HS"
  | disjunctiveSyll => "DS"
  | constructiveDilemma => "CD"
  | reiteration => "R"

/-- Number of premises required -/
def premiseCount : InferenceRule → Nat
  | conjunctionIntro => 2
  | conjunctionElimL => 1
  | conjunctionElimR => 1
  | disjunctionIntroL => 1
  | disjunctionIntroR => 1
  | disjunctionElim => 3
  | modusPonens => 2
  | modusTollens => 2
  | doubleNegIntro => 1
  | doubleNegElim => 1
  | biconditionalIntro => 2
  | biconditionalElimL => 2
  | biconditionalElimR => 2
  | hypotheticalSyll => 2
  | disjunctiveSyll => 2
  | constructiveDilemma => 3
  | reiteration => 1

/-- Apply the rule to premises, returning the derived formula if valid -/
def apply (rule : InferenceRule) (premises : List Formula) (additional : Option Formula := none) : Option Formula :=
  match rule, premises with
  | conjunctionIntro, [p, q] => some (.and p q)
  | conjunctionElimL, [.and p _] => some p
  | conjunctionElimR, [.and _ q] => some q
  | disjunctionIntroL, [p] => additional.map fun q => .or p q
  | disjunctionIntroR, [q] => additional.map fun p => .or p q
  | disjunctionElim, [.or p q, .implies p' r, .implies q' r'] =>
    if p == p' && q == q' && r == r' then some r else none
  | modusPonens, [.implies p q, p'] => if p == p' then some q else none
  | modusPonens, [p', .implies p q] => if p == p' then some q else none
  | modusTollens, [.implies p q, .not q'] => if q == q' then some (.not p) else none
  | modusTollens, [.not q', .implies p q] => if q == q' then some (.not p) else none
  | doubleNegIntro, [p] => some (.not (.not p))
  | doubleNegElim, [.not (.not p)] => some p
  | biconditionalIntro, [.implies p q, .implies q' p'] =>
    if p == p' && q == q' then some (.biconditional p q) else none
  | biconditionalElimL, [.biconditional p q, p'] => if p == p' then some q else none
  | biconditionalElimL, [p', .biconditional p q] => if p == p' then some q else none
  | biconditionalElimR, [.biconditional p q, q'] => if q == q' then some p else none
  | biconditionalElimR, [q', .biconditional p q] => if q == q' then some p else none
  | hypotheticalSyll, [.implies p q, .implies q' r] =>
    if q == q' then some (.implies p r) else none
  | hypotheticalSyll, [.implies q' r, .implies p q] =>
    if q == q' then some (.implies p r) else none
  | disjunctiveSyll, [.or p q, .not p'] => if p == p' then some q else none
  | disjunctiveSyll, [.not p', .or p q] => if p == p' then some q else none
  | disjunctiveSyll, [.or p q, .not q'] => if q == q' then some p else none
  | disjunctiveSyll, [.not q', .or p q] => if q == q' then some p else none
  | constructiveDilemma, [.or p q, .implies p' r, .implies q' s] =>
    if p == p' && q == q' then some (.or r s) else none
  | reiteration, [p] => some p
  | _, _ => none

/-- Verify that applying the rule produces the expected conclusion -/
def verify (rule : InferenceRule) (premises : List Formula) (conclusion : Formula) (additional : Option Formula := none) : Bool :=
  rule.apply premises additional == some conclusion

end InferenceRule

/-- Equivalence rule identifiers -/
inductive EquivalenceRule where
  | deMorgansAnd        -- ~(P ∧ Q) ≡ ~P ∨ ~Q
  | deMorgansOr         -- ~(P ∨ Q) ≡ ~P ∧ ~Q
  | commutationAnd      -- P ∧ Q ≡ Q ∧ P
  | commutationOr       -- P ∨ Q ≡ Q ∨ P
  | associationAnd      -- (P ∧ Q) ∧ R ≡ P ∧ (Q ∧ R)
  | associationOr       -- (P ∨ Q) ∨ R ≡ P ∨ (Q ∨ R)
  | distributionAndOr   -- P ∧ (Q ∨ R) ≡ (P ∧ Q) ∨ (P ∧ R)
  | distributionOrAnd   -- P ∨ (Q ∧ R) ≡ (P ∨ Q) ∧ (P ∨ R)
  | contraposition      -- P → Q ≡ ~Q → ~P
  | materialImplication -- P → Q ≡ ~P ∨ Q
  | materialEquivalence -- P ≡ Q ≡ (P → Q) ∧ (Q → P)
  | exportation         -- (P ∧ Q) → R ≡ P → (Q → R)
  | tautology           -- P ≡ P ∨ P ≡ P ∧ P
  | absorption          -- P → Q ≡ P → (P ∧ Q)
  deriving Repr, BEq

namespace EquivalenceRule

def name : EquivalenceRule → String
  | deMorgansAnd => "De Morgan's (And)"
  | deMorgansOr => "De Morgan's (Or)"
  | commutationAnd => "Commutation (And)"
  | commutationOr => "Commutation (Or)"
  | associationAnd => "Association (And)"
  | associationOr => "Association (Or)"
  | distributionAndOr => "Distribution (And over Or)"
  | distributionOrAnd => "Distribution (Or over And)"
  | contraposition => "Contraposition"
  | materialImplication => "Material Implication"
  | materialEquivalence => "Material Equivalence"
  | exportation => "Exportation"
  | tautology => "Tautology"
  | absorption => "Absorption"

def abbreviation : EquivalenceRule → String
  | deMorgansAnd => "DeM"
  | deMorgansOr => "DeM'"
  | commutationAnd => "Com"
  | commutationOr => "Com'"
  | associationAnd => "Assoc"
  | associationOr => "Assoc'"
  | distributionAndOr => "Dist"
  | distributionOrAnd => "Dist'"
  | contraposition => "Contra"
  | materialImplication => "Impl"
  | materialEquivalence => "Equiv"
  | exportation => "Exp"
  | tautology => "Taut"
  | absorption => "Abs"

/-- Get equivalent forms of a formula under this rule -/
def equivalentForms (rule : EquivalenceRule) (f : Formula) : List Formula :=
  match rule, f with
  | deMorgansAnd, .not (.and p q) => [.or (.not p) (.not q)]
  | deMorgansAnd, .or (.not p) (.not q) => [.not (.and p q)]
  | deMorgansOr, .not (.or p q) => [.and (.not p) (.not q)]
  | deMorgansOr, .and (.not p) (.not q) => [.not (.or p q)]
  | commutationAnd, .and p q => [.and q p]
  | commutationOr, .or p q => [.or q p]
  | associationAnd, .and (.and p q) r => [.and p (.and q r)]
  | associationAnd, .and p (.and q r) => [.and (.and p q) r]
  | associationOr, .or (.or p q) r => [.or p (.or q r)]
  | associationOr, .or p (.or q r) => [.or (.or p q) r]
  | distributionAndOr, .and p (.or q r) => [.or (.and p q) (.and p r)]
  | distributionAndOr, .or (.and p q) (.and p' r) =>
    if p == p' then [.and p (.or q r)] else []
  | distributionOrAnd, .or p (.and q r) => [.and (.or p q) (.or p r)]
  | distributionOrAnd, .and (.or p q) (.or p' r) =>
    if p == p' then [.or p (.and q r)] else []
  | contraposition, .implies p q => [.implies (.not q) (.not p)]
  | contraposition, .implies (.not q) (.not p) => [.implies p q]
  | materialImplication, .implies p q => [.or (.not p) q]
  | materialImplication, .or (.not p) q => [.implies p q]
  | materialEquivalence, .biconditional p q => [.and (.implies p q) (.implies q p)]
  | materialEquivalence, .and (.implies p q) (.implies q' p') =>
    if p == p' && q == q' then [.biconditional p q] else []
  | exportation, .implies (.and p q) r => [.implies p (.implies q r)]
  | exportation, .implies p (.implies q r) => [.implies (.and p q) r]
  | tautology, f => [.or f f, .and f f]
  | absorption, .implies p q => [.implies p (.and p q)]
  | absorption, .implies p (.and p' q) => if p == p' then [.implies p q] else []
  | _, _ => []

/-- Verify that transforming from one formula to another is valid -/
def verify (rule : EquivalenceRule) (from_ to : Formula) : Bool :=
  rule.equivalentForms from_ |>.contains to

end EquivalenceRule

/-- Proof technique identifiers -/
inductive ProofTechnique where
  | conditionalProof    -- →I: Assume P, derive Q, conclude P → Q
  | indirectProof       -- IP: Assume ~P, derive ⊥, conclude P
  | negationIntro       -- ~I: Assume P, derive ⊥, conclude ~P
  deriving Repr, BEq

namespace ProofTechnique

def name : ProofTechnique → String
  | conditionalProof => "Conditional Proof"
  | indirectProof => "Indirect Proof"
  | negationIntro => "Negation Introduction"

def abbreviation : ProofTechnique → String
  | conditionalProof => "→I"
  | indirectProof => "IP"
  | negationIntro => "~I"

/-- Derive the formula from closing a subproof -/
def deriveFromSubproof (tech : ProofTechnique) (assumption conclusion : Formula) : Option Formula :=
  match tech with
  | conditionalProof => some (.implies assumption conclusion)
  | indirectProof =>
    if conclusion == .contradiction then
      match assumption with
      | .not p => some p
      | _ => none
    else none
  | negationIntro =>
    if conclusion == .contradiction then some (.not assumption) else none

end ProofTechnique

end LogicProofTrainer
