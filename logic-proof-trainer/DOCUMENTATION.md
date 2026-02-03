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
│   ├── setupTests.ts                # Vitest test setup
│   ├── types/
│   │   ├── index.ts                 # TypeScript types
│   │   └── index.test.ts            # Unit tests for pure functions
│   ├── utils/
│   │   └── proofCommandParser.ts    # Unified proof command parser
│   ├── hooks/
│   │   ├── useProof.ts              # Proof state (Zustand)
│   │   ├── useProof.test.ts         # Unit tests for useProof
│   │   ├── useProofAutoApply.ts     # Auto-apply inference/equivalence
│   │   ├── useProofGoals.ts         # Subproof goal tracking
│   │   ├── useProofTimer.ts         # Proof timing + portfolio save
│   │   ├── useTheorems.ts           # Theorem state
│   │   ├── usePortfolio.ts          # Portfolio state
│   │   ├── useTheme.ts              # Theme state (dark/high-contrast)
│   │   └── useScratchpad.ts         # Scratchpad state
│   ├── components/
│   │   ├── ErrorBoundary.tsx        # Error boundary for app stability
│   │   ├── FormulaDisplay.tsx       # Color-coded bracket rendering
│   │   ├── shared/
│   │   │   └── SymbolToolbar.tsx    # Shared symbol toolbar component
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

**Parser Safety Limits**:
- Maximum input length: 10,000 characters (counted by Unicode characters, not bytes)
- Maximum nesting depth: 100 levels (applies to all constructs: negations, binary operators, and parentheses)
- Atom names: ASCII alphanumeric characters, underscores, and apostrophes only

These limits prevent stack overflow and excessive resource usage from malformed input.

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

**useProof** (main proof state):
- State: `proof`, `selectedLines`, `isLoading`, `error`, `hint`
- Actions: `createProof`, `applyInferenceRule`, `applyEquivalenceRule`, `openSubproof`, `closeSubproof`, `undoLine`, `getHint`, `reorderProof`, `renameProof`

**useProofAutoApply** (auto-apply logic):
- Automatically applies inference rules when correct number of premises selected
- Automatically applies equivalence rules when single transformation available
- Uses race condition guard (`pendingAutoApplyRef`) to prevent concurrent operations

**useProofGoals** (subproof goals):
- Tracks user-defined goals for each subproof
- Prompts for goal when new subproof opened

**useProofTimer** (timing + portfolio):
- Tracks time spent on proof
- Counts hints used
- Auto-saves completed proofs to portfolio

**useTheorems**:
- `customTheorems`, `selectedTheorem`
- `CURATED_EXAMPLES`: Static examples for each difficulty level (Easy: Modus Ponens, Medium: Contraposition, Hard: De Morgan, Expert: Peirce's Law)
- Actions: `loadCustomTheorems`, `generateTheorem`, `generateTheoremWithValue`, `selectTheorem`, `saveCustomTheorem`

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

**ErrorBoundary**: React error boundary component that catches JavaScript errors anywhere in the component tree. Displays a fallback UI with error details and a "Try Again" button that reloads the page. Wraps the entire application in App.tsx to provide global error handling and prevent white-screen crashes.

**SymbolToolbar**: Shared component used across FormulaInput, CustomTheoremModal, and Scratchpad for consistent symbol input. Features:
- Displays logic symbols: ~, ·, ∨, ⊃, ≡, ⊥, (, )
- Displays atom buttons: P, Q, R, S, T
- Supports compact mode for smaller spaces (used in Scratchpad)
- Optional `includeAtoms` prop to hide atom buttons when not needed
- Reduces code duplication and ensures consistent UX

**FormulaDisplay**: Renders formulas with color-coded brackets. `[]` uses a fixed color, `{}` uses depth-based colors (2-5). Optional bracket lines feature draws connecting lines for `{}` curly brackets only (not `()` or `[]`), alternating above/below the formula for visual clarity. The component clears stale refs on each render to prevent incorrect line connections.

Features:
- **Collapsible brackets**: Click any opening bracket (`(`, `[`, `{`) to collapse its contents to `▸`. Click `▸` or the opening bracket again to expand. Useful for navigating complex nested formulas.
- Collapse state resets when the formula changes
- SVG connector lines are hidden for collapsed brackets and any brackets nested inside collapsed sections

**FitchBox**: Fitch-style proof display with drag-and-drop reordering (@dnd-kit)

**ProofLine / SortableProofLine**: Individual proof line with scope brackets and drag handles

**ProofWorkspace**: Main proof editor with unified input parsing:

**Inference/Equivalence Rules:**
- `Q 1,2 MP` — Apply MP to lines 1,2, derive Q
- `Q 1 2 MP` — Same, with spaces instead of commas
- `~~P 3 DN` — Apply DN to line 3, derive ~~P
- `MP 1,2` — Apply MP to lines 1,2 (auto-derive formula)
- `Q //1, 2, MP` — Legacy format with //

**Subproof Opening:**
- `P CP` — Open CP subproof assuming P
- `~Q IP` — Open IP subproof assuming ~Q

**Subproof Closing:**
- `P > Q 2-5 CP` — Close CP with formula, line range 2-5
- `P v Q 2-5 IP` — Close IP with formula containing disjunction
- `2-5 CP` — Auto-close CP with line range
- `CP` or `IP` — Auto-close with auto-detected lines and formula
- Accepts both `-` and `–` (en-dash) in line ranges
- Legacy aliases: `~I`, `NI` map to IP

**RulePalette**: Three sections - Inference (9), Equivalence (10), Techniques (3). Supports **auto-apply** behavior:
- **Inference rules**: When lines are selected and you click a rule, the rule auto-applies if the correct number of premises is selected
- **Equivalence rules**: When exactly one line is selected and you click a rule, auto-applies if there's only one possible transformation; if multiple options exist, the first is suggested in the input field

**TheoremList**: Minimal theorem panel with:
- **Difficulty Selector**: 4 buttons (Easy, Medium, Hard, Expert)
- **Example Preview**: Shows a curated static example for the selected difficulty level
- **Generate New**: Generates a random theorem at selected difficulty AND auto-starts the proof
- **Custom**: Opens CustomTheoremModal to create a custom theorem (also auto-starts proof)

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
| `generate_theorem_with_value` | `difficulty_value: u8 (1-100)` | `Result<Theorem>` |

Note: `generate_theorem_with_value` validates that `difficulty_value` is between 1 and 100 inclusive, returning an error otherwise.

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
| `delete_portfolio_entry` | `id` | `Result<()>` | Returns error if entry not found |
| `update_portfolio_notes` | `id, notes` | `Result<()>` | |
| `rename_portfolio_entry` | `id, name` | `Result<()>` | |

Note: All portfolio commands validate that `id` is a valid UUID format (alphanumeric with hyphens only) to prevent path traversal attacks.

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
# Backend tests (209 tests total)
cd src-tauri && cargo test

# Service layer tests (114 tests across 5 services):
# - verifier.rs: 18 tests (line validation, scope access, rule verification)
# - storage.rs: 21 tests (security/path traversal, CRUD, export/import)
# - generator.rs: 15 tests (config, difficulty mapping, theorem generation)
# - proof_tree.rs: 17 tests (tree structure, validation, pretty printing)
# - truth_table.rs: 43 tests (semantic checks, forcing conditions)

# Frontend tests
npm run test        # Watch mode
npm run test:run    # Single run
npm run test:ui     # Vitest UI

# Type checking
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

The Portfolio view has three columns:
- **Entry List**: Browse completed and incomplete proofs with tabs to filter
- **Entry Detail**: View selected proof details, theorem, stats, and solution
- **Global Notepad**: A persistent notepad for general notes (auto-saves with debounce)

The Portfolio view has two tabs:
- **Completed**: Shows finished proofs with:
  - **Review**: Load the proof as-is to view or tweak it
  - **Retry from scratch**: Start a fresh proof from the theorem
- **Incomplete**: Shows in-progress proofs with a "Resume" button to continue where you left off

Incomplete entries are visually distinguished with an orange left border indicator.

The Global Notepad is stored separately from individual proofs at `global_notes.txt` in the data directory.

Storage locations:
- macOS: `~/Library/Application Support/logic-proof-trainer/`
- Windows: `%APPDATA%/logic-proof-trainer/`
- Linux: `~/.local/share/logic-proof-trainer/`

---

## Security

The application implements several security measures:

### Path Traversal Prevention

All storage operations validate IDs to prevent path traversal attacks:
- IDs must be non-empty
- IDs cannot contain `..`, `/`, or `\` characters
- IDs must consist only of ASCII alphanumeric characters and hyphens (UUID format)
- Invalid IDs result in an error with the message "Invalid ID format"

### Formula Parser Protections

- **Input length limit**: Maximum 10,000 characters (counted by Unicode code points)
- **Global nesting depth limit**: Maximum 100 levels of nesting across all constructs
- **ASCII-only atoms**: Atom names restricted to ASCII alphanumeric, underscore, and apostrophe characters

### Input Validation

- **Difficulty values**: `generate_theorem_with_value` validates that the difficulty is between 1-100
- **Line range validation**: The proof workspace validates that `lineStart <= lineEnd` in subproof close commands
- **Delete verification**: Storage delete operations verify that the file was actually removed, returning an error if the file still exists after deletion
- **String length limits**: Global notes are limited to 10,000 characters, theorem/entry names are limited to 200 characters to prevent memory exhaustion

### Error Handling

- Delete operations now return an error if the target entry doesn't exist, preventing silent failures
- All storage operations provide meaningful error messages for debugging
