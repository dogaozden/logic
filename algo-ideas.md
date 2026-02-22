# Algorithm Ideas

Future improvements to the theorem generation pipeline.

---

## Final Depth-Walk Equivalence Pass

**Status:** Not implemented (available as an additive enhancement on top of the positional replacement fix)

**Problem it addresses:** Even with positional replacement, the main obfuscation pipeline applies N random transforms per pass, picking random nodes. With large formulas (Absurd/Cosmic/Mind), many nodes may never get selected, leaving pockets of identical subtrees.

**Idea:** After the main obfuscation pipeline completes, add a final pass that systematically walks every node in the AST. At each node, independently roll a random equivalence transformation and apply it (or skip with some probability). Since equivalence transforms are truth-preserving by definition, no tautology check is needed per-node.

**Why it works:**
- Every node gets visited, guaranteeing no subtree is left untouched
- Each node's transform is chosen independently, so structurally identical subtrees diverge
- The main pipeline handles macro-level complexity (wrapping, substitution, gnarly combos); this pass handles micro-level variety

**Implementation sketch:**
```rust
fn depth_walk_transform(formula: Formula, rng: &mut impl Rng) -> Formula {
    // First, recursively transform children
    let formula = match formula {
        Formula::Not(inner) => Formula::Not(Box::new(depth_walk_transform(*inner, rng))),
        Formula::And(l, r) => Formula::And(
            Box::new(depth_walk_transform(*l, rng)),
            Box::new(depth_walk_transform(*r, rng)),
        ),
        // ... same for Or, Implies, Biconditional
        other => other, // Atoms, Contradiction pass through
    };

    // Then, maybe transform this node (e.g. 50% chance)
    if rng.gen_bool(0.5) {
        let applicable = find_applicable_rules(&formula);
        if !applicable.is_empty() {
            let (_rule, equivalent) = &applicable[rng.gen_range(0..applicable.len())];
            return equivalent.clone();
        }
    }

    formula
}
```

**Considerations:**
- Transform probability (50%? 30%?) controls how aggressively subtrees diverge vs. preserving recognizable structure
- Could be parameterized per difficulty tier (higher tiers = higher transform probability)
- No tautology check needed since equivalence transforms preserve truth tables by definition
- Should still respect the existing DN/Tautology guards (no excessive negation introduction, no Tautology expansion)
- Apply AFTER `simplify_negations()` or integrate negation simplification into the walk
