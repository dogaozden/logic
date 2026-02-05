# PropBench — Context Brief for Claude Code

## What is PropBench?

PropBench is an LLM benchmark that scores models on **proof efficiency** (fewest lines) rather than just correctness. Models are given propositional logic tautologies and must produce Fitch-style natural deduction proofs. The model with the fewest total proof lines wins.

This is a novel benchmark because:
- **Non-saturating**: Theorems can be made arbitrarily difficult (variable count, connective depth, obfuscation layers). Even on "easy" theorems, there's always the question of whether a shorter proof exists.
- **Mechanically verifiable**: Every proof line can be syntactically checked against the cited rule. No human judgment needed.
- **Measures reasoning quality, not just correctness**: Two models can both prove a theorem, but one might do it in 7 lines (using CP) and the other in 17 lines (using IP). The benchmark captures that difference.
- **Arbitrarily scalable difficulty**: The existing theorem generator has a 1-100 difficulty dial controlling variable count, obfuscation transforms, and atom substitution depth.

## Where This Lives

PropBench is being built as a **new feature branch** on the existing Logic Proof Trainer app. The app already has the hard parts: theorem generation, truth table validation, and Fitch proof verification — all in Rust.

**Repo location**: `~/Documents/AI_Projects/logic/logic-proof-trainer`

**Branch**: Create `propbench` branch off `master`.

## What Already Exists (DO NOT rebuild)

The Rust backend already has everything needed for generation and validation:

### Theorem Generation
- `services/generator.rs` — Dual-mode orchestrator (template-based for easy, obfuscation-based for medium+)
- `services/obfuscate_gen.rs` — 3-layer generation: base form → atom substitution → wrap + transform
- `services/tree_gen/` — Backward proof tree construction
- `services/truth_table.rs` — 32-bit semantic validation, tautology checking (currently supports max 5 variables P, Q, R, S, T; expandable to u64/u128/BigInt for more variables if needed)
- Difficulty 1-100 with tiers: Easy (1-25), Medium (26-45), Hard (46-70), Expert (71-85), Nightmare (86-95), Marathon (96-100)

### Proof Verification
- `services/verifier.rs` — Validates each proof step against cited justification, checks scope accessibility
- `models/rules/inference.rs` — 9 inference rules (MP, MT, DS, Simp, Conj, HS, Add, CD, NegE)
- `models/rules/equivalence.rs` — 10 equivalence rules (DN, DeM, Comm, Assoc, Dist, Contra, Impl, Exp, Taut, Equiv)
- `models/rules/technique.rs` — CP and IP with auto-close detection

### Formula Parsing
- `models/formula.rs` — Parser accepts many symbol aliases:
  - `⊃`, `->`, `=>`, `>` for implies
  - `∨`, `|`, `v`, `V` for or
  - `·`, `&`, `.`, `^`, `*` for and
  - `~`, `!`, `¬`, `-` for not
  - `≡`, `<->`, `<=>`, `<>` for biconditional
  - `⊥`, `_|_`, `#` for contradiction
  - Brackets `()`, `[]`, `{}` interchangeable

### Existing Tauri Commands (relevant ones)
- `generate_theorem_with_value(difficulty_value: u8)` → `Result<Theorem>`
- `create_proof(theorem)` → `Proof`
- `apply_rule(proof, rule_application, formula_str)` → `Result<Proof>`
- `open_subproof(proof, technique, assumption_str)` → `Result<Proof>`
- `close_subproof(proof, technique, conclusion_str)` → `Result<Proof>`
- `check_proof_complete(proof)` → `Proof`
- `parse_formula(input)` → `Result<Formula>`

## What Needs to Be Built

### 1. CLI Binary for Benchmarking

A new Rust binary (or extend existing) that can be called from the command line:

```bash
# Generate a benchmark set
propbench generate --count 100 --difficulty-distribution "30:easy,40:medium,30:hard" --output theorems.json

# Validate a proof
propbench validate --theorem <theorem_json> --proof <proof_json>
```

This wraps the existing generation and verification logic. The theorem generator and verifier are already implemented — this just exposes them via CLI instead of Tauri IPC.

### 2. Benchmark Harness (TypeScript)

A TypeScript script that orchestrates the benchmark:

```
For each theorem in benchmark set:
  For each model (Gemini, Claude, GPT, etc.):
    1. Format prompt with theorem + rules
    2. Call model API
    3. Parse model's proof output into structured format
    4. Feed to Rust validator
    5. Record: valid/invalid, line count, raw response, errors
```

**Key design decisions:**
- Start with Gemini API (we have Google Cloud credits)
- Extensive logging: store ALL raw API responses, not just pass/fail
- Store failures with full context (raw response, parse errors, validation errors)

### 3. Proof Parser (for LLM output)

The existing frontend parser (`utils/proofCommandParser.ts`) handles line-by-line input with 40+ rule aliases. For the benchmark, we need batch parsing that:
- Accepts a full proof as a text block
- Strips line numbers (models will include `1.`, `Step 1:`, etc.)
- Splits into individual lines
- Feeds each through the existing parser

The existing parser is already forgiving with symbol aliases and rule name variations. The main gap is handling the full-proof-as-block format.

**Note**: The proposed output format (e.g., `Assumption (CP)`) diverges from the existing parser's expected format (e.g., `P CP`). The batch parser can't simply reuse `parseCommand()` line-by-line without adaptation — it needs its own format handling.

### 4. Prompt Template

The prompt must include:
- The theorem to prove — **note**: Easy theorems (difficulty 1-25) are generated via templates and have explicit premises + conclusion (e.g., `P⊃Q, P ∴ Q`). Medium+ theorems (26-100) use the obfuscation pipeline and are standalone tautologies with no premises. The prompt format must handle both cases.
- All 19 rules + CP/IP with exact names and abbreviations
- Strict output format specification
- Instruction to minimize proof length

### 5. Scorer / Reporter

- Line count per theorem per model
- Total lines across all theorems
- Valid/invalid proof counts
- Elo ratings (models compared head-to-head on each theorem)
- Output as JSON + human-readable summary

### 6. Logging System

For every API call, store:
- Theorem (ID, formula, difficulty)
- Model name and parameters
- Raw prompt sent
- Raw response received
- Parsed proof (if parsing succeeded)
- Validation result (if parsing succeeded)
- Validation errors (if any)
- Line count (if valid)
- Timestamp, latency

Log to structured JSON files. Failures are just as valuable as successes.

## Output Format for Proofs

Models should output proofs in this format:

```
1. [formula] [justification]
2. [formula] [justification]
...
```

Where justification is one of:
- `Assumption (CP)` or `Assumption (IP)` — opens a subproof
- `[Rule] [line_numbers]` — e.g., `MP 1,2` or `Simp 3` or `DeM 5`
- `CP [start]-[end]` or `IP [start]-[end]` — closes a subproof

Subproofs should be indicated by indentation or explicit markers.

## Difficulty Distribution for v1 Benchmark

Suggested initial benchmark set (100 theorems):
- 30 Easy (difficulty 1-25): baseline competence
- 30 Medium (difficulty 26-45): strategy starts mattering
- 20 Hard (difficulty 46-70): CP vs IP divergence
- 15 Expert (difficulty 71-85): complex subformula work
- 5 Nightmare (difficulty 86-100): stress test

The theorem set should be generated once and locked. Every model gets the same 100 theorems.

## Architecture Summary

```
logic-proof-trainer/          (existing repo)
├── src-tauri/                (existing Rust — generation + validation)
│   └── src/
│       ├── bin/
│       │   └── propbench.rs  (NEW — CLI binary wrapping existing logic)
│       └── ...existing code...
├── propbench/                (NEW — benchmark harness)
│   ├── harness.ts            (orchestrator)
│   ├── prompt.ts             (prompt template builder)
│   ├── parser.ts             (LLM output → structured proof)
│   ├── models/               (API adapters per model)
│   │   ├── gemini.ts
│   │   ├── anthropic.ts
│   │   └── openai.ts
│   ├── scorer.ts             (line counting + Elo)
│   ├── logger.ts             (extensive structured logging)
│   └── config.ts             (benchmark parameters)
├── benchmarks/               (NEW — generated + locked theorem sets)
│   └── v1/
│       ├── theorems.json
│       └── results/
│           ├── gemini-2.0-flash/
│           ├── claude-opus-4.6/
│           └── ...
└── ...existing frontend code...
```

## Priority Order

1. **Expose generation + validation via CLI** (Rust binary)
2. **Generate and lock the v1 theorem set** (100 theorems)
3. **Build prompt template** (critical for proof quality)
4. **Build Gemini API adapter + parser** (first model to test)
5. **Build scorer + logger**
6. **Run first benchmark**
7. **Add more model adapters** (Anthropic, OpenAI)

## Notes

- The formula parser in Rust accepts tons of symbol aliases — models don't need to output exact Unicode symbols
- The verifier checks scope accessibility, rule correctness, and line references — it's thorough
- All equivalence rules work bidirectionally and on subformulas
- CD tries all 6 permutations of 3 premises — the verifier is forgiving about ordering
- The app has 209+ backend tests — don't break them
