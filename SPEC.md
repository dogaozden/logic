# Logic Proof Trainer

A Mac app for practicing propositional logic proofs using the natural deduction system.

## Core Concept

Generate provable theorems of propositional logic for the user to prove. Every generated theorem is guaranteed provable (verified via proof search). Future v2 will add predicate logic.

## Proof System

### Supported Proof Techniques
- **Conditional Proof (→I)**: Assume P, derive Q, conclude P → Q
- **Indirect Proof (¬I)**: Assume ¬P, derive ⊥, conclude P

### Inference Rules
- User will provide the complete rule set
- **Rule Macros**: Users can define custom macros combining multiple rules (e.g., "MQ = MP + MT")
  - Macros are verified for logical soundness before saving
  - Macros persist locally and can be exported/shared
  - Clicking a macro expands to show the underlying primitive rules

### Notation
- ASCII-friendly symbols: `&` (and), `|` (or), `->` (implies), `~` (not), `<->` (iff)

## Theorem Generation

- **Method**: Backwards from proof — generate a valid proof structure first, then present its conclusion as the theorem
- **Difficulty**: Explicit levels 1-5, mapping to proof depth, connective count, and subproof nesting
- **Themes**: Random by default, but user can request rule-focused exercises (e.g., "disjunction elimination practice")

## User Interface

### Proof Construction
- **Hybrid input mode**: Both click-to-select (visual, mouse-driven) and type rule + line refs (keyboard-driven)
- **Keyboard shortcuts**: Fully customizable by user

### Proof Display
- **Fitch-style boxes**: Nested vertical boxes with indentation lines for subproofs
- **Subproof creation**: Selecting →I or ¬I automatically prompts for assumption and opens scope

### Error Handling
- **Invalid steps allowed**: User can make invalid inferences; they're marked in red
- Invalid steps propagate — later steps citing invalid steps are also marked invalid (shows dependency chain)
- User debugs their own proof

### Contradiction Handling
- **Explicit discharge required**: After deriving ⊥, user must explicitly apply ¬I rule citing the ⊥ and assumption line

### Multiple Attempts
- **Branching attempts**: User can create proof "branches" to try different strategies, switch between them

## Verification

When user completes a proof:
1. Step-by-step validation (each line follows from cited premises via stated rule)
2. Independent verification that the theorem is provable
3. Display a canonical/shorter proof for comparison

## Progress & Statistics

Full stats dashboard:
- Theorems solved
- Time per proof
- Accuracy rate
- Streaks
- Rule usage frequency

## Data Storage

Local only (UserDefaults/files) — no cloud sync, no accounts.

## Technical Decisions (TBD)

- Proof search algorithm selection (tableaux vs resolution vs direct ND search)
- Undo/redo system design

## Distribution

Personal use only — not intended for commercial distribution.
