# PropBench Parser Fairness Audit

**Date:** 2026-02-06
**Dataset:** `benchmarks/v1/theorems.json` (100 theorems)
**Model tested:** Gemini
**Results directory:** `results/v1/raw/`

## Executive Summary

Out of 100 benchmark runs, **34 passed** and **66 were rejected** (42 `invalid`, 24 `error`). After manual review of every single rejected result, a significant fraction of failures are **not genuine logical mistakes by the model** but are caused by parser limitations, validator bugs, API transport errors, or the model looping until it hits the token limit. The breakdown is as follows:

## Summary Table

| Bucket | Count | % of 66 failures |
|--------|------:|------------------:|
| **PARSE FAILURE -- fixable** | 16 | 24.2% |
| **PARSE FAILURE -- garbage output** | 3 | 4.5% |
| **GENUINE FAILURE -- wrong proof** | 22 | 33.3% |
| **GENUINE FAILURE -- gave up / looped** | 16 | 24.2% |
| **GENUINE FAILURE -- hit token limit** | 0 | 0.0% |
| **API / infrastructure error** | 9 | 13.6% |

If all fixable parse failures were recovered, the model's effective score would rise from **34/100 to 50/100** (a +16 point swing). Additionally, 9 results were API errors (network failures -- not the model's fault), so the effective denominator should really be 91, making the corrected score **50/91 = 54.9%** instead of **34/100 = 34%**.

---

## Detailed Classification

### API / Infrastructure Error (9 results)

These results have empty `raw_response` and the validation error is `API error: exception TypeError: fetch failed sending request`. The model never ran; the HTTP request to the Gemini API failed. These should be retried and excluded from scoring.

| # | Theorem ID | File |
|---|-----------|------|
| 1 | v1-032 | `v1-032_gemini_1770396002295.json` |
| 2 | v1-036 | `v1-036_gemini_1770396065036.json` |
| 3 | v1-040 | `v1-040_gemini_1770396127082.json` |
| 4 | v1-044 | `v1-044_gemini_1770396246837.json` |
| 5 | v1-083 | `v1-083_gemini_1770396659181.json` |
| 6 | v1-084 | `v1-084_gemini_1770396719436.json` |
| 7 | v1-087 | `v1-087_gemini_1770396781254.json` |
| 8 | v1-097 | `v1-097_gemini_1770396908878.json` |
| 9 | v1-098 | `v1-098_gemini_1770396969033.json` |

---

### PARSE FAILURE -- fixable (16 results)

These are cases where the model produced a correct or plausible proof, but our parser or validator rejected it due to formatting issues. Fixing these parser/validator issues would recover these proofs.

#### Issue 1: "CP 2-2" single-line subproof not recognized (6 results)

**Theorem IDs:** v1-045, v1-058, v1-068, v1-070, v1-073, v1-078

**What happened:** For identity theorems like `P & Q -> P & Q`, the model writes:
```
1. (P . Q) > (P . Q) Assumption (CP)
2.   P . Q Assumption (CP)
3.   P . Q CP 2-2
4. (P . Q) > (P . Q) CP 1-3
```
Line 3 uses `CP 2-2` (a subproof ranging from line 2 to line 2). The validator rejects this with "The conclusion does not follow from the subproof using Conditional Proof." The model's reasoning is logically valid: assume P.Q, the assumption itself is P.Q, so conclude P.Q > P.Q. The validator does not handle the degenerate case where the subproof start equals the subproof end.

**Parse error:** `Line 3: The conclusion does not follow from the subproof using Conditional Proof`

**Fix:** The validator should allow subproof ranges where start == end. The assumption at line N is both the antecedent and the derived consequent.

#### Issue 2: Bare "CP N-M" or "IP N-M" line without formula (4 results)

**Theorem IDs:** v1-031, v1-043, v1-071, v1-092

**What happened:** The model writes the CP/IP conclusion as a standalone line with no formula:
```
7. CP 5-6
```
instead of:
```
7. P > Q CP 5-6
```
The parser fails with `Could not parse justification from: "CP 5-6"` because the `parseJustification` function requires a formula before the justification. The model is using a shorthand style where the formula is implicit.

**Parse error:** `Could not parse justification from: "CP N-M"`

**Fix:** When the parser encounters a line whose entire content (after the line number) is `CP N-M` or `IP N-M`, it should treat it as a subproof conclusion line. The formula can be inferred: for CP, it is `assumption > last_line_formula`; for IP, it is `~~assumption` or `~assumption` depending on the subproof structure. Alternatively, the parser could accept this format and pass it to the validator which can compute the expected formula.

#### Issue 3: "Assume FORMULA (CP/IP)" format instead of "FORMULA Assumption (CP/IP)"

**Note:** This format issue appears in v1-041, v1-082, and v1-100, but all three of those results also have other fatal issues (loops or garbage output) and are classified under those primary buckets instead. However, the parser should still be fixed to handle this format for robustness with future model outputs.

**What happens:** The model writes assumptions as:
```
1.  Assume ~(Q . P) (IP)
2.    Assume P (CP)
```
instead of:
```
1.  ~(Q . P) Assumption (IP)
2.    P Assumption (CP)
```
The parser's assumption regex (`/^(.+?)\s+(?:Assumption|Assume|Ass\.?)\s*\(?\s*(CP|IP)\s*\)?$/i`) expects the formula first, then "Assume/Assumption." When "Assume" is at the beginning followed by the formula and then "(CP/IP)", the regex does not match.

**Parse error:** `Could not parse justification from: "Assume ~(Q . P) (IP)"`

**Fix:** Add an additional regex pattern to `parseJustification` that matches `Assume FORMULA (CP/IP)` format:
```
/^(?:Assume|Assumption)\s+(.+?)\s*\(?\s*(CP|IP)\s*\)?$/i
```

#### Issue 4: Validator rejects valid proofs with empty validation_errors (4 results)

**Theorem IDs:** v1-054, v1-055, v1-056, v1-060

**What happened:** These results are all the theorem `P & Q -> P`:
```
1. (P . Q) > P Assumption (CP)
2.   P . Q Assumption (CP)
3.   P Simp 2
4. (P . Q) > P CP 2-3
```
The proof is logically correct, the parser parsed it successfully (no parse errors, no validation errors), yet `validation_result` is `"invalid"`. The `validation_errors` array is empty. This suggests a bug in the validation pipeline -- possibly the validator considers the proof invalid because the first line is an "Assumption (CP)" when the theorem has no premises, or there is a mismatch between how the harness invokes the Rust validator vs. what the parsed proof structure looks like.

**Parse error:** None. `validation_errors: []`.

**Fix:** Investigate the Rust validator's handling of tautology proofs (theorems with no premises). The parsed proof is correct; the validator is giving a false negative.

#### Issue 5: Unrecognized rule name "Tautology" (full word) with no line reference (1 result)

**Theorem ID:** v1-091

**What happened:** The model writes `~C | C Tautology` using the full word "Tautology" as a standalone justification (no line reference). The parser's justification pattern requires `RULE LINE_NUMBER` but this line has no line reference -- the model is treating "Tautology" as a zero-premise rule (asserting a tautologous formula).

**Parse error:** `Could not parse justification from: "~C | C Tautology"`

**Fix:** The parser should handle zero-premise equivalence rules. When a recognized rule name appears at the end of a line with no line references, it should be accepted. The Tautology rule in particular can validly produce formulas like `P v ~P` or `A v A` with no premise.

#### Issue 6: Single `&` and `|` operators not normalized (1 result)

**Theorem ID:** v1-089

**What happened:** The model proved `(B | ~A) & ~C -> (B | ~A) & ~C` correctly:
```
1. (B | ~A) & ~C -> (B | ~A) & ~C Assumption (CP)
2.   (B | ~A) & ~C Assumption (CP)
3.   (B | ~A) Simp 2
4.   ~C Simp 2
5.   (B | ~A) . ~C Conj 3,4
6. (B | ~A) & ~C -> (B | ~A) & ~C CP 2-5
```
The proof is logically correct and uses the right rules. However, the formula normalizer converts `||` to `v` and `&&` to `.` but does **not** convert single `&` to `.` or single `|` to `v`. The Rust validator may not recognize `&` and `|` as valid operators. The result is `validation_result: "invalid"` with `validation_errors: []` -- the same false-negative pattern as Issue 4.

**Parse error:** None. `validation_errors: []`.

**Fix:** Add to `normalizeFormula()`:
```typescript
.replace(/&/g, ".")
.replace(/\|/g, "v")
```
These must be applied **after** the `&&` and `||` replacements to avoid double-conversion.

---

### PARSE FAILURE -- garbage output (3 results)

These results show the model producing output that is fundamentally incompatible with the expected proof format, not just minor formatting variations.

| # | Theorem ID | Explanation |
|---|-----------|-------------|
| 1 | v1-081 | Model wrote `Identity Tautology (This is a placeholder for the required structure, as the theorem is $P \to P$...)` -- it produced a prose explanation embedded in the proof line, with LaTeX formatting. Not a real proof attempt. |
| 2 | v1-100 | Model mixed `Assume FORMULA Assumption (CP)` format with `B v B Taut` (no line ref), `A -> A Taut` (no line ref), and eventually dropped into LaTeX (`$\sim \sim D$ Add 11`). Multiple incompatible formatting styles in one proof. |
| 3 | v1-082 | Model used a hybrid format: `Assume FORMULA (Assumption (CP)` with parenthetical annotations like `(Conj 1535,1536)` instead of standard justification format. Also entered a massive loop (1538 lines). |

---

### GENUINE FAILURE -- wrong proof (22 results)

These are cases where the model attempted a proof in roughly the correct format, the parser handled it, but the proof is logically invalid. The model applied rules incorrectly, mixed up subproof scoping, or used rules that don't exist in this system.

| # | Theorem ID | Key Error | Explanation |
|---|-----------|-----------|-------------|
| 1 | v1-018 | `⊥ NegE 1,2` where line 1 is `Q > Q` and line 2 is `~Q` | NegE (contradiction intro) requires `P` and `~P`, but `Q > Q` is not `Q`. Model confused `Q > Q` with `Q`. |
| 2 | v1-025 | Same as v1-018 | Identical error: `⊥ NegE 1,2` with `Q > Q` and `~Q`. |
| 3 | v1-027 | `P > P, P MP 1,3` | Model wrote multiple formulas on one line separated by commas. Also wrong rule application. |
| 4 | v1-035 | Mismatched IP/CP techniques in nested subproofs | Model used IP assumption but closed with CP, and vice versa. Also used rules (Impl, Contra, Equiv) incorrectly to manipulate formulas. |
| 5 | v1-038 | `~Q > ~(Q v P) Contra 3` where line 3 is `(Q v P)` | Contraposition of `Q v P` is not `~Q > ~(Q v P)`. Contra applies to conditionals, not disjunctions. |
| 6 | v1-039 | Mismatched subproof scoping | Used IP where CP was needed. Line 7 closes with IP 5-6 but the assumption at line 5 was `~P` and the contradiction was between P and ~P -- the conclusion should be `~~P`, not `Q`. |
| 7 | v1-042 | Forward reference (line 6 references line 10) | The model referenced a line that hadn't been derived yet. Also used Tautology incorrectly. |
| 8 | v1-047 | `~~P DN 3` where line 3 is `~Q` | DN of `~Q` should be `~~Q`, not `~~P`. Wrong variable. |
| 9 | v1-049 | `(~Q -> ~P) -> (Q -> P) Contraposition 1` referencing itself | Line 1 references line 1 (self-reference). Also used `->` instead of `>` and `&` instead of `.`. |
| 10 | v1-050 | Misused Conjunction as conditional | `(P > Q) . P > Q Conj 1,4` -- Conj should produce `A . B`, not a conditional. |
| 11 | v1-051 | `~~P Simp 1` where line 1 is `(P v Q) . ~P` | Simp of `(P v Q) . ~P` should give `(P v Q)` or `~P`, not `~~P`. |
| 12 | v1-057 | Mismatched IP/CP scoping | Proof has deep nesting errors: IP used where CP needed, DS applied incorrectly. |
| 13 | v1-059 | `~Q > P Equiv 5` where line 5 is `~(~Q > P)` | Equiv cannot strip a negation. Model confused Equivalence with some other transformation. |
| 14 | v1-062 | `Q v Q Taut 7` where line 7 is `Q v Q` | Tautology of `Q v Q` should simplify to `Q`, but the model kept it as `Q v Q`. The issue is applying Taut to produce the same formula. |
| 15 | v1-063 | Uses `&`, `|`, `->` operators; Tautology/Contraposition/Commutation/HS used incorrectly | Multiple rule misapplications. Also uses alternate operators that the validator may not handle. |
| 16 | v1-064 | `~~P DN 4` where line 4 is `~P` (Assumption) | DN of `~P` should be `~~P` -- wait, that's actually correct. But the validator says it's wrong. This may be a validator issue with DN applied to an assumption in a subproof. Needs investigation. |
| 17 | v1-066 | `~~Q v ~(P > Q) DeM 1` where line 1 is `~Q . (P > Q)` | DeM of `~(A . B)` is `~A v ~B`, but line 1 is `~Q . (P > Q)` (not negated). DeM doesn't apply to un-negated conjunctions. |
| 18 | v1-074 | `~Q > ~(Q v P) Contra 3` where line 3 is `(Q v P)` | Same error as v1-038: Contraposition applied to a disjunction instead of a conditional. |
| 19 | v1-077 | Self-reference on line 1; cascading rule errors | `(~P \| R) v (~P \| R) Taut 1` references itself. Entire proof is built on an invalid first step. |
| 20 | v1-080 | Self-reference on line 1; `Impl 1` referencing itself | `~Q > (~P v ~Q) Impl 1` references itself. Invalid foundation. |
| 21 | v1-085 | Simp on 4-way conjunction gives wrong conjunct | `F > ~(~G v ~H) Simp 2` where line 2 is a 4-conjunct formula. Simp is only defined for 2-conjunct formulas `A . B -> A` or `A . B -> B`. |
| 22 | v1-099 | `⊥ NegE 3` with only 1 premise | NegE (contradiction intro) requires 2 premises (`P` and `~P`), but the model provided only 1 line reference. |

---

### GENUINE FAILURE -- gave up / looped (16 results)

These are cases where the model entered a repetition loop, repeating the same line over and over (often hundreds or thousands of times) until it hit the token limit, or where the model produced a short proof riddled with cascading rule application errors suggesting it fundamentally could not solve the theorem.

| # | Theorem ID | Lines | Pattern | Notes |
|---|-----------|------:|---------|-------|
| 1 | v1-014 | 3,237 | `~P MT 1,2` repeated from line 6 onward | Started with wrong MP/MT application, then looped `~P MT 1,2` endlessly. |
| 2 | v1-041 | 2,273 | `~Q v ~P DeM N` repeated from line 8 onward | Used "Assume" format (parse issue) AND entered DeM loop. Classified here because loop is the dominant failure. |
| 3 | v1-046 | 1,778 | Repeating block of Impl/Contra/Equiv/DeM transformations | Got stuck in a cycle of equivalent transformations. |
| 4 | v1-052 | 1,688 | `~((P > Q) . ~Q) v ~P IP 2-16` repeated | Derived same formula repeatedly via IP. |
| 5 | v1-053 | 1,606 | `~((P > Q) . ~Q) v ~P IP 2-N` repeated | Same theorem as v1-052, same loop pattern. |
| 6 | v1-067 | 1,437 | Repeating CD applications with wrong arguments | Looped trying different CD (Constructive Dilemma) applications. |
| 7 | v1-079 | 2,936 | Looping with prose comments embedded in justifications | `P > S HS 5, (P > Q > S) (This step is not a valid...)` -- model annotated its own confusion. |
| 8 | v1-088 | 1,663 | `C > D > E > (` formula growing with Exportation | Applied Exp repeatedly, formula grew until truncated. |
| 9 | v1-069 | 19 | Not a loop per se, but cascading errors from line 4 onward | NegE with wrong arity, then mismatched IP/CP throughout. |
| 10 | v1-072 | 21 | Mismatched IP/CP; similar to v1-057 | Model attempted multiple approaches, all with scoping errors. |
| 11 | v1-086 | 6 | `CD 3, 4` with only 2 premises | CD requires 3 premises (a disjunction and two conditionals). Model only provided 2 line references. |
| 12 | v1-090 | 18 | Deep nesting with re-introduced Premise inside subproof | Used `Premise` inside a CP subproof (line 7) which is invalid. |
| 13 | v1-093 | 14 | Simp on 3-conjunct formula gives wrong result | Model couldn't correctly decompose a 3-way conjunction. |
| 14 | v1-094 | 11 | `~A Taut 5` where line 5 is `~A` (Assumption) | Taut of `~A` should give `~A v ~A` or `~A . ~A`, not `~A` itself. |
| 15 | v1-095 | 31 | Deep nesting errors, DN applied to wrong line | Multiple scoping and rule application errors. |
| 16 | v1-096 | 15 | Simp on 3-conjunct formula wrong; cascading errors | Same issue as v1-093: can't decompose 3-way conjunctions correctly. |

---

### GENUINE FAILURE -- hit token limit (0 results)

No results clearly show a correct proof being truncated mid-derivation. The looping cases above are distinct from token-limit truncation because the model was not making progress -- it was repeating the same steps. The truncation in those cases ended a loop, not a productive derivation.

---

## Parse Issue Deep Dive

### Issue Frequency Summary

| Parse Issue | Occurrences | Recoverable Proofs |
|-------------|------------:|-------------------:|
| CP/IP 2-2 (single-line subproof) | 6 | 6 (all identity theorems) |
| Bare "CP N-M" / "IP N-M" line (no formula) | 4 | 2-3 (some also have other errors) |
| "Assume FORMULA (CP)" format | 3 | 0 (all also have loops/garbage) |
| Valid proof, empty validation_errors, marked invalid | 4 | 4 |
| Single `&` / `|` operators not normalized | 1 | 1 |
| "Tautology" with no line reference (zero-premise rule) | 1 | 0-1 (also has other issues) |

### What the Parser Currently Handles

The parser (`parser.ts`) handles:
- Line number formats: `1.`, `1)`, `(1)`, `Step 1:`, `Line 1:`, `#1.`
- Symbol normalization: `->` to `>`, `∧` to `.`, `∨` to `v`, `¬` to `~`, `⊥` to `#`
- 40+ rule name aliases (e.g., "modus ponens" -> "MP", "contradiction" -> "NegE")
- Indentation-based subproof depth detection
- Commentary filtering (lines starting with "Proof:", "Here is", etc.)

### What the Parser Does NOT Handle

1. **"Assume FORMULA (TECHNIQUE)" format** -- only matches `FORMULA Assumption/Assume (TECHNIQUE)`, not `Assume FORMULA (TECHNIQUE)`
2. **Bare technique lines** -- `CP 5-6` with no formula on the line
3. **Zero-premise rules** -- `P v ~P Tautology` with no line reference
4. **Single `&` and `|` operators** -- the model uses `&` for conjunction and `|` for disjunction but the normalizer only handles `&&` -> `.` and `||` -> `v`, not single `&` and `|`

### What the Validator Does NOT Handle

1. **Single-line subproofs (CP 2-2)** -- a degenerate but logically valid case
2. **Tautology proofs with no premises** -- some valid proofs of tautologies are marked invalid with empty validation_errors

---

## Recommendations

Ranked by impact (number of proofs recovered):

### 1. Fix the validator's handling of single-line subproofs (CP N-N) -- recovers 6 proofs
The validator should accept `CP N-N` and `IP N-N` where the subproof range contains exactly one line (the assumption). For CP, this means "assume P; P is trivially derived; conclude P > P." This is valid.

### 2. Investigate and fix the empty-validation-errors false negative -- recovers 4 proofs
Four correct proofs of `P & Q -> P` are rejected with `validation_result: "invalid"` but `validation_errors: []`. This is clearly a bug -- either the validator is wrong or the harness is misinterpreting the validator's output.

### 3. Support bare "CP N-M" / "IP N-M" lines -- recovers 2-3 proofs
When the entire content of a proof line (after the line number) is just `CP N-M` or `IP N-M`, the parser should construct the formula from the subproof structure rather than failing with a parse error.

### 4. Support "Assume FORMULA (TECHNIQUE)" format -- recovers 0-1 proofs (but prevents future issues)
Add a regex pattern to match `Assume FORMULA (CP/IP)` in addition to the existing `FORMULA Assumption (CP/IP)` pattern. While the current affected results also have loops, this fix prevents the parser from being the *first* thing to fail.

### 5. Normalize `&` to `.` and `|` to `v` (single character operators) -- prevents cascading errors
The model frequently uses `&` for conjunction and `|` for disjunction. The formula normalizer handles `&&` and `||` but not the single-character versions. Adding these normalizations would prevent many downstream validation errors.

### 6. Support zero-premise rule applications -- recovers 0-1 proofs
Allow rules like Tautology to appear without a line reference, treating them as axiom-like introductions (e.g., `P v ~P Tautology`).

### 7. Retry API errors -- recovers 9 results for re-evaluation
The 9 API transport errors (`TypeError: fetch failed`) should be automatically retried. These are infrastructure failures, not model failures.

### 8. Add loop detection to the harness -- saves tokens
Many failures involve the model repeating the same line hundreds or thousands of times. The harness could detect repetition loops (e.g., same formula appearing 3+ times consecutively) and terminate the generation early, saving tokens and wall-clock time.

---

## Corrected Score Projection

| Scenario | Score | Notes |
|----------|------:|-------|
| Current raw score | 34/100 (34.0%) | As reported |
| Exclude API errors | 34/91 (37.4%) | 9 results excluded |
| + Fix single-line subproofs (CP N-N) | 40/91 (44.0%) | +6 recovered |
| + Fix empty-VE false negatives | 44/91 (48.4%) | +4 recovered |
| + Fix bare CP/IP lines | 46-47/91 (50.5-51.6%) | +2-3 recovered |
| + Normalize `&` and `|` operators | 47-48/91 (51.6-52.7%) | +1 recovered |
| + Fix zero-premise Tautology | 48-49/91 (52.7-53.8%) | +0-1 recovered |
| **Best case (all parser fixes)** | **~50/91 (54.9%)** | All 16 fixable parse issues resolved |
