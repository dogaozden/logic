# PropBench Commands

## Setup

```bash
# 1. Install TypeScript dependencies
cd ~/Documents/AI_Projects/logic/prop-bench
npm install

# 2. Build the Rust CLI binary
cargo build --release
```

## CLI Binary (Rust)

### Generate a theorem set

The generate command supports three modes: **distribution** (legacy), **tier preset**, and **custom spec**.

```bash
# Legacy distribution mode (default if no --tier/--spec flags)
./target/release/propbench generate --output benchmarks/v1/theorems.json

# Custom distribution (counts must sum to --count)
./target/release/propbench generate \
  --count 50 \
  --difficulty-distribution "20:easy,20:medium,10:hard" \
  --output my_theorems.json

# Distribution with extended tiers (absurd/cosmic/mind use spec-based generation)
./target/release/propbench generate \
  --count 10 \
  --difficulty-distribution "3:easy,3:absurd,4:cosmic" \
  --output extended.json

# Tier preset mode — all theorems use one tier's DifficultySpec
./target/release/propbench generate --tier nightmare --count 20 --output nightmare.json
./target/release/propbench generate --tier absurd --count 5 --output absurd.json

# Custom spec mode — full control over generation parameters
./target/release/propbench generate \
  --variables 10 --passes 3 --transforms 15 \
  --base complex --substitution 3 \
  --count 20 --output custom.json
```

### Difficulty tiers

| Tier       | Vars | Passes | Transforms/pass | Base    | Substitution |
|------------|------|--------|-----------------|---------|-------------|
| Easy       | 2    | 1      | 2               | simple  | 0           |
| Medium     | 3    | 1      | 5               | simple  | 0           |
| Hard       | 4    | 1      | 10              | complex | 0           |
| Expert     | 5    | 1      | 15              | complex | 2           |
| Nightmare  | 5    | 2      | 12              | complex | 3           |
| Marathon   | 5    | 3      | 15              | complex | 4           |
| Absurd     | 8    | 5      | 20              | complex | 4           |
| Cosmic     | 15   | 10     | 20              | complex | 4           |
| Mind       | 20   | 20     | 24              | complex | 4           |

### DifficultySpec fields

| Field               | Range | Description |
|---------------------|-------|-------------|
| `variables`         | 2-20  | Number of propositional variables |
| `passes`            | 1-20  | Number of transform passes (re-wrapping between each) |
| `transforms_per_pass` | 1-24 | Random equivalence transforms applied per pass |
| `base_complexity`   | simple/complex | `simple` = standard base forms, `complex` = includes ConstructiveDilemmaFull, NestedCP, Chain4 |
| `substitution_depth` | 0-4  | Depth of atom-to-formula substitutions (0 = none) |

### Validate a proof

```bash
# Validate a proof against a theorem (both are JSON files)
./target/release/propbench validate --theorem theorem.json --proof proof.json
```

**Note:** The current benchmark uses tautology-only theorems (empty premises). The examples below show the data structure format, which still supports theorems with premises for validation purposes, but the benchmark prompt no longer generates premise-based theorems.

**theorem.json** format (formulas use ASCII with alternating brackets):
```json
{
  "id": "v1-001",
  "premises": ["P | Q", "~P"],
  "conclusion": "Q",
  "difficulty": "Easy",
  "difficulty_value": 8
}

// Tautology example (current benchmark format):
{
  "id": "v1-042",
  "premises": [],
  "conclusion": "[(P -> Q) & ~Q] -> ~P",
  "difficulty": "Medium",
  "difficulty_value": 39
}
```

**proof.json** format:
```json
[
  { "line_number": 1, "formula": "P | Q", "justification": "Premise", "depth": 0 },
  { "line_number": 2, "formula": "~P", "justification": "Premise", "depth": 0 },
  { "line_number": 3, "formula": "Q", "justification": "DS 1,2", "depth": 0 }
]
```

**Output** (stdout, JSON):
```json
{
  "valid": true,
  "line_count": 1,
  "errors": []
}
```

## Benchmark Harness (TypeScript)

### Run a benchmark

```bash
# Run against a single model
npx ts-node harness.ts \
  --theorems benchmarks/v1/theorems.json \
  --models gemini \
  --propbench-bin ./target/release/propbench

# Run against multiple models
npx ts-node harness.ts \
  --theorems benchmarks/v1/theorems.json \
  --models gemini,claude,gpt \
  --propbench-bin ./target/release/propbench

# Run a subset of theorems (e.g., first 10)
npx ts-node harness.ts \
  --theorems benchmarks/v1/theorems.json \
  --models gemini \
  --start 0 --count 10 \
  --propbench-bin ./target/release/propbench

# Custom output directory
npx ts-node harness.ts \
  --theorems benchmarks/v1/theorems.json \
  --models gemini \
  --output my_results/ \
  --propbench-bin ./target/release/propbench

# Run with parallel workers
npx ts-node harness.ts \
  --theorems benchmarks/v1/theorems.json \
  --models gemini \
  --workers 5 \
  --propbench-bin ./target/release/propbench

# Adjust model parameters
npx ts-node harness.ts \
  --theorems benchmarks/v1/theorems.json \
  --models claude \
  --temperature 0.0 \
  --max-tokens 8192 \
  --propbench-bin ./target/release/propbench
```

### Harness CLI arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--theorems <path>` | Yes | — | Path to theorem set JSON |
| `--models <list>` | Yes | — | Comma-separated: `gemini`, `claude`, `gpt` |
| `--output <dir>` | No | `results/` | Output directory for results |
| `--start <n>` | No | `0` | Start at theorem index n |
| `--count <n>` | No | all | Process only n theorems |
| `--propbench-bin <path>` | No | `propbench` | Path to the Rust CLI binary |
| `--workers <n>` | No | `1` | Number of parallel API workers |
| `--temperature <n>` | No | `0.2` | Model temperature |
| `--max-tokens <n>` | No | `4096` | Max tokens for model response |

### Resume interrupted runs

The harness automatically detects completed theorem+model pairs in the output directory and skips them. Just re-run the same command to resume.

## Environment Variables

**Recommended: Use `.env` file** (v2.5+)

Create a `.env` file in the prop-bench root directory:

```bash
# prop-bench/.env
GEMINI_API_KEY=your-key-here
ANTHROPIC_API_KEY=your-key-here
OPENAI_API_KEY=your-key-here
```

The harness and GUI server will automatically load these on startup using the `dotenv` package.

**Alternative: Shell environment**

```bash
# Set before running
export GEMINI_API_KEY="your-key-here"
export ANTHROPIC_API_KEY="your-key-here"
export OPENAI_API_KEY="your-key-here"
```

| Variable | Required for | Description |
|----------|-------------|-------------|
| `GEMINI_API_KEY` | `--models gemini` | Google AI API key |
| `ANTHROPIC_API_KEY` | `--models claude` | Anthropic API key |
| `OPENAI_API_KEY` | `--models gpt` | OpenAI API key |

## Model Aliases

**IMPORTANT:** When changing model names, defaults, or CLI arguments, always update the GUI to match. See `CLAUDE.md` for the "PropBench: Keep GUI in sync with CLI" rule.

| Alias | Provider | Default Model | SDK |
|-------|----------|---------------|-----|
| `gemini`, `gemini-flash` | Google | `gemini-2.5-flash-lite-preview-09-2025` | `@google/genai` v1.0.0 |
| `gemini-3-flash` | Google | `gemini-3-flash-preview` | `@google/genai` v1.0.0 |
| `gemini-3-pro` | Google | `gemini-3-pro-preview` | `@google/genai` v1.0.0 |
| `claude`, `anthropic` | Anthropic | `claude-sonnet-4-5-20250929` | `@anthropic-ai/sdk` v0.39.0 |
| `gpt`, `openai` | OpenAI | `gpt-4o` | `openai` v4.77.0 |

**v2.5 Changes:**
- Gemini: migrated from `@google/generative-ai` to `@google/genai` SDK
- Gemini: default model changed from `gemini-2.0-flash` to `gemini-2.5-flash-lite-preview-09-2025`
- Gemini: constructor changed from `new GoogleGenerativeAI(apiKey)` to `new GoogleGenAI({ apiKey })`

## Output Structure

```
results/
├── raw/                           # Individual result JSON per theorem+model
│   ├── v1-001_gemini_1738800000.json
│   ├── v1-001_anthropic_1738800001.json
│   └── ...
└── summary.json                   # Run summary (counts, models used)
propbench.db                       # SQLite database (all data)
```

## Database (SQLite)

PropBench uses SQLite (`propbench.db`) for storing benchmark results alongside the traditional JSON filesystem. The database uses WAL mode for safe concurrent access.

### Migration

To migrate existing JSON results into the database:

```bash
cd ~/Documents/AI_Projects/logic/prop-bench
npm run migrate
```

This scans `benchmarks/` and `results/` directories and populates the SQLite database. The migration is idempotent — running it multiple times is safe.

### Database location

The database file `propbench.db` is created in the `prop-bench/` root directory.

### Dual-write mode

The harness writes results to both JSON files and SQLite simultaneously. The GUI server queries SQLite when available and falls back to filesystem scanning if the database is missing.

### Schema

- `theorem_sets` — Benchmark theorem set metadata
- `theorems` — Individual theorems with difficulty ratings
- `results` — Model benchmark results (one row per theorem × model)
- `reports_cache` — Cached Elo reports for fast serving

### Database queries

The PropBench database includes several query functions for retrieving aggregate statistics:

#### Average lines by difficulty

```typescript
getAvgLinesByDifficulty(setName?: string): Promise<AvgLinesByDifficultyRow[]>
```

Computes the average proof line count for each model across difficulty tiers. Only valid proofs are included in the calculation. Results include the count of valid proofs per model per tier.

**Parameters:**
- `setName` (optional) — Filter results to a specific theorem set

**Returns:**
Array of objects containing:
- `model` — Model alias (e.g., "gemini", "claude", "gpt")
- `difficulty` — Difficulty tier name
- `avg_lines` — Average line count for valid proofs
- `valid_count` — Number of valid proofs used in calculation

## GUI

### Setup

```bash
cd ~/Documents/AI_Projects/logic/prop-bench/gui
npm install
```

### Development server

```bash
cd ~/Documents/AI_Projects/logic/prop-bench/gui
npm run dev
# Runs both Vite frontend (http://localhost:3000) and Express backend (http://localhost:3001) concurrently
```

### Run backend only

```bash
cd ~/Documents/AI_Projects/logic/prop-bench/gui
npm run server
# Starts Express backend on http://localhost:3001
```

### Production build

```bash
cd ~/Documents/AI_Projects/logic/prop-bench/gui
npx vite build
# Output in gui/dist/
```

### Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Dashboard | Load results JSON, view Elo rankings, difficulty breakdown, aggregate stats, average lines by difficulty, head-to-head wins, latency comparison |
| `/theorems` | Theorem Explorer | Browse 100 theorems, filter by difficulty, view Fitch-style proofs, compare models side-by-side |
| `/runner` | Benchmark Runner | Configure benchmark parameters, generate CLI command, track run history |

### Dashboard features

#### Avg Lines by Difficulty

Displays a table showing the average proof line count for each model across difficulty tiers. Features:
- **Rows:** Models (gemini, claude, gpt, etc.)
- **Columns:** Difficulty tiers (Easy, Medium, Hard, Expert, Nightmare, etc.)
- **Cells:** Average line count with valid proof count in parentheses, e.g., "12.5 (8)"
- **Highlighting:** Green background on the shortest (best) average for each difficulty tier
- **Data source:** Only valid proofs are included; invalid/failed proofs are excluded

The table helps identify which models produce more concise proofs at different difficulty levels.

#### API endpoints

- `GET /api/runs/stats/avg-lines-by-difficulty` — Get avg lines by difficulty for all theorem sets
- `GET /api/runs/stats/avg-lines-by-difficulty/:setName` — Filter by specific theorem set

## Development

```bash
# Type-check harness TypeScript
npx tsc --noEmit

# Build harness TypeScript to dist/
npm run build

# Type-check GUI TypeScript
cd gui && npx tsc --noEmit

# Build GUI for production
cd gui && npx vite build

# Run Rust tests (from prop-bench/)
cargo test

# Build Rust in debug mode
cargo build
```

## Recent Improvements (v2.5)

### Parser Fixes
- Fixed formula parsing for formulas containing dots/spaces (e.g., `P . Q Conj 1,2`)
- Parser now uses known-rule-name matching instead of ambiguous regex
- Result: Benchmark accuracy improved from 50% to 100% on first 10 theorems

### Prompt Improvements
- **Tautology-only:** All premise-related code removed from `buildPrompt()` — no more `hasPremises` branching, `formatTheoremWithPremises()`, or `formatTautology()` helper functions
- Single code path: `buildPrompt()` now has a unified structure for all theorems
- System instruction says "Given a theorem" (not "Given a tautology")
- "Premise" justification type removed from output format specification
- Worked example section now has only ONE example (tautology with nested CP) — the old "with premises" example was removed
- Simplified and streamlined prompt structure

### SDK Migration
- Gemini adapter migrated from deprecated `@google/generative-ai` to new `@google/genai` SDK
- Constructor syntax changed: `new GoogleGenAI({ apiKey })` instead of `new GoogleGenerativeAI(apiKey)`
- Default model updated to `gemini-2.5-flash-lite-preview-09-2025`

### Environment Configuration
- Added `.env` file support via `dotenv` package
- Both harness and GUI server load `.env` from prop-bench root with `override: true`
- API keys can now be stored in `.env` instead of shell environment

### GUI Backend Fixes
- `cli.ts`: Uses local `node_modules/.bin/ts-node` instead of npx
- `cli.ts`: Explicitly injects `.env` vars into child process
- `cli.ts`: Pre-spawn validation (checks files exist)
- `benchmark.ts`: Rewrote SSE handler with structured progress events
- `benchmark.ts`: Fixed error event format
- `results.ts`: Fixed to use RESULTS_DIR instead of BENCHMARKS_DIR
- `index.ts`: Loads dotenv on startup

### GUI Frontend Fixes
- `BenchmarkRunner.tsx`: Fixed stale closure bug using useRef
- `ProofViewer.tsx`: Added "Show Raw Model Response" collapsible section
- `ProofViewer.tsx`: Added latency display
- `TheoremDetail.tsx`: Passes rawResponse and latencyMs to ProofViewer
- `theorems.css`: Added styles for raw response viewer
- `vite.config.ts`: Added SSE proxy buffering fix

### Parallel Execution
- Added `--workers N` flag for concurrent API calls (default: 1, sequential)
- GUI: Added "Parallel Workers" field in benchmark configuration
- Significantly reduces total benchmark time when running many theorems

### Formula Notation & Bracketing
- Theorem JSON uses ASCII operators (`&`, `|`, `->`, `<->`) for LLM compatibility
- GUI displays logic notation (`·`, `∨`, `⊃`, `≡`) via `renderFormula()` conversion
- All formulas use alternating bracket hierarchy: `()` innermost, `[]` next, `{}` outermost
- Every binary subexpression is explicitly bracketed — no implicit precedence
- Added `ascii_string_bracketed()` method to Formula (Rust)
- Added `toDisplayNotation()` utility to `gui/src/types.ts`
- Fixed `renderFormula()` replacement order bug in GUI components (was replacing `->` before `<->`)

### Import Fixes
- Removed `.js` extensions from all TypeScript imports (was breaking ts-node in CommonJS mode)
- Affects: `models/index.ts`, `models/gemini.ts`, `models/anthropic.ts`, `models/openai.ts`

### Dashboard Statistics
- Added "Avg Lines by Difficulty" table showing average proof line counts per model per difficulty tier
- New database query `getAvgLinesByDifficulty()` joins results with theorems to compute averages
- Only valid proofs are included in the calculation
- Table highlights the shortest (best) average per difficulty tier in green
- Valid proof counts shown in parentheses for each cell
- New API endpoints: `/api/runs/stats/avg-lines-by-difficulty` and `/api/runs/stats/avg-lines-by-difficulty/:setName`
- Component integrated into Dashboard between Head-to-Head Wins and Latency Comparison sections
