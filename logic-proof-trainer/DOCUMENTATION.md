# Logic Proof Trainer - Technical Documentation

A cross-platform desktop application for practicing propositional logic proofs using the natural deduction system. Built with Tauri (Rust backend + React/TypeScript frontend).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Logical System](#logical-system)
3. [Project Structure](#project-structure)
4. [Backend (Rust)](#backend-rust)
5. [Frontend (React/TypeScript)](#frontend-reacttypescript)
6. [Data Flow](#data-flow)
7. [Building and Running](#building-and-running)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Tauri Application                         │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React + TypeScript)                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ TheoremList │  │ProofWorkspace│  │  Portfolio  │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│         │                │                │                  │
│         └────────────────┼────────────────┘                  │
│                          │                                   │
│              Tauri IPC (invoke commands)                     │
│                          │                                   │
├──────────────────────────┼──────────────────────────────────┤
│  Backend (Rust)          │                                   │
│  ┌───────────────────────┴───────────────────────┐          │
│  │                  Commands                      │          │
│  └───────────────────────┬───────────────────────┘          │
│         ┌────────────────┼────────────────┐                  │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐          │
│  │   Models    │  │  Services   │  │   Storage   │          │
│  │ - Formula   │  │ - Verifier  │  │ - JSON files│          │
│  │ - Proof     │  │ - Generator │  │ - Portfolio │          │
│  │ - Rules     │  │ - Dependency│  │ - Stats     │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

---

## Logical System

The app implements a natural deduction proof system for propositional logic based on the rules defined in `rules.md`.

### Symbols

| Symbol | Meaning | ASCII Input |
|--------|---------|-------------|
| `⊃` | Implies (conditional) | `->` |
| `∨` | Or (disjunction) | `\|` |
| `·` | And (conjunction) | `&` |
| `~` | Not (negation) | `~` |
| `≡` | Biconditional | `<->` |
| `⊥` | Contradiction | `_\|_` or `!` |

### Valid Argument Forms (Inference Rules 1-8)

These rules derive new formulas from existing lines:

| # | Name | Abbrev | Pattern |
|---|------|--------|---------|
| 1 | Modus Ponens | MP | p ⊃ q, p ∴ q |
| 2 | Modus Tollens | MT | p ⊃ q, ~q ∴ ~p |
| 3 | Disjunctive Syllogism | DS | p ∨ q, ~p ∴ q |
| 4 | Simplification | Simp | p · q ∴ p (or q) |
| 5 | Conjunction | Conj | p, q ∴ p · q |
| 6 | Hypothetical Syllogism | HS | p ⊃ q, q ⊃ r ∴ p ⊃ r |
| 7 | Addition | Add | p ∴ p ∨ q |
| 8 | Constructive Dilemma | CD | p ∨ q, p ⊃ r, q ⊃ s ∴ r ∨ s |

### Valid Equivalence Forms (Rules 9-18)

These rules transform formulas bidirectionally (replacement rules):

| # | Name | Abbrev | Pattern |
|---|------|--------|---------|
| 9 | Double Negation | DN | p :: ~~p |
| 10 | DeMorgan's Theorem | DeM | ~(p · q) :: (~p ∨ ~q) |
| 11 | Commutation | Comm | (p ∨ q) :: (q ∨ p) |
| 12 | Association | Assoc | [p ∨ (q ∨ r)] :: [(p ∨ q) ∨ r] |
| 13 | Distribution | Dist | [p · (q ∨ r)] :: [(p · q) ∨ (p · r)] |
| 14 | Contraposition | Contra | (p ⊃ q) :: (~q ⊃ ~p) |
| 15 | Implication | Impl | (p ⊃ q) :: (~p ∨ q) |
| 16 | Exportation | Exp | [(p · q) ⊃ r] :: [p ⊃ (q ⊃ r)] |
| 17 | Tautology | Taut | p :: (p · p), p :: (p ∨ p) |
| 18 | Equivalence | Equiv | (p ≡ q) :: [(p ⊃ q) · (q ⊃ p)] |

### Proof Techniques

| Name | Abbrev | Description |
|------|--------|-------------|
| Conditional Proof | CP | Assume p, derive q, conclude p ⊃ q |
| Indirect Proof | IP | Assume ~p, derive contradiction, conclude p |

---

## Project Structure

```
logic-proof-trainer/
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml               # Rust dependencies
│   ├── tauri.conf.json          # Tauri configuration
│   └── src/
│       ├── main.rs              # Tauri entry point
│       ├── lib.rs               # Module exports
│       ├── commands.rs          # IPC command handlers
│       ├── models/
│       │   ├── mod.rs
│       │   ├── formula.rs       # Formula AST and parser
│       │   ├── theorem.rs       # Theorem definitions
│       │   ├── proof.rs         # Proof and ProofLine
│       │   ├── scope.rs         # Subproof scope management
│       │   ├── statistics.rs    # User statistics
│       │   └── rules/
│       │       ├── mod.rs
│       │       ├── inference.rs  # 8 inference rules
│       │       ├── equivalence.rs # 10 equivalence rules
│       │       └── technique.rs  # CP, IP techniques
│       └── services/
│           ├── mod.rs
│           ├── verifier.rs      # Proof step validation
│           ├── generator.rs     # Theorem generation
│           ├── dependency.rs    # Line dependency tracking
│           └── storage.rs       # JSON file persistence
├── src/                         # React frontend
│   ├── main.tsx                # React entry point
│   ├── App.tsx                 # Main app component
│   ├── types/
│   │   └── index.ts            # TypeScript types (mirrors Rust)
│   ├── hooks/
│   │   ├── useProof.ts         # Proof state management (Zustand)
│   │   ├── useTheorems.ts      # Theorem state management
│   │   └── usePortfolio.ts     # Portfolio state management
│   ├── components/
│   │   ├── TheoremList/
│   │   │   └── TheoremList.tsx # Theorem browser sidebar
│   │   ├── ProofWorkspace/
│   │   │   ├── ProofWorkspace.tsx # Main proof editor
│   │   │   ├── RulePalette.tsx    # Rule selection panel
│   │   │   └── FormulaInput.tsx   # Formula text input
│   │   └── Portfolio/
│   │       └── Portfolio.tsx   # Completed proofs gallery
│   └── styles/
│       └── main.css            # Application styles
├── package.json                # Node dependencies
├── tsconfig.json               # TypeScript config
└── vite.config.ts              # Vite bundler config
```

---

## Backend (Rust)

### Formula Model (`models/formula.rs`)

The core AST for propositional logic formulas:

```rust
pub enum Formula {
    Atom(String),                        // P, Q, R, etc.
    Not(Box<Formula>),                   // ~P
    And(Box<Formula>, Box<Formula>),     // P · Q
    Or(Box<Formula>, Box<Formula>),      // P ∨ Q
    Implies(Box<Formula>, Box<Formula>), // P ⊃ Q
    Biconditional(Box<Formula>, Box<Formula>), // P ≡ Q
    Contradiction,                       // ⊥
}
```

Key methods:
- `Formula::parse(input: &str)` - Recursive descent parser
- `formula.display_string()` - Pretty print with logical symbols
- `formula.atoms()` - Extract all atomic propositions

### Inference Rules (`models/rules/inference.rs`)

Each rule implements:
- `apply(&self, premises: &[&Formula], additional: Option<&Formula>) -> Option<Formula>`
- `verify(&self, premises: &[&Formula], conclusion: &Formula) -> bool`
- `all_conclusions(&self, premises: &[&Formula], additional: Option<&Formula>) -> Vec<Formula>`

### Equivalence Rules (`models/rules/equivalence.rs`)

Each rule implements:
- `equivalent_forms(&self, formula: &Formula) -> Vec<Formula>`
- `can_transform(&self, from: &Formula, to: &Formula) -> bool`

### Proof Model (`models/proof.rs`)

```rust
pub struct Proof {
    pub id: String,
    pub theorem: Theorem,
    pub lines: Vec<ProofLine>,
    pub scope_manager: ScopeManager,
    pub is_complete: bool,
}

pub struct ProofLine {
    pub id: String,
    pub line_number: usize,
    pub formula: Formula,
    pub justification: Justification,
    pub depth: usize,           // Subproof nesting level
    pub scope_id: Option<String>,
    pub is_valid: bool,
    pub validation_message: Option<String>,
}
```

### Justification Types

```rust
pub enum Justification {
    Premise,
    Assumption { technique: ProofTechnique },
    Inference { rule: InferenceRule, lines: Vec<usize> },
    Equivalence { rule: EquivalenceRule, line: usize },
    SubproofConclusion {
        technique: ProofTechnique,
        subproof_start: usize,
        subproof_end: usize
    },
}
```

### Scope Manager (`models/scope.rs`)

Manages subproof nesting for CP and IP:
- Tracks open/closed scopes
- Determines line accessibility (can only cite lines in current or parent scopes)
- Validates subproof closures

### Services

**Verifier** (`services/verifier.rs`):
- Validates each proof step against its cited justification
- Checks line accessibility within scopes
- Marks invalid lines and propagates invalidity to dependents

**Generator** (`services/generator.rs`):
- Creates provable theorems by working backwards from conclusion
- Difficulty levels control formula complexity and proof depth

**Storage** (`services/storage.rs`):
- Persists data to JSON files in OS-appropriate data directory
- Stores: portfolio entries, custom theorems, user statistics

---

## Frontend (React/TypeScript)

### State Management (Zustand)

**useProof** (`hooks/useProof.ts`):
```typescript
interface ProofState {
  proof: Proof | null;
  selectedLines: number[];
  error: string | null;

  setProof: (proof: Proof | null) => void;
  toggleLineSelection: (lineNumber: number) => void;
  applyInferenceRule: (rule: InferenceRule, formula?: string) => Promise<void>;
  applyEquivalenceRule: (rule: EquivalenceRule) => Promise<void>;
  openSubproof: (technique: ProofTechnique, assumption: string, goal?: string) => Promise<void>;
  closeSubproof: () => Promise<void>;
}
```

**useTheorems** (`hooks/useTheorems.ts`):
- Loads classic theorems from backend
- Generates random theorems by difficulty
- Tracks selected theorem

**usePortfolio** (`hooks/usePortfolio.ts`):
- Loads completed proofs from storage
- Adds new completed proofs
- Provides portfolio statistics

### Key Components

**ProofWorkspace** (`components/ProofWorkspace/ProofWorkspace.tsx`):
- Main proof editing area
- Displays proof lines with Fitch-style indentation
- Formula input with syntax toolbar
- Error display and validation feedback

**RulePalette** (`components/ProofWorkspace/RulePalette.tsx`):
- Three sections: Inference Rules (1-8), Equivalence Rules (9-18), Proof Techniques
- Click to select rule, then click "Apply" with selected lines

**TheoremList** (`components/TheoremList/TheoremList.tsx`):
- Lists classic theorems
- Difficulty filter
- "Generate Random" button

**Portfolio** (`components/Portfolio/Portfolio.tsx`):
- Gallery of completed proofs
- Click to view full proof details

---

## Data Flow

### Applying an Inference Rule

```
1. User selects lines [1, 3] in ProofWorkspace
2. User clicks "MP" in RulePalette
3. User clicks "Apply Rule"
4. Frontend calls: invoke('apply_rule', { proof, rule, lines: [1, 3] })
5. Backend:
   - Retrieves formulas from lines 1 and 3
   - Calls InferenceRule::ModusPonens.apply(...)
   - If valid: creates new ProofLine, appends to proof
   - If invalid: returns error message
6. Frontend receives updated Proof or error
7. UI updates to show new line or error message
```

### Opening a Subproof (CP)

```
1. User clicks "CP" in RulePalette
2. User enters assumption formula (e.g., "P")
3. User optionally enters goal formula (e.g., "Q")
4. Frontend calls: invoke('open_subproof', { proof, technique: 'conditionalProof', assumption: 'P' })
5. Backend:
   - Creates new ProofScope
   - Creates assumption line with depth + 1
   - Returns updated proof
6. UI shows indented subproof box with assumption
```

### Closing a Subproof

```
1. User clicks "Close Subproof"
2. Frontend calls: invoke('close_subproof', { proof })
3. Backend:
   - Validates subproof can be closed (has assumption and required conclusion)
   - Creates SubproofConclusion line at parent depth
   - Marks scope as closed
4. UI shows completed subproof with conclusion
```

---

## Building and Running

### Prerequisites

- Node.js 18+
- Rust 1.70+
- Tauri CLI: `npm install -g @tauri-apps/cli`

### Development

```bash
# Install dependencies
npm install

# Run in development mode (hot reload)
npm run tauri dev
```

### Production Build

```bash
# Build for current platform
npm run tauri build
```

Output: `src-tauri/target/release/bundle/`

### Running Tests

```bash
# Rust tests
cd src-tauri && cargo test

# TypeScript type checking
npm run typecheck
```

---

## Input Syntax

### Formula Input

Users type formulas using ASCII-friendly syntax:

| Input | Renders As |
|-------|------------|
| `P` | P |
| `~P` | ~P |
| `P & Q` | P · Q |
| `P \| Q` | P ∨ Q |
| `P -> Q` | P ⊃ Q |
| `P <-> Q` | P ≡ Q |
| `(P & Q) -> R` | (P · Q) ⊃ R |

### Justification Input

When entering a new line, format is:
```
FORMULA //RULE LINE_REFS
```

Examples:
- `Q //MP 1, 2` - Modus Ponens from lines 1 and 2
- `~P //MT 3, 4` - Modus Tollens from lines 3 and 4
- `P | Q //Add 5` - Addition from line 5
- `P //Simp 6` - Simplification from line 6
- `~~P //DN 7` - Double Negation from line 7
- `P //CP` - Start Conditional Proof with assumption P
- `P //IP` - Start Indirect Proof with assumption ~P

---

## Classic Theorems

The app includes 13 pre-defined classic theorems for practice:

1. Simple MP: P, P → Q ∴ Q
2. Simple MT: P → Q, ~Q ∴ ~P
3. Chain Rule: P → Q, Q → R ∴ P → R
4. Disjunctive Syllogism: P ∨ Q, ~P ∴ Q
5. Constructive Dilemma
6. Contraposition: P → Q ∴ ~Q → ~P
7. DeMorgan: ~(P · Q) ∴ ~P ∨ ~Q
8. Distribution
9. Exportation: (P · Q) → R ∴ P → (Q → R)
10. Material Implication: P → Q ∴ ~P ∨ Q
11. Double Negation: ~~P ∴ P
12. Identity (requires CP): ∴ P → P
13. Excluded Middle (requires IP): ∴ P ∨ ~P

---

## Portfolio System

Completed proofs are saved to the portfolio with:
- Theorem details (premises, conclusion)
- Complete proof with all lines
- Completion timestamp
- Step count
- Time spent (if tracked)

Portfolio data is stored at:
- macOS: `~/Library/Application Support/logic-proof-trainer/portfolio.json`
- Windows: `%APPDATA%/logic-proof-trainer/portfolio.json`
- Linux: `~/.local/share/logic-proof-trainer/portfolio.json`
