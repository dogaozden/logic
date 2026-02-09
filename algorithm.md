# Theorem Generation Algorithm

A plain-English explanation of how the Logic Proof Trainer generates provable theorems of propositional logic. No code required.

---

## The Goal

Generate formulas that are **guaranteed tautologies** (always true under every truth-value assignment) and are **hard to prove** using the natural deduction system. The difficulty comes from obfuscation: the formula is logically equivalent to something simple, but has been rewritten so many times that the simple structure is buried.

---

## Two Generation Modes

### Mode 1: Template-Based (Easy difficulty only)

Pick one of 9 hand-crafted argument patterns (Modus Ponens, Modus Tollens, etc.), plug in random atom names (P, Q, R...), and present it with premises. Simple and direct — the user can see the argument structure immediately.

### Mode 2: Equivalence Obfuscation (Medium and above)

This is where the interesting algorithm lives. It has **three layers** plus a **multi-pass pipeline**.

---

## The Obfuscation Pipeline

### Layer 1: Pick a Base Argument Form

Start with a simple, valid logical argument. The algorithm maintains a pool of propositional atoms (e.g., P, Q, R, S, T, A, B, C, ...) sized according to the `variables` parameter. The base form picks 3-4 atoms from this pool.

**10 base forms are available, split into two groups:**

Standard forms (1-2 inference steps to prove):
- **Modus Ponens**: P, P ⊃ Q ⊢ Q
- **Modus Tollens**: P ⊃ Q, ~Q ⊢ ~P
- **Hypothetical Syllogism**: P ⊃ Q, Q ⊃ R ⊢ P ⊃ R
- **Disjunctive Syllogism**: P ∨ Q, ~P ⊢ Q
- **Simplification**: P · Q ⊢ P
- **Conjunction**: P, Q ⊢ P · Q
- **Constructive Dilemma**: (P ⊃ Q) · (R ⊃ S), P ∨ R ⊢ Q ∨ S

Complex forms (multi-step proofs, require case analysis or long chains):
- **Constructive Dilemma Full**: P ∨ Q, P ⊃ R, Q ⊃ R ⊢ R
- **Nested CP**: P ⊃ (Q ⊃ R), P, Q ⊢ R
- **Chain4**: P ⊃ Q, Q ⊃ R, R ⊃ S, P ⊢ S

**Which forms are available depends on difficulty:**
- **Simple mode** (Easy through Medium): Standard forms only.
- **Complex mode** (Hard and above): **Only** complex forms — CDFull, NestedCP, Chain4. Standard forms are excluded entirely. This ensures that high-difficulty theorems have genuinely harder proof structures underneath the obfuscation, not just a Simplification buried under layers of rewrites.

### Layer 2: Atom Substitution (Expert+ only)

This layer replaces the 3-4 simple atoms from the base form with randomly-generated complex subformulas, using the **remaining atoms from the pool** as building blocks.

**How it works, step by step:**

1. The base form used 3-4 atoms from the pool (e.g., P, Q, R for a NestedCP)
2. The remaining atoms in the pool become available for substitutions. For Mind difficulty with a 20-atom pool and a 3-atom base form, that's 17 remaining atoms.
3. These remaining atoms are **partitioned evenly** among the base atoms. With 3 base atoms and 17 remaining: the first gets 6, the second gets 6, the third gets 5.
4. Each base atom is replaced with a randomly-generated formula built from its dedicated partition of atoms.

**Example for Mind difficulty:**

```
Pool:       [P, Q, R, S, T, A, B]  (7 atoms)
Base form:  NestedCP uses P, Q, R  (3 atoms)
Remaining:  [S, T, A, B]          (4 atoms)
Partition:  P gets {S, T}
            Q gets {A}
            R gets {B}
```

Each base atom's replacement formula is **guaranteed to use every atom in its partition at least once**. The generator works in two stages:

1. **Seed construction**: All atoms in the partition are shuffled and combined into a balanced binary tree using random connectives (·, ∨, ⊃). For a partition of 2 atoms, this produces a single binary connective joining them. For 3 atoms, a tree with 3 leaves. This guarantees every atom appears exactly once.

2. **Random growth**: After the seed is built, the generator expands random leaf nodes by combining them with additional connectives and atoms from the same partition. The number of growth passes scales with `substitution_depth` (depth × 2 passes). Each expansion preserves the existing leaf, so coverage is never lost.

The result is that replacement formulas vary in depth and structure due to the random growth phase, but always contain every atom from the partition.

Since substitution is uniform (every occurrence of P becomes the same replacement formula), the logical validity is preserved. The formula just got much bigger and uses many more atoms.

### Layer 3: Wrap as Tautology

Take the premises and conclusion from the (now-substituted) argument and combine them into a single formula:

```
(P₁ · P₂ · ... · Pn) ⊃ C
```

This is a tautology if and only if the original argument was valid (which it is, by construction). From this point on, the theorem has no premises — the user must prove the entire conditional using Conditional Proof (CP), Indirect Proof (IP), or equivalence transformations.

### The Multi-Pass Transform Pipeline

This is the core obfuscation engine. For each **pass** (1 to N, where N depends on difficulty):

1. **Safety check**: If the formula has exceeded 10,000 nodes or depth 100, stop early. This means formulas that grow quickly may get fewer passes than the spec requests.

2. **Gnarly combos** (difficulty >= 85 only): Before random transforms, force 2-3 specific hard transformation patterns:
   - Contraposition + DeMorgan (obscures the conditional structure)
   - Implication + Distribution (creates case splits)
   - Exportation + Double Negation (adds structural noise)
   - Equivalence + DeMorgan (expands biconditionals then distributes negation)

   These are applied to random subformulas, not necessarily at the top level.

3. **Random equivalence transforms**: Attempt up to `transforms_per_pass` transformations. For each attempt:
   - List every subformula in the AST with its **positional path** (see below)
   - Shuffle the list and try subformulas in random order
   - For the chosen subformula, find all applicable equivalence rules (DN, DeM, Comm, Assoc, Dist, Contra, Impl, Exp, Equiv)
   - Pick one at random and apply it **at that specific position only**
   - Verify the result is still a tautology (sanity check)
   - If successful, accept the transformation and move on
   - If no applicable rule works on any subformula, the attempt is wasted

   The algorithm allows up to 10x the target number of attempts to account for failed tries (e.g., if `transforms_per_pass` is 24, it tries up to 240 times to land 24 successful transforms).

4. **Negation simplification**: Collapse chains of 4+ negations back down (`~~~~P` -> `P`) to keep formulas readable.

After all passes complete, the formula is a tautology that looks nothing like the original simple argument.

---

## Positional Path Replacement

A critical detail in how transforms are applied. When the algorithm picks a subformula to transform, it identifies the subformula by its **position in the AST** (e.g., "go left, then right, then into the negation"), not by its **structure** (e.g., "find any subtree that looks like `~(A ∨ B)`").

**Why this matters:** Large formulas often contain many structurally-identical subtrees — especially after atom substitution, where the same base atom (appearing multiple times in the base form) gets the same replacement formula everywhere. If you match by structure, transforming one copy transforms ALL copies simultaneously — they stay in lockstep and never diverge. With positional replacement, each copy is an independent node that can be transformed (or not) independently. Over many passes, identical subtrees naturally diverge, producing varied, non-repetitive output.

Each position is described as a path of steps from the root:
- **Inner**: Go into the operand of a negation (`~X` -> follow into `X`)
- **Left**: Go into the left operand of a binary operator (`X · Y` -> follow into `X`)
- **Right**: Go into the right operand of a binary operator (`X · Y` -> follow into `Y`)

---

## Safety Guards

Several guards prevent the algorithm from producing degenerate output:

- **Tautology rule restriction**: The Tautology equivalence (`P :: P · P` and `P :: P ∨ P`) is only allowed in the contraction direction (merging duplicates), never expansion. Without this, formulas would grow exponentially by duplicating subformulas.
- **Double negation cap**: If a subformula already has 2+ leading negations, Double Negation introduction is blocked to prevent `~~~~~~~~P` buildup.
- **Negation simplification**: After each pass, chains of 4+ negations are collapsed.
- **Node count limit**: 10,000 AST nodes maximum. Formulas that grow too fast hit this cap and stop transforming early (remaining passes are skipped).
- **Depth limit**: 100 levels of nesting maximum.
- **Tautology verification**: After every single transformation, the formula is verified to still be a tautology using truth tables. For <= 5 standard variables (P,Q,R,S,T), this uses a fast 32-bit engine. For 6-20 variables, it uses a dynamic bitvector engine that scales to any variable count.

---

## Difficulty Tiers

Each tier maps to a set of generation parameters:

| Tier | Variables | Passes | Transforms/Pass | Base Complexity | Substitution Depth |
|------|-----------|--------|------------------|-----------------|-------------------|
| Easy | 2 | 1 | 2 | Simple | 0 |
| Medium | 3 | 1 | 5 | Simple | 0 |
| Hard | 4 | 1 | 10 | Complex | 0 |
| Expert | 5 | 1 | 15 | Complex | 2 |
| Nightmare | 5 | 2 | 12 | Complex | 3 |
| Marathon | 5 | 3 | 15 | Complex | 4 |
| Absurd | 6 | 5 | 20 | Complex | 4 |
| Cosmic | 7 | 10 | 20 | Complex | 4 |
| Mind | 7 | 20 | 24 | Complex | 4 |

**What each parameter does:**

- **Variables**: Size of the atom pool. The base form uses 3-4 atoms; the rest become ingredients for atom substitution. With guaranteed coverage, every remaining atom appears in the final formula. Kept low (2-7) because more atoms spread the formula thinner and make truth table verification slower (O(2^n)), without adding proof difficulty. The real difficulty comes from obfuscation depth, not atom count.

- **Passes**: How many times the transform pipeline runs. Each pass applies a fresh round of equivalence rewrites. More passes = more obfuscation layers stacked on top of each other.

- **Transforms/Pass**: How many individual equivalence rewrites are attempted per pass. More transforms = more obfuscation per pass. The algorithm tries up to 10x this number of attempts to account for failed applications.

- **Base Complexity**: Simple uses all 7 standard argument forms (1-2 step proofs underneath). Complex uses **only** the 3 complex forms — CDFull, NestedCP, Chain4 — which require multi-step proofs with case analysis or long inference chains. This is the primary control over the real proof difficulty hidden under the obfuscation.

- **Substitution Depth**: Controls the complexity of replacement formulas. Depth 0 means no substitution (atoms stay as-is). Higher depth means more random growth passes are applied to the seed formula (depth × 2 passes), producing deeper and more complex trees. All atoms in each partition are guaranteed to appear regardless of depth.

---

## What Makes a Theorem Hard?

There are two independent dimensions of difficulty:

1. **Structural difficulty** (base form): The minimum number of inference steps needed to prove the theorem, regardless of how it looks. A Chain4 base requires a chain of 4 implications to be resolved. A CDFull base requires case analysis on a disjunction. This is controlled by `base_complexity`. Note: after wrapping as a tautology and obfuscation, the actual proof also requires CP/IP scaffolding and equivalence steps to simplify the formula — the base form just sets the floor on inference complexity.

2. **Recognition difficulty** (obfuscation): How hard it is to *recognize* the underlying structure through the equivalence rewrites. Even a CDFull base buried under 20 passes of DeMorgan, Distribution, and Contraposition becomes extremely hard to recognize. The solver must apply many equivalence rules to simplify the formula before the underlying inference pattern becomes visible. This is controlled by `passes`, `transforms_per_pass`, and `substitution_depth`.

The highest tiers (Absurd through Mind) maximize both: complex base forms with heavy obfuscation across many passes with deep substitutions.

---

## Sources of Size Variance Within a Tier

Even with identical difficulty specs, two theorems from the same tier can differ significantly in formula length. The main causes:

1. **Base form selection**: CDFull (3 premises) vs Chain4 (4 premises) produce different starting sizes.

2. **Substitution randomness**: All partition atoms are guaranteed to appear, but the random growth phase adds variable depth and structure. With 3-4 atoms being substituted, each getting a differently-shaped replacement tree, the cumulative effect can be large.

3. **Transform rule selection**: Some equivalence rules expand formulas (Distribution duplicates a subformula), while others are size-neutral (Commutation, Association). A theorem that randomly hits Distribution repeatedly grows much faster.

4. **Safety bound cutoff**: Formulas that expand quickly hit the 10,000-node limit and stop transforming early, while smaller formulas complete all passes. This creates a ceiling effect where large formulas are capped but small ones aren't boosted.

---

## Correctness Guarantee

Every generated theorem is guaranteed to be a tautology because:

1. The base argument form is valid by construction (textbook inference rules)
2. Atom substitution preserves validity (uniform substitution theorem)
3. Wrapping as `(premises) ⊃ conclusion` is a tautology iff the argument is valid
4. Every equivalence transform preserves truth values (that's what "equivalence" means)
5. Every transform is verified against the truth table engine as a sanity check
6. The final formula is verified as a tautology before being returned

If any step produces a non-tautology (which would indicate a bug), the assertion fails and the theorem is rejected.
