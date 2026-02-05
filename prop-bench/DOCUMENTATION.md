# PropBench Documentation

An LLM benchmark that scores models on proof efficiency (fewest lines) for propositional logic natural deduction. Models receive tautologies and must produce Fitch-style proofs; the model with the fewest total proof lines wins.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Shared Types and Configuration (`config.ts`)](#shared-types-and-configuration-configts)
3. [Prompt Template Builder (`prompt.ts`)](#prompt-template-builder-promptts)
4. [LLM Output Parser (`parser.ts`)](#llm-output-parser-parserts)
5. [Benchmark Harness (`harness.ts`)](#benchmark-harness-harnessts)
6. [Model API Adapters (`models/`)](#model-api-adapters-models)
7. [Scorer (`scorer.ts`)](#scorer-scorerts)
8. [Logger (`logger.ts`)](#logger-loggerts)
9. [CLI Binary (`src/main.rs`)](#cli-binary-srcmainrs)

---

## Architecture Overview

```
prop-bench/
├── config.ts          # Shared TypeScript types and default parameters
├── prompt.ts          # Prompt template builder for LLM queries
├── parser.ts          # LLM output parser (text → structured proof)
├── harness.ts         # Benchmark orchestrator
├── scorer.ts          # Line counting + Elo ratings
├── logger.ts          # Structured JSON logging
├── models/            # Per-provider API adapters
│   └── gemini.ts
├── src/
│   └── main.rs        # Rust CLI binary (generate + validate)
├── package.json       # TypeScript project config
├── tsconfig.json      # TypeScript compiler config
└── Cargo.toml         # Rust project config
```

**Data flow for a single benchmark run:**
```
Theorem (JSON)
    │
    ▼
buildPrompt(theorem)          ← prompt.ts
    │
    ▼
LLM API call                  ← harness.ts + models/*.ts
    │
    ▼
Raw text response
    │
    ▼
parseProof(rawOutput, theorem) ← parser.ts
    │
    ▼
toValidationJSON()             ← parser.ts
    │
    ▼
propbench validate --theorem ... --proof ...  ← src/main.rs (Rust CLI)
    │
    ▼
ProofResult { valid, line_count, errors }
    │
    ▼
Score + Log                    ← scorer.ts + logger.ts
```

---

## Shared Types and Configuration (`config.ts`)

Central type definitions and default parameters used by all other modules.

### Interfaces

**`Theorem`** — A theorem to be proved:
```typescript
interface Theorem {
  id: string;
  premises: string[];       // empty for tautologies (Medium+ difficulty)
  conclusion: string;       // formula string
  difficulty: Difficulty;
  difficulty_value: number;  // 1-100
}
```

**`Difficulty`** — Six difficulty tiers:
```typescript
type Difficulty = "Easy" | "Medium" | "Hard" | "Expert" | "Nightmare" | "Marathon";
```

| Tier | Value Range |
|------|-------------|
| Easy | 1-25 |
| Medium | 26-45 |
| Hard | 46-70 |
| Expert | 71-85 |
| Nightmare | 86-95 |
| Marathon | 96-100 |

**`ProofLine`** — A single line in a structured proof:
```typescript
interface ProofLine {
  line_number: number;
  formula: string;
  justification: string;  // e.g. "Assumption (CP)", "MP 1,2", "CP 3-7"
  depth: number;           // subproof nesting depth (0 = top level)
}
```

**`ProofResult`** — Validation result from the Rust CLI:
```typescript
interface ProofResult {
  valid: boolean;
  line_count: number;
  errors: string[];
}
```

**`BenchmarkResult`** — Full result for one theorem + one model:
```typescript
interface BenchmarkResult {
  theorem_id: string;
  model: string;
  proof_lines: ProofLine[];
  result: ProofResult;
  raw_response: string;
  raw_prompt: string;
  parse_errors: string[];
  timestamp: string;      // ISO 8601
  latency_ms: number;
}
```

**`BenchmarkSummary`** — Aggregate results for one model across all theorems:
```typescript
interface BenchmarkSummary {
  model: string;
  total_theorems: number;
  valid_proofs: number;
  invalid_proofs: number;
  parse_failures: number;
  total_lines: number;     // sum of line_count for valid proofs
  average_lines: number;
  results: BenchmarkResult[];
}
```

**`ModelConfig`** — Configuration for an LLM API:
```typescript
interface ModelConfig {
  name: string;
  provider: "gemini" | "anthropic" | "openai";
  model_id: string;
  api_key_env: string;    // environment variable name
  temperature: number;
  max_tokens: number;
}
```

**`DifficultyDistribution`** — Theorem count per difficulty tier:
```typescript
interface DifficultyDistribution {
  easy: number;       // difficulty 1-25
  medium: number;     // difficulty 26-45
  hard: number;       // difficulty 46-70
  expert: number;     // difficulty 71-85
  nightmare: number;  // difficulty 86-100
}
```

**`ParsedLine`** — A parsed proof line with the original raw text retained:
```typescript
interface ParsedLine {
  line_number: number;
  formula: string;
  justification: string;
  depth: number;
  raw: string;           // original unparsed line
}
```

**`ParseResult`** — Complete parser output:
```typescript
interface ParseResult {
  lines: ParsedLine[];
  errors: ParseError[];
  unparsed_sections: string[];
}
```

**`ParseError`** — A line that could not be parsed:
```typescript
interface ParseError {
  line_number: number | null;  // null if line number could not be determined
  raw: string;
  message: string;
}
```

### Default Parameters

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_DISTRIBUTION` | `{ easy: 30, medium: 30, hard: 20, expert: 15, nightmare: 5 }` | 100-theorem benchmark distribution |
| `DEFAULT_TOTAL_THEOREMS` | `100` | Total theorems in v1 benchmark |
| `DEFAULT_MODEL_CONFIGS` | Gemini 2.0 Flash (temp 0.0, 4096 tokens) | Initial model to test |

### Helper Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `difficultyFromValue` | `(value: number) => Difficulty` | Maps a 1-100 difficulty value to a Difficulty tier |
| `difficultyRange` | `(difficulty: Difficulty) => { min, max }` | Returns the value range for a Difficulty tier |

---

## Prompt Template Builder (`prompt.ts`)

Builds a complete LLM prompt containing the theorem, all rules, and strict output format requirements.

### Function Signature

```typescript
function buildPrompt(theorem: Theorem): string
```

### Prompt Structure

Every prompt follows this fixed structure:

1. **System instruction** — Role assignment ("formal logic proof assistant") and the directive to minimize proof lines
2. **Symbol reference** — ASCII symbols for all connectives (`>`, `v`, `.`, `~`, `≡`, `⊥`)
3. **Inference rules** — All 9 valid argument forms with number, name, abbreviation, and pattern
4. **Equivalence rules** — All 10 replacement rules with bidirectional equivalences
5. **Proof techniques** — CP and IP with step-by-step procedure
6. **Output format** — Exact line format specification
7. **Theorem section** — The specific theorem to prove
8. **Closing instruction** — "Output ONLY the numbered proof lines"

### Rules Included

**9 Inference Rules:**

| # | Name | Abbrev | Pattern |
|---|------|--------|---------|
| 1 | Modus Ponens | MP | p > q, p therefore q |
| 2 | Modus Tollens | MT | p > q, ~q therefore ~p |
| 3 | Disjunctive Syllogism | DS | p v q, ~p therefore q |
| 4 | Simplification | Simp | p . q therefore p (or q) |
| 5 | Conjunction | Conj | p, q therefore p . q |
| 6 | Hypothetical Syllogism | HS | p > q, q > r therefore p > r |
| 7 | Addition | Add | p therefore p v q |
| 8 | Constructive Dilemma | CD | p v q, p > r, q > s therefore r v s |
| 9 | Negation Elimination | NegE | p, ~p therefore contradiction |

**10 Equivalence Rules:**

| # | Name | Abbrev |
|---|------|--------|
| 10 | Double Negation | DN |
| 11 | DeMorgan's | DeM |
| 12 | Commutation | Comm |
| 13 | Association | Assoc |
| 14 | Distribution | Dist |
| 15 | Contraposition | Contra |
| 16 | Implication | Impl |
| 17 | Exportation | Exp |
| 18 | Tautology | Taut |
| 19 | Equivalence | Equiv |

**2 Proof Techniques:** Conditional Proof (CP), Indirect Proof (IP)

### Theorem Format Handling

The prompt format differs based on whether the theorem has premises:

**Easy theorems (difficulty 1-25)** — Have explicit premises and a conclusion. The prompt lists numbered premises and instructs the model to begin with them justified as "Premise".

```
Premises:
  1. P > Q
  2. P
Conclusion: Q

Your proof must begin with the premises as given (justified as "Premise"),
then derive the conclusion.
```

**Medium+ theorems (difficulty 26-100)** — Standalone tautologies with no premises. The prompt instructs the model to use CP and/or IP since there are no premises to start from.

```
Prove the following tautology (no premises):
  (P > Q) v (Q > P)

Since there are no premises, you will need to use Conditional Proof (CP)
and/or Indirect Proof (IP) to derive the formula.
```

### Output Format Specification

The prompt specifies the exact format models should use:

```
N. FORMULA JUSTIFICATION
```

Where JUSTIFICATION is one of:
- `Premise` — for given premises
- `Assumption (CP)` or `Assumption (IP)` — opens a subproof
- `RULE LINE_NUMBERS` — e.g. `MP 1,2` or `Simp 3` or `DeM 5`
- `CP START-END` or `IP START-END` — closes a subproof (e.g. `CP 3-7`)

### Design Decisions

- **ASCII symbols preferred**: The prompt uses `>`, `v`, `.` rather than Unicode symbols (`⊃`, `∨`, `·`) to reduce the chance of models producing unusual Unicode variants. The Rust parser accepts both.
- **Minimization instruction**: Appears twice (opening system instruction and output format section) to reinforce the efficiency objective.
- **No example proof included**: Including an example proof could bias models toward a specific proof style or length. The rule descriptions are sufficient.
- **Fixed structure**: The rule reference is identical for every theorem. Only the theorem section varies. This ensures consistent prompting across the benchmark.

---

## LLM Output Parser (`parser.ts`)

Parses raw LLM text output into structured `ParsedLine[]` for validation by the Rust CLI. This is the most complex module because LLMs produce highly variable output formats.

### Function Signatures

```typescript
function parseProof(rawOutput: string, theorem: Theorem): ParseResult
function toValidationJSON(theorem: Theorem, parsed: ParseResult): string
```

### Parsing Pipeline

Each line goes through this pipeline:

```
Raw line from LLM
    │
    ▼
1. Skip if empty or commentary (isCommentary)
    │
    ▼
2. Strip subproof markers (|, │)
    │
    ▼
3. Measure indentation depth
    │
    ▼
4. Strip line number prefix
    │
    ▼
5. Check if it looks like proof content (looksLikeProofLine)
    │
    ▼
6. Parse formula + justification (parseJustification)
    │
    ▼
7. Normalize formula symbols (normalizeFormula)
    │
    ▼
8. Emit ParsedLine or ParseError
```

### Line Number Stripping

The parser recognizes 7 line number formats via ordered regex patterns:

| Format | Example | Regex |
|--------|---------|-------|
| Parenthesized | `(1)` | `/^\((\d+)\)\s*/` |
| Hash prefix | `#1.` or `#1)` or `#1:` | `/^#(\d+)[.):]\s*/` |
| Step prefix | `Step 1:` or `Step 1.` | `/^Step\s+(\d+)[.:]\s*/i` |
| Line prefix | `Line 1:` or `Line 1.` | `/^Line\s+(\d+)[.:]\s*/i` |
| Paren suffix | `1)` | `/^(\d+)\)\s*/` |
| Dot suffix | `1.` | `/^(\d+)\.\s*/` |
| Colon suffix | `1:` | `/^(\d+):\s*/` |

Patterns are tried in this order; the first match wins. If no line number is found, the parser assigns one automatically based on sequential counting (`autoLineNumber`).

### Subproof Depth Detection

Depth is determined by two methods, with explicit markers taking priority:

**Method 1 — Vertical bar markers** (`|` or `│`):
The parser counts and strips leading vertical bar characters. Each bar increments the depth by 1. This handles Fitch-style notation where subproofs are marked with vertical lines.

**Method 2 — Indentation**:
The parser measures leading whitespace (tabs count as 2 spaces). On a pre-scan pass, it detects:
- `baseIndent`: indentation of the first numbered line (subtracted from all measurements)
- `indentUnit`: minimum non-zero indentation difference between any two lines

Depth is computed as: `Math.round((indent - baseIndent) / indentUnit)`

If both markers and indentation are present, marker depth is used.

### Rule Alias Mapping

The parser maps 80+ rule name variations to canonical names via three lookup tables. All lookups are case-insensitive.

**Inference Aliases (28 entries):**

| Canonical | Aliases |
|-----------|---------|
| MP | mp, modus ponens, modusponens, modus, ponens |
| MT | mt, modus tollens, modustollens, tollens |
| DS | ds, disjunctive syllogism, disjunctivesyllogism, disj, disjsyl |
| Simp | simp, simplification, simple |
| Conj | conj, conjunction, and |
| HS | hs, hypothetical syllogism, hypotheticalsyllogism, hyp, hypo, syl |
| Add | add, addition, or |
| CD | cd, constructive dilemma, constructivedilemma, dil, dilemma |
| NegE | nege, negation elimination, negationelimination, neg elim, contradiction, bottom intro |

**Equivalence Aliases (32 entries):**

| Canonical | Aliases |
|-----------|---------|
| DN | dn, double negation, doublenegation, double neg |
| DeM | dem, demorgan, de morgan, demorgans, de morgan's, morgan, dm |
| Comm | comm, commutation, com, commute |
| Assoc | assoc, association, associate |
| Dist | dist, distribution, distrib, distribute |
| Contra | contra, contraposition, contrap, contrapositive, trans, transposition |
| Impl | impl, implication, imp, material implication |
| Exp | exp, exportation, export |
| Taut | taut, tautology |
| Equiv | equiv, equivalence, eq, bicon, biconditional, material equivalence |

**Technique Aliases (16 entries):**

| Canonical | Aliases |
|-----------|---------|
| CP | cp, conditional proof, conditionalproof, conditional, cond |
| IP | ip, indirect proof, indirectproof, indirect, raa, reductio ad absurdum, reductio, ~i, ni, negintro, negation introduction |

The `canonicalizeRule(name)` function returns `{ canonical, kind }` where kind is `"inference"`, `"equivalence"`, or `"technique"`, or `null` if unrecognized. Technique aliases are checked first (highest priority), then inference, then equivalence.

### Symbol Normalization

The `normalizeFormula(formula)` function converts symbol variations to ASCII forms accepted by the Rust parser:

| Category | Input Variants | Normalized To |
|----------|---------------|---------------|
| Conditional | `→`, `⊃`, `=>`, `->` | `>` |
| Disjunction | `∨`, `\|\|` | `v` |
| Conjunction | `·`, `∧` (U+2227), `&&` | `.` |
| Negation | `¬`, `−` (em-dash) | `~` |
| Biconditional | `≡`, `↔`, `<=>`, `<->` | `<>` |
| Contradiction | `⊥`, `_\|_` | `#` |
| Whitespace | multiple spaces/tabs | single space |

### Justification Parsing

The `parseJustification(text)` function splits a line (after line number stripping) into formula + justification. It tries patterns in this priority order:

1. **Premise** — Matches `FORMULA Premise` (case-insensitive)
2. **Assumption** — Matches `FORMULA Assumption (CP)`, `FORMULA Assume (IP)`, `FORMULA Ass. CP`, etc. Technique name is canonicalized.
3. **Subproof close** — Matches `FORMULA CP 3-7` or `FORMULA IP 4-9` (en-dash also accepted)
4. **Rule + lines (rule first)** — Matches `FORMULA RULE N,N,N` where RULE is a known inference/equivalence rule
5. **Rule + lines (lines first)** — Matches `FORMULA N,N RULE` (alternate ordering)
6. **Single line reference** — Matches `FORMULA RULE N` (common for equivalence rules)

All justifications are output in canonical form:
- `"Premise"`
- `"Assumption (CP)"` or `"Assumption (IP)"`
- `"MP 1,2"` or `"Simp 3"` (comma-separated, no spaces)
- `"CP 3-7"` or `"IP 4-9"` (hyphen-separated)

### Commentary Filtering

The `isCommentary(line)` function detects and skips common LLM preamble/postscript patterns:

| Pattern | Examples |
|---------|----------|
| Proof labels | `Proof:`, `Here is the proof`, `Here's my proof` |
| Planning text | `Let me`, `I will`, `I'll`, `We need`, `We can` |
| Annotations | `Note:`, `Note that`, `Explanation` |
| Conclusions | `Therefore`, `Thus`, `QED` |
| End markers | Tombstone symbol, `//`, `/*`, triple backticks |
| Dividers | Em-dashes, horizontal rules (`---`) |

Lines that fail commentary detection are further checked by `looksLikeProofLine()`, which returns true if the line contains logical symbols, known rule names, or single uppercase letters (atom names).

### Validation JSON Output

The `toValidationJSON(theorem, parsed)` function produces a JSON string suitable for piping to the Rust CLI's `propbench validate` command:

```json
{
  "theorem": {
    "id": "theorem-001",
    "premises": ["P > Q", "P"],
    "conclusion": "Q",
    "difficulty": "Easy",
    "difficulty_value": 15
  },
  "proof": [
    {
      "line_number": 1,
      "formula": "P > Q",
      "justification": "Premise",
      "depth": 0
    },
    {
      "line_number": 2,
      "formula": "P",
      "justification": "Premise",
      "depth": 0
    },
    {
      "line_number": 3,
      "formula": "Q",
      "justification": "MP 1,2",
      "depth": 0
    }
  ]
}
```

### Edge Cases Handled

- **No line numbers**: If the LLM omits line numbers entirely, the parser assigns sequential numbers starting from 1.
- **Mixed formats**: Line numbers in different formats across the same proof (e.g., `1.` then `(2)` then `Step 3:`) are all handled.
- **Trailing commentary**: Commentary lines after the proof block are skipped without generating errors.
- **Variable indentation**: The parser auto-detects the indentation unit from the minimum non-zero indent difference rather than assuming a fixed 2-space unit.
- **En-dash in ranges**: `CP 3–7` (en-dash) is accepted alongside `CP 3-7` (hyphen).
- **Assumption variants**: `Assumption (CP)`, `Assume (CP)`, `Ass. CP`, and `Assume CP` are all recognized.
- **Rule ordering flexibility**: Both `FORMULA RULE LINES` and `FORMULA LINES RULE` orderings are accepted for rule applications.

---

## Benchmark Harness (`harness.ts`)

Main orchestrator that drives the entire benchmark. Iterates over theorems and models, coordinates the prompt-build / API-call / parse / validate / log pipeline, and supports resuming interrupted runs.

### CLI Interface

```bash
npx tsx harness.ts --theorems <path> --models <list> [options]
```

**Required arguments:**

| Argument | Description |
|----------|-------------|
| `--theorems <path>` | Path to the theorems JSON file (e.g., `benchmarks/v1/theorems.json`) |
| `--models <list>` | Comma-separated model adapter names (e.g., `gemini,claude,gpt`) |

**Optional arguments:**

| Argument | Default | Description |
|----------|---------|-------------|
| `--output <dir>` | `results/` | Output directory for results and summary |
| `--start <n>` | `0` | Start at theorem index n (0-based) |
| `--count <n>` | all | Process only n theorems from the start index |
| `--propbench-bin <path>` | `propbench` | Path to the Rust CLI binary for validation |
| `--temperature <n>` | `0.2` | Temperature parameter passed to all models |
| `--max-tokens <n>` | `4096` | Maximum output tokens for model responses |

### Core Loop

For each theorem in the selected range, for each model adapter:

```
1. buildPrompt(theorem)          → prompt string
2. adapter.callModel(prompt)     → ModelResponse { raw_response, latency_ms, model, tokens_used }
3. parseResponse(raw_response)   → ProofLine[] or parse error
4. validateProof(theorem, proof) → { valid, errors } via Rust CLI subprocess
5. saveResult(result, outputDir) → JSON file in output/raw/
```

Each step is wrapped in try/catch. If any step fails, the error is captured in the `BenchmarkResult`, saved to disk, and the harness continues to the next theorem/model pair.

### Resume Support

The harness scans `<output>/raw/` on startup for existing result JSON files. Each file contains `theorem_id` and `model` fields. The harness builds a `Set<string>` of `"theorem_id::model"` keys and skips any pair that already has a result file.

This means:
- Interrupted runs can be resumed with the same command
- To re-run a specific theorem/model pair, delete its result file from `output/raw/`
- The `--start` and `--count` flags work independently of resume state

### Dynamic Module Loading

The harness dynamically imports `prompt.ts` and `parser.ts` at runtime via `await import("./prompt.js")` and `await import("./parser.js")`. If either module is not yet available (e.g., during development), the harness falls back to built-in implementations:

- **`buildFallbackPrompt(theorem)`** — Generates a basic prompt with the theorem, all 19 rules + CP/IP, output format spec, and symbol reference. Handles both premise-based (Easy) and tautology (Medium+) theorem formats.
- **`parseFallback(rawResponse)`** — Extracts numbered lines via regex, detects subproof depth from `|` markers, and splits formula from justification using known rule keyword patterns.

### Result Storage

Each result is saved as an individual JSON file in `<output>/raw/` with the naming pattern:

```
<theorem_id>_<model>_<timestamp_ms>.json
```

**`BenchmarkResult` structure:**

```typescript
interface BenchmarkResult {
  theorem_id: string;
  model: string;             // adapter name (e.g., "gemini")
  model_name: string;        // actual model ID (e.g., "gemini-2.0-flash")
  raw_response: string;      // full LLM output
  parsed_proof: ProofLine[] | null;
  parse_error: string | null;
  validation_result: "valid" | "invalid" | "error";
  validation_errors: string[];
  line_count: number | null;  // proof length (only if valid)
  latency_ms: number;
  tokens_used: number | undefined;
  timestamp: string;          // ISO 8601
}
```

A run summary is also written to `<output>/summary.json` with aggregate counts.

### Validation via CLI

The harness invokes the Rust CLI binary as a subprocess:

```bash
propbench validate --theorem <theorem_json> --proof <proof_json>
```

- Theorem and proof are passed as JSON string arguments
- Subprocess timeout: 30 seconds
- The harness parses the CLI's stdout as JSON `{ valid: boolean, errors?: string[] }`
- If stdout is not valid JSON, the harness checks for the word "valid" as a simple pass/fail heuristic
- Subprocess errors (missing binary, timeout, crash) are caught and recorded as validation errors

### Progress Reporting

The harness prints progress to stdout during execution:

```
=== PropBench Harness ===
Theorems: benchmarks/v1/theorems.json
Models:   gemini, claude

Loaded 100 theorems
Processing theorems 0 to 99 (100 total)
Found 0 already-completed results

[1/100] theorem-001 x gemini — running...
  -> VALID (5 lines, 1823ms)
[1/100] theorem-001 x anthropic — running...
  -> INVALID: Scope error on line 4 (cited line 2 not accessible)
[2/100] theorem-002 x gemini — SKIPPED (already done)
...

=== Summary ===
Run:     198
Skipped: 2
Valid:   142
Invalid: 38
Errors:  18
```

### Error Handling

Errors at every stage are caught, logged, and saved:

| Stage | Error Type | Recorded As |
|-------|-----------|-------------|
| Prompt build | Exception in `buildPrompt()` | `validation_errors: ["Prompt build error: ..."]` |
| API call | Network/auth/rate limit failure | `validation_errors: ["API error: ..."]` |
| Parse | No proof lines found, malformed lines | `parse_error: "..."`, `validation_result: "error"` |
| Validation | CLI subprocess error, timeout | `validation_errors: ["Validation process error: ..."]` |

The harness never aborts on individual theorem/model failures. Only fatal errors (missing theorems file, unknown model adapter) cause an exit.

---

## Model API Adapters (`models/`)

### Shared Interface (`models/index.ts`)

All model adapters implement the `ModelAdapter` interface:

```typescript
interface ModelAdapter {
  name: string;
  callModel(prompt: string, config: ModelConfig): Promise<ModelResponse>;
}
```

**`ModelConfig`** — Parameters for the API call:

```typescript
interface ModelConfig {
  model: string;          // model ID override (empty string uses adapter default)
  temperature?: number;   // default: 0.2
  maxTokens?: number;     // default: 4096
  apiKey?: string;        // override for env var
}
```

**`ModelResponse`** — Standardized response from any model:

```typescript
interface ModelResponse {
  raw_response: string;   // full text output
  latency_ms: number;     // round-trip time in milliseconds
  model: string;          // actual model ID used
  tokens_used?: number;   // total tokens (prompt + completion)
}
```

### Model Registry (`getModel`)

```typescript
function getModel(name: string): ModelAdapter
```

Looks up a model adapter by name or alias (case-insensitive). Throws if the name is not recognized.

**Supported aliases:**

| Alias | Adapter |
|-------|---------|
| `gemini` | `GeminiAdapter` |
| `gemini-flash` | `GeminiAdapter` |
| `claude` | `AnthropicAdapter` |
| `anthropic` | `AnthropicAdapter` |
| `gpt` | `OpenAIAdapter` |
| `openai` | `OpenAIAdapter` |

Each call to `getModel()` creates a new adapter instance (factory pattern). Adapters are stateless and safe to reuse across multiple calls.

### Gemini Adapter (`models/gemini.ts`)

| Property | Value |
|----------|-------|
| SDK | `@google/generative-ai` |
| API key env var | `GEMINI_API_KEY` |
| Default model | `gemini-2.0-flash` |
| Adapter name | `"gemini"` |

**Token tracking:** Uses `response.usageMetadata` to report `promptTokenCount + candidatesTokenCount`.

**Retry behavior:** Exponential backoff with jitter on rate-limit errors:
- Max retries: 5
- Base delay: 1000ms
- Delay formula: `1000 * 2^attempt + random(0, 10% of delay)`
- Rate-limit detection: Error message contains `429`, `rate`, `quota`, or `resource_exhausted` (case-insensitive)
- Non-rate-limit errors on the first attempt are thrown immediately
- Non-rate-limit errors on subsequent attempts (after a rate-limit retry) are also thrown immediately

### Anthropic Adapter (`models/anthropic.ts`)

| Property | Value |
|----------|-------|
| SDK | `@anthropic-ai/sdk` |
| API key env var | `ANTHROPIC_API_KEY` |
| Default model | `claude-sonnet-4-5-20250929` |
| Adapter name | `"anthropic"` |

**Token tracking:** Uses `message.usage.input_tokens + message.usage.output_tokens`.

**Response extraction:** Finds the first `text` content block in `message.content` array.

**Retry behavior:** Same exponential backoff pattern as Gemini. Rate-limit detection checks for `429`, `rate`, or `overloaded` in error messages.

### OpenAI Adapter (`models/openai.ts`)

| Property | Value |
|----------|-------|
| SDK | `openai` |
| API key env var | `OPENAI_API_KEY` |
| Default model | `gpt-4o` |
| Adapter name | `"openai"` |

**Token tracking:** Uses `completion.usage.prompt_tokens + completion.usage.completion_tokens` (undefined if usage data is missing).

**Response extraction:** `completion.choices[0]?.message?.content ?? ""`.

**Retry behavior:** Same exponential backoff pattern as Gemini. Rate-limit detection checks for `429`, `rate`, or `quota` in error messages.

### Design Decisions

- **API key via env var with override:** Each adapter reads its API key from a well-known environment variable but also accepts an override in `ModelConfig.apiKey`. This supports both standard usage (keys in env) and testing (keys passed programmatically).
- **Stateless adapters:** Adapters create a fresh SDK client on each `callModel()` invocation. This avoids connection pooling complexity and ensures clean state for benchmarking.
- **Consistent retry logic:** All three adapters use identical retry parameters (5 retries, 1s base delay, 2x exponential, 10% jitter). This ensures that rate-limit handling does not vary across providers and does not skew benchmark results.
- **Immediate throw for non-rate-limit errors:** Authentication failures, invalid model names, and other non-transient errors are thrown immediately without retrying, to fail fast and provide clear error messages.
- **Factory-based registry:** `getModel()` returns a new instance each time, allowing the harness to use multiple instances of the same adapter concurrently if needed in future parallelization.

---

## Scorer (`scorer.ts`)

Tracks per-theorem, per-model results and produces aggregate statistics, Elo ratings, and formatted reports. The scorer is stateful: results are accumulated via `recordResult()` and a full report is generated on demand via `generateReport()`.

### Types

**`TheoremResult`** — Result of a single theorem attempt by a single model:
```typescript
interface TheoremResult {
  theoremId: string;
  valid: boolean;
  parseSuccess: boolean;
  lineCount: number | null;       // null if proof invalid or parse failed
  difficulty: DifficultyTier;
  difficultyValue: number;
  failureStage?: "api_call" | "parse" | "validation";
}
```

**`DifficultyTier`** — Lowercase tier names used internally by the scorer:
```typescript
type DifficultyTier = "easy" | "medium" | "hard" | "expert" | "nightmare" | "marathon";
```

**`ModelStats`** — Aggregate statistics for one model:
```typescript
interface ModelStats {
  model: string;
  totalLines: number;                    // sum of lineCount for valid proofs
  validCount: number;
  invalidCount: number;
  totalAttempted: number;
  avgLinesPerValidProof: number | null;  // null if no valid proofs
  linesByDifficulty: Record<DifficultyTier, { total: number; count: number; avg: number | null }>;
  eloRating: number;
}
```

**`HeadToHead`** — Record of a single pairwise comparison on one theorem:
```typescript
interface HeadToHead {
  theoremId: string;
  modelA: string;
  modelB: string;
  winner: string | "tie";
  modelALines: number | null;
  modelBLines: number | null;
}
```

**`BenchmarkReport`** — Full output of `generateReport()`:
```typescript
interface BenchmarkReport {
  timestamp: string;                                          // ISO 8601
  models: ModelStats[];                                       // one entry per model
  headToHead: HeadToHead[];                                   // all pairwise comparisons
  perTheorem: Record<string, Record<string, TheoremResult>>;  // theoremId -> model -> result
  rankings: {
    rank: number;
    model: string;
    eloRating: number;
    totalLines: number;
    validRate: string;   // e.g. "85.0%"
  }[];
}
```

### Scorer Class

```typescript
class Scorer {
  recordResult(theoremId: string, model: string, result: TheoremResult): void;
  generateReport(): BenchmarkReport;
  printSummary(report: BenchmarkReport): void;
}
```

**`recordResult(theoremId, model, result)`** — Stores a single theorem result. Can be called multiple times for the same theorem/model pair (the latest call overwrites). Internally uses nested `Map<string, Map<string, TheoremResult>>` keyed by theoremId then model name.

**`generateReport()`** — Computes all aggregate statistics, runs the Elo algorithm, generates head-to-head records, and returns a complete `BenchmarkReport`. Can be called at any time (does not consume the stored results).

**`printSummary(report)`** — Prints a human-readable table to stdout with two sections:

1. **Rankings table** — Models ranked by Elo rating, showing rank, model name, Elo, valid/total, success rate, total lines, and average lines per valid proof.
2. **Lines by difficulty tier** — For each model, shows the average line count and number of valid proofs at each difficulty tier.

Example output:
```
=== PropBench Results ===

Rankings:
#   Model                       Elo     Valid     Rate    Lines   Avg Lines
----------------------------------------------------------------------------
1   gemini-2.0-flash            1532    85/100    85.0%   612     7.2
2   claude-sonnet-4.5           1468    78/100    78.0%   702     9.0

Lines by Difficulty Tier:
Model                       easy        medium      hard        expert      nightmare   marathon
------------------------------------------------------------------------------------------------
gemini-2.0-flash            4.2 (30)    6.8 (28)    9.1 (17)    12.3 (8)    18.0 (2)    -
claude-sonnet-4.5           5.1 (28)    7.9 (25)    10.4 (15)   14.2 (7)    22.0 (3)    -
```

### Elo Rating System

The scorer implements standard Elo with the following parameters:

| Parameter | Value |
|-----------|-------|
| Initial rating | 1500 |
| K-factor | 32 |
| Expected score formula | `1 / (1 + 10^((Rb - Ra) / 400))` |
| Rating update | `Ra_new = round(Ra + K * (Sa - Ea))` |

**Head-to-head scoring per theorem:**

| Model A | Model B | Score A | Score B |
|---------|---------|---------|---------|
| Valid (fewer lines) | Valid (more lines) | 1.0 | 0.0 |
| Valid | Invalid/failed | 1.0 | 0.0 |
| Invalid/failed | Valid | 0.0 | 1.0 |
| Both valid, same lines | Both valid, same lines | 0.5 | 0.5 |
| Both invalid/failed | Both invalid/failed | 0.5 | 0.5 |

Elo updates are applied sequentially for each theorem, iterating over all unique model pairs. If a model did not attempt a given theorem, that pair is skipped for that theorem. Ratings are rounded to integers after each update.

### Aggregate Statistics

For each model, the scorer computes:

- **totalLines**: Sum of `lineCount` across all valid proofs
- **validCount / invalidCount**: Count of valid vs. invalid (or failed) attempts
- **totalAttempted**: Total theorems attempted by this model
- **avgLinesPerValidProof**: `totalLines / validCount` (null if validCount is 0)
- **linesByDifficulty**: For each of the 6 difficulty tiers, tracks `total` lines, `count` of valid proofs, and `avg` lines per valid proof at that tier

### Design Decisions

- **Mutable accumulator pattern**: The `Scorer` stores results incrementally rather than accepting a batch. This allows the harness to feed results one at a time as they arrive, supporting streaming and resume scenarios.
- **Sequential Elo updates**: Elo ratings are computed in a single pass over all theorems in insertion order. This means the final ratings can vary slightly depending on the order theorems are processed, which matches real Elo behavior in tournaments.
- **Round-robin pairwise**: Every unique model pair is compared on every theorem where both models have results. Models that skip theorems are not penalized in Elo (they simply have fewer comparisons).
- **Integer Elo**: Ratings are rounded to integers after each update for clean display. The rounding does not compound significantly over typical benchmark sizes (100-200 theorems).

---

## Logger (`logger.ts`)

Structured JSONL logging for benchmark runs. Every API call attempt is logged with full context including raw prompts, responses, parse results, validation results, and errors. Failures are logged with equal detail to successes.

### Types

**`LogEntry`** — A single logged attempt (one theorem, one model):
```typescript
interface LogEntry {
  // Theorem info
  theoremId: string;
  formula: string;
  difficulty: string;
  difficultyValue: number;

  // Model info
  model: string;
  modelParameters?: Record<string, unknown>;

  // Prompt and response
  rawPrompt: string;
  rawResponse: string | null;           // null if API call failed

  // Parse results
  parsedProof: unknown | null;          // structured proof object, null if parse failed
  parseErrors?: string[];

  // Validation results
  validationResult: boolean | null;     // null if not reached
  validationErrors?: string[];

  // Metrics
  lineCount: number | null;             // null if proof invalid or not parsed
  latencyMs: number;
  timestamp: string;                    // ISO 8601

  // Failure tracking
  failureStage?: "api_call" | "parse" | "validation";
  errorMessage?: string;
}
```

**`RunSummary`** — Running totals maintained alongside the JSONL log:
```typescript
interface RunSummary {
  model: string;
  runTimestamp: string;
  totalTheorems: number;
  validProofs: number;
  invalidProofs: number;
  parseFailures: number;
  apiFailures: number;
  totalLines: number;
  avgLinesPerValidProof: number | null;
  avgLatencyMs: number;
  logFile: string;                      // filename of the JSONL log
}
```

**`Logger`** — Logger instance interface:
```typescript
interface Logger {
  logAttempt(entry: LogEntry): void;
  flush(): void;
  getSummary(): RunSummary;
}
```

### Factory Function

```typescript
function createLogger(outputDir: string, modelName: string): Logger
```

Creates a logger that writes to:
- **Log file**: `{outputDir}/{model-name}/run-{timestamp}.jsonl`
- **Summary file**: `{outputDir}/{model-name}/latest-summary.json`

The `model-name` directory component is sanitized: any character not matching `[a-zA-Z0-9._-]` is replaced with `_`. The timestamp in the filename uses ISO 8601 format with colons and dots replaced by hyphens (e.g., `2026-02-05T23-04-12-345Z`).

The output directory is created recursively on logger construction (`fs.mkdirSync` with `recursive: true`).

### JSONL Format

Each line in the log file is a single JSON object (one `LogEntry` per line, no trailing commas, no array wrapper). This format:
- Supports append-only writes (no need to read/modify existing data)
- Allows streaming processing with tools like `jq`
- Survives partial writes (each line is independently valid JSON)
- Is easy to parse line-by-line for analysis

Example:
```
{"theoremId":"t-001","formula":"P > Q","difficulty":"easy","difficultyValue":15,...}
{"theoremId":"t-002","formula":"(P v Q) > (Q v P)","difficulty":"medium","difficultyValue":30,...}
```

### Buffered Writes

The logger buffers entries in memory and flushes to disk in batches:

| Parameter | Value |
|-----------|-------|
| Buffer size | 10 entries |
| Write method | `fs.appendFileSync` |
| Flush trigger | Buffer reaches 10 entries, or explicit `flush()` call |

On each flush, the logger also updates `latest-summary.json` with the current running totals. The harness should call `flush()` at the end of a run to ensure all entries are written.

### Failure Categorization

The logger categorizes each attempt based on the `failureStage` field:

| `failureStage` | Counted As | Description |
|----------------|-----------|-------------|
| `"api_call"` | `apiFailures` | Network error, auth failure, rate limit exhaustion |
| `"parse"` | `parseFailures` | LLM output could not be parsed into proof lines |
| `"validation"` | `invalidProofs` | Proof parsed but failed Rust validator checks |
| `undefined` + `validationResult === true` | `validProofs` | Successful proof, `lineCount` added to `totalLines` |
| `undefined` + `validationResult === false` | `invalidProofs` | Validation returned false without explicit stage |
| Any other state | `invalidProofs` | Fallback categorization |

### Summary File

The `latest-summary.json` file is overwritten on each flush with the current `RunSummary`. This provides a quick view of run progress without parsing the full JSONL log. It is always updated atomically (write the full file in one `fs.writeFileSync` call).

### `getSummary()`

Returns the current `RunSummary` object programmatically, without writing to disk. Useful for the harness to access running totals without reading the summary file.

### File Structure Example

After a run with two models:
```
results/
├── gemini-2_0-flash/
│   ├── run-2026-02-05T23-04-12-345Z.jsonl    # 100 lines, one per theorem
│   └── latest-summary.json                    # aggregate stats
└── claude-sonnet-4_5/
    ├── run-2026-02-05T23-04-12-345Z.jsonl
    └── latest-summary.json
```

### Design Decisions

- **JSONL over JSON arrays**: JSONL supports append-only writes and survives crashes mid-run. A JSON array would require reading the entire file to append, and a partial write would corrupt the array.
- **Buffered writes with explicit flush**: Batching reduces I/O overhead during fast theorem processing. The flush threshold of 10 balances write frequency against data loss risk on crash.
- **`unknown` type for `parsedProof`**: The logger is agnostic to the proof structure. It accepts whatever the parser produces, serializing it as-is. This avoids coupling the logger to parser types.
- **Sanitized filenames**: Model names like `claude-sonnet-4.5` or `gemini/2.0-flash` may contain characters invalid in filenames. The sanitizer replaces anything outside `[a-zA-Z0-9._-]` with underscores.
- **Summary updated on every flush**: The summary file always reflects the latest state, even during long runs. Monitoring tools can poll this file for progress updates.
- **Synchronous I/O**: The logger uses `fs.appendFileSync` and `fs.writeFileSync` for simplicity and to guarantee write ordering. The benchmark is I/O-bound on API calls, not on disk writes, so async I/O would add complexity without meaningful performance benefit.

---

## CLI Binary (`src/main.rs`)

*Section to be filled in by the rust-cli agent.*

---

## Dependencies

### TypeScript (`package.json`)

**Dev**: typescript ^5.5.0, ts-node ^10.9.2, @types/node ^20.14.0

### Rust (`Cargo.toml`)

See `Cargo.toml` for Rust dependencies (shared with the existing Logic Proof Trainer backend).

---

## Building and Running

### TypeScript

```bash
cd prop-bench
npm install
npm run build        # Compile TypeScript to dist/
npm run typecheck    # Type-check without emitting
```

### Rust CLI

```bash
cd prop-bench
cargo build --release
# Binary at target/release/propbench
```

### Running a Benchmark

```bash
# 1. Generate theorem set
propbench generate --count 100 --difficulty-distribution "30:easy,40:medium,30:hard" --output theorems.json

# 2. Validate a single proof
propbench validate --theorem <theorem_json> --proof <proof_json>
```
