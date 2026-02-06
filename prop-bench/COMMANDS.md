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

```bash
# Generate the default v1 set (100 theorems, 30:easy,30:medium,20:hard,15:expert,5:nightmare)
./target/release/propbench generate --output benchmarks/v1/theorems.json

# Generate a custom set
./target/release/propbench generate \
  --count 50 \
  --difficulty-distribution "20:easy,20:medium,10:hard" \
  --output my_theorems.json

# Generate with all difficulty tiers
./target/release/propbench generate \
  --count 100 \
  --difficulty-distribution "30:easy,30:medium,20:hard,15:expert,5:nightmare" \
  --output benchmarks/v2/theorems.json
```

### Validate a proof

```bash
# Validate a proof against a theorem (both are JSON files)
./target/release/propbench validate --theorem theorem.json --proof proof.json
```

**theorem.json** format:
```json
{
  "id": "v1-001",
  "premises": ["P | Q", "~P"],
  "conclusion": "Q",
  "difficulty": "Easy",
  "difficulty_value": 8
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
| `--temperature <n>` | No | `0.2` | Model temperature |
| `--max-tokens <n>` | No | `4096` | Max tokens for model response |

### Resume interrupted runs

The harness automatically detects completed theorem+model pairs in the output directory and skips them. Just re-run the same command to resume.

## Environment Variables

| Variable | Required for | Description |
|----------|-------------|-------------|
| `GEMINI_API_KEY` | `--models gemini` | Google AI API key |
| `ANTHROPIC_API_KEY` | `--models claude` | Anthropic API key |
| `OPENAI_API_KEY` | `--models gpt` | OpenAI API key |

```bash
# Set before running
export GEMINI_API_KEY="your-key-here"
export ANTHROPIC_API_KEY="your-key-here"
export OPENAI_API_KEY="your-key-here"
```

## Model Aliases

| Alias | Provider | Default Model |
|-------|----------|---------------|
| `gemini`, `gemini-flash` | Google | `gemini-2.0-flash` |
| `claude`, `anthropic` | Anthropic | `claude-sonnet-4-5-20250929` |
| `gpt`, `openai` | OpenAI | `gpt-4o` |

## Output Structure

```
results/
├── raw/                           # Individual result JSON per theorem+model
│   ├── v1-001_gemini_1738800000.json
│   ├── v1-001_anthropic_1738800001.json
│   └── ...
└── summary.json                   # Run summary (counts, models used)
```

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
# Opens at http://localhost:3000
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
| `/` | Dashboard | Load results JSON, view Elo rankings, difficulty breakdown, aggregate stats |
| `/theorems` | Theorem Explorer | Browse 100 theorems, filter by difficulty, view Fitch-style proofs, compare models side-by-side |
| `/runner` | Benchmark Runner | Configure benchmark parameters, generate CLI command, track run history |

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
