/-
  Proof Verification
  Validates proof steps and manages scoping rules
-/

import LogicProofTrainer.Formula
import LogicProofTrainer.Rules.Basic

namespace LogicProofTrainer

/-- A justification for a proof line -/
inductive Justification where
  | premise
  | assumption
  | inference (rule : InferenceRule) (lineRefs : List Nat)
  | equivalence (rule : EquivalenceRule) (lineRef : Nat)
  | subproofConclusion (tech : ProofTechnique) (scopeStart scopeEnd : Nat)
  deriving Repr, BEq

/-- A single line in a proof -/
structure ProofLine where
  lineNumber : Nat
  formula : Formula
  justification : Justification
  isValid : Bool := true
  validationMessage : Option String := none
  deriving Repr

/-- A scope (subproof) in the proof -/
structure Scope where
  startLine : Nat
  endLine : Option Nat
  technique : ProofTechnique
  depth : Nat
  deriving Repr

/-- Verification result -/
structure VerificationResult where
  isValid : Bool
  message : Option String
  derivedFormula : Option Formula
  deriving Repr

namespace Verification

/-- Check if a line is accessible from another line given the scope structure -/
def isAccessible (scopes : List Scope) (fromLine targetLine : Nat) : Bool :=
  -- Can't access lines that come after
  if targetLine >= fromLine then false
  else
    -- Check that targetLine is not in a closed scope that doesn't contain fromLine
    scopes.all fun scope =>
      match scope.endLine with
      | none => true  -- Open scope, accessible
      | some endL =>
        -- If target is in this closed scope
        if targetLine >= scope.startLine && targetLine <= endL then
          -- fromLine must also be in or after this scope
          fromLine <= endL
        else true

/-- Verify an inference rule application -/
def verifyInference
    (rule : InferenceRule)
    (lineRefs : List Nat)
    (conclusion : Formula)
    (lines : List ProofLine)
    (scopes : List Scope)
    (currentLine : Nat)
    : VerificationResult :=
  -- Check all referenced lines exist and are accessible
  let premises := lineRefs.filterMap fun ref =>
    lines.find? (·.lineNumber == ref) |>.map (·.formula)

  if premises.length != lineRefs.length then
    { isValid := false, message := some "Some referenced lines do not exist", derivedFormula := none }
  else if !lineRefs.all (isAccessible scopes currentLine ·) then
    { isValid := false, message := some "Some referenced lines are not accessible", derivedFormula := none }
  else if premises.length != rule.premiseCount then
    { isValid := false, message := some s!"{rule.name} requires {rule.premiseCount} premises", derivedFormula := none }
  else
    match rule.apply premises with
    | some derived =>
      if derived == conclusion then
        { isValid := true, message := none, derivedFormula := some derived }
      else
        { isValid := false, message := some s!"{rule.name} derives {derived}, not {conclusion}", derivedFormula := none }
    | none =>
      { isValid := false, message := some s!"Cannot apply {rule.name} to these premises", derivedFormula := none }

/-- Verify an equivalence rule application -/
def verifyEquivalence
    (rule : EquivalenceRule)
    (lineRef : Nat)
    (conclusion : Formula)
    (lines : List ProofLine)
    (scopes : List Scope)
    (currentLine : Nat)
    : VerificationResult :=
  match lines.find? (·.lineNumber == lineRef) with
  | none =>
    { isValid := false, message := some s!"Line {lineRef} does not exist", derivedFormula := none }
  | some sourceLine =>
    if !isAccessible scopes currentLine lineRef then
      { isValid := false, message := some s!"Line {lineRef} is not accessible", derivedFormula := none }
    else if rule.verify sourceLine.formula conclusion then
      { isValid := true, message := none, derivedFormula := some conclusion }
    else
      { isValid := false, message := some s!"Invalid application of {rule.name}", derivedFormula := none }

/-- Verify a subproof conclusion -/
def verifySubproofConclusion
    (tech : ProofTechnique)
    (scopeStart scopeEnd : Nat)
    (conclusion : Formula)
    (lines : List ProofLine)
    : VerificationResult :=
  match lines.find? (·.lineNumber == scopeStart), lines.find? (·.lineNumber == scopeEnd) with
  | some assumptionLine, some lastLine =>
    match assumptionLine.justification with
    | .assumption =>
      match tech.deriveFromSubproof assumptionLine.formula lastLine.formula with
      | some derived =>
        if derived == conclusion then
          { isValid := true, message := none, derivedFormula := some derived }
        else
          { isValid := false, message := some s!"{tech.name} derives {derived}, not {conclusion}", derivedFormula := none }
      | none =>
        { isValid := false, message := some s!"Cannot close subproof with {tech.name}", derivedFormula := none }
    | _ =>
      { isValid := false, message := some "Subproof must start with an assumption", derivedFormula := none }
  | _, _ =>
    { isValid := false, message := some "Invalid subproof range", derivedFormula := none }

/-- Verify a proof line -/
def verifyLine
    (line : ProofLine)
    (allLines : List ProofLine)
    (scopes : List Scope)
    : VerificationResult :=
  match line.justification with
  | .premise =>
    { isValid := true, message := none, derivedFormula := some line.formula }
  | .assumption =>
    { isValid := true, message := none, derivedFormula := some line.formula }
  | .inference rule lineRefs =>
    verifyInference rule lineRefs line.formula allLines scopes line.lineNumber
  | .equivalence rule lineRef =>
    verifyEquivalence rule lineRef line.formula allLines scopes line.lineNumber
  | .subproofConclusion tech start end_ =>
    verifySubproofConclusion tech start end_ line.formula allLines

end Verification

end LogicProofTrainer
