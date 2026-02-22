# LLM Parse Failure Analysis: Real Benchmark Data

## Data Source

- **Database**: `propbench.db` (results table)
- **Total results examined**: 350 rows
- **Models**: gemini (Gemini 2.5 Flash Lite), gemini-3-flash, gemini-3-pro
- **Breakdown by validation result**:
  - valid: 238 (68%)
  - invalid: 104 (30%)
  - error (parse failure): 8 (2.3%)

| Model | Valid | Invalid | Error (Parse) | Total |
|---|---|---|---|---|
| gemini (2.5 Flash Lite) | 45 | 100 | 5 | 150 |
| gemini-3-flash | 98 | 2 | 0 | 100 |
| gemini-3-pro | 95 | 2 | 3 | 100 |

---

## Category 1: Unrecognized Rule Names (Parser Error)

**Impact**: Causes `Could not parse justification` errors. Completely prevents proof evaluation.

### 1a. "Copy" / "Reit" (Reiteration)

The model outputs `Copy` or `Reit` as a justification rule, which is a legitimate natural deduction step (repeating a formula from an accessible line) but is NOT in the parser's alias maps.

**Example** (DB id 449, gemini, theorem v1-006):
```
1.   [~(P . Q)] Assumption (CP)
2.     [~(P . Q)] Copy 1
3.   [~(P . Q)] > [~(P . Q)] CP 1-2
```
Parse error: `Could not parse justification from: "[~(P . Q)] Copy 1"`

**Example** (DB id 349, gemini, theorem v1-089):
```
4.     {[~F > (G > H)] . (A > ~C)} . (A v ~F) Reit 2
```
Parse error: `Could not parse justification from: "... Reit 2"`

**Count**: 2 results directly affected. Neither "Reit" nor "Copy" exists in `INFERENCE_ALIASES` or `EQUIVALENCE_ALIASES`.

### 1b. "Negation Elimination" with Inline Formula Arguments

The model writes `# Negation Elimination 6, (B v ~B)` or `# Negation Elimination 6,9 (commentary...)`, embedding formula fragments and parenthetical commentary directly in the justification field.

**Example** (DB id 450, gemini, theorem v1-021):
```
7.    # Negation Elimination 6, (B v ~B) DN 6 (Implicitly, we know B v ~B is true...)
```

While "Negation Elimination" IS in the alias map, the parser fails because the justification contains extra formula text and parenthetical commentary after the rule name and line references.

### 1c. "Simplification" (Full Word vs Alias)

The model writes `Simplification` instead of `Simp`. Note: "simplification" IS in the alias map (mapped to "Simp"). The parser correctly resolves this. However, the models using `Simplification` also tend to produce other malformed output, causing cascading failures.

**Example** (DB ids 407, 416, gemini):
```
3.     (P > Q) . ~Q > P . ~Q Impl 1
4.     (P > Q) . ~Q Simplification 3
```
The `Simplification` parses fine, but line 3 itself is logically wrong, causing cascading invalid references.

---

## Category 2: Inline Commentary / Meta-Reasoning in Proof Lines (Parser Error)

**Impact**: Lines containing meta-commentary cannot be parsed as proof lines.

### 2a. Dash-Dash Commentary Lines

The model inserts lines starting with `--` as self-commentary/reasoning within the proof.

**Example** (DB id 450, gemini, theorem v1-021):
```
-- Re-evaluating strategy: Since B v ~B is a tautology, we can use it...
-- Strategy: Use CP on the main goal. Assume the antecedent and derive ~F.
-- Since B v ~B is a tautology, we cannot introduce it without an assumption...
-- Let's use IP on ~F. Assume the antecedent and ~(~F), i.e., F, and derive #.
-- Final attempt using CD structure on line 4, 5, and 3.
```

These are interspersed throughout the proof, breaking the parser's line-by-line expectations.

### 2b. Parenthetical Annotations on Justifications

The model appends parenthetical explanations to justification lines.

**Examples** (DB id 450):
```
B v ~B Assumption (Tautology, but we must derive it or use it as an assumption...)
B v ~B Assumption (IP) -- We assume B v ~B is true to use DS/MP...
B v ~B IP 14-19 (This just proves B v ~B is true, which we already knew...)
F DN 9 (This is not helping derive ~F)
F DN 9 (Still not deriving ~F)
D . C IP 7-8 (Again, proving the tautology)
~F MP 5, 17 (This is wrong, 17 is not B v ~B, it's the result of IP 11-16)
D . C IP 20-21 (Useless)
B v ~B IP 24-29 (Useless)
```

The parser cannot strip these trailing parenthetical commentaries from the justification.

### 2c. Non-Standard Assumption Labels

The model uses custom assumption labels like `Assumption (Tautology)` instead of the expected `Assumption (IP)` or `Assumption (CP)`.

**Example** (DB id 450):
```
B v ~B Assumption (Tautology, but we must derive it or use it as an assumption...)
```

### 2d. Multiple Proof Attempts in Single Response

The model restarts the proof from line 1 multiple times within a single response, prefaced by commentary lines. The parser sees duplicate line numbers and commentary interleaved.

**Example** (DB id 450, gemini): The response contains at least 8 separate proof attempts, each starting with `1.` and separated by `--` commentary lines. The model is essentially "thinking out loud" and iterating on its approach.

---

## Category 3: Formula Syntax Errors from LLMs (Validation Error)

**Impact**: Lines parse syntactically but the formula contains characters the formula parser rejects, resulting in `Invalid formula` validation errors.

### 3a. Comma-Separated Multiple Formulas on One Line

The model writes two formulas separated by a comma on a single line, as if to show "both of these hold."

**Examples** (DB ids 11, 12, 19, 407, 416, 439 -- all gemini):
```
4. P > P, P MP 1,3          -- "P > P" and "P" listed together
5. P > P, ~P MT 1,2         -- "P > P" and "~P" listed together
5. P, ~P NegE 4,2           -- "P" and "~P" listed together
8. P, ~P NegE 6,7           -- "P" and "~P" listed together
6. ~P v Q, P => Q MP 2,5    -- "~P v Q" and "P => Q" together, also using "=>" operator
7. ~R > ~Q, ~Q > R MT 3     -- two formulas listed together
```

**Count**: At least 6 results affected across multiple theorems.

The formula parser hits a `,` and reports `Unexpected character: ','`. This is a recurring pattern where the model tries to list multiple results from a rule application.

### 3b. Mismatched Curly Braces `{}`

When formulas are deeply nested, the model introduces bracket mismatches -- extra closing `}` without a matching opening `{`.

**Examples** (DB ids 418, 431, 435, 436, 448 -- all gemini):
```
id 418: {[(A . B) > C] . {(C > F) . [F > (G v ~G)]}} . (A . B)} > (G v ~G)
                                                                ^-- extra }
id 431: ...[(G v H) v G]}} . {[~(A . B)] v ~A}}
                                              ^-- extra }
id 435: ...{[(~A > ~A) v B] v B}} . D}
                                ^-- extra }
id 436: {~{B > {(E v F) v [~(~F . C)]}}} v ~B} v {(E v F) v [~(~F . C)]}
                                         ^-- extra }
```

**Count**: At least 5 results with `Unexpected character: '}'` errors.

This appears to happen specifically on complex/deeply nested theorems where the model loses track of bracket nesting depth.

### 3c. Mismatched Parentheses `)` without `(`

Related to 3b, but with regular parentheses.

**Example** (DB ids 420, 421 -- gemini):
```
id 420: {[~A v B) . C] . D}
              ^-- uses ) to close [
id 421: {[B > {B > [(D . D) > F)]} . (B . B)} . (D . D)
                              ^-- extra ) inside []
```

### 3d. Non-Standard Operators

The model uses `=>` instead of `>` for implication, or `::` for some kind of equivalence/replacement notation.

**Example** (DB id 439, gemini):
```
6. ~P v Q, P => Q MP 2,5
```

**Example** (DB id 450, gemini):
```
7. (B v ~B) v (D . C) :: B v ~B Taut 4
```

Neither `=>` nor `::` are recognized formula operators.

---

## Category 4: Empty / Missing Responses (Parser Error)

**Impact**: No proof text at all to parse.

### 4a. Completely Empty raw_response

**Examples** (DB ids 296, 298, 299, 399, 402 -- all gemini-3-pro):

The `raw_response` field is an empty string. These are likely API failures, rate limits, or content filtering on the model side. All 5 empty responses are from `gemini-3-pro`.

**Count**: 5 results (all gemini-3-pro).

### 4b. Empty Justification String

**Example** (DB id 451, gemini, theorem v1-036):
Parse error: `Could not parse justification from: ""`

The model produced proof lines but one line had a completely empty justification -- likely the model hit its output token limit mid-proof (the proof had 278+ lines of repetitive output).

---

## Category 5: Repetitive/Looping Output (Indirect Parser Failure)

**Impact**: The model generates hundreds of repetitive lines, which may eventually produce an unparseable line or an unclosed subproof. This is a model behavior problem that indirectly triggers parser errors.

### 5a. Infinite Tautology Loops

The model applies the same rule (usually `Taut` or `Add`) repeatedly in an infinite loop, generating hundreds of identical or alternating lines.

**Example** (DB id 349, gemini, theorem v1-089): 321+ lines of alternating:
```
14.    ~C > (~F v (G > H)) v (G > H) Add 13
15.    ~C > [~F v (G > H)] Taut 14
16.    ~C > (~F v (G > H)) v (G > H) Add 15
... (repeats to line 321+)
```

**Example** (DB id 451, gemini, theorem v1-036): 278+ lines of:
```
9.     A v A Taut 8
10.    A v A Taut 9
... (repeats to line 278+)
```

**Example** (DB id 453, gemini, theorem v1-048): 216+ lines of repeating:
```
13.    ~D > ~D Assumption (CP)
14.    ~(~D . ~D) DeM 13
15.    ~D . ~D Taut 14
16.  ~(~D > ~D) > (~D . ~D) CP 13-15
... (4-line block repeats dozens of times)
```

These loops cause the model to hit its output token limit, resulting in truncated output with:
- Unclosed subproofs
- Missing final conclusion lines
- Eventually, an empty justification field (as in id 451)

**Count**: At least 3 results with extreme repetitive looping (100+ unnecessary lines).

---

## Category 6: Structural Proof Errors (Validation Errors, Not Parser Failures)

These are NOT parser failures -- the parser handles them correctly. But they represent the dominant class of invalid results (75 of 104 invalid results).

### 6a. Conclusion Not Established (75 results)

The proof runs but never closes all subproofs or reaches the target conclusion at depth 0. Often caused by:
- Unclosed CP/IP subproofs
- Proof that derives the wrong formula
- Model hitting token limit before completing

### 6b. Wrong Rule Application (10+ results)

The model applies a rule incorrectly (e.g., derives `~~P` from `~P` via DN, when DN should give `P` from `~~P` or `~~P` from `P`).

### 6c. IP/CP Technique Mismatch (multiple results)

The model closes a subproof with the wrong technique label (e.g., starts with `Assumption (IP)` but closes with `CP`, or vice versa).

---

## Summary Table: Parse Failure Categories

| Category | Type | Count | Fixable by Parser? |
|---|---|---|---|
| 1a. Unrecognized rules (Reit/Copy) | Parse error | 2 | Yes -- add aliases |
| 1b. Inline formula in justification | Parse error | 1 | Partial -- strip trailing text |
| 2a. Commentary lines (`--`) | Parse error | 1 | Yes -- skip non-proof lines |
| 2b. Parenthetical annotations | Parse error | 1 | Yes -- strip `(...)` from justification |
| 2c. Non-standard assumption labels | Parse error | 1 | Yes -- normalize assumption text |
| 2d. Multiple proof attempts | Parse error | 1 | Partial -- take last complete attempt |
| 3a. Comma-separated formulas | Validation error | 6+ | Partial -- could split on comma |
| 3b. Mismatched curly braces | Validation error | 5+ | No -- model error |
| 3c. Mismatched parentheses | Validation error | 2+ | No -- model error |
| 3d. Non-standard operators (=>, ::) | Validation error | 2+ | Yes -- normalize operators |
| 4a. Empty response | Parse error | 5 | No -- API/model issue |
| 4b. Empty justification | Parse error | 1 | No -- model hit token limit |
| 5a. Repetitive looping | Indirect | 3+ | No -- model behavior issue |

---

## Recommendations

### High-Value Parser Improvements (Would Fix Real Failures)

1. **Add "Reit" / "Copy" / "Reiteration" aliases** mapped to a reiteration rule (or treat as valid identity steps). This directly fixes 2 parse errors.

2. **Strip trailing parenthetical commentary** from justifications: after extracting the rule name and line references, discard any remaining `(...)` text. This fixes multiple parse errors from gemini's self-commentary.

3. **Skip non-proof lines** starting with `--` or lacking a line number prefix entirely. These commentary/meta-reasoning lines should be filtered out before parsing.

4. **Normalize non-standard operators**: convert `=>` to `>`, strip `::` notation. Would fix at least 2 formula parse errors.

5. **Handle multiple proof attempts**: when a response contains multiple proof blocks (detected by repeated `1.` starts separated by commentary), take the LAST complete proof attempt. This would address the multi-attempt pattern from gemini.

### Lower-Value Improvements (Edge Cases)

6. **Handle comma-separated formulas**: when a line contains `formula1, formula2 Rule refs`, try splitting on the comma and using only the first or last formula. This is an ambiguous pattern though.

7. **Handle empty responses gracefully**: return a clear "no response from model" error rather than a generic parse error.

### Not Fixable by Parser (Model Issues)

8. **Mismatched brackets/braces**: The model loses track of nesting depth on complex formulas. This requires better prompting or simpler theorems.

9. **Repetitive looping**: The model gets stuck in loops, hitting token limits. Requires model-side fixes or output length enforcement.

10. **IP/CP technique mismatches and wrong rule applications**: These are logical errors by the model, correctly caught by the validator.
