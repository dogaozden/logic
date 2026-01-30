/-
  JSON-RPC Server
  Provides an interface for Swift to communicate with Lean verification
-/

import LogicProofTrainer.Formula
import LogicProofTrainer.Rules.Basic
import LogicProofTrainer.Verification
import LogicProofTrainer.ProofSearch
import Lean.Data.Json

namespace LogicProofTrainer.Server

open Lean

/-- JSON-RPC request structure -/
structure Request where
  jsonrpc : String := "2.0"
  id : Nat
  method : String
  params : Json
  deriving FromJson, ToJson

/-- JSON-RPC response structure -/
structure Response where
  jsonrpc : String := "2.0"
  id : Nat
  result : Option Json := none
  error : Option Json := none
  deriving ToJson

/-- Error codes -/
def parseError : Int := -32700
def invalidRequest : Int := -32600
def methodNotFound : Int := -32601
def invalidParams : Int := -32602
def internalError : Int := -32603

/-- Create an error response -/
def errorResponse (id : Nat) (code : Int) (message : String) : Response :=
  { id := id
    error := some (Json.mkObj [("code", code), ("message", message)]) }

/-- Create a success response -/
def successResponse (id : Nat) (result : Json) : Response :=
  { id := id, result := some result }

/-- Parse a formula from JSON -/
def parseFormula (json : Json) : Except String Formula :=
  match json with
  | Json.obj fields =>
    match fields.find compare "type" with
    | some (Json.str "atom") =>
      match fields.find compare "name" with
      | some (Json.str name) => Except.ok (.atom name)
      | _ => Except.error "Missing atom name"
    | some (Json.str "not") =>
      match fields.find compare "operand" with
      | some operand =>
        parseFormula operand |>.map Formula.not
      | _ => Except.error "Missing operand for negation"
    | some (Json.str "and") =>
      match fields.find compare "left", fields.find compare "right" with
      | some left, some right =>
        do let l ← parseFormula left
           let r ← parseFormula right
           pure (.and l r)
      | _, _ => Except.error "Missing operands for conjunction"
    | some (Json.str "or") =>
      match fields.find compare "left", fields.find compare "right" with
      | some left, some right =>
        do let l ← parseFormula left
           let r ← parseFormula right
           pure (.or l r)
      | _, _ => Except.error "Missing operands for disjunction"
    | some (Json.str "implies") =>
      match fields.find compare "left", fields.find compare "right" with
      | some left, some right =>
        do let l ← parseFormula left
           let r ← parseFormula right
           pure (.implies l r)
      | _, _ => Except.error "Missing operands for conditional"
    | some (Json.str "biconditional") =>
      match fields.find compare "left", fields.find compare "right" with
      | some left, some right =>
        do let l ← parseFormula left
           let r ← parseFormula right
           pure (.biconditional l r)
      | _, _ => Except.error "Missing operands for biconditional"
    | some (Json.str "contradiction") => Except.ok .contradiction
    | _ => Except.error "Unknown formula type"
  | _ => Except.error "Invalid formula JSON"

/-- Convert a formula to JSON -/
def formulaToJson : Formula → Json
  | .atom name => Json.mkObj [("type", "atom"), ("name", name)]
  | .not p => Json.mkObj [("type", "not"), ("operand", formulaToJson p)]
  | .and p q => Json.mkObj [("type", "and"), ("left", formulaToJson p), ("right", formulaToJson q)]
  | .or p q => Json.mkObj [("type", "or"), ("left", formulaToJson p), ("right", formulaToJson q)]
  | .implies p q => Json.mkObj [("type", "implies"), ("left", formulaToJson p), ("right", formulaToJson q)]
  | .biconditional p q => Json.mkObj [("type", "biconditional"), ("left", formulaToJson p), ("right", formulaToJson q)]
  | .contradiction => Json.mkObj [("type", "contradiction")]

/-- Handle the "verify_inference" method -/
def handleVerifyInference (params : Json) (id : Nat) : Response :=
  match params with
  | Json.obj fields =>
    let ruleStr := fields.find compare "rule" |>.bind (·.getStr?) |>.getD ""
    let premisesJson := fields.find compare "premises" |>.getD (Json.arr #[])
    let conclusionJson := fields.find compare "conclusion" |>.getD Json.null

    -- Parse rule
    let rule := match ruleStr with
      | "MP" => some InferenceRule.modusPonens
      | "MT" => some InferenceRule.modusTollens
      | "∧I" => some InferenceRule.conjunctionIntro
      | "∧E" => some InferenceRule.conjunctionElimL
      | "∧E'" => some InferenceRule.conjunctionElimR
      | "∨I" => some InferenceRule.disjunctionIntroL
      | "∨I'" => some InferenceRule.disjunctionIntroR
      | "DS" => some InferenceRule.disjunctiveSyll
      | "HS" => some InferenceRule.hypotheticalSyll
      | "DNI" => some InferenceRule.doubleNegIntro
      | "DNE" => some InferenceRule.doubleNegElim
      | "R" => some InferenceRule.reiteration
      | _ => none

    match rule with
    | none => errorResponse id invalidParams s!"Unknown rule: {ruleStr}"
    | some r =>
      -- Parse premises
      match premisesJson with
      | Json.arr arr =>
        let premises := arr.toList.filterMap fun j =>
          parseFormula j |>.toOption
        match parseFormula conclusionJson with
        | Except.ok conclusion =>
          let result := r.verify premises conclusion
          successResponse id (Json.mkObj [
            ("valid", result),
            ("rule", ruleStr)
          ])
        | Except.error e =>
          errorResponse id invalidParams s!"Invalid conclusion: {e}"
      | _ => errorResponse id invalidParams "Premises must be an array"
  | _ => errorResponse id invalidParams "Invalid params"

/-- Handle the "verify_equivalence" method -/
def handleVerifyEquivalence (params : Json) (id : Nat) : Response :=
  match params with
  | Json.obj fields =>
    let ruleStr := fields.find compare "rule" |>.bind (·.getStr?) |>.getD ""
    let fromJson := fields.find compare "from" |>.getD Json.null
    let toJson := fields.find compare "to" |>.getD Json.null

    -- Parse rule
    let rule := match ruleStr with
      | "DeM" => some EquivalenceRule.deMorgansAnd
      | "DeM'" => some EquivalenceRule.deMorgansOr
      | "Com" => some EquivalenceRule.commutationAnd
      | "Com'" => some EquivalenceRule.commutationOr
      | "Assoc" => some EquivalenceRule.associationAnd
      | "Assoc'" => some EquivalenceRule.associationOr
      | "Dist" => some EquivalenceRule.distributionAndOr
      | "Dist'" => some EquivalenceRule.distributionOrAnd
      | "Contra" => some EquivalenceRule.contraposition
      | "Impl" => some EquivalenceRule.materialImplication
      | "Equiv" => some EquivalenceRule.materialEquivalence
      | "Exp" => some EquivalenceRule.exportation
      | "Taut" => some EquivalenceRule.tautology
      | "Abs" => some EquivalenceRule.absorption
      | _ => none

    match rule with
    | none => errorResponse id invalidParams s!"Unknown rule: {ruleStr}"
    | some r =>
      match parseFormula fromJson, parseFormula toJson with
      | Except.ok from_, Except.ok to =>
        let result := r.verify from_ to
        successResponse id (Json.mkObj [
          ("valid", result),
          ("rule", ruleStr)
        ])
      | _, _ =>
        errorResponse id invalidParams "Invalid formula"
  | _ => errorResponse id invalidParams "Invalid params"

/-- Handle the "check_tautology" method -/
def handleCheckTautology (params : Json) (id : Nat) : Response :=
  match params with
  | Json.obj fields =>
    match fields.find compare "formula" with
    | some formulaJson =>
      match parseFormula formulaJson with
      | Except.ok formula =>
        let result := formula.isTautology
        successResponse id (Json.mkObj [("tautology", result)])
      | Except.error e =>
        errorResponse id invalidParams s!"Invalid formula: {e}"
    | _ => errorResponse id invalidParams "Missing formula"
  | _ => errorResponse id invalidParams "Invalid params"

/-- Handle the "find_proof" method -/
def handleFindProof (params : Json) (id : Nat) : Response :=
  match params with
  | Json.obj fields =>
    let premisesJson := fields.find compare "premises" |>.getD (Json.arr #[])
    let conclusionJson := fields.find compare "conclusion" |>.getD Json.null

    match premisesJson with
    | Json.arr arr =>
      let premises := arr.toList.filterMap fun j =>
        parseFormula j |>.toOption
      match parseFormula conclusionJson with
      | Except.ok conclusion =>
        let thm : Theorem := { premises := premises, conclusion := conclusion }
        match ProofSearch.findProof thm with
        | some steps =>
          let linearized := ProofSearch.linearize steps
          let stepsJson := linearized.map fun (f, j) =>
            Json.mkObj [("formula", formulaToJson f), ("justification", j)]
          successResponse id (Json.mkObj [
            ("found", true),
            ("steps", Json.arr stepsJson.toArray)
          ])
        | none =>
          successResponse id (Json.mkObj [("found", false)])
      | Except.error e =>
        errorResponse id invalidParams s!"Invalid conclusion: {e}"
    | _ => errorResponse id invalidParams "Premises must be an array"
  | _ => errorResponse id invalidParams "Invalid params"

/-- Process a single request -/
def processRequest (req : Request) : Response :=
  match req.method with
  | "verify_inference" => handleVerifyInference req.params req.id
  | "verify_equivalence" => handleVerifyEquivalence req.params req.id
  | "check_tautology" => handleCheckTautology req.params req.id
  | "find_proof" => handleFindProof req.params req.id
  | "ping" => successResponse req.id (Json.str "pong")
  | _ => errorResponse req.id methodNotFound s!"Unknown method: {req.method}"

/-- Main server loop -/
partial def serverLoop : IO Unit := do
  let stdin ← IO.getStdin
  let stdout ← IO.getStdout

  while true do
    let line ← stdin.getLine
    if line.isEmpty then break

    match Json.parse line with
    | Except.error e =>
      let resp := errorResponse 0 parseError s!"Parse error: {e}"
      stdout.putStrLn (toString (toJson resp))
      stdout.flush
    | Except.ok json =>
      match fromJson? json with
      | Except.error e =>
        let resp := errorResponse 0 invalidRequest s!"Invalid request: {e}"
        stdout.putStrLn (toString (toJson resp))
        stdout.flush
      | Except.ok req =>
        let resp := processRequest req
        stdout.putStrLn (toString (toJson resp))
        stdout.flush

/-- Entry point -/
def main : IO Unit := do
  IO.eprintln "LogicProofTrainer Lean Server started"
  serverLoop

end LogicProofTrainer.Server
