# Parser Fix Validation

## Problem
The parser's `ruleFirstMatch` regex failed to parse lines like `P . Q Conj 1,2` because the non-greedy `(.+?)` combined with the rule pattern `[A-Za-z .']*?` created ambiguity when formulas contained dots and spaces.

## Solution
Changed from a regex-based approach that tried to guess where formulas end and rules begin, to a more precise approach that:
1. Looks for a known rule name (using `\S+` to match a single word)
2. Validates it against the canonical rule names via `canonicalizeRule()`
3. Extracts the formula by removing the matched rule and line numbers from the end

## Test Cases

### Now Working
- `P . Q Conj 1,2` → formula: `P . Q`, rule: `Conj`, lines: `1,2` ✅
- `~P MT 1,2` → formula: `~P`, rule: `MT`, lines: `1,2` ✅
- `P v Q Add 1` → formula: `P v Q`, rule: `Add`, lines: `1` ✅
- `P . Q . R Conj 1,2` → formula: `P . Q . R`, rule: `Conj`, lines: `1,2` ✅
- `((P . Q) v R) > (S . T) Impl 1` → formula: `((P . Q) v R) > (S . T)`, rule: `Impl`, lines: `1` ✅

### Model Error (Parser extracts, validator rejects)
- `P > Q, ~Q MT 1,2` → formula: `P > Q, ~Q`, rule: `MT`, lines: `1,2`
  - Parser now extracts this structure
  - Rust validator will reject the invalid formula (comma is not a valid operator)
  - This is correct behavior: parser's job is to extract structure, validator's job is to check validity

## Real-World Test
Tested against `/Users/dogaozden/Documents/AI_Projects/logic/prop-bench/results/v1/raw/v1-005_gemini_1770394652680.json`:
- Before fix: `"parse_error": "Could not parse justification from: \"P . Q Conj 1,2\""`
- After fix: Parses successfully ✅

## Files Changed
- `/Users/dogaozden/Documents/AI_Projects/logic/prop-bench/parser.ts`
  - Lines 341-366: Pattern A (FORMULA RULE N,N,N)
  - Lines 368-389: Pattern B (FORMULA N,N RULE)
  - Lines 391-408: Pattern C (FORMULA RULE N)

All three patterns now use the same approach:
1. Match rule name with `\S+` (single non-whitespace word)
2. Validate against known rules
3. Extract formula by slicing from the end
