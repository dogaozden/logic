# Logic Proof Trainer - Technical Documentation

A cross-platform desktop application for practicing propositional logic proofs using the natural deduction system. Built with Tauri (Rust backend + React/TypeScript frontend).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Logical System](#logical-system)
3. [Project Structure](#project-structure)
4. [Backend (Rust)](#backend-rust)
5. [Frontend (React/TypeScript)](#frontend-reacttypescript)
6. [Tauri Commands](#tauri-commands)
7. [Data Flow](#data-flow)
8. [Building and Running](#building-and-running)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Tauri Application                           │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (React + TypeScript)                                   │
│  ┌───────────┐ ┌─────────────┐ ┌─────────┐ ┌──────────┐         │
│  │TheoremList│ │ProofWorkspace│ │Portfolio│ │ Settings │         │
│  └───────────┘ └─────────────┘ └─────────┘ └──────────┘         │
│        │              │              │            │              │
│        └──────────────┼──────────────┴────────────┘              │
│                       │                                          │
│            Tauri IPC (invoke commands)                           │
│                       │                                          │
├───────────────────────┼──────────────────────────────────────────┤
│  Backend (Rust)       │                                          │
│  ┌────────────────────┴──────────────────────┐                  │
│  │                 Commands                   │                  │
│  └────────────────────┬──────────────────────┘                  │
│       ┌───────────────┼───────────────┐                         │
│  ┌────┴────┐    ┌─────┴─────┐    ┌────┴────┐                    │
│  │ Models  │    │ Services  │    │ Storage │                    │
│  │-Formula │    │-Verifier  │    │-JSON    │                    │
│  │-Proof   │    │-Generator │    │-Portfolio│                   │
│  │-Theorem │    │-TreeGen   │    │-Stats   │                    │
│  │-Rules   │    │-TruthTable│    │         │                    │
│  │-Scope   │    │-ProofTree │    │         │                    │
│  └─────────┘    └───────────┘    └─────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Logical System

The app implements a natural deduction proof system for propositional logic.

### Symbols

| Symbol | Meaning | ASCII Input |
|--------|---------|-------------|
| `⊃` | Implies (conditional) | `->` or `>` |
| `∨` | Or (disjunction) | `\|` or `v` |
| `·` | And (conjunction) | `&` or `.` |
| `~` | Not (negation) | `~` or `!` |
| `≡` | Biconditional | `<->` or `<>` |
| `⊥` | Contradiction | `_\|_` |

### Valid Argument Forms (Inference Rules 1-9)

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
| 9 | Negation Elimination | NegE | p, ~p ∴ ⊥ |

### Valid Equivalence Forms (Rules 10-19)

| # | Name | Abbrev | Pattern |
|---|------|--------|---------|
| 10 | Double Negation | DN | p :: ~~p |
| 11 | DeMorgan's Theorem | DeM | ~(p · q) :: (~p ∨ ~q) |
| 12 | Commutation | Comm | (p ∨ q) :: (q ∨ p) |
| 13 | Association | Assoc | [p ∨ (q ∨ r)] :: [(p ∨ q) ∨ r] |
| 14 | Distribution | Dist | [p · (q ∨ r)] :: [(p · q) ∨ (p · r)] |
| 15 | Contraposition | Contra | (p ⊃ q) :: (~q ⊃ ~p) |
| 16 | Implication | Impl | (p ⊃ q) :: (~p ∨ q) |
| 17 | Exportation | Exp | [(p · q) ⊃ r] :: [p ⊃ (q ⊃ r)] |
| 18 | Tautology | Taut | p :: (p · p), p :: (p ∨ p) |
| 19 | Equivalence | Equiv | (p ≡ q) :: [(p ⊃ q) · (q ⊃ p)] |

### Proof Techniques

| Name | Abbrev | Description |
|------|--------|-------------|
| Conditional Proof | CP | Assume p, derive q, conclude p ⊃ q |
| Indirect Proof | IP | Assume p, derive contradiction (⊥ or q · ~q), conclude ~p (or vice versa) |

**Note**: IP handles both directions:
- Assume `p`, derive contradiction → conclude `~p`
- Assume `~p`, derive contradiction → conclude `p`

A contradiction can be either `⊥` or a conjunction like `A · ~A`.

---

## Project Structure

```
logic-proof-trainer/
├── src-tauri/                       # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── lib.rs                   # Command registration
│       ├── commands.rs              # 22 IPC command handlers
│       ├── models/
│       │   ├── formula.rs           # Formula AST and parser
│       │   ├── theorem.rs           # Theorem + Difficulty + Theme
│       │   ├── proof.rs             # Proof, ProofLine, Justification
│       │   ├── scope.rs             # ScopeManager for subproofs
│       │   ├── statistics.rs        # User statistics
│       │   └── rules/
│       │       ├── inference.rs     # 9 inference rules
│       │       ├── equivalence.rs   # 10 equivalence rules
│       │       └── technique.rs     # CP, IP techniques
│       └── services/
│           ├── verifier.rs          # Proof step validation
│           ├── generator.rs         # High-level theorem generation
│           ├── tree_gen.rs          # Backward proof tree construction
│           ├── proof_tree.rs        # ProofNode/ProofTree structures
│           ├── fragments.rs         # 12 composable proof rules
│           ├── truth_table.rs       # 32-bit semantic validation
│           ├── proof_search.rs      # Difficulty analysis
│           ├── obfuscate_gen.rs     # Equivalence obfuscation
│           ├── dependency.rs        # Line dependency tracking
│           └── storage.rs           # JSON file persistence
├── src/                             # React frontend
│   ├── main.tsx
│   ├── App.tsx                      # Main app + navigation
│   ├── types/
│   │   └── index.ts                 # TypeScript types
│   ├── hooks/
│   │   ├── useProof.ts              # Proof state (Zustand)
│   │   ├── useTheorems.ts           # Theorem state
│   │   ├── usePortfolio.ts          # Portfolio state
│   │   ├── useTheme.ts              # Theme state (dark/high-contrast)
│   │   └── useScratchpad.ts         # Scratchpad state
│   ├── components/
│   │   ├── FormulaDisplay.tsx       # Color-coded bracket rendering
│   │   ├── TheoremList/
│   │   │   ├── TheoremList.tsx      # Theorem browser + generator
│   │   │   └── CustomTheoremModal.tsx # Custom theorem creator UI
│   │   ├── ProofWorkspace/
│   │   │   ├── ProofWorkspace.tsx   # Main proof editor
│   │   │   ├── FitchBox.tsx         # Fitch-style display + drag-drop
│   │   │   ├── ProofLine.tsx        # Individual proof line
│   │   │   ├── RulePalette.tsx      # Rule selection panel
│   │   │   └── FormulaInput.tsx     # Formula input + symbol toolbar
│   │   ├── Scratchpad/
│   │   │   ├── Scratchpad.tsx       # Formula transformation sandbox
│   │   │   └── index.ts             # Export
│   │   ├── Portfolio/
│   │   │   └── Portfolio.tsx        # Completed proofs gallery
│   │   └── Settings/
│   │       └── Settings.tsx         # Theme + preferences
│   └── styles/
│       └── main.css
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Backend (Rust)

### Models

**Formula** (`models/formula.rs`):
```rust
pub enum Formula {
    Atom(String),                        // P, Q, R
    Not(Box<Formula>),                   // ~P
    And(Box<Formula>, Box<Formula>),     // P · Q
    Or(Box<Formula>, Box<Formula>),      // P ∨ Q
    Implies(Box<Formula>, Box<Formula>), // P ⊃ Q
    Biconditional(Box<Formula>, Box<Formula>), // P ≡ Q
    Contradiction,                       // ⊥
}
```

**Theorem** (`models/theorem.rs`):
```rust
pub struct Theorem {
    pub id: String,
    pub premises: Vec<Formula>,
    pub conclusion: Formula,
    pub difficulty: Difficulty,      // Easy, Medium, Hard, Expert
    pub difficulty_value: u8,        // 1-100
    pub theme: Option<Theme>,
    pub name: Option<String>,
    pub is_classic: bool,
}
```

**Proof** (`models/proof.rs`):
```rust
pub struct Proof {
    pub id: String,
    pub theorem: Theorem,
    pub lines: Vec<ProofLine>,
    pub scope_manager: ScopeManager,
    pub is_complete: bool,
}

pub enum Justification {
    Premise,
    Assumption { technique: ProofTechnique },
    Inference { rule: InferenceRule, lines: Vec<usize> },
    Equivalence { rule: EquivalenceRule, line: usize },
    SubproofConclusion { technique, subproof_start, subproof_end },
}
```

### Services

**Verifier** (`services/verifier.rs`):
- Validates proof steps against cited justification
- Checks line accessibility within scopes
- Propagates invalidity to dependent lines

**Generator** (`services/generator.rs`):
- High-level theorem generation orchestrator
- Easy: legacy template-based
- Medium+: obfuscation-based (see `architecture.md`)

**TreeGen** (`services/tree_gen.rs`):
- Backward proof tree construction
- `RequiredTechniques`: tracks CP/CaseSplit/IP requirements
- `ConstructionContext`: premises, assumptions, depth budget
- `ProofTreeGenerator`: main generation algorithm

**ProofTree** (`services/proof_tree.rs`):
- `ProofNode`: Premise | Assumption | Derivation
- `DegenerateProofError`: 15 types of invalid theorems
- Semantic validation via truth tables

**Fragments** (`services/fragments.rs`):
- 12 composable proof rules
- Basic: MP, MT, HS, DS, Simp, Conj, Add, CD
- Nesting: CP, IP, CaseSplit (NegIntro is handled internally as IP)

**TruthTable** (`services/truth_table.rs`):
- 32-bit truth table computation
- `is_tautology()`, `is_contradiction()`
- `entails()`, `forces_cp()`, `forces_case_split()`

**ObfuscateGen** (`services/obfuscate_gen.rs`):
- 3-layer theorem generation (see `architecture.md`)
- Base forms → Atom substitution → Wrap + Transform

**Storage** (`services/storage.rs`):
- JSON persistence to OS data directory
- Portfolio, custom theorems, statistics

---

## Frontend (React/TypeScript)

### Formula Display (`types/index.ts`)

The `formulaToString` function renders formulas with appropriate bracketing for clarity.

**Bracket Rules**:
- **Atoms and contradictions**: Never wrapped
- **Negations**: Chain without parentheses (`~~P`, `~~~Q`), only wrap binary operators inside (`~(P · Q)`)
- **Binary operators** (And, Or, Implies, Biconditional): Always wrapped when they appear as operands of other binary operators

**Examples**:
- `~~P` — Double negation displays without parentheses
- `~~~Q` — Triple negation displays without parentheses
- `~~F . ~~E` — DeMorgan result from `~(~F ∨ ~E)` displays cleanly
- `E ⊃ [~(D ∨ C) ∨ ~C]` — Or consequent is wrapped, but negations inside are not
- `~(A · B)` — Negation handles its own parentheses for the conjunction inside
- `A ⊃ (B ⊃ C)` — Nested implications are wrapped for clarity

### State Management (Zustand)

**useProof**:
- `proof`, `selectedLines`, `isLoading`, `error`, `hint`
- Actions: `createProof`, `applyInferenceRule`, `applyEquivalenceRule`, `openSubproof`, `closeSubproof`, `undoLine`, `getHint`, `reorderProof`

**useTheorems**:
- `classicTheorems`, `customTheorems`, `selectedTheorem`
- Actions: `loadClassicTheorems`, `loadCustomTheorems`, `generateTheorem`, `generateTheoremWithValue`, `selectTheorem`, `saveCustomTheorem`

**usePortfolio**:
- `entries`, `selectedEntry`
- Actions: `loadPortfolio`, `saveToPortfolio`, `deleteEntry`, `updateNotes`

**useTheme**:
- `theme`: 'dark' | 'high-contrast'
- Actions: `setTheme`, `toggleHighContrast`
- Persisted to localStorage

**useScratchpad**:
- `lines`, `selectedLineId`, `availableTransformations`, `copiedFormula`
- Actions: `addFormula`, `addNote`, `applyTransformation`, `selectLine`, `removeLine`, `clearAll`, `copyToProof`

### Components

**FormulaDisplay**: Renders formulas with color-coded brackets. `[]` uses a fixed color, `{}` uses depth-based colors (2-5). Optional bracket lines feature draws connecting lines for `{}` curly brackets only (not `()` or `[]`), alternating above/below the formula for visual clarity. The component clears stale refs on each render to prevent incorrect line connections.

Features:
- **Collapsible brackets**: Click any opening bracket (`(`, `[`, `{`) to collapse its contents to `▸`. Click `▸` or the opening bracket again to expand. Useful for navigating complex nested formulas.
- Collapse state resets when the formula changes
- SVG connector lines are hidden for collapsed brackets and any brackets nested inside collapsed sections

**FitchBox**: Fitch-style proof display with drag-and-drop reordering (@dnd-kit)

**ProofLine / SortableProofLine**: Individual proof line with scope brackets and drag handles

**ProofWorkspace**: Main proof editor with input parsing:
- New format: `Q 1,2 MP`
- Legacy format: `Q //MP 1, 2`
- Subproof opening: `P CP` or `P IP` (simplified) or `P //CP` (legacy)
- Subproof closing (unified parser, extremely forgiving):
  - Technique only (auto-close): `CP`, `IP` (legacy `~I`/`NI` aliases also work)
  - Range + technique (auto-close): `1-15 CP`, `1-15, CP`, `//1-15 CP`, `//1-15, CP`
  - Formula + range + technique: `P > Q 1-15 CP`, `P > Q 1-15, CP`, `P //1-15 CP`
  - Formula + technique: `P > Q CP`, `P > Q //CP`
  - Accepts both `-` and `–` (en-dash) in line ranges

**RulePalette**: Three sections - Inference (9), Equivalence (10), Techniques (3). Supports **auto-apply** behavior:
- **Inference rules**: When lines are selected and you click a rule, the rule auto-applies if the correct number of premises is selected
- **Equivalence rules**: When exactly one line is selected and you click a rule, auto-applies if there's only one possible transformation; if multiple options exist, the first is suggested in the input field

**TheoremList**: Theorem browser with difficulty filter and custom generation (1-100). Includes a "Custom" button that opens a modal for creating custom theorems.

**CustomTheoremModal**: Modal UI for creating custom theorems (arguments) with:
- Optional theorem name
- Dynamic premise list (add/remove premises)
- Conclusion input (required)
- Difficulty selection (easy/medium/hard/expert)
- Symbol palette for entering logical operators
- Real-time formula validation using `parse_formula` backend command
- Custom theorems are saved to `~/.local/share/LogicProofTrainer/theorems/` and persist across sessions

**Scratchpad**: Formula transformation sandbox for experimenting with equivalence rules without affecting the main proof. Users can enter formulas, see all available transformations, apply them to build chains, and copy results to the proof input. Also supports text notes for annotations and reminders.

**Portfolio**: Two-pane view with proof details, notes, retry/delete. Includes **Completed** and **Incomplete** tabs to filter proofs by status. Incomplete proofs can be **resumed** (loads the proof state back into the workspace), while completed proofs can be **retried** (starts fresh from the theorem).

**Settings**: Theme toggle (dark/high-contrast), bracket color legend, collapsible brackets toggle

---

## Tauri Commands

### Theorem Commands
| Command | Parameters | Returns |
|---------|-----------|---------|
| `get_classic_theorems` | - | `Vec<Theorem>` |
| `generate_theorem` | `difficulty` | `Theorem` |
| `generate_theorem_with_value` | `difficulty_value: u8` | `Theorem` |

### Proof Commands
| Command | Parameters | Returns |
|---------|-----------|---------|
| `create_proof` | `theorem` | `Proof` |
| `apply_rule` | `proof, rule_application, formula_str` | `Result<Proof>` |
| `open_subproof` | `proof, technique, assumption_str` | `Result<Proof>` |
| `close_subproof` | `proof, technique, conclusion_str` | `Result<Proof>` |
| `delete_line` | `proof, line_number` | `Result<Proof>` |
| `undo_line` | `proof` | `Proof` |
| `check_proof_complete` | `proof` | `Proof` |
| `get_hint` | `proof` | `String` |
| `parse_formula` | `input` | `Result<Formula>` |
| `get_all_transformations` | `formula_str` | `Result<Vec<TransformationResult>>` |

### Storage Commands
| Command | Parameters | Returns |
|---------|-----------|---------|
| `save_proof` | `proof` | `Result<()>` |
| `load_proofs` | - | `Result<Vec<Proof>>` |
| `get_statistics` | - | `Result<UserStatistics>` |
| `save_custom_theorem` | `theorem` | `Result<()>` |
| `load_custom_theorems` | - | `Result<Vec<Theorem>>` |

### Portfolio Commands
| Command | Parameters | Returns | Notes |
|---------|-----------|---------|-------|
| `save_to_portfolio` | `proof, time_spent_secs?, hints_used` | `Result<PortfolioEntry>` | Accepts complete or incomplete proofs |
| `load_portfolio` | - | `Result<Vec<PortfolioEntry>>` | Sorted by `saved_at` descending |
| `get_portfolio_entry` | `id` | `Result<PortfolioEntry>` | |
| `delete_portfolio_entry` | `id` | `Result<()>` | |
| `update_portfolio_notes` | `id, notes` | `Result<()>` | |

---

## Data Flow

### Applying an Inference Rule
```
1. User selects lines [1, 3] in ProofWorkspace
2. User types "Q 1,3 MP" OR clicks MP in RulePalette (auto-applies if correct # of lines selected)
3. Frontend calls: invoke('apply_rule', { proof, rule_application, formula_str })
4. Backend validates rule application
5. If valid: new ProofLine added, check completion
6. Frontend receives updated Proof
```

### Applying an Equivalence Rule (Auto-Apply)
```
1. User selects line [2] containing "~~P"
2. User clicks DN in RulePalette
3. Frontend fetches all transformations, finds exactly one DN option: "P"
4. Auto-applies: invoke('apply_rule', { proof, equivalence: {rule: DN, line: 2}, formula_str: "P" })
5. If multiple options existed, first is shown in input field for user confirmation
```

### Opening a Subproof (CP)
```
1. User types "P CP" (or legacy "P //CP") or clicks CP in RulePalette
2. Frontend calls: invoke('open_subproof', { proof, technique, assumption_str })
3. Backend creates ProofScope, adds assumption line at depth+1
4. UI shows indented subproof with assumption
```

### Completing a Proof
```
1. User derives conclusion at depth 0
2. Backend marks proof.is_complete = true
3. Frontend auto-saves to portfolio with timing/hints
```

---

## Building and Running

### Prerequisites
- Node.js 18+
- Rust 1.70+
- Tauri CLI: `npm install -g @tauri-apps/cli`

### Development
```bash
npm install
npm run tauri dev
```

### Production Build
```bash
npm run tauri build
```

### Tests
```bash
cd src-tauri && cargo test
npm run typecheck
```

---

## Difficulty System

| Tier | Value | Atoms | Transforms | Techniques |
|------|-------|-------|------------|------------|
| Easy | 1-25 | 2 | 1-3 | None |
| Medium | 26-45 | 2-3 | 3-6 | CP optional |
| Hard | 46-70 | 3-4 | 6-11 | CP required |
| Expert | 71-85 | 4-5 | 11-16 | CP + CaseSplit |
| Nightmare | 86-95 | 5 | 16-20 | All techniques |
| Marathon | 96-100 | 5 | 20-24 | All + deep substitution |

See `architecture.md` for the 3-layer generation algorithm.

---

## Theme System

Two themes: **Dark** (default) and **High Contrast**

Bracket colors by depth (1-5):
- Dark: blue, orange, teal, purple, magenta
- High Contrast: cyan, yellow, bright green, magenta, orange

Theme persisted in localStorage via `useTheme` hook.

---

## Portfolio System

Both completed and incomplete proofs can be saved to the portfolio:
- **Completed proofs**: Auto-saved when the conclusion is derived at depth 0
- **Incomplete proofs**: Manually saved via the "Save Progress" button in the workspace header

Each entry includes:
- Theorem details
- Complete proof lines (current state)
- Save timestamp (`saved_at` - renamed from `completed_at` for backward compatibility via serde alias)
- Step count, time spent, hints used
- User notes (editable)

The Portfolio view has two tabs:
- **Completed**: Shows finished proofs with:
  - **Review**: Load the proof as-is to view or tweak it
  - **Retry from scratch**: Start a fresh proof from the theorem
- **Incomplete**: Shows in-progress proofs with a "Resume" button to continue where you left off

Incomplete entries are visually distinguished with an orange left border indicator.

Storage locations:
- macOS: `~/Library/Application Support/logic-proof-trainer/`
- Windows: `%APPDATA%/logic-proof-trainer/`
- Linux: `~/.local/share/logic-proof-trainer/`
