# PropBench Parser: Rigidity & Failure Mode Analysis

This report identifies every point in `parser.ts` where the parser could reject valid proof content produced by LLMs. Each finding describes (1) what the parser currently does, (2) what it fails on, and (3) what a more forgiving approach would look like -- without compromising logical validity.

---

## 1. Rule Alias Coverage Gaps

### Current behavior
`canonicalizeRule()` looks up a lowercased+trimmed name in three alias maps (INFERENCE_ALIASES, EQUIVALENCE_ALIASES, TECHNIQUE_ALIASES). If the name is not found in any map, it returns `null`, and the entire line fails to parse.

### Failure modes

| Model output | Why it fails |
|---|---|
| `"Simp."` or `"Conj."` (trailing period) | Period is part of the name string; not in alias map |
| `"M.P."` or `"D.S."` (dotted abbreviations) | Not in map |
| `"Simplification (Simp)"` | The parenthetical variant is not stripped |
| `"Double Neg"` | Only `"double negation"` and `"double neg"` are present but NOT `"double neg."` |
| `"Neg Elim"` or `"Neg. Elim."` | Only `"neg elim"` is present; dotted variants absent |
| `"Assumption"` used alone (without CP/IP) | Treated only as part of assumption patterns, not as a standalone rule |
| `"Reit"` / `"Reiteration"` / `"R"` | Reiteration is a valid Fitch rule not in any alias map |
| `"Absorption"` | Some textbooks call Distribution+Simplification "Absorption"; not aliased |
| `"DeMorgan's Laws"` or `"De Morgan's Law"` | Plural/singular "law(s)" variants not covered |
| `"Bicond Elim"` or `"Biconditional Elimination"` | Not aliased to Equiv |
| `"Cond. Proof"` or `"Ind. Proof"` | Abbreviated with periods; not in map |
| `"→E"` / `"→I"` / `"∧E"` / `"∧I"` / `"∨E"` / `"∨I"` | Gentzen-style intro/elim notation used by some models; entirely absent |
| `"And-Elim"` / `"Or-Intro"` | Natural-language Gentzen-style not aliased |
| `"CE"` / `"CI"` (conjunction elimination/introduction) | Not in map |

### More forgiving approach
- Strip trailing periods and parenthetical remarks from the rule name before lookup.
- Add Gentzen-style intro/elim aliases for all connectives.
- Add dotted abbreviation variants.
- Consider fuzzy matching (Levenshtein distance <= 2) as a fallback, with a confidence threshold.

---

## 2. Justification Parsing Structure is Fragile

### Current behavior
`parseJustification()` tries patterns in a fixed order: Premise -> Assume-first -> Assumption-last -> bare subproof close -> subproof close with formula -> rule+lines extraction. If none match, the line becomes a parse error.

### Failure modes

#### 2a. Premise detection requires exact trailing position
The regex `^(.+?)\s+Premise$/i` requires "Premise" to be the LAST word on the line. Models that write:
- `"P Premise (given)"` -- trailing commentary
- `"P  Premise"` -- extra spaces (handled by `\s+` but `$` anchoring is strict)
- `"P / Premise"` -- slash separator
- `"P [Premise]"` -- brackets around justification
- `"P     Premise  "` -- trailing whitespace (partially handled by prior trimming)
- `"Premise: P"` -- premise-first format (reversed order)

All of these will fail to match, causing the line to fall through to rule extraction, where "Premise" is not a recognized inference/equivalence rule.

#### 2b. Assumption patterns are overly constrained
The regex requires exactly `(CP)` or `(IP)` after the assumption keyword. Models that write:
- `"Assume P for CP"` -- natural language
- `"Assume P [CP]"` -- bracket notation
- `"Assume P (Conditional Proof)"` -- full name in parens
- `"Assume P (for reductio)"` -- alternative phrasing
- `"P (Assumption for CP)"` -- different word order
- `"CPA: P"` or `"IPA: P"` -- compact notation some models use
- `"Assume P"` with NO technique annotation -- model forgets to specify CP vs IP

Will fail to parse.

#### 2c. Subproof close line references
The regex for subproof close requires `(\d+)\s*[-\u2013]\s*(\d+)` (hyphen or en-dash range). Models that write:
- `"CP 3\u20147"` -- em-dash instead of en-dash/hyphen
- `"CP lines 3-7"` -- word "lines" inserted
- `"CP (3-7)"` -- parenthesized range
- `"CP 3 to 7"` -- word "to" instead of dash
- `"CP 3,7"` -- comma instead of dash for range
- `"CP [3-7]"` -- brackets around range

Will fail to parse.

#### 2d. Rule+lines extraction requires specific ordering
`tryExtractRuleAndLines()` tries "RULE LINES" and "LINES RULE" patterns, but:
- `"MP(1,2)"` -- no space before parens, lines in parentheses
- `"MP: 1,2"` -- colon separator
- `"MP [1,2]"` -- brackets around line numbers
- `"MP from 1,2"` -- word "from" inserted
- `"MP, 1, 2"` -- comma after rule name
- `"by MP 1,2"` -- leading preposition "by"
- `"1,2 (MP)"` -- rule name in parentheses
- `"(MP) 1,2"` -- rule name in leading parentheses

Will fail to parse.

### More forgiving approach
- Strip bracketing characters `[](){}` from justification portions before matching.
- Add a "Premise-first" pattern: `/^Premise\s+(.+)$/i`.
- Support bare "Assume P" (no technique specified) with a heuristic to infer CP/IP from context.
- Normalize separators: strip "from", "by", "using", "lines" before rule matching.
- Support em-dashes in subproof ranges.

---

## 3. Commentary Detection is Both Over-Aggressive and Under-Aggressive

### Current behavior
`isCommentary()` checks if a line starts with specific prefixes like "Proof:", "Here is", "Therefore", "Thus", "QED", etc. Lines matching are skipped entirely.

### Failure modes (over-aggressive)

| Model output | Why it's wrongly skipped |
|---|---|
| `"Therefore, P > Q  CP 1-5"` | Line starts with "Therefore" but IS a proof line with a valid CP justification |
| `"Thus P . Q  Conj 1,2"` | Line starts with "Thus" but IS a valid proof step |
| `"Note: ~P  DN 3"` | Line starts with "Note:" but contains a valid derivation |
| `"Proof: P  Premise"` | Line starts with "Proof:" but IS the first premise |
| `"This is P > Q  HS 1,2"` | Starts with "This is" -- falsely treated as commentary |
| `"Wait, P v Q  Add 1"` | Starts with "Wait" -- falsely treated as commentary (model thinking out loud then giving result) |

### Failure modes (under-aggressive)

| Model output | Why it should be skipped but isn't |
|---|---|
| `"Now we apply MP to lines 1 and 2 to get Q"` | Doesn't start with a known prefix; contains rule names so `looksLikeProofLine` returns true |
| `"By Modus Ponens on 1 and 2, we derive Q"` | Contains rule name, passes `looksLikeProofLine`, but is natural language |
| `"The next step uses Simplification"` | Contains rule name, treated as proof content |
| `"We need to assume P for our conditional proof"` | Starts with "We need" (caught), but `"We should"`, `"We must"`, `"To prove"` are NOT caught |
| `"Since we have P > Q and P..."` | Natural language reasoning not caught |

### More forgiving approach
- Instead of prefix-based commentary detection, use a two-pass system: first identify all lines that have successfully parseable justifications, then treat remaining lines as commentary.
- Alternatively, check for commentary AFTER attempting to parse the justification. If parsing succeeds, it's a proof line regardless of how it starts.

---

## 4. Line Number Stripping Gaps

### Current behavior
`stripLineNumber()` tries patterns in order: `(1)`, `#1.`, `Step 1:`, `Line 1:`, `1)`, `1.`, `1:`.

### Failure modes

| Model output | Why it fails |
|---|---|
| `"[1]"` | Square bracket notation not supported |
| `"1 ."` | Space before period |
| `"1 -"` or `"1 >"` | Unusual separators |
| `"Step1."` | No space after "Step" |
| `"l.1"` or `"L1."` | Lowercase/variant "line" abbreviations |
| `"i."` or `"ii."` or `"iii."` | Roman numeral line numbers |
| `"1a."` or `"1b."` | Sub-numbered lines |
| `"  1."` after marker stripping | Leading whitespace before line number (partially handled by `trimStart()`) |
| `"1:"` followed by rule application | The `1:` pattern might match but then the colon is consumed, potentially interfering with formulas that follow |

### More forgiving approach
- Add `[N]` square bracket pattern.
- Add a catch-all pattern that matches any leading number followed by a reasonable delimiter.
- Consider Roman numeral support.

---

## 5. Indentation / Depth Detection Issues

### Current behavior
The parser pre-scans for indentation levels, computes `baseIndent` from the first numbered line, and `indentUnit` from the minimum non-zero difference between unique indent levels. Lines are assigned `depth = round((indent - baseIndent) / indentUnit)`.

### Failure modes

#### 5a. Mixed indentation
If a model uses 2 spaces for some lines and 4 spaces for others at the "same" depth, the algorithm picks the smallest difference (2) as the unit. But if the model used 3 spaces inconsistently, depths get miscalculated.

#### 5b. No indentation (flat output)
Many models output proofs with NO indentation -- all lines at depth 0. The parser will assign depth 0 to everything, including subproof lines. The subproof structure is then lost entirely, and the validator will reject the proof even though the logical content may be correct.

#### 5c. Tab/space mixing
Tabs count as 2 spaces, but some models may use a tab as 4 or 8 spaces visually. A tab followed by 2 spaces would give indent=4, which may or may not match the intended depth.

#### 5d. Marker-based depth ignores indentation
When `|` or `\u2502` markers are found, marker depth takes precedence over indentation. But if a model uses markers AND indentation inconsistently, the two signals can conflict.

#### 5e. First numbered line sets base indent
If the first numbered line is inside commentary that happens to have a line number pattern (e.g., a model says "In step 1, we..."), the base indent is set incorrectly for the entire proof.

### More forgiving approach
- Use justification type (Assumption CP/IP and CP/IP close lines) to infer subproof structure rather than relying solely on whitespace.
- When depth is ambiguous, cross-reference with CP/IP assumption and closure lines to reconstruct the subproof tree.
- Accept flat (depth=0) output and reconstruct depth from the logical structure.

---

## 6. Symbol Normalization Gaps

### Current behavior
`normalizeFormula()` replaces various Unicode and ASCII symbol variants with the canonical forms: `>` for conditional, `v` for disjunction, `.` for conjunction, `~` for negation, `<>` for biconditional, `#` for contradiction.

### Failure modes

| Model output | Why it fails |
|---|---|
| `"P and Q"` or `"P AND Q"` | English words for connectives not normalized |
| `"P or Q"` | English "or" not normalized (and note: `"or"` IS in INFERENCE_ALIASES as an alias for Add, which would cause confusion) |
| `"not P"` or `"NOT P"` | English "not" not normalized |
| `"P implies Q"` or `"P if Q"` | English conditional not normalized |
| `"P iff Q"` | English biconditional not normalized |
| `"P \u2192 Q"` | Already handled (\u2192 = right arrow), but `\u21d2` (double right arrow) is NOT |
| `"P \u22a5"` | Already handled, but `"F"` or `"false"` as contradiction are NOT |
| `"P /\\ Q"` | LaTeX-style conjunction `/\` not normalized |
| `"P \\/ Q"` | LaTeX-style disjunction `\/` not normalized |
| `"!P"` | Programming-style negation not normalized |
| `"\u00acp"` | `\u00ac` is already handled (it's `\u00ac`), but some models produce combining characters |
| `"P \u2283 Q"` | Already handled, confirmed |
| `"P \u2194 Q"` | Already handled, confirmed |
| `"P ^ Q"` | Caret for conjunction not normalized |
| `"P + Q"` | Plus sign for disjunction not normalized |

### More forgiving approach
- Add LaTeX-style connective normalization: `/\` -> `.`, `\/` -> `v`.
- Add `!` -> `~` normalization.
- Add `^` -> `.` normalization (common in programming contexts).
- Add `\u21d2` (double arrow) -> `>` normalization.
- Consider word-to-symbol replacement as an optional aggressive mode, but this risks false positives with variable names.

---

## 7. The `looksLikeProofLine` Heuristic is Blunt

### Current behavior
If a line has no line number AND doesn't "look like" proof content, it's skipped. `looksLikeProofLine()` checks for: logical symbols, rule name keywords, or uppercase single letters.

### Failure modes

#### 7a. False positives
- `"By Modus Ponens on lines 1 and 2, Q follows"` -- contains "Modus Ponens", passes the check, but is natural language commentary.
- `"A good approach is to use CP here"` -- contains single uppercase "A" and "CP", passes the check.
- Any sentence containing a single capital letter at the start passes due to `\b[A-Z]\b`.

#### 7b. False negatives
- `"p . q  Conj 1,2"` -- lowercase propositional variables. The symbol `.` is in the regex, so this actually passes. But `"p and q Conj 1,2"` with English "and" would not contain any checked symbols or have a matching `\b[A-Z]\b`.
- Lines using only multi-character variable names like `"Prop1 . Prop2"` -- `\b[A-Z]\b` requires a single letter bounded by word boundaries. "Prop1" has `P` but it's followed by "rop", so `\b[A-Z]\b` doesn't match it.

### More forgiving approach
- Instead of `\b[A-Z]\b` (single uppercase letter), check for any uppercase letter: `/[A-Z]/`.
- Reduce reliance on this heuristic by attempting justification parsing on all non-blank, non-commentary lines.

---

## 8. Trailing Commentary Stripping is Minimal

### Current behavior
`tryExtractRuleAndLines()` strips a single trailing parenthetical: `.replace(/\s*\([^)]*\)\s*$/, "")`. This handles `"(Still wrong)"` but nothing else.

### Failure modes

| Model output | Why it fails |
|---|---|
| `"P . Q  Conj 1,2 // conjunction of lines 1 and 2"` | Trailing `//` comment not stripped |
| `"P . Q  Conj 1,2 -- applying conjunction"` | `--` comment prefix not stripped from END of line |
| `"P . Q  Conj 1,2 [from premises]"` | Trailing bracket commentary not stripped |
| `"P . Q  Conj 1,2 (step 1) (step 2)"` | Only ONE trailing paren group is stripped |
| `"P . Q  Conj 1,2; this gives us..."` | Trailing semicolon commentary not stripped |
| `"P . Q  Conj 1,2 (by combining P and Q)"` | This IS stripped, but only because it matches `\([^)]*\)` at end |

### More forgiving approach
- Strip ALL trailing parenthetical groups, not just one.
- Strip trailing `//` and `--` comments.
- Strip trailing text after a semicolon.
- Strip trailing bracket groups `[...]`.

---

## 9. Formula Extraction from Justification Boundary

### Current behavior
The parser splits a line into "formula" and "justification" by looking for rule+lines patterns at the end. The formula is everything before that match.

### Failure modes

#### 9a. Ambiguity with variable names that match rule abbreviations
- `"Add v Q  Add 1"` -- the first "Add" is the formula (variable named "Add"?? unlikely, but the propositional variable could be `A` followed by `dd`). More realistically:
- `"P v Q  Add 1"` -- this works fine.
- But: `"Comm . P  Comm 3"` -- the formula contains the word "Comm" which is also a rule alias. The regex might match the wrong "Comm" occurrence.

#### 9b. Formulas containing numbers
- `"P1 > Q2  MP 1,2"` -- if variable names contain digits, the line numbers regex `\d[\d,\s]*\d|\d` could match parts of variable names.
- This is unlikely with single-letter variables, but some models might use multi-character names.

#### 9c. The greedy/lazy split
The rule extraction uses `(.+?)` (lazy) for the formula part in some patterns and relies on `$` anchoring. If the justification portion contains content that looks like a formula (e.g., the formula references in "from P and Q"), the split point may be wrong.

### More forgiving approach
- Parse from the RIGHT side of the line: find the rightmost valid justification pattern and treat everything to the left as the formula.
- Validate that the extracted formula parses as a well-formed propositional formula, and retry with different split points if it doesn't.

---

## 10. The `parseProof` Main Loop Issues

### Current behavior
The main loop processes lines sequentially, skipping blanks and commentary, then trying to parse each remaining line.

### Failure modes

#### 10a. Markdown code blocks
Models frequently wrap output in ` ``` ` code blocks. The parser skips lines starting with ` ``` ` as commentary, but:
- If the model writes ` ```text ` or ` ```proof ` (with a language tag), the line starts with ` ``` ` and IS caught.
- The content BETWEEN the backtick lines is NOT affected -- those lines parse normally.
- However, if the model uses INDENTED code blocks (4+ spaces before text), the indentation throws off the depth calculation.

#### 10b. Table-formatted proofs
Some models output proofs as markdown tables:
```
| Line | Formula | Justification |
|------|---------|---------------|
| 1    | P > Q   | Premise       |
```
The `|` characters would be caught by `stripSubproofMarkers()` and interpreted as subproof depth markers, completely corrupting the parse. The table header and separator rows would also pollute the output.

#### 10c. Numbered lists with unusual formatting
Models may use markdown numbered lists: `1. ` (with double space), which the `1.` pattern catches. But `- 1.` (bulleted + numbered) or `* 1.` would fail.

#### 10d. Lines with ONLY a formula (no justification)
If a model writes just `"1. P > Q"` with no justification at all, `parseJustification` returns null, and the line becomes a parse error. Some models may omit justifications for "obvious" steps.

#### 10e. Error recovery
When a line fails to parse, the parser records an error and continues. But the auto-incrementing line number (`autoLineNumber`) may become out of sync with the model's numbering, causing subsequent lines to get wrong line numbers.

### More forgiving approach
- Detect and strip markdown table formatting before parsing.
- When a line has no justification, record it as a warning rather than an error, and attempt to infer the justification from context.
- When auto-numbering diverges from model numbering, prefer the model's explicit numbers.

---

## 11. Post-Processing: Bare CP/IP Formula Inference

### Current behavior
After parsing, the code infers formulas for bare CP/IP close lines (where the model wrote just `"CP 3-7"` with no formula). It constructs:
- For CP: `(assumption_formula) > (last_formula)`
- For IP: `~(assumption_formula)`

### Failure modes

#### 11a. IP formula inference is overly simplistic
The IP inference always produces `~(assumption_formula)`. But the actual conclusion of an indirect proof is the negation of the assumption. If the assumption was `~P`, the conclusion should be `~~P` (which is correct) or simplified to `P` (if DN is applied). The parser always wraps with `~()`, which is technically correct but may not match what the validator expects if the model wrote a simplified form elsewhere.

#### 11b. Missing referenced lines
If the assumption line or last line of the subproof range doesn't exist in `lines[]` (e.g., because that line failed to parse), the formula remains empty, and the proof will fail validation.

#### 11c. Nested bare CP/IP
The comment says "Process in order so earlier inferred formulas are available for later ones." This works for sequential nesting but could fail if the bare CP/IP lines are not in dependency order (e.g., if an outer CP references an inner CP that also has no formula).

### More forgiving approach
- For IP, check whether the assumption was already negated and handle double-negation correctly.
- When referenced lines are missing, emit a warning rather than silently leaving the formula empty.

---

## 12. Interaction Between Commentary Skipping and `inProofBlock`

### Current behavior
Once `inProofBlock` is set to `true` (after the first successfully parsed proof line), commentary lines are silently skipped with `continue`. Before the proof block starts, they go into `unparsedSections`.

### Failure modes

#### 12a. Commentary WITHIN the proof
If a model interleaves commentary between proof lines:
```
1. P > Q  Premise
Now we apply MP:
2. P  Premise
3. Q  MP 1,2
```
The "Now we apply MP:" line starts with "Now" which is NOT in the commentary list, so it would be treated as a potential proof line. It has no line number and `looksLikeProofLine` returns true (contains "MP"), so it falls through to justification parsing, which fails, creating a parse error.

#### 12b. Multi-line commentary
If a model writes a paragraph of reasoning, each line is checked independently. Some lines might accidentally trigger `looksLikeProofLine` due to containing uppercase letters or rule keywords.

### More forgiving approach
- Add more commentary prefixes: "Now", "Next", "First", "Then", "So", "Since", "Because", "Using", "Applying", "From", "To", "By", "After", "Before", "Finally".
- Better yet, only consider a line as proof content if it has BOTH a parseable line number AND a parseable justification.

---

## 13. The `ParseError` Handling in `harness.ts` is All-or-Nothing

### Current behavior
In `harness.ts:parseModelResponse()`, if `result.errors.length > 0`, the ENTIRE proof is rejected as a parse error:
```typescript
if (result.errors && result.errors.length > 0) {
  return { proof: null, error: result.errors.map(...).join("; ") };
}
```

### Impact
Even a single unparseable line (perhaps a commentary line that slipped through) causes the entire proof to be discarded. The parser may have successfully parsed 10 out of 11 lines, but one bad line kills everything.

### More forgiving approach
- Return partial results: if some lines parsed successfully, send those to the validator. The validator can then determine if the proof is logically complete without the unparsed lines.
- Distinguish between "critical" errors (e.g., no lines parsed at all) and "minor" errors (e.g., 1 out of 15 lines failed).
- Use a threshold: if > 80% of lines parsed, attempt validation with the parsed subset.

---

## 14. `Premise` Handling Does Not Support Premise-First Syntax

### Current behavior
`"P Premise"` is the only supported format (formula then "Premise").

### Failure modes
- `"Premise: P"` -- some models put the justification keyword first with a colon
- `"P (Premise)"` -- premise in parentheses
- `"P, Premise"` -- comma-separated
- `"P - Premise"` -- dash-separated

### More forgiving approach
- Add pattern: `/^Premise[:\s]+(.+)$/i` for premise-first format.
- Strip parentheses around "Premise".

---

## 15. Missing Support for Explicit Depth Annotations

### Current behavior
Depth is inferred from indentation or `|` markers only.

### Failure modes
Some models may explicitly annotate subproof depth:
- `"  | 1. P  Assumption (CP)"` -- single marker (handled)
- `"  || 2. Q  Assumption (CP)"` -- double marker for depth 2 (each `|` is stripped one at a time, so this works IF there's whitespace between them)
- `"[depth=2] 3. Q  MP 1,2"` -- explicit depth annotation (not supported)
- `"  >> 1. P  Assumption (CP)"` -- `>>` as depth marker (not supported)

### More forgiving approach
- Accept `>>` or `>>>` as depth markers.
- Support explicit `[depth=N]` or `{N}` annotations if present.

---

## Summary of Impact Priority

| # | Finding | Severity | Frequency |
|---|---------|----------|-----------|
| 13 | All-or-nothing error handling in harness | **Critical** | Every failed parse |
| 2 | Justification parsing fragility | **High** | Common across all models |
| 3 | Commentary detection over/under-aggressive | **High** | Common with chatty models |
| 5 | Depth detection / flat output | **High** | Very common with flat proofs |
| 1 | Rule alias gaps | **Medium** | Depends on model training |
| 8 | Trailing commentary not stripped | **Medium** | Common with verbose models |
| 10 | Main loop issues (tables, code blocks) | **Medium** | Occasional |
| 6 | Symbol normalization gaps | **Medium** | Depends on model |
| 4 | Line number format gaps | **Low-Medium** | Occasional |
| 14 | Premise-first syntax | **Low-Medium** | Occasional |
| 7 | `looksLikeProofLine` heuristic | **Low** | Rare false negatives |
| 9 | Formula/justification boundary | **Low** | Edge cases |
| 11 | Post-processing IP inference | **Low** | Rare |
| 12 | Commentary within proof | **Low** | Model-dependent |
| 15 | Explicit depth annotations | **Low** | Rare |

---

## Key Architectural Recommendation

The single highest-impact change would be to **decouple parsing success from validation success** (Finding #13). Currently, any parse error discards the entire proof. If the harness instead forwarded partially-parsed proofs to the validator, many proofs that are logically correct but have one unparseable commentary line would pass.

The second highest-impact change would be to **reconstruct subproof depth from logical structure** (Finding #5) rather than relying on whitespace. Since CP/IP assumption lines and close lines explicitly declare the subproof boundaries, depth can be computed deterministically from the justification column alone.
