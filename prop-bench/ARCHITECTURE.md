# PropBench Architecture

## System Overview

PropBench is an LLM benchmark that measures proof efficiency in propositional logic natural deduction. Unlike traditional benchmarks that only check correctness, PropBench scores models on the fewest proof lines needed to prove tautologies using Fitch-style natural deduction. This creates a non-saturating benchmark: theorems can be arbitrarily difficult, every proof is mechanically verifiable, and the metric captures reasoning quality, not just binary correctness. PropBench reuses the robust Rust infrastructure from the Logic Proof Trainer app (theorem generation, formula parsing, truth table validation, and proof verification) and wraps it with a TypeScript harness that orchestrates LLM API calls, parses model outputs, validates proofs, and computes Elo ratings.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                   PropBench Benchmark System                     │
└─────────────────────────────────────────────────────────────────┘

                           TypeScript Layer
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│  Theorem JSON (from CLI)                                         │
│        │                                                          │
│        ▼                                                          │
│  ┌─────────────┐                                                 │
│  │ harness.ts  │  Orchestrator (main loop)                       │
│  └─────────────┘                                                 │
│        │                                                          │
│        ├──► prompt.ts ──────────► buildPrompt()                  │
│        │                                   │                      │
│        │                                   ▼                      │
│        │                          Complete Prompt String         │
│        │                                   │                      │
│        │                                   ▼                      │
│        ├──► models/index.ts ───► ModelAdapter.callModel()        │
│        │           │                       │                      │
│        │           ├─► gemini.ts           │                      │
│        │           ├─► anthropic.ts        │                      │
│        │           └─► openai.ts           │                      │
│        │                                   │                      │
│        │                                   ▼                      │
│        │                          LLM API Response               │
│        │                           (raw text)                     │
│        │                                   │                      │
│        ▼                                   ▼                      │
│  ┌─────────────┐                  ┌──────────────┐               │
│  │ parser.ts   │◄─────────────────│ Raw Response │               │
│  └─────────────┘                  └──────────────┘               │
│        │                                                          │
│        ▼                                                          │
│  ParsedLine[] (structured proof)                                 │
│        │                                                          │
│        ▼                                                          │
│  toValidationJSON() ──────► JSON payload                         │
│                                    │                              │
└────────────────────────────────────┼──────────────────────────────┘
                                     │
                                     ▼
                         Temp files: theorem.json
                                    proof.json
                                     │
                                     ▼
        ┌────────────────────────────────────────────────┐
        │             Rust CLI (subprocess)              │
        │                                                │
        │  $ propbench validate                          │
        │      --theorem theorem.json                    │
        │      --proof proof.json                        │
        │                                                │
        │  ┌──────────────────────────────────────────┐ │
        │  │  src/main.rs (CLI entry)                 │ │
        │  │      │                                    │ │
        │  │      ▼                                    │ │
        │  │  Parse theorem + proof JSON              │ │
        │  │      │                                    │ │
        │  │      ▼                                    │ │
        │  │  logic-proof-trainer crate (via path)    │ │
        │  │      │                                    │ │
        │  │      ├─► Formula::parse()                │ │
        │  │      ├─► Proof::new()                    │ │
        │  │      ├─► Proof::add_line()               │ │
        │  │      ├─► Proof::open_subproof()          │ │
        │  │      ├─► Proof::close_subproof()         │ │
        │  │      └─► ProofVerifier::verify_line()    │ │
        │  │                │                          │ │
        │  │                ▼                          │ │
        │  │     { valid, line_count, errors }        │ │
        │  └──────────────────────────────────────────┘ │
        │                                                │
        └────────────────────────────────────────────────┘
                         │
                         ▼
                  JSON to stdout
                         │
                         ▼
        ┌────────────────────────────────────────────────┐
        │          TypeScript Layer (cont'd)             │
        │                                                │
        │  Parse CLI output                              │
        │        │                                       │
        │        ▼                                       │
        │  BenchmarkResult                               │
        │        │                                       │
        │        ├──► logger.ts ──► JSONL log           │
        │        └──► scorer.ts ──► Elo ratings         │
        │                                                │
        └────────────────────────────────────────────────┘

      Relationship to Logic Proof Trainer Crate
┌───────────────────────────────────────────────────┐
│  logic-proof-trainer/src-tauri/                   │
│     (existing Rust backend)                       │
│                                                   │
│  ├─ models/                                       │
│  │    ├─ formula.rs      (parser, symbol aliases) │
│  │    ├─ proof.rs        (Proof, ProofLine)       │
│  │    ├─ theorem.rs      (Theorem, Difficulty)    │
│  │    └─ rules/          (19 rules + CP/IP)       │
│  │                                                 │
│  ├─ services/                                     │
│  │    ├─ generator.rs    (TheoremGenerator)       │
│  │    ├─ verifier.rs     (ProofVerifier)          │
│  │    ├─ truth_table.rs  (tautology checking)     │
│  │    └─ obfuscate_gen.rs (difficulty engine)     │
│  │                                                 │
│  └─ lib.rs              (public API)              │
│                                                   │
│  Cargo.toml: name = "logic-proof-trainer"         │
│                                                   │
└───────────────────────────────────────────────────┘
                    ▲
                    │ path dependency
                    │
┌───────────────────────────────────────────────────┐
│  prop-bench/                                      │
│                                                   │
│  Cargo.toml:                                      │
│    [dependencies]                                 │
│    logic-proof-trainer = {                        │
│      path = "../logic-proof-trainer/src-tauri"    │
│    }                                              │
│                                                   │
│  src/main.rs  (CLI binary wrapping lib calls)     │
│                                                   │
└───────────────────────────────────────────────────┘
```

## Component Overview

| Component | Responsibility |
|-----------|---------------|
| **harness.ts** | Orchestrates the entire benchmark loop: load theorems, call models, parse responses, validate proofs, log results |
| **prompt.ts** | Builds complete LLM prompts with theorem, all 19 rules + CP/IP, symbol reference, and output format spec |
| **parser.ts** | Parses raw LLM text output into structured proof lines: strips line numbers, detects subproof depth, normalizes symbols, canonicalizes rule names |
| **models/index.ts** | Model adapter registry and shared interfaces (ModelAdapter, ModelConfig, ModelResponse) |
| **models/gemini.ts** | Gemini API adapter with retry logic and token tracking |
| **models/anthropic.ts** | Anthropic API adapter with retry logic and token tracking |
| **models/openai.ts** | OpenAI API adapter with retry logic and token tracking |
| **scorer.ts** | Computes Elo ratings, aggregates line counts, tracks per-difficulty statistics |
| **logger.ts** | Structured JSONL logging of all API calls, responses, parse results, validation results, and errors |
| **config.ts** | Shared TypeScript types and default benchmark parameters |
| **src/main.rs** | Rust CLI binary with two commands: `generate` (theorem sets) and `validate` (proof checking) |

## Data Flow

A single benchmark run follows this pipeline:

1. **Load theorems**: Harness reads the pre-generated theorem JSON file (produced by `propbench generate`)
2. **For each theorem, for each model**:
   - **Build prompt**: `prompt.ts` formats the theorem with the complete rule reference and output format instructions
   - **Call LLM API**: Model adapter sends the prompt to Gemini/Claude/GPT and receives raw text response
   - **Parse response**: `parser.ts` extracts proof lines, normalizing symbols and rule names into canonical forms
   - **Write temp files**: Harness writes theorem + parsed proof to temporary JSON files
   - **Validate via CLI**: Harness spawns `propbench validate` subprocess, which:
     - Parses the JSON files
     - Calls `logic-proof-trainer` library functions to build and verify the proof
     - Returns `{ valid, line_count, errors }` as JSON to stdout
   - **Clean up**: Delete temp files
   - **Log result**: `logger.ts` writes a JSONL entry with full context (prompt, response, parse result, validation result)
   - **Score result**: `scorer.ts` records the line count and validity for Elo calculation
3. **Generate report**: After all theorem/model pairs complete, scorer computes Elo ratings and outputs rankings

## Key Design Decisions

### Separate Rust CLI vs Embedding in TypeScript

The Rust proof verifier is complex (scope tracking, subproof validation, rule pattern matching) and well-tested (209+ tests). Rather than rewrite this logic in TypeScript or embed Rust via WASM, PropBench treats the existing Rust backend as a black-box subprocess. This approach:

- Reuses proven, stable verification logic
- Isolates the TypeScript orchestration layer from verification complexity
- Allows independent evolution of the benchmark harness and the proof verifier
- Avoids WASM build complexity and ensures identical verification behavior to the main app

### Temp Files for Validation

The Rust CLI reads theorem + proof from JSON files rather than stdin because:

- The existing `logic-proof-trainer` API expects structured types (Theorem, Formula), not raw strings
- File paths are simpler to pass via CLI args than multi-line JSON on stdin
- Temp files allow inspection/debugging of exact inputs sent to the validator
- The overhead is negligible (< 10ms per validation on typical systems)

### Type System: BenchTheorem vs Theorem

The Rust CLI emits theorems as `BenchTheorem` (serializable, string-based formulas) while TypeScript modules use `Theorem` (from `config.ts`). This separation:

- Keeps the CLI output format stable and language-agnostic (pure JSON)
- Allows TypeScript types to evolve independently (e.g., adding display metadata)
- Matches the existing Tauri command pattern where the frontend receives serialized theorems from Rust

### Two Theorem Formats: Premises + Conclusion vs Standalone Tautology

Easy theorems (difficulty 1-25) are generated via templates with explicit premises and conclusions (e.g., `P>Q, P ∴ Q`). Medium+ theorems (26-100) use the obfuscation pipeline and are standalone tautologies with no premises. The prompt template handles both cases:

- **With premises**: Prompt lists premises and instructs the model to begin with them justified as "Premise"
- **No premises**: Prompt instructs the model to use CP/IP since there are no given starting points

This dual format reflects the existing generator's two-mode design (template-based for pedagogy, obfuscation-based for difficulty scaling).

## Relationship to Logic Proof Trainer

PropBench is a path-dependent crate that imports `logic-proof-trainer` from the sibling directory. The entire proof generation and verification infrastructure lives in the main app:

| Module | Functionality Reused by PropBench |
|--------|-----------------------------------|
| **models/formula.rs** | Parses formula strings with 40+ symbol aliases (>, ⊃, ->, => all map to conditional) |
| **models/theorem.rs** | Theorem type with difficulty tiers, premise/conclusion structure |
| **models/proof.rs** | Proof and ProofLine types, subproof stack management |
| **models/rules/** | All 19 rules (9 inference, 10 equivalence) + CP/IP, with pattern matching and bidirectional equivalence checking |
| **services/generator.rs** | Dual-mode theorem generation (template-based for Easy, obfuscation-based for Medium+) |
| **services/obfuscate_gen.rs** | 3-layer obfuscation (base form → atom substitution → wrap + transform) with difficulty scaling |
| **services/truth_table.rs** | 32-bit tautology validation (currently supports 5 variables P, Q, R, S, T; expandable to 64/128 bits or BigInt for more variables) |
| **services/verifier.rs** | Line-by-line validation: checks justifications, scope accessibility, rule pattern matching, and subproof closure |

PropBench's Rust CLI (`src/main.rs`) is a thin wrapper around these library functions. It does not reimplement any logic; it only handles CLI argument parsing, JSON serialization, and subprocess stdout formatting.

The Cargo.toml dependency declaration:

```toml
[dependencies]
logic-proof-trainer = { path = "../logic-proof-trainer/src-tauri" }
```

This path dependency means:

- PropBench is built from the `prop-bench` branch of the main repository
- Theorem generation uses the exact same difficulty engine as the app
- Proof verification uses the identical rule checking logic as the interactive trainer
- Any improvements to the verifier automatically apply to the benchmark
