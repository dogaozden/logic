# Logic Proof Trainer

A macOS application for learning propositional logic proofs using the natural deduction system.

## Features

- **Fitch-style Proof Display**: Visual nested boxes for subproofs
- **18 Inference Rules**: Including Modus Ponens, Modus Tollens, Hypothetical Syllogism, etc.
- **14 Equivalence Rules**: De Morgan's Laws, Distribution, Contraposition, etc.
- **Proof Techniques**: Conditional Proof (→I), Indirect Proof (IP), Negation Introduction (~I)
- **Real-time Validation**: Steps are validated as you enter them
- **Dependency Tracking**: Invalid steps cascade to dependent steps
- **Theorem Generator**: Generates provable theorems by building proofs backwards
- **Statistics Dashboard**: Track your progress and rule usage

## Requirements

- macOS 14.0+
- Swift 5.9+
- Xcode 15+ (for development)

## Building

```bash
cd LogicProofTrainer
swift build
```

## Running

```bash
swift run
```

Or open the built app from `.build/debug/LogicProofTrainer`.

## Project Structure

```
LogicProofTrainer/
├── Package.swift
├── Sources/LogicProofTrainer/
│   ├── App/                      # Entry point
│   ├── Models/
│   │   ├── Formula/              # AST, parser
│   │   ├── Proof/                # ProofStep, ProofScope
│   │   ├── Rules/                # Inference, Equivalence, ProofTechnique
│   │   ├── Theorem/              # Theorem, Difficulty, Theme
│   │   └── Statistics/           # UserStats, ProofAttempt
│   ├── Services/
│   │   ├── LeanBridge/           # Swift↔Lean communication
│   │   ├── TheoremGenerator/     # Backwards-from-proof generation
│   │   ├── ProofVerifier/        # Step validation
│   │   └── Storage/              # Persistence
│   ├── ViewModels/               # State management
│   └── Views/                    # SwiftUI views
├── LeanPackage/                  # Lean 4 verification (optional)
└── Tests/
```

## Formula Input Syntax

- **Atoms**: Uppercase letters (P, Q, R, Prop1, etc.)
- **Negation**: `~P`
- **Conjunction**: `P & Q` (displays as P · Q)
- **Disjunction**: `P | Q` (displays as P ∨ Q)
- **Conditional**: `P -> Q` (displays as P ⊃ Q)
- **Biconditional**: `P <-> Q` (displays as P ≡ Q)
- **Contradiction**: `_|_` (displays as ⊥)
- **Parentheses**: `(P & Q) -> R`

## Inference Rules

| Abbreviation | Name | Form |
|-------------|------|------|
| ∧I | Conjunction Introduction | P, Q ⊢ P · Q |
| ∧E | Conjunction Elimination | P · Q ⊢ P |
| ∨I | Disjunction Introduction | P ⊢ P ∨ Q |
| ∨E | Disjunction Elimination | P ∨ Q, P → R, Q → R ⊢ R |
| MP | Modus Ponens | P → Q, P ⊢ Q |
| MT | Modus Tollens | P → Q, ~Q ⊢ ~P |
| HS | Hypothetical Syllogism | P → Q, Q → R ⊢ P → R |
| DS | Disjunctive Syllogism | P ∨ Q, ~P ⊢ Q |
| DNI | Double Negation Introduction | P ⊢ ~~P |
| DNE | Double Negation Elimination | ~~P ⊢ P |
| ≡I | Biconditional Introduction | P → Q, Q → P ⊢ P ≡ Q |
| ≡E | Biconditional Elimination | P ≡ Q, P ⊢ Q |
| CD | Constructive Dilemma | P ∨ Q, P → R, Q → S ⊢ R ∨ S |
| R | Reiteration | P ⊢ P |

## Proof Techniques

| Abbreviation | Name | Description |
|-------------|------|-------------|
| →I | Conditional Proof | Assume P, derive Q, conclude P → Q |
| IP | Indirect Proof | Assume ~P, derive ⊥, conclude P |
| ~I | Negation Introduction | Assume P, derive ⊥, conclude ~P |

## Lean Integration (Optional)

The project includes a Lean 4 package for formal verification:

```bash
cd LeanPackage
lake build
```

The Lean server provides:
- Rule verification
- Tautology checking
- Automatic proof search
- Canonical proof generation

## License

MIT
