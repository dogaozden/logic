/-
  Propositional Logic Formula Definition
  Mirrors the Swift Formula type for verification
-/

namespace LogicProofTrainer

/-- Propositional logic formula AST -/
inductive Formula where
  | atom : String → Formula
  | not : Formula → Formula
  | and : Formula → Formula → Formula
  | or : Formula → Formula → Formula
  | implies : Formula → Formula → Formula
  | biconditional : Formula → Formula → Formula
  | contradiction : Formula
  deriving Repr, BEq, Hashable, Inhabited

namespace Formula

/-- Convert formula to display string with logical symbols -/
def toDisplayString : Formula → String
  | atom s => s
  | not p => s!"~{p.toDisplayStringParens}"
  | and p q => s!"{p.toDisplayStringParens} · {q.toDisplayStringParens}"
  | or p q => s!"{p.toDisplayStringParens} ∨ {q.toDisplayStringParens}"
  | implies p q => s!"{p.toDisplayStringParens} ⊃ {q.toDisplayStringParens}"
  | biconditional p q => s!"{p.toDisplayStringParens} ≡ {q.toDisplayStringParens}"
  | contradiction => "⊥"
where
  toDisplayStringParens : Formula → String
    | atom s => s
    | contradiction => "⊥"
    | f => s!"({f.toDisplayString})"

/-- Convert formula to ASCII string -/
def toAsciiString : Formula → String
  | atom s => s
  | not p => s!"~{p.toAsciiStringParens}"
  | and p q => s!"{p.toAsciiStringParens} & {q.toAsciiStringParens}"
  | or p q => s!"{p.toAsciiStringParens} | {q.toAsciiStringParens}"
  | implies p q => s!"{p.toAsciiStringParens} -> {q.toAsciiStringParens}"
  | biconditional p q => s!"{p.toAsciiStringParens} <-> {q.toAsciiStringParens}"
  | contradiction => "_|_"
where
  toAsciiStringParens : Formula → String
    | atom s => s
    | contradiction => "_|_"
    | f => s!"({f.toAsciiString})"

instance : ToString Formula where
  toString := toDisplayString

/-- Get all atomic propositions in a formula -/
def atoms : Formula → List String
  | atom s => [s]
  | not p => p.atoms
  | and p q => p.atoms ++ q.atoms
  | or p q => p.atoms ++ q.atoms
  | implies p q => p.atoms ++ q.atoms
  | biconditional p q => p.atoms ++ q.atoms
  | contradiction => []

/-- Depth of formula nesting -/
def depth : Formula → Nat
  | atom _ => 0
  | contradiction => 0
  | not p => 1 + p.depth
  | and p q => 1 + max p.depth q.depth
  | or p q => 1 + max p.depth q.depth
  | implies p q => 1 + max p.depth q.depth
  | biconditional p q => 1 + max p.depth q.depth

/-- Substitute a variable with a formula -/
def substitute (var : String) (replacement : Formula) : Formula → Formula
  | atom s => if s == var then replacement else atom s
  | not p => not (p.substitute var replacement)
  | and p q => and (p.substitute var replacement) (q.substitute var replacement)
  | or p q => or (p.substitute var replacement) (q.substitute var replacement)
  | implies p q => implies (p.substitute var replacement) (q.substitute var replacement)
  | biconditional p q => biconditional (p.substitute var replacement) (q.substitute var replacement)
  | contradiction => contradiction

end Formula

/-- Truth assignment for propositional variables -/
abbrev Assignment := String → Bool

/-- Evaluate a formula under an assignment -/
def Formula.eval (f : Formula) (v : Assignment) : Bool :=
  match f with
  | .atom s => v s
  | .not p => !p.eval v
  | .and p q => p.eval v && q.eval v
  | .or p q => p.eval v || q.eval v
  | .implies p q => !p.eval v || q.eval v
  | .biconditional p q => p.eval v == q.eval v
  | .contradiction => false

/-- Check if formula is a tautology (valid under all assignments) -/
def Formula.isTautology (f : Formula) : Bool :=
  -- For small formulas, we can check all assignments
  -- This is a simplified implementation
  let vars := f.atoms.eraseDups
  checkAllAssignments vars f
where
  checkAllAssignments : List String → Formula → Bool
    | [], f => f.eval (fun _ => false)
    | v :: vs, f =>
      let withTrue := checkAllAssignments vs f
      let withFalse := checkAllAssignments vs (f.substitute v .contradiction)
      withTrue && withFalse

/-- Check if two formulas are logically equivalent -/
def Formula.equivalent (p q : Formula) : Bool :=
  (Formula.implies p q |>.and (Formula.implies q p)).isTautology

end LogicProofTrainer
