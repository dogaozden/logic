# Parser Improvement Plan

Synthesized from 6 parallel agents analyzing **1,088 parse errors** across v7 (283) and v8 (805) datasets.
Validated by 4 agents tracing each fix through the actual parser code.

## Validation Summary

| Fix | Verdict | Key Finding |
|-----|---------|-------------|
| 1. Commentary stripping | **CONFIRMED** | Bug is deeper than planned — CP/IP technique rules are excluded from Patterns A-D, so even after stripping, tryExtractRuleAndLines can't match them. Need to strip BEFORE Cases 3a/3b. |
| 2. Bare rule no line numbers | **CORRECTED** | Plan's diagnosis was wrong. Pattern D works fine for equivalence rules. The ONLY bug is `kind === "equivalence"` guard (line 542) blocking inference rules. One-line fix. |
| 3. CP/IP single line ref | **CONFIRMED** | Trivial regex addition. Cases 3a/3b reject single numbers. |
| 4. Assumption variants | **CONFIRMED** | Trailing content breaks `$` anchor. Some inputs are MISPARSED (not unparsed) — "Assumption (Simp 12)" becomes "Simp 12" with "Assumption" swallowed into formula. |
| 5. (from N) refs | **CONFIRMED** | `canonicalizeRule("from")` returns null, paren-stripping removes `(from 4)`, leaving bare `#`. Needs new pattern before parenJustMatch. |
| 6. Formula + bare linenum | **CONFIRMED** | Two-token inputs like `"Q 7"` fail all patterns. Safe as last-resort fallback. |
| 7. Aliases | **ALL MISSING** | reit, absorption, #e, negimpl, assumed, replace, copy — none are in alias tables. |
| 8. Multi-rule chaining | **CONFIRMED** | Pattern D matches last rule, swallowing earlier rules into formula. |
| 9. CP/IP comma format | **CONFIRMED** | Trivial: change range separator regex to accept comma. |
| 10. :: notation | **CONFIRMED** | Safe — `::` has no meaning in propositional logic formulas. |
| 11. NegE ~N refs | **CONFIRMED** | `~` breaks digit regex. Strip from line ref tokens. |
| 12. Rule-first format | **NOT WORTH IT** | Would require fundamental parser restructuring for 1 model (~25 lines). |
| 13. Equiv rule + formula arg | **CONFIRMED but RISKY** | Trying 2nd-to-last word risks false positives. |
| 14. # RULE malformed refs | **CONFIRMED** | Trailing comma breaks digit regex. Trivial strip. |
| 15. Lines-then-rule comma | **CONFIRMED** | Comma between digit and rule breaks Pattern B. |
| 16. CD multi-range | **NOT WORTH IT** | Too complex for 3 lines. |

**Key dependency**: Fixes 5, 6, 7 (reit/rep/copy) require a new `Reit` canonical rule. The Rust validator must support reiteration for these parses to pass validation.

## Scope

- **1,088 result rows** with parse errors, **~11,000+ individual failing justification strings**
- **100%** are "Could not parse justification" — formula extracted but rule/justification not recognized
- Models: gemini-2.5-flash (dominant), gemini-2.5-flash-lite, gemini-3-flash-preview, gemini-3-pro-preview, claude-haiku-4.5, glm-4.5-air
- **~40-50% of distinct errors are fixable** by parser improvements
- By **total failing lines** (counting repeats), fixable patterns dominate because models repeat the same fixable mistake hundreds of times

## Unfixable (~50% of distinct errors)

These are model output problems, not parser problems:
- **Commentary/reasoning text** — model thinking aloud instead of writing proof steps (biggest category)
- **Truncated formulas** — token limit hit mid-formula
- **Ellipsis abbreviation** — model used `...` to abbreviate
- **Bare formulas with no justification** — formula present but no rule/line ref at all
- **Empty strings** — nothing to parse
- **LaTeX notation** — model output in LaTeX math mode

---

## P0 — Critical Fixes (thousands of failing lines each)

### Fix 1: Strip trailing commentary before rule matching

**Pattern**: `FORMULA CP 3-7 (This is incorrect...)` or `FORMULA MP 1,2 -- commentary`

**Root cause**: The `--` stripping happens inside `tryExtractRuleAndLines()` (line 405) but CP/IP patterns are matched in Cases 3a/3b BEFORE that function is called. The paren-stripping loop (line 448) strips ALL trailing `(...)` groups but runs AFTER `parenJustMatch`, creating a catch-22.

**Examples**:
```
~(R v ~R) IP 16-16 (This is a placeholder for a subproof)
P . Q MT 7, ~R (This path is complex...)
R CP 16-17 (Error: Subproof 16-17 derived #, so it should yield ~~R)
P > R CP 3-7 -- Error in logic flow, need to use MP
~Q IP 18-19 (This is a contradiction, ~Q and Q.)
```

**Fix**: Move `--` comment stripping and non-justification paren stripping to the TOP of `parseJustification()`, before any case matching. Commentary parens can be identified by containing English words (not just rule names/numbers). Specifically:
1. Strip `\s*--.*$` early (before Cases 3a/3b)
2. Strip trailing `(...)` groups that contain English words / don't match rule patterns
3. THEN try all the existing case matching

**Found in**: ALL 6 chunks. Estimated **~5,000-10,000+ failing lines** across all datasets.

---

### Fix 2: Bare equivalence/inference rule with no line numbers

**Pattern**: `FORMULA Taut`, `FORMULA Impl`, `FORMULA DeM`, `FORMULA DN`, `# NegE`

**Root cause**: Pattern D in `tryExtractRuleAndLines()` should already handle `FORMULA RULE` for equivalence rules (1-word match at end). But:
- It may have a bug where the 2-word pattern matches `T Taut` (treating `T` as part of the rule name) before the 1-word pattern tries `Taut` alone
- Inference rules (NegE, Add, Simp) used bare are rejected because Pattern D requires `canon.kind === "equivalence"`
- Full-word aliases like `Tautology`, `Simplification` aren't matched by single-word patterns

**Examples**:
```
~R v R Taut
T > T Impl
~(B . ~B) Taut
P v P Taut
~[(P > Q) . ~Q] DeM
P > (Q > R) Exp
# NegE
S v R Add
(T v T) v T Simplification
```

**Fix**:
1. Debug why Pattern D fails for simple cases like `S v S Taut` — likely 2-word pattern match interference
2. Allow inference rules without line refs in Pattern D (at minimum NegE for `# NegE`, and Taut which is used as both)
3. Ensure multi-word aliases (`Tautology`, `Simplification`, `Negation Elimination`) are caught by the multi-word patterns

**Found in**: ALL 6 chunks. Single entry id 2524 has **450 lines** all failing on bare `Taut`. Estimated **~3,000+ failing lines** total.

---

### Fix 3: CP/IP with single line ref

**Pattern**: `FORMULA CP 2` or `FORMULA IP 4` (single number, not a range)

**Root cause**: The parser only matches `CP N-M` (range format) in Cases 3a/3b. Models sometimes emit `CP N` with just the starting line.

**Examples**:
```
{{~[(T > S) > T]} . S} CP 1
~(R . B) IP 14
B > [~(B . ~B)] CP 2
T > S IP 4
[~(T > T)] > [~(T > T)] CP 22
```

**Fix**: Add patterns for `CP N` / `IP N` with single line ref. Treat as `CP N-N` (degenerate range). Trivial regex addition to Cases 3a/3b.

**Found in**: chunks 1, 2, 3, 4, 5. Estimated **~1,400 failing lines**.

---

## P1 — High Impact (hundreds of failing lines each)

### Fix 4: Assumption with non-CP/IP tags or trailing content

**Patterns**:
- `FORMULA Assumption (Simp 5)` — inference rule where CP/IP should be
- `FORMULA Assumption (DS)` — wrong technique tag
- `FORMULA Assumption (IP) 5` — trailing line number
- `FORMULA Assumption (CP) (Line 2)` — trailing annotation

**Examples**:
```
B Assumption (DS)
(S . R) . T Assumption (Simp 12)
~P Assumption (IP) 5
P v Q Assumption (CP) (Line 2)
~B Assumption (NegE)
```

**Fix**:
1. After matching `Assumption (CP|IP)`, ignore any trailing content (numbers, parens)
2. For `Assumption (RULE N)`, treat as `RULE N` applied (strip the "Assumption" wrapper)
3. For `Assumption (non-CP/IP-tag)`, default to `Assumption (CP)`

**Found in**: chunks 1, 2, 3, 4, 5. Estimated **~2,000+ failing lines** (dominated by flash-lite repeats).

---

### Fix 5: `(from N)` / `(line N)` back-references

**Pattern**: `FORMULA (from 4)`, `# (from line 15)`, `FORMULA (line 19)`

**Examples**:
```
# (from line 15)
# (from 4)
~T (from 28)
R (from line 12)
P (from 4)
~S (line 19)
T (repeat)
```

**Fix**: Add a pattern to match `(from N)`, `(from line N)`, `(line N)` as `Reit N` justification. Also handle `(from N,M)` for multi-line refs.

**Found in**: chunks 1, 2, 5. Estimated **~50 failing lines**.

---

### Fix 6: Formula + bare line number (no rule name)

**Pattern**: `FORMULA N` where N is just a number, no rule name

**Examples**:
```
# 16
# 7
Q 7
~P 2
S v ~S 29
(R > T) v ~S 11
T > T 2
{[(S . T) v T] v [(~T v ~T) v (~T v ~S)]} 13
```

**Fix**: After all other patterns fail, match `FORMULA \d+$` as a fallback and emit `Reit N` (reiteration from line N). Very common in gemini-2.5-flash output.

**Found in**: ALL 6 chunks. Estimated **~100 failing lines**.

---

### Fix 7: Add missing rule aliases

| Alias | Maps to | Source |
|-------|---------|--------|
| `reit`, `reiteration`, `rep`, `repetition` | New "Reit" rule | chunks 1,2,3,4,5 |
| `absorption` | `Taut` | chunk 2 |
| `#e` | `NegE` | chunk 5 |
| `negimpl` | `Impl` | chunk 5 |
| `assumed` | same as `assumption` | chunk 1 |
| `replace` | `Equiv` | chunk 2 |
| `copy` | "Reit" | chunk 6 |

**Fix**: Add entries to `INFERENCE_ALIASES`, `EQUIVALENCE_ALIASES`, and/or `TECHNIQUE_ALIASES`. Also add `assumed` to the assumption regex patterns.

**Found in**: chunks 1-6. Estimated **~30 failing lines**.

---

## P2 — Medium Impact (tens of failing lines each)

### Fix 8: Multi-rule chaining
**Pattern**: `Impl 5, DeM` or `Simp 21, DN, Simp`
**Fix**: Take the first rule + its line reference, ignore subsequent rules.
**Estimated**: ~40 failing lines.

### Fix 9: CP/IP comma format
**Pattern**: `CP 1,5` instead of `CP 1-5`
**Fix**: Accept comma-separated line refs for CP/IP, treat as range.
**Estimated**: ~130 failing lines.

### Fix 10: `::` alternative notation
**Pattern**: `FORMULA :: FORMULA Impl`
**Fix**: Split on `::`, parse the last segment for rule name.
**Estimated**: ~50 failing lines.

### Fix 11: NegE with `~N` style refs
**Pattern**: `NegE 1,~1`
**Fix**: Strip `~` prefix from line number references.
**Estimated**: ~20 failing lines.

### Fix 12: Rule-first format (gemini-3-pro)
**Pattern**: `Simp 2 ~(Q v Q)` (rule BEFORE formula)
**Fix**: Detect reversed format heuristically from first few lines, switch parsing mode.
**Estimated**: ~25 failing lines, but model-specific.

### Fix 13: Equivalence rule + formula argument
**Pattern**: `S v S Taut S` (rule followed by the result formula)
**Fix**: After detecting a bare equivalence rule, ignore any trailing formula token.
**Estimated**: ~43 failing lines.

### Fix 14: `# RULE` patterns with malformed refs
**Pattern**: `# NegE 9,` (trailing comma), `# NegE 14,T` (formula mixed with line ref)
**Fix**: Strip trailing commas from line refs; ignore non-numeric tokens in line ref lists.
**Estimated**: ~30 failing lines.

### Fix 15: Lines-then-rule format
**Pattern**: `[(P v T) . A] 3, DS` (line number then rule, reversed)
**Fix**: Pattern B handles this but the comma between number and rule breaks it. Add comma-tolerant variant.
**Estimated**: ~10 failing lines.

### Fix 16: CD with complex multi-range refs
**Pattern**: `CD 5, 6-7, 8-13`
**Fix**: Parse CD with multiple comma-separated range arguments.
**Estimated**: ~3 failing lines.

---

## Implementation Order

1. **Fix 1** (commentary stripping) — highest ROI, affects all rule types
2. **Fix 2** (bare rule) — second highest, trivial once Pattern D bug is found
3. **Fix 3** (CP/IP single line) — trivial regex addition
4. **Fix 4** (assumption variants) — moderate complexity
5. **Fix 7** (aliases) — trivial additions
6. **Fix 6** (formula + bare line number fallback) — easy, add at end of parseJustification
7. **Fix 5** (`(from N)`) — new pattern, easy
8. Fixes 8-16 as time permits
