# PropBench

A benchmark that measures how efficiently LLMs can prove propositional logic tautologies using Fitch-style natural deduction.

## Why PropBench?

Most LLM benchmarks check binary correctness — right or wrong. PropBench scores models on **proof efficiency**: the fewest lines needed to complete a valid proof. This captures reasoning quality beyond pass/fail, and because theorems can be made arbitrarily difficult, the benchmark doesn't saturate.

All proofs are mechanically verified by the same Rust engine that powers the [Logic Proof Trainer](../logic-proof-trainer) app.

## How It Works

1. **Generate theorems** — The Rust CLI produces tautologies at configurable difficulty tiers (Baby → Mind), controlling variables, transformation passes, substitution depth, and bridge atoms.
2. **Prompt LLMs** — The TypeScript harness sends each theorem to one or more models with the full set of 19 inference/equivalence rules, conditional proof, and indirect proof techniques.
3. **Parse & validate** — LLM output is parsed into structured proof lines, written to temp files, and validated by the Rust CLI (`propbench validate`).
4. **Score** — Valid proofs are scored by line count. Models are ranked using an Elo rating system with head-to-head matchups.

## Supported Models

- **Gemini** (direct API) — `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-3-flash-preview`, `gemini-3-pro-preview`, etc.
- **OpenRouter** (any model) — `anthropic/claude-sonnet-4.5`, `openai/gpt-4o`, `deepseek/deepseek-r1`, etc.

## Difficulty Tiers

| Tier | Variables | Passes | Transforms/Pass |
|------|-----------|--------|-----------------|
| Baby | 2 | 1 | 2 |
| Easy | 3 | 1 | 5 |
| Medium | 4 | 1 | 10 |
| Hard | 5 | 1 | 15 |
| Expert | 5 | 2 | 15 |
| Nightmare | 5 | 3 | 15 |
| Marathon | 6 | 5 | 20 |
| Absurd | 7 | 10 | 20 |
| Cosmic | 7 | 20 | 24 |
| Mind | 7 | 50 | 50 |

## Quick Start

### Prerequisites

- Rust toolchain (for the CLI)
- Node.js + npm
- API keys: `GEMINI_API_KEY` and/or `OPENROUTER_API_KEY` in `.env`

### Generate Theorems

```bash
cargo build --release
./target/release/propbench generate --tier nightmare --count 20 --output benchmarks/my-set/theorems.json
```

### Run a Benchmark (CLI)

```bash
npx ts-node harness.ts \
  --theorems benchmarks/my-set/theorems.json \
  --models gemini-2.5-flash,anthropic/claude-sonnet-4.5 \
  --workers 5
```

### Run via GUI

```bash
cd gui && npm run dev
```

Opens a web UI at `localhost:3000` with:

- **Dashboard** — Elo rankings, difficulty breakdown, head-to-head matrix, latency comparison, failure analysis
- **Benchmark Runner** — Configure models, theorem sets, token budgets, parallelism, cost limits; watch live progress via SSE
- **Theorem Explorer** — Browse theorems by difficulty, view side-by-side proof comparisons across models

## Project Structure

```
prop-bench/
├── src/main.rs          # Rust CLI: generate theorems & validate proofs
├── harness.ts           # Main orchestrator: LLM calls → parse → validate → score
├── parser.ts            # LLM output → structured proof lines
├── prompt.ts            # Prompt builder (rules, techniques, format spec)
├── scorer.ts            # Elo rating system
├── config.ts            # Shared types & difficulty tiers
├── db.ts                # SQLite storage layer
├── models/              # LLM adapters (Gemini direct, OpenRouter)
├── gui/                 # React + Express web interface
├── benchmarks/          # Pre-generated theorem sets
└── results/             # Benchmark output (JSON + SQLite)
```
