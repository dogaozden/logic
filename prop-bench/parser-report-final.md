# PropBench Parser Report: Final Recommendations

This report synthesizes findings from two independent research tracks -- a static analysis of `parser.ts` for rigidity and failure modes, and an empirical analysis of 350 real LLM benchmark results from the PropBench database -- into a prioritized, actionable plan for parser improvements.

**Guiding principle**: Be maximally forgiving on FORMAT (how models express the proof) without being forgiving on LOGIC (the proof must still be valid). Accept any reasonable way of saying "Modus Ponens on lines 1 and 2" but never accept an invalid proof step.

---

## Executive Summary

Across 350 benchmark results (3 Gemini models), 238 proofs validated successfully (68%), 104 were logically invalid (30%), and 8 were parse failures (2.3%). The parse failure rate is low, but several improvements can recover additional proofs from both the "parse error" and "invalid" buckets without compromising validity.

**Key insight**: Most failures (104/112) are genuine logic errors by the model, not parser issues. The parser is already reasonably good. However, a handful of targeted changes can fix real failures, and one architectural change (depth reconstruction) could recover proofs that fail only because the parser assigned wrong subproof depths.

---

## Quick Wins

These are small, safe changes with clear impact on real failures. Each can be implemented independently.

### QW-1. Add "Reit" / "Copy" / "Reiteration" rule aliases

**What**: Add entries to `INFERENCE_ALIASES`:
```
"reit": "Reit", "reiteration": "Reit", "copy": "Reit", "rep": "Reit", "repeat": "Reit"
```
Note: Reiteration is a standard Fitch-style rule that simply restates a formula from an accessible line. If the Rust validator does not support "Reit" as a rule, consider treating it as an identity/no-op that passes the formula through unchanged. The validator would then check that the cited line's formula matches.

**Fixes**: 2 parse failures (v1-006 `Copy 1`, v1-089 `Reit 2`).

**Validity impact**: None. Reiteration is logically valid (it asserts A from A). The validator still checks that the formula matches the cited line.

**Estimated impact**: Fixes 2 of 8 parse errors (25% of parse errors).

---

### QW-2. Normalize `=>` to `>` in formula normalization

**What**: Add to `normalizeFormula()`:
```typescript
.replace(/=>/g, ">")
```

Wait -- this is ALREADY in the parser (line 187). However, the normalization happens AFTER justification parsing. The issue is that `=>` appearing in a comma-separated formula context (e.g., `~P v Q, P => Q MP 2,5`) causes the formula to contain `=>` which gets normalized, but the comma splits it wrong.

Actually, re-examining the code: `=>` IS normalized. The real issue in the `~P v Q, P => Q MP 2,5` example is the comma, not the `=>`. Skip this quick win -- it's already handled.

---

### QW-2 (revised). Strip trailing parenthetical commentary more aggressively

**What**: In `tryExtractRuleAndLines()`, replace the single trailing parenthetical strip:
```typescript
const cleaned = text.replace(/\s*\([^)]*\)\s*$/, "").trim();
```
with a loop that strips ALL trailing parenthetical groups and also strips `--` trailing comments:
```typescript
let cleaned = text;
cleaned = cleaned.replace(/\s*--.*$/, "").trim();          // strip -- comments
while (/\s*\([^)]*\)\s*$/.test(cleaned)) {                 // strip all trailing (...)
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/, "").trim();
}
```

**Fixes**: Lines like `~F MP 5, 17 (Still wrong)`, `F DN 9 (This is not helping derive ~F)`, `D . C IP 20-21 (Useless)`.

**Validity impact**: None. The parenthetical text is commentary, not part of the formula or justification. Stripping it exposes the actual rule+lines pattern.

**Estimated impact**: Fixes at least 1 parse error (v1-021 with embedded commentary), and prevents potential future failures from verbose models.

---

### QW-3. Add more commentary prefixes to `isCommentary()`

**What**: Add these prefixes to the `isCommentary()` function:
```typescript
if (lower.startsWith("now ")) return true;
if (lower.startsWith("next")) return true;
if (lower.startsWith("first")) return true;
if (lower.startsWith("then")) return true;
if (lower.startsWith("so ")) return true;
if (lower.startsWith("since")) return true;
if (lower.startsWith("because")) return true;
if (lower.startsWith("using")) return true;
if (lower.startsWith("applying")) return true;
if (lower.startsWith("from ")) return true;
if (lower.startsWith("to ")) return true;
if (lower.startsWith("by ")) return true;
if (lower.startsWith("finally")) return true;
if (lower.startsWith("we should")) return true;
if (lower.startsWith("we must")) return true;
if (lower.startsWith("to prove")) return true;
```

**Fixes**: Prevents natural language commentary lines from being treated as proof content and generating spurious parse errors.

**Validity impact**: None, BUT be careful about over-skipping. Mitigation: if a line starts with a commentary prefix but ALSO has a parseable justification, parse it anyway (see DW-2 below for the architectural approach). As a quick win, just adding the prefixes is safe since these phrases never start valid proof lines.

**Estimated impact**: Low direct impact (most commentary is already skipped), but prevents false positive parse errors from chatty models.

---

### QW-4. Handle the "bare CP/IP close without formula" more robustly

**What**: The parser already handles bare `CP 3-7` lines and infers formulas. Extend the bare subproof close pattern to also match:
- Em-dash: `CP 3\u20147` (already uses `[-\u2013]`, add `\u2014`)
- Word "to": `CP 3 to 7`
- Parenthesized range: `CP (3-7)`

In the regex patterns (lines 339-349 and 353-366), change:
```typescript
/^(CP|IP)\s+(\d+)\s*[-–]\s*(\d+)$/i
```
to:
```typescript
/^(CP|IP)\s+\(?(\d+)\s*[-–—]\s*(\d+)\)?$/i
```
And add a second pattern:
```typescript
/^(CP|IP)\s+(\d+)\s+to\s+(\d+)$/i
```

**Fixes**: Edge cases where models use em-dashes or natural language ranges.

**Validity impact**: None. The subproof range numbers are just references; the validator checks them.

**Estimated impact**: Low (no current failures match this pattern), but future-proofs against known LLM formatting tendencies.

---

### QW-5. Strip trailing periods from rule names before lookup

**What**: In `canonicalizeRule()`, strip trailing periods and dots before lookup:
```typescript
const lower = name.toLowerCase().trim().replace(/\.+$/, "");
```

**Fixes**: Models that write `Simp.`, `Conj.`, `M.P.` (with dotted abbreviations).

Also strip internal dots from the name for lookup:
```typescript
const noDots = lower.replace(/\./g, "");
```
Then check both `lower` and `noDots` against the alias maps.

**Validity impact**: None. The canonical rule name is still resolved correctly.

**Estimated impact**: Low currently (no failures match exactly), but defensive against formatting variation.

---

### QW-6. Normalize `::` operator in formulas

**What**: Add to `normalizeFormula()`:
```typescript
.replace(/::/g, "<>")
```

The `::` notation is used in the prompt's equivalence rule reference (e.g., `p :: ~~p`) to mean "is logically equivalent to." Some models echo this notation in their proofs.

**Fixes**: v1-021 line `(B v ~B) v (D . C) :: B v ~B Taut 4`.

**Validity impact**: Technically risky. `::` in the prompt means bidirectional equivalence, equivalent to `<>`. However, if a model writes `A :: B` meaning "A is equivalent to B" and we convert it to `A <> B`, the validator would check it as a biconditional formula. This is correct -- the equivalence rules ARE replacement rules that establish biconditional relationships. Safe to normalize.

**Estimated impact**: 1 additional formula that would parse correctly.

---

## Deeper Changes

These require more substantial refactoring but address systemic issues.

### DW-1. Reconstruct subproof depth from logical structure (CP/IP annotations)

**What**: Instead of relying solely on whitespace indentation to determine `depth`, reconstruct the subproof tree from the justification column:

1. Lines with `Assumption (CP)` or `Assumption (IP)` open a new subproof (depth++)
2. Lines with `CP N-M` or `IP N-M` close the most recent open subproof (depth--)
3. All other lines inherit the current depth

This can be done as a post-processing pass after the initial parse, overriding the whitespace-based depths.

**Fixes**: Proofs where the model outputs flat (no indentation) or inconsistent indentation but has correct CP/IP annotations. Out of 350 results, 164 valid proofs already use flat output (no indent variation), which means they don't use subproofs. But for proofs that DO use subproofs with flat formatting, the validator rejects them with "No open subproof to close" errors because all lines are at depth 0.

**Validity impact**: None. The subproof structure is fully determined by the Assumption/close annotations. If those annotations are correct, the depth is correct. If those annotations are wrong, the validator will catch the logical error regardless of depth.

**Why it doesn't compromise logical validity**: The depth field is a structural annotation, not a logical one. It tells the validator which lines are "inside" which subproofs for scope-checking purposes. The actual logical validity is determined by the rule applications and formula derivations. Reconstructing depth from the justification column is more reliable than guessing from whitespace.

**Estimated impact**: Hard to quantify from current data since most depth-related failures are mixed with genuine logic errors. However, this eliminates an entire category of parser-induced failures and makes the system robust against any model that outputs flat proofs with correct subproof annotations.

---

### DW-2. Two-pass parsing: attempt parse first, classify as commentary second

**What**: Instead of the current approach (check if a line is commentary FIRST, then try to parse it), reverse the order:

1. For every non-blank line, attempt to parse it as a proof line (strip line number, parse justification)
2. If parsing SUCCEEDS, accept it as a proof line regardless of how it starts
3. If parsing FAILS and the line has no line number, treat it as commentary
4. If parsing FAILS and the line HAS a line number, record it as a parse error

This eliminates both over-aggressive commentary detection (skipping "Therefore P > Q CP 1-5") and under-aggressive detection (accepting "By Modus Ponens on lines 1 and 2, Q follows" as proof content).

**Fixes**: Commentary detection false positives and false negatives.

**Validity impact**: None. The change only affects which lines are ATTEMPTED for parsing, not how they are parsed or validated.

**Estimated impact**: Low direct impact on current data (the current commentary patterns are mostly caught). Prevents future failures from models that start proof lines with natural language.

---

### DW-3. Partial proof forwarding (drop all-or-nothing error handling)

**What**: In `harness.ts:parseModelResponse()`, change the behavior when some lines fail to parse:

Currently (line 245-247):
```typescript
if (result.errors && result.errors.length > 0) {
  return { proof: null, error: ... };
}
```

Change to: if the majority of lines parsed successfully (e.g., >= 80%), forward the parsed lines to the validator and include the parse errors as warnings. Only reject if zero lines or fewer than some threshold parsed.

**Fixes**: Cases where one commentary line slips through and causes a parse error, killing an otherwise-correct proof.

**Validity impact**: **Requires careful consideration.** If a skipped line was a critical proof step (e.g., the line that derives the contradiction for IP), the validator will catch it -- the proof will be "incomplete" rather than "parse error." This is actually a better outcome: we get a validation error that correctly identifies the gap, rather than a generic parse error.

However, skipping lines can cause LINE NUMBER misalignment. If line 5 fails to parse and is dropped, the validator might map line 6's references to the wrong formulas. Mitigation: when forwarding partial results, preserve the original line numbers (don't renumber).

**Estimated impact**: Potentially fixes 1-2 of the current 8 parse errors. More importantly, reduces false "parse error" classifications going forward.

**Risk**: LOW if line numbers are preserved. The validator independently checks every rule application.

---

### DW-4. Handle multiple proof attempts (take the last complete one)

**What**: When the raw response contains multiple proof blocks (detected by repeated `1.` line numbers separated by non-proof content), extract the LAST complete proof block and parse only that.

Detection: scan for lines matching `^\s*1[.)]\s+` or `^\s*\(1\)\s+`. If found more than once with non-trivial content between them, split into blocks and take the last one that has a closing CP/IP line or reaches a conclusion.

**Fixes**: v1-021 where the gemini model restarts the proof 8+ times within a single response.

**Validity impact**: None. We're selecting which TEXT to parse, not changing how parsing or validation works. The validator still fully checks the selected proof.

**Estimated impact**: Fixes 1 specific parse error. Low frequency but high impact when it occurs.

---

### DW-5. Add Gentzen-style intro/elim rule aliases

**What**: Add rule aliases for the Gentzen-style notation that some models use:

```typescript
// Inference aliases
"->e": "MP", "arrow elim": "MP", "conditional elim": "MP",
"->i": "CP", "arrow intro": "CP", "conditional intro": "CP",
".e": "Simp", "and elim": "Simp", "and-elim": "Simp", "conjunction elim": "Simp",
".i": "Conj", "and intro": "Conj", "and-intro": "Conj", "conjunction intro": "Conj",
"ve": "DS", "or elim": "DS", "or-elim": "DS", "disjunction elim": "DS",
"vi": "Add", "or intro": "Add", "or-intro": "Add", "disjunction intro": "Add",
"~e": "DN", "neg elim": "NegE", "negation elim": "NegE",
"~i": "IP", "neg intro": "IP", "negation intro": "IP",
"ce": "Simp", "ci": "Conj",

// Symbol-based aliases
"\u2192e": "MP", "\u2192i": "CP",
"\u2227e": "Simp", "\u2227i": "Conj",
"\u2228e": "DS", "\u2228i": "Add",
"\u00ace": "DN", "\u00aci": "IP",
```

Note: `"~i"` and `"ni"` are already mapped to IP. `"neg elim"` is already mapped to NegE. The main additions are the Gentzen-style hyphenated forms and the symbol-based variants.

**Fixes**: No current failures (Gemini models don't use Gentzen notation), but prepares for testing with models trained on different logic textbooks.

**Validity impact**: None. These are just alternative names for the same rules. The canonical rule name is what the validator checks.

**Estimated impact**: Zero current impact, but important for multi-model benchmarking.

---

## Changes That WOULD Compromise Validity (Do NOT Implement)

These suggestions may seem helpful but would undermine the benchmark's logical rigor.

### DO NOT: Auto-correct mismatched brackets in formulas

Mismatched brackets (`{[A > B) . C]`) are genuine model errors. If the parser auto-corrects them, it might "fix" a formula into something the model didn't intend, producing a valid-looking proof of a different theorem. The validator must reject these.

**Why it matters**: A formula with mismatched brackets is ambiguous. `{[A > B) . C]` could mean `(A > B) . C` or `[A > (B . C)]` depending on which bracket you "fix." Guessing wrong would validate an incorrect proof.

### DO NOT: Accept bare "Assume P" without CP/IP annotation

Some models write `Assume P` without specifying whether it's for CP or IP. The parser could try to infer the technique from context (if the subproof ends with a conditional, it's CP; if it ends with a negation, it's IP). However, this inference is fragile and could assign the wrong technique, causing the validator to accept an invalid proof.

**Why it matters**: The technique determines the CONCLUSION of the subproof. CP concludes `P > Q`; IP concludes `~P`. Getting this wrong means the proof derives the wrong formula.

**Caveat**: If the model writes "Assume P" and the subproof is later closed with an explicit `CP 3-7` or `IP 3-7`, the technique IS specified in the close line. In that case, the assumption line's technique annotation is redundant, and defaulting to the close line's technique is safe. This specific case could be handled as a DW-level improvement by cross-referencing assumption lines with their corresponding close lines.

### DO NOT: Infer justifications for lines that have no justification

If a model writes `1. P > Q` with no justification, the parser should NOT guess that it's a premise or an application of some rule. The justification is the core logical claim, and guessing it could validate incorrect proof steps.

### DO NOT: Accept English-word connectives ("P and Q", "not P")

While tempting, normalizing English words to logical symbols is dangerous:
- "or" is already aliased to the Addition rule, not to disjunction
- Variable names could be words ("And", "Not")
- Sentence fragments containing these words are common in commentary
- This would cause more false positives than it fixes

### DO NOT: Use fuzzy matching (Levenshtein distance) for rule names

A misspelled rule name could fuzzy-match to the WRONG rule (e.g., "Diss" matching to "Dist" instead of "DS"), silently accepting an incorrect rule application.

---

## Impact Summary

| Change | Category | Fixes (current) | Risk | Effort |
|---|---|---|---|---|
| QW-1: Add Reit/Copy aliases | Quick Win | 2 parse errors | None | Trivial |
| QW-2: Strip trailing commentary | Quick Win | 1+ parse errors | None | Trivial |
| QW-3: More commentary prefixes | Quick Win | 0 (preventive) | None | Trivial |
| QW-4: Flexible CP/IP close range | Quick Win | 0 (preventive) | None | Trivial |
| QW-5: Strip dots from rule names | Quick Win | 0 (preventive) | None | Trivial |
| QW-6: Normalize `::` operator | Quick Win | 1 formula | Low | Trivial |
| DW-1: Depth from CP/IP structure | Deep | Unknown (systemic) | None | Medium |
| DW-2: Parse-first, skip-second | Deep | 0 (preventive) | None | Medium |
| DW-3: Partial proof forwarding | Deep | 1-2 parse errors | Low | Medium |
| DW-4: Last proof attempt | Deep | 1 parse error | None | Medium |
| DW-5: Gentzen-style aliases | Deep | 0 (future models) | None | Low |

**Bottom line**: The quick wins (QW-1 through QW-6) are all safe, trivial to implement, and collectively address 4+ of the 8 current parse errors. DW-1 (depth reconstruction) is the highest-impact structural change and should be the next priority after the quick wins. DW-3 (partial proof forwarding) provides the biggest philosophical improvement -- treating parse errors as degraded results rather than total failures.

---

## Appendix: Data Summary

### Overall Results (350 benchmark runs)
- Valid: 238 (68.0%)
- Invalid: 104 (29.7%)
- Parse Error: 8 (2.3%)

### Parse Error Breakdown (8 total)
- API failures (empty response): 5 (gemini-3-pro) -- NOT fixable by parser
- Unknown rule "Copy": 1 -- Fixed by QW-1
- Unknown rule "Reit" + commentary: 1 -- Fixed by QW-1 + QW-2
- Embedded commentary destroying parse: 1 -- Fixed by QW-2 + QW-3

### Invalid Result Breakdown (104 total)
- Genuine logic errors (wrong derivations, incomplete proofs): ~90
- Formula syntax errors (commas, mismatched brackets): ~8
- Potentially fixable by depth reconstruction: Unknown (mixed with logic errors)

### Validation Error Patterns (across 104 invalid results)
- "Conclusion does not follow from subproof": 79 occurrences -- model logic error
- "Conclusion not established at depth 0": 56 occurrences -- incomplete proof
- "Subproof scopes still open": 21 occurrences -- unclosed subproofs
- "Referenced line N is invalid" (cascading): 74 results -- secondary errors
- "Invalid formula" / "Unexpected character": 6 occurrences -- model syntax error
- "Cannot derive formula using [rule]": 14 occurrences -- wrong rule application
