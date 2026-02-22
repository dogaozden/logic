#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — Build two clean public repos from the monorepo
#
# Creates:
#   ~/Documents/AI_Projects/propbench/            (self-contained benchmark suite)
#   ~/Documents/AI_Projects/logic-proof-trainer/  (standalone Tauri app)
#
# Safe to re-run: always starts fresh.
# Does NOT modify anything in the monorepo.
# ─────────────────────────────────────────────────────────────────────────────

MONO="$HOME/Documents/AI_Projects/logic"
DEST_PB="$HOME/Documents/AI_Projects/propbench"
DEST_LPT="$HOME/Documents/AI_Projects/logic-proof-trainer"

# ── Cleanup ──────────────────────────────────────────────────────────────────
echo "=== Cleaning target directories ==="
rm -rf "$DEST_PB"
rm -rf "$DEST_LPT"

# ── 1. PropBench ─────────────────────────────────────────────────────────────
echo ""
echo "=== Building propbench repo ==="

echo "  Copying prop-bench files..."
rsync -a \
  --exclude='node_modules/' \
  --exclude='target/' \
  --exclude='dist/' \
  --exclude='results/' \
  --exclude='.DS_Store' \
  --exclude='.env' \
  --exclude='*.db' \
  --exclude='*.db-shm' \
  --exclude='*.db-wal' \
  --exclude='Cargo.lock' \
  --exclude='package-lock.json' \
  --exclude='*.js' \
  --exclude='*.js.map' \
  --exclude='*.d.ts' \
  --exclude='.claude/' \
  --exclude='benchmarks/' \
  --exclude='gui/node_modules/' \
  --exclude='gui/dist/' \
  --exclude='gui/package-lock.json' \
  "$MONO/prop-bench/" "$DEST_PB/"

echo "  Creating empty benchmarks/ directory..."
mkdir -p "$DEST_PB/benchmarks"

echo "  Deleting any .db files (if any survived)..."
find "$DEST_PB" -name '*.db' -delete 2>/dev/null || true
find "$DEST_PB" -name '*.db-shm' -delete 2>/dev/null || true
find "$DEST_PB" -name '*.db-wal' -delete 2>/dev/null || true

echo "  Creating logic-lib/ (embedded Rust library)..."
mkdir -p "$DEST_PB/logic-lib/src"

cat > "$DEST_PB/logic-lib/Cargo.toml" << 'CARGO_EOF'
[package]
name = "logic-proof-trainer"
version = "0.1.0"
description = "Core logic library for propositional logic natural deduction"
edition = "2021"

[lib]
name = "logic_proof_trainer_lib"
crate-type = ["lib"]

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4", "serde"] }
rand = "0.8"
chrono = { version = "0.4", features = ["serde"] }
dirs = "5"
CARGO_EOF

cat > "$DEST_PB/logic-lib/src/lib.rs" << 'LIB_EOF'
pub mod models;
pub mod services;
LIB_EOF

echo "  Copying models/ and services/ into logic-lib/src/..."
rsync -a "$MONO/logic-proof-trainer/src-tauri/src/models/" "$DEST_PB/logic-lib/src/models/"
rsync -a "$MONO/logic-proof-trainer/src-tauri/src/services/" "$DEST_PB/logic-lib/src/services/"

echo "  Updating Cargo.toml path dependency..."
sed -i '' 's|path = "../logic-proof-trainer/src-tauri"|path = "logic-lib"|g' "$DEST_PB/Cargo.toml"

echo "  Updating ARCHITECTURE.md path references..."
sed -i '' 's|path = "../logic-proof-trainer/src-tauri"|path = "logic-lib"|g' "$DEST_PB/ARCHITECTURE.md"
sed -i '' 's|logic-proof-trainer/src-tauri/|logic-lib/src/|g' "$DEST_PB/ARCHITECTURE.md"

echo "  Building Rust binary..."
(cd "$DEST_PB" && cargo build --release 2>&1 | tail -1)

echo "  Installing npm dependencies..."
(cd "$DEST_PB" && npm install --silent 2>&1 | tail -1)
(cd "$DEST_PB/gui" && npm install --silent 2>&1 | tail -1)

echo "  Initializing git repo..."
(
  cd "$DEST_PB"
  git init -q
  git add -A
  git commit -q -m "Initial commit: PropBench LLM benchmark suite

Propositional logic proof benchmark with embedded logic library.
Measures LLM proof efficiency using Fitch-style natural deduction."
)
echo "  propbench repo ready."

# ── 2. Logic Proof Trainer ───────────────────────────────────────────────────
echo ""
echo "=== Building logic-proof-trainer repo ==="

echo "  Copying logic-proof-trainer files..."
rsync -a \
  --exclude='node_modules/' \
  --exclude='target/' \
  --exclude='dist/' \
  --exclude='.DS_Store' \
  --exclude='package-lock.json' \
  --exclude='Cargo.lock' \
  "$MONO/logic-proof-trainer/" "$DEST_LPT/"

echo "  Stripping PropBench references from DOCUMENTATION.md..."
# Remove TOC entry
sed -i '' '/^14\. \[PropBench/d' "$DEST_LPT/DOCUMENTATION.md"

# Remove entire PropBench section (from heading to EOF)
sed -i '' '/^## PropBench: LLM Benchmark Tool$/,$d' "$DEST_LPT/DOCUMENTATION.md"

# Remove trailing --- separator that preceded the PropBench section
sed -i '' '${/^---$/d;}' "$DEST_LPT/DOCUMENTATION.md"

# Clean inline PropBench mentions
sed -i '' 's/ (used by PropBench for LLM-facing output; / (/' "$DEST_LPT/DOCUMENTATION.md"
sed -i '' 's/ — used by PropBench CLI//' "$DEST_LPT/DOCUMENTATION.md"
sed -i '' 's/ (used by PropBench)//' "$DEST_LPT/DOCUMENTATION.md"
sed -i '' '/tier presets are defined in `prop-bench/d' "$DEST_LPT/DOCUMENTATION.md"
sed -i '' 's|Tier presets are stored in `prop-bench/tier-presets.json` and served via API for GUI usage|Tier presets are defined in code and served via API for GUI usage|g' "$DEST_LPT/DOCUMENTATION.md"

echo "  Initializing git repo..."
(
  cd "$DEST_LPT"
  git init -q
  git add -A
  git commit -q -m "Initial commit: Logic Proof Trainer

Tauri desktop app for practicing propositional logic proofs
using the natural deduction system."
)
echo "  logic-proof-trainer repo ready."

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "=== Deploy complete ==="
echo "  propbench:           $DEST_PB"
echo "  logic-proof-trainer: $DEST_LPT"
echo ""
echo "Next steps:"
echo "  cd $DEST_PB && cargo build --release   # verify Rust compiles"
echo "  cd $DEST_LPT                           # verify contents"
