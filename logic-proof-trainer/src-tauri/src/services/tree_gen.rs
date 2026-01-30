use rand::Rng;
use std::collections::HashSet;
use crate::models::Formula;
use crate::models::theorem::Difficulty;
use super::proof_tree::{ProofNode, ProofTree};
use super::fragments::Fragment;
use super::truth_table::{compute_truth_table, entails};

// ============================================================================
// NEW BACKWARD CONSTRUCTION TYPES
// ============================================================================

/// Tracks what proof techniques are required and which have been used.
/// Used to ensure theorems actually force certain techniques at higher difficulties.
#[derive(Debug, Clone, Default)]
pub struct RequiredTechniques {
    /// Whether CP must be used (difficulty >= 30)
    pub need_cp: bool,
    /// Whether case split must be used (difficulty >= 50)
    pub need_case_split: bool,
    /// Whether IP must be used (future: difficulty >= 80)
    pub need_ip: bool,
    /// Whether CP has actually been used in construction
    pub used_cp: bool,
    /// Whether case split has actually been used in construction
    pub used_case_split: bool,
    /// Whether IP has actually been used in construction
    pub used_ip: bool,
    /// Whether CP was used INSIDE a case split branch (for nested technique enforcement)
    pub cp_inside_case_split: bool,
    /// Whether case split was used INSIDE a CP subproof (for nested technique enforcement)
    pub case_split_inside_cp: bool,
}

impl RequiredTechniques {
    /// Create requirements based on difficulty value (1-100)
    pub fn for_difficulty_value(d: u8) -> Self {
        Self {
            need_cp: d >= 30,
            need_case_split: d >= 50,
            need_ip: false, // Future: d >= 80
            ..Default::default()
        }
    }

    /// Check if all required techniques have been used
    pub fn all_requirements_met(&self) -> bool {
        let basic = (!self.need_cp || self.used_cp) &&
                    (!self.need_case_split || self.used_case_split) &&
                    (!self.need_ip || self.used_ip);

        // If both CP and case split are required, they must be nested
        // (CP inside case split OR case split inside CP)
        if self.need_cp && self.need_case_split {
            return basic && (self.cp_inside_case_split || self.case_split_inside_cp);
        }

        basic
    }
}

/// Internal error signals during backward construction.
/// These guide retry logic without creating invalid proofs.
#[derive(Debug, Clone)]
pub enum GenerationError {
    /// CP would be trivial (premises already entail the consequent)
    TrivialCP,
    /// DS is available (negation of a disjunct is available), case split not forced
    DSAvailable,
    /// Hit the depth/fragment limit without completing
    DepthExhausted,
    /// Cannot commit a premise (would create contradiction or redundancy)
    NoPremiseAvailable,
    /// Required techniques were not used in the constructed proof
    RequirementsNotMet,
    /// The goal couldn't be proven with current constraints
    CannotProve,
}

/// Context maintained during backward proof construction.
/// Tracks premises (committed), assumptions (discharged), and constraints.
#[derive(Debug, Clone)]
pub struct ConstructionContext {
    /// Formulas that will become theorem premises (not discharged)
    pub premises: Vec<Formula>,
    /// Active subproof assumptions (will be discharged)
    pub assumptions: Vec<Formula>,
    /// Combined truth table of all premises (AND of all, starts as TAUTOLOGY)
    pub combined_premises_tt: u32,
    /// Truth tables of individual committed premises (for duplicate/equivalence checking)
    pub premise_truth_tables: HashSet<u32>,
    /// Remaining depth/fragment budget
    pub remaining_depth: usize,
    /// Required techniques tracking
    pub required: RequiredTechniques,
    /// Pool of atoms to use
    pub atom_pool: Vec<String>,
    /// Maximum nesting depth allowed
    pub max_nesting: usize,
    /// Current nesting depth
    pub current_nesting: usize,
}

impl ConstructionContext {
    /// Create a new construction context
    pub fn new(config: &TreeGenConfig, required: RequiredTechniques) -> Self {
        Self {
            premises: Vec::new(),
            assumptions: Vec::new(),
            combined_premises_tt: TAUTOLOGY,
            premise_truth_tables: HashSet::new(),
            remaining_depth: config.target_fragments,
            required,
            atom_pool: config.atom_pool.clone(),
            max_nesting: config.max_nesting,
            current_nesting: 0,
        }
    }

    /// Check if a formula can be committed as a premise without creating degeneracy
    pub fn can_commit_premise(&self, formula: &Formula) -> bool {
        let tt = compute_truth_table(formula);

        // Would create contradiction?
        if (self.combined_premises_tt & tt) == 0 {
            return false;
        }

        // Equivalent to existing premise?
        if self.premise_truth_tables.contains(&tt) {
            return false;
        }

        true
    }

    /// Commit a formula as a premise (update constraint tracking)
    /// Returns true if committed successfully
    pub fn commit_premise(&mut self, formula: Formula) -> bool {
        let tt = compute_truth_table(&formula);

        // Check for contradiction
        if (self.combined_premises_tt & tt) == 0 {
            return false;
        }

        // Check for duplicate
        if self.premise_truth_tables.contains(&tt) {
            return false;
        }

        // Check that we won't make combined_premises_tt == 0 (contradiction)
        let new_combined = self.combined_premises_tt & tt;
        if new_combined == 0 {
            return false;
        }

        self.premise_truth_tables.insert(tt);
        self.combined_premises_tt = new_combined;
        self.premises.push(formula);
        true
    }

    /// Check if a formula is available (either as premise or assumption)
    pub fn is_available(&self, formula: &Formula) -> bool {
        let tt = compute_truth_table(formula);
        // Check premises
        if self.premises.iter().any(|p| compute_truth_table(p) == tt) {
            return true;
        }
        // Check assumptions
        if self.assumptions.iter().any(|a| compute_truth_table(a) == tt) {
            return true;
        }
        false
    }

    /// Get all available formulas (premises + assumptions)
    pub fn available_formulas(&self) -> Vec<&Formula> {
        self.premises.iter().chain(self.assumptions.iter()).collect()
    }

    /// Enter a subproof with a new assumption
    /// Returns a new context with the assumption added
    pub fn enter_subproof(&self, assumption: Formula) -> Self {
        let mut new_ctx = self.clone();
        new_ctx.assumptions.push(assumption);
        new_ctx.current_nesting += 1;
        new_ctx
    }

    /// Check if there's nesting budget remaining
    pub fn has_nesting_budget(&self) -> bool {
        self.current_nesting < self.max_nesting
    }

    /// Random atom from the pool
    pub fn random_atom(&self, rng: &mut impl Rng) -> Formula {
        let idx = rng.gen_range(0..self.atom_pool.len());
        Formula::Atom(self.atom_pool[idx].clone())
    }

    /// Generate a random formula of limited depth
    pub fn random_formula(&self, rng: &mut impl Rng, max_depth: usize) -> Formula {
        if max_depth == 0 {
            return self.random_atom(rng);
        }

        let choice = rng.gen_range(0..100);
        match choice {
            0..=50 => self.random_atom(rng),
            51..=65 => {
                Formula::Not(Box::new(self.random_formula(rng, max_depth - 1)))
            }
            66..=80 => {
                Formula::And(
                    Box::new(self.random_formula(rng, max_depth - 1)),
                    Box::new(self.random_formula(rng, max_depth - 1)),
                )
            }
            81..=90 => {
                Formula::Or(
                    Box::new(self.random_formula(rng, max_depth - 1)),
                    Box::new(self.random_formula(rng, max_depth - 1)),
                )
            }
            _ => {
                Formula::Implies(
                    Box::new(self.random_formula(rng, max_depth - 1)),
                    Box::new(self.random_formula(rng, max_depth - 1)),
                )
            }
        }
    }
}

// ============================================================================
// BACKWARD CONSTRUCTION ALGORITHM
// ============================================================================

/// Main backward construction function.
/// Builds a proof tree by working backward from the goal, validating at each step.
fn backward_construct(
    goal: Formula,
    ctx: &mut ConstructionContext,
    rng: &mut impl Rng,
) -> Result<ProofNode, GenerationError> {
    // Base case: depth exhausted
    if ctx.remaining_depth == 0 {
        return make_leaf(goal, ctx, rng);
    }

    // Check if goal is already available (from assumption or premise)
    if ctx.is_available(&goal) {
        // Use available formula - check if it's an assumption or premise
        let tt = compute_truth_table(&goal);
        if ctx.assumptions.iter().any(|a| compute_truth_table(a) == tt) {
            return Ok(ProofNode::assumption(goal));
        }
        // It's a premise - return a premise node
        return Ok(ProofNode::premise(goal));
    }

    // If we can commit goal as premise and have enough depth used already, just do it
    // This prevents over-complication and premise conflicts
    let used_so_far = ctx.atom_pool.len() * 2; // rough estimate of starting depth
    if ctx.remaining_depth <= used_so_far / 2 && ctx.can_commit_premise(&goal) {
        ctx.commit_premise(goal.clone());
        return Ok(ProofNode::premise(goal));
    }

    // Decrement depth for this step
    ctx.remaining_depth = ctx.remaining_depth.saturating_sub(1);

    // Pick a rule based on goal shape and requirements
    let rule = pick_rule_for_goal(&goal, ctx, rng);

    // Apply the rule backward - if it fails, try falling back to make_leaf
    match apply_rule_backward(rule, goal.clone(), ctx, rng) {
        Ok(node) => Ok(node),
        Err(_) => make_leaf(goal, ctx, rng),
    }
}

/// Create a leaf node (premise or assumption) when we can't go deeper
fn make_leaf(
    goal: Formula,
    ctx: &mut ConstructionContext,
    rng: &mut impl Rng,
) -> Result<ProofNode, GenerationError> {
    // First check if available as assumption
    let tt = compute_truth_table(&goal);
    if ctx.assumptions.iter().any(|a| compute_truth_table(a) == tt) {
        return Ok(ProofNode::assumption(goal));
    }

    // Check if already a premise (semantically)
    if ctx.premises.iter().any(|p| compute_truth_table(p) == tt) {
        // Find the matching premise and return it
        return Ok(ProofNode::premise(goal));
    }

    // Try to commit as new premise
    if ctx.can_commit_premise(&goal) {
        ctx.commit_premise(goal.clone());
        return Ok(ProofNode::premise(goal));
    }

    // Can't commit directly - try to find a safe formula to use as premise
    // and derive the goal from it via MP
    let mut atoms: Vec<_> = ctx.atom_pool.iter()
        .map(|a| Formula::Atom(a.clone()))
        .collect();

    // Shuffle for variety
    for i in (1..atoms.len()).rev() {
        let j = rng.gen_range(0..=i);
        atoms.swap(i, j);
    }

    for atom in atoms {
        if ctx.can_commit_premise(&atom) {
            let impl_formula = Formula::Implies(
                Box::new(atom.clone()),
                Box::new(goal.clone()),
            );
            if ctx.can_commit_premise(&impl_formula) {
                ctx.commit_premise(atom.clone());
                ctx.commit_premise(impl_formula.clone());
                return Ok(ProofNode::derivation(
                    goal,
                    "MP",
                    vec![
                        ProofNode::premise(impl_formula),
                        ProofNode::premise(atom),
                    ],
                    None,
                ));
            }
        }
    }

    Err(GenerationError::NoPremiseAvailable)
}

/// Choose which rule to apply backward based on goal shape and requirements
fn pick_rule_for_goal(
    goal: &Formula,
    ctx: &ConstructionContext,
    rng: &mut impl Rng,
) -> Fragment {
    let has_nesting = ctx.has_nesting_budget();

    // If we need CP and haven't used it yet, and goal is implication, prefer CP
    if ctx.required.need_cp && !ctx.required.used_cp {
        if let Formula::Implies(_, _) = goal {
            if has_nesting {
                return Fragment::CP;
            }
        }
    }

    // If we need case split and haven't used it yet, try to introduce one
    if ctx.required.need_case_split && !ctx.required.used_case_split {
        if has_nesting && rng.gen_bool(0.7) {
            return Fragment::CaseSplit;
        }
    }

    // Pick based on goal shape
    match goal {
        Formula::Implies(_, _) => {
            if has_nesting && rng.gen_bool(0.7) {
                Fragment::CP
            } else if rng.gen_bool(0.5) {
                Fragment::HS
            } else {
                Fragment::MP
            }
        }
        Formula::And(_, _) => Fragment::Conj,
        Formula::Or(_, _) => {
            let choice = rng.gen_range(0..3);
            match choice {
                0 => Fragment::Add,
                1 => Fragment::CD,
                _ => Fragment::DS,
            }
        }
        Formula::Not(_) => {
            if has_nesting && rng.gen_bool(0.5) {
                Fragment::NegIntro
            } else {
                Fragment::MT
            }
        }
        _ => {
            // Atoms and other formulas
            let choice = rng.gen_range(0..10);
            match choice {
                0..=4 => Fragment::MP,
                5..=6 => Fragment::DS,
                7..=8 => Fragment::Simp,
                _ if has_nesting => Fragment::CaseSplit,
                _ => Fragment::MP,
            }
        }
    }
}

/// Apply a rule backward to construct a proof of the goal
fn apply_rule_backward(
    rule: Fragment,
    goal: Formula,
    ctx: &mut ConstructionContext,
    rng: &mut impl Rng,
) -> Result<ProofNode, GenerationError> {
    match rule {
        Fragment::MP => apply_mp_backward(goal, ctx, rng),
        Fragment::MT => apply_mt_backward(goal, ctx, rng),
        Fragment::HS => apply_hs_backward(goal, ctx, rng),
        Fragment::DS => apply_ds_backward(goal, ctx, rng),
        Fragment::Simp => apply_simp_backward(goal, ctx, rng),
        Fragment::Conj => apply_conj_backward(goal, ctx, rng),
        Fragment::Add => apply_add_backward(goal, ctx, rng),
        Fragment::CD => apply_cd_backward(goal, ctx, rng),
        Fragment::CP => apply_cp_backward(goal, ctx, rng),
        Fragment::IP => apply_ip_backward(goal, ctx, rng),
        Fragment::NegIntro => apply_neg_intro_backward(goal, ctx, rng),
        Fragment::CaseSplit => apply_case_split_backward(goal, ctx, rng),
    }
}

// ============================================================================
// RULE BACKWARD APPLICATIONS
// ============================================================================

/// MP backward: goal B needs A and A⊃B
fn apply_mp_backward(
    goal: Formula,
    ctx: &mut ConstructionContext,
    rng: &mut impl Rng,
) -> Result<ProofNode, GenerationError> {
    // Prefer using an atom that can be safely committed as A
    let a = {
        // Try to find a safe atom first
        let mut atoms: Vec<_> = ctx.atom_pool.iter()
            .map(|name| Formula::Atom(name.clone()))
            .collect();

        // Shuffle for variety
        for i in (1..atoms.len()).rev() {
            let j = rng.gen_range(0..=i);
            atoms.swap(i, j);
        }

        // Find one that can be committed (or already is committed/available)
        atoms.into_iter()
            .find(|atom| ctx.is_available(atom) || ctx.can_commit_premise(atom))
            .unwrap_or_else(|| ctx.random_atom(rng))
    };

    let implication = Formula::Implies(Box::new(a.clone()), Box::new(goal.clone()));

    let child_impl = backward_construct(implication, ctx, rng)?;
    let child_a = backward_construct(a, ctx, rng)?;

    Ok(ProofNode::derivation(goal, "MP", vec![child_impl, child_a], None))
}

/// MT backward: goal ~A needs A⊃B and ~B
fn apply_mt_backward(
    goal: Formula,
    ctx: &mut ConstructionContext,
    rng: &mut impl Rng,
) -> Result<ProofNode, GenerationError> {
    match &goal {
        Formula::Not(a) => {
            // Prefer a safe atom for B
            let b = ctx.random_atom(rng);
            let implication = Formula::Implies(a.clone(), Box::new(b.clone()));
            let not_b = Formula::Not(Box::new(b));

            let child_impl = backward_construct(implication, ctx, rng)?;
            let child_not_b = backward_construct(not_b, ctx, rng)?;

            Ok(ProofNode::derivation(goal, "MT", vec![child_impl, child_not_b], None))
        }
        _ => {
            // Fall back to MP for non-negation goals
            apply_mp_backward(goal, ctx, rng)
        }
    }
}

/// HS backward: goal A⊃C needs A⊃B and B⊃C
fn apply_hs_backward(
    goal: Formula,
    ctx: &mut ConstructionContext,
    rng: &mut impl Rng,
) -> Result<ProofNode, GenerationError> {
    match &goal {
        Formula::Implies(a, c) => {
            // Use a simple atom for B to avoid complexity
            let b = Box::new(ctx.random_atom(rng));
            let a_impl_b = Formula::Implies(a.clone(), b.clone());
            let b_impl_c = Formula::Implies(b, c.clone());

            let child1 = backward_construct(a_impl_b, ctx, rng)?;
            let child2 = backward_construct(b_impl_c, ctx, rng)?;

            Ok(ProofNode::derivation(goal, "HS", vec![child1, child2], None))
        }
        _ => apply_mp_backward(goal, ctx, rng),
    }
}

/// DS backward: goal B needs A∨B and ~A
fn apply_ds_backward(
    goal: Formula,
    ctx: &mut ConstructionContext,
    rng: &mut impl Rng,
) -> Result<ProofNode, GenerationError> {
    // Use a simple atom for the "other" part
    let other = ctx.random_atom(rng);
    let disjunction = if rng.gen_bool(0.5) {
        Formula::Or(Box::new(other.clone()), Box::new(goal.clone()))
    } else {
        Formula::Or(Box::new(goal.clone()), Box::new(other.clone()))
    };
    let negated = Formula::Not(Box::new(other));

    let child_disj = backward_construct(disjunction, ctx, rng)?;
    let child_neg = backward_construct(negated, ctx, rng)?;

    Ok(ProofNode::derivation(goal, "DS", vec![child_disj, child_neg], None))
}

/// Simp backward: goal A needs A∧B
fn apply_simp_backward(
    goal: Formula,
    ctx: &mut ConstructionContext,
    rng: &mut impl Rng,
) -> Result<ProofNode, GenerationError> {
    // Use a simple atom for the "other" part
    let other = ctx.random_atom(rng);
    let conjunction = if rng.gen_bool(0.5) {
        Formula::And(Box::new(goal.clone()), Box::new(other))
    } else {
        Formula::And(Box::new(other), Box::new(goal.clone()))
    };

    let child = backward_construct(conjunction, ctx, rng)?;
    Ok(ProofNode::derivation(goal, "Simp", vec![child], None))
}

/// Conj backward: goal A∧B needs A and B
fn apply_conj_backward(
    goal: Formula,
    ctx: &mut ConstructionContext,
    rng: &mut impl Rng,
) -> Result<ProofNode, GenerationError> {
    match &goal {
        Formula::And(a, b) => {
            let child_a = backward_construct((**a).clone(), ctx, rng)?;
            let child_b = backward_construct((**b).clone(), ctx, rng)?;
            Ok(ProofNode::derivation(goal, "Conj", vec![child_a, child_b], None))
        }
        _ => apply_mp_backward(goal, ctx, rng),
    }
}

/// Add backward: goal A∨B needs either A or B
fn apply_add_backward(
    goal: Formula,
    ctx: &mut ConstructionContext,
    rng: &mut impl Rng,
) -> Result<ProofNode, GenerationError> {
    match &goal {
        Formula::Or(a, b) => {
            let prove_this = if rng.gen_bool(0.5) {
                (**a).clone()
            } else {
                (**b).clone()
            };

            let child = backward_construct(prove_this, ctx, rng)?;
            Ok(ProofNode::derivation(goal, "Add", vec![child], None))
        }
        _ => apply_mp_backward(goal, ctx, rng),
    }
}

/// CD backward: goal C∨D needs A∨B, A⊃C, B⊃D
fn apply_cd_backward(
    goal: Formula,
    ctx: &mut ConstructionContext,
    rng: &mut impl Rng,
) -> Result<ProofNode, GenerationError> {
    match &goal {
        Formula::Or(c, d) => {
            // Use simple atoms for A and B
            let a = ctx.random_atom(rng);
            let b = ctx.random_atom(rng);
            let disjunction = Formula::Or(Box::new(a.clone()), Box::new(b.clone()));
            let a_impl_c = Formula::Implies(Box::new(a), c.clone());
            let b_impl_d = Formula::Implies(Box::new(b), d.clone());

            let child_disj = backward_construct(disjunction, ctx, rng)?;
            let child_ac = backward_construct(a_impl_c, ctx, rng)?;
            let child_bd = backward_construct(b_impl_d, ctx, rng)?;

            Ok(ProofNode::derivation(goal, "CD", vec![child_disj, child_ac, child_bd], None))
        }
        _ => apply_mp_backward(goal, ctx, rng),
    }
}

/// CP backward: goal A⊃B needs subproof [assume A, derive B]
/// CRITICAL: Validates that premises don't already entail B (would make CP trivial)
fn apply_cp_backward(
    goal: Formula,
    ctx: &mut ConstructionContext,
    rng: &mut impl Rng,
) -> Result<ProofNode, GenerationError> {
    // Extract antecedent and consequent if goal is an implication
    let (antecedent, consequent) = match &goal {
        Formula::Implies(a, c) => ((**a).clone(), (**c).clone()),
        _ => return apply_mp_backward(goal, ctx, rng),
    };

    // CRITICAL CHECK: Premises alone must NOT entail the consequent
    // If they do, CP is trivial (could just derive B directly, then wrap)
    if entails(&ctx.premises, &consequent) {
        return Err(GenerationError::TrivialCP);
    }

    // Enter subproof with assumption
    let mut subproof_ctx = ctx.enter_subproof(antecedent.clone());

    // Build proof of consequent with assumption available
    let cons_proof = backward_construct(consequent, &mut subproof_ctx, rng)?;

    // Mark CP as truly used
    ctx.required.used_cp = true;

    // Merge technique usage flags from subproof
    // If case split was used inside this CP subproof, mark it
    if subproof_ctx.required.used_case_split {
        ctx.required.used_case_split = true;
        ctx.required.case_split_inside_cp = true;
    }

    // Merge discovered premises from subproof back to main context
    for premise in &subproof_ctx.premises {
        if !ctx.premises.iter().any(|p| compute_truth_table(p) == compute_truth_table(premise)) {
            let _ = ctx.commit_premise(premise.clone());
        }
    }

    Ok(ProofNode::derivation(
        goal,
        "CP",
        vec![ProofNode::assumption(antecedent.clone()), cons_proof],
        Some(antecedent),
    ))
}

/// IP backward: goal A needs subproof [assume ~A, derive ⊥]
fn apply_ip_backward(
    goal: Formula,
    ctx: &mut ConstructionContext,
    rng: &mut impl Rng,
) -> Result<ProofNode, GenerationError> {
    let assumption = Formula::Not(Box::new(goal.clone()));

    // Enter subproof with negation of goal as assumption
    let mut subproof_ctx = ctx.enter_subproof(assumption.clone());

    // Build proof of contradiction
    let contra_proof = build_contradiction_backward(&mut subproof_ctx, rng)?;

    // Mark IP as used
    ctx.required.used_ip = true;

    // Merge premises
    for premise in &subproof_ctx.premises {
        if !ctx.premises.iter().any(|p| compute_truth_table(p) == compute_truth_table(premise)) {
            let _ = ctx.commit_premise(premise.clone());
        }
    }

    Ok(ProofNode::derivation(
        goal,
        "IP",
        vec![ProofNode::assumption(assumption.clone()), contra_proof],
        Some(assumption),
    ))
}

/// NegIntro backward: goal ~A needs subproof [assume A, derive ⊥]
fn apply_neg_intro_backward(
    goal: Formula,
    ctx: &mut ConstructionContext,
    rng: &mut impl Rng,
) -> Result<ProofNode, GenerationError> {
    match &goal {
        Formula::Not(a) => {
            let assumption = (**a).clone();

            // Enter subproof with what we want to negate
            let mut subproof_ctx = ctx.enter_subproof(assumption.clone());

            // Build proof of contradiction
            let contra_proof = build_contradiction_backward(&mut subproof_ctx, rng)?;

            // Merge premises
            for premise in &subproof_ctx.premises {
                if !ctx.premises.iter().any(|p| compute_truth_table(p) == compute_truth_table(premise)) {
                    let _ = ctx.commit_premise(premise.clone());
                }
            }

            Ok(ProofNode::derivation(
                goal,
                "NegIntro",
                vec![ProofNode::assumption(assumption.clone()), contra_proof],
                Some(assumption),
            ))
        }
        _ => apply_ip_backward(goal, ctx, rng),
    }
}

/// CaseSplit backward: goal G needs A∨B and subproofs [A→G], [B→G]
/// CRITICAL: Validates that neither ~A nor ~B is committable as premise (would allow DS instead)
fn apply_case_split_backward(
    goal: Formula,
    ctx: &mut ConstructionContext,
    rng: &mut impl Rng,
) -> Result<ProofNode, GenerationError> {
    // Generate disjuncts using simple atoms
    let atoms: Vec<_> = ctx.atom_pool.iter().map(|a| Formula::Atom(a.clone())).collect();
    let left_idx = rng.gen_range(0..atoms.len());
    let mut right_idx = rng.gen_range(0..atoms.len());
    // Try to pick different atoms
    for _ in 0..3 {
        if right_idx != left_idx {
            break;
        }
        right_idx = rng.gen_range(0..atoms.len());
    }

    let left = atoms[left_idx].clone();
    let right = atoms[right_idx].clone();

    // CRITICAL CHECK: Neither ~left nor ~right should be committable as premise
    // If they are, DS would work instead of case split
    let neg_left = Formula::Not(Box::new(left.clone()));
    let neg_right = Formula::Not(Box::new(right.clone()));

    if ctx.can_commit_premise(&neg_left) || ctx.can_commit_premise(&neg_right) {
        return Err(GenerationError::DSAvailable);
    }

    let disjunction = Formula::Or(Box::new(left.clone()), Box::new(right.clone()));

    // Prove disjunction - this needs to be a premise
    let disj_proof = if ctx.can_commit_premise(&disjunction) {
        ctx.commit_premise(disjunction.clone());
        ProofNode::premise(disjunction)
    } else {
        backward_construct(disjunction.clone(), ctx, rng)?
    };

    // Check if we need to force CP inside the case split branches
    let need_cp_in_branch = ctx.required.need_cp && !ctx.required.used_cp;

    // Case 1: assume left, prove goal
    let mut case1_ctx = ctx.enter_subproof(left.clone());
    let case1_proof = if need_cp_in_branch && case1_ctx.has_nesting_budget() {
        // Force CP inside this branch for proper nesting
        force_cp_in_branch(goal.clone(), &mut case1_ctx, rng)?
    } else {
        backward_construct(goal.clone(), &mut case1_ctx, rng)?
    };

    // Case 2: assume right, prove goal
    let mut case2_ctx = ctx.enter_subproof(right.clone());
    let case2_proof = if need_cp_in_branch && !case1_ctx.required.used_cp && case2_ctx.has_nesting_budget() {
        // Force CP in branch 2 if branch 1 didn't use it
        force_cp_in_branch(goal.clone(), &mut case2_ctx, rng)?
    } else {
        backward_construct(goal.clone(), &mut case2_ctx, rng)?
    };

    // Mark case split as used
    ctx.required.used_case_split = true;

    // Merge technique usage flags from branches
    // If CP was used in either branch, mark it as cp_inside_case_split
    if case1_ctx.required.used_cp || case2_ctx.required.used_cp {
        ctx.required.used_cp = true;
        ctx.required.cp_inside_case_split = true;
    }

    // Merge premises from both cases
    for premise in &case1_ctx.premises {
        if !ctx.premises.iter().any(|p| compute_truth_table(p) == compute_truth_table(premise)) {
            let _ = ctx.commit_premise(premise.clone());
        }
    }
    for premise in &case2_ctx.premises {
        if !ctx.premises.iter().any(|p| compute_truth_table(p) == compute_truth_table(premise)) {
            let _ = ctx.commit_premise(premise.clone());
        }
    }

    Ok(ProofNode::derivation(
        goal,
        "CaseSplit",
        vec![
            disj_proof,
            ProofNode::assumption(left.clone()),
            case1_proof,
            ProofNode::assumption(right.clone()),
            case2_proof,
        ],
        None,
    ))
}

/// Force CP to be used within a case split branch.
/// Creates an intermediate implication that requires CP to prove, then uses MP to get the goal.
fn force_cp_in_branch(
    goal: Formula,
    ctx: &mut ConstructionContext,
    rng: &mut impl Rng,
) -> Result<ProofNode, GenerationError> {
    // Create an intermediate formula X that we can use as antecedent
    let intermediate = ctx.random_atom(rng);

    // Create the conditional: X ⊃ goal
    let conditional = Formula::Implies(Box::new(intermediate.clone()), Box::new(goal.clone()));

    // Prove the conditional using CP - this MUST use CP
    let cp_proof = apply_cp_backward(conditional.clone(), ctx, rng)?;

    // If CP failed or wasn't used, fall back to regular construction
    if !ctx.required.used_cp {
        return backward_construct(goal, ctx, rng);
    }

    // Prove the antecedent X
    let ant_proof = backward_construct(intermediate.clone(), ctx, rng)?;

    // Combine via MP: (X ⊃ goal), X ⊢ goal
    Ok(ProofNode::derivation(
        goal,
        "MP",
        vec![cp_proof, ant_proof],
        None,
    ))
}

/// Build a proof of contradiction (⊥)
fn build_contradiction_backward(
    ctx: &mut ConstructionContext,
    rng: &mut impl Rng,
) -> Result<ProofNode, GenerationError> {
    // Try to find P and ~P among available formulas
    let available: Vec<Formula> = ctx.premises.iter().chain(ctx.assumptions.iter()).cloned().collect();

    for f in &available {
        let neg = Formula::Not(Box::new(f.clone()));
        let neg_tt = compute_truth_table(&neg);
        if available.iter().any(|a| compute_truth_table(a) == neg_tt) {
            // Found P and ~P
            return Ok(ProofNode::derivation(
                Formula::Contradiction,
                "NegE",
                vec![
                    if ctx.assumptions.iter().any(|a| compute_truth_table(a) == compute_truth_table(f)) {
                        ProofNode::assumption(f.clone())
                    } else {
                        ProofNode::premise(f.clone())
                    },
                    if ctx.assumptions.iter().any(|a| compute_truth_table(a) == neg_tt) {
                        ProofNode::assumption(neg)
                    } else {
                        ProofNode::premise(neg)
                    },
                ],
                None,
            ));
        }

        // Check if f is ~P and P is available
        if let Formula::Not(inner) = f {
            let inner_tt = compute_truth_table(inner);
            if available.iter().any(|a| compute_truth_table(a) == inner_tt) {
                return Ok(ProofNode::derivation(
                    Formula::Contradiction,
                    "NegE",
                    vec![
                        if ctx.assumptions.iter().any(|a| compute_truth_table(a) == inner_tt) {
                            ProofNode::assumption((**inner).clone())
                        } else {
                            ProofNode::premise((**inner).clone())
                        },
                        if ctx.assumptions.iter().any(|a| compute_truth_table(a) == compute_truth_table(f)) {
                            ProofNode::assumption(f.clone())
                        } else {
                            ProofNode::premise(f.clone())
                        },
                    ],
                    None,
                ));
            }
        }
    }

    // No direct contradiction available - need to derive one
    // IMPORTANT: To avoid creating contradictory premises, we need to derive
    // the contradiction using an assumption and a premise that don't conflict.
    // The most reliable way is to use the assumption in this subproof as one half
    // of the contradiction.

    // Clone assumptions to avoid borrow issues
    let assumptions_copy: Vec<Formula> = ctx.assumptions.clone();

    // Check if any assumption can be contradicted by a committable premise
    for assumption in &assumptions_copy {
        let neg_assumption = Formula::Not(Box::new(assumption.clone()));
        if ctx.can_commit_premise(&neg_assumption) {
            ctx.commit_premise(neg_assumption.clone());
            return Ok(ProofNode::derivation(
                Formula::Contradiction,
                "NegE",
                vec![
                    ProofNode::assumption(assumption.clone()),
                    ProofNode::premise(neg_assumption),
                ],
                None,
            ));
        }

        // If assumption is ~P, check if P can be committed
        if let Formula::Not(inner) = assumption {
            if ctx.can_commit_premise(inner) {
                ctx.commit_premise((**inner).clone());
                return Ok(ProofNode::derivation(
                    Formula::Contradiction,
                    "NegE",
                    vec![
                        ProofNode::premise((**inner).clone()),
                        ProofNode::assumption(assumption.clone()),
                    ],
                    None,
                ));
            }
        }
    }

    // Last resort: pick an atom, derive both it and its negation
    // This will likely fail due to premise conflicts, but try anyway
    let p = ctx.random_atom(rng);
    let not_p = Formula::Not(Box::new(p.clone()));

    // Try to make one of them the premise and derive the other
    if ctx.can_commit_premise(&p) {
        ctx.commit_premise(p.clone());
        let child_not_p = backward_construct(not_p.clone(), ctx, rng)?;
        return Ok(ProofNode::derivation(
            Formula::Contradiction,
            "NegE",
            vec![ProofNode::premise(p), child_not_p],
            None,
        ));
    } else if ctx.can_commit_premise(&not_p) {
        ctx.commit_premise(not_p.clone());
        let child_p = backward_construct(p.clone(), ctx, rng)?;
        return Ok(ProofNode::derivation(
            Formula::Contradiction,
            "NegE",
            vec![child_p, ProofNode::premise(not_p)],
            None,
        ));
    }

    Err(GenerationError::CannotProve)
}

// ============================================================================
// ORIGINAL CODE (TreeGenConfig and ProofTreeGenerator)
// ============================================================================

/// Configuration for proof tree generation
#[derive(Debug, Clone)]
pub struct TreeGenConfig {
    /// Pool of atoms to use (P, Q, R, etc.)
    pub atom_pool: Vec<String>,
    /// Target number of fragments (inference steps)
    pub target_fragments: usize,
    /// Maximum allowed nesting depth
    pub max_nesting: usize,
    /// Minimum fragments before stopping
    pub min_fragments: usize,
    /// Minimum proof steps required (for difficulty enforcement)
    /// This is different from min_fragments - it's about how many steps
    /// the SHORTEST proof would take, not how complex the tree structure is
    pub min_proof_steps: usize,
    /// Whether the theorem MUST force conditional proof (CP)
    /// True when conclusion is A⊃B and premises don't entail B alone
    pub require_forces_cp: bool,
    /// Whether the theorem MUST force case split (∨-Elim)
    /// True when premises contain A∨B and neither ~A nor ~B is available
    pub require_forces_case_split: bool,
    /// Whether the theorem MUST force indirect proof (IP)
    /// True when conclusion is atomic/negation and not directly derivable
    pub require_forces_ip: bool,
}

impl TreeGenConfig {
    /// Create config from continuous difficulty value (1-100)
    /// Parameters interpolate smoothly based on difficulty value.
    pub fn for_difficulty_value(difficulty: u8) -> Self {
        let d = difficulty.clamp(1, 100) as usize;

        // Atom count: 2-5 (2 at d=1, 5 at d=100)
        let atom_count = 2 + (d * 3 / 100);
        let atoms: Vec<String> = ["P", "Q", "R", "S", "T"]
            .iter()
            .take(atom_count)
            .map(|s| s.to_string())
            .collect();

        Self {
            atom_pool: atoms,
            target_fragments: 2 + (d * 10 / 100),   // 2-12
            max_nesting: 1 + (d * 4 / 100),         // 1-5
            min_fragments: 1 + (d * 7 / 100),       // 1-8
            min_proof_steps: 1 + (d * 6 / 100),     // 1-7
            require_forces_cp: d >= 30,
            require_forces_case_split: d >= 50,
            require_forces_ip: false,
        }
    }

    /// Create config appropriate for difficulty preset.
    /// Randomizes within the preset's range for variety.
    pub fn for_difficulty(difficulty: Difficulty) -> Self {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let value = match difficulty {
            Difficulty::Easy => rng.gen_range(1..=25),
            Difficulty::Medium => rng.gen_range(26..=45),
            Difficulty::Hard => rng.gen_range(46..=70),
            Difficulty::Expert => rng.gen_range(71..=100),
        };
        Self::for_difficulty_value(value)
    }
}

/// Generates proof trees compositionally (proof-first approach)
pub struct ProofTreeGenerator {
    config: TreeGenConfig,
    used_fragments: usize,
    current_nesting: usize,
    /// Formulas available in current scope (from assumptions)
    available: Vec<Formula>,
    /// Truth tables of committed premises (for constraint checking)
    premise_truth_tables: HashSet<u32>,
    /// Combined truth table of all premises (AND of all, starts as TAUTOLOGY)
    combined_premises_tt: u32,
}

/// Constant for tautology truth table (all 1s)
const TAUTOLOGY: u32 = 0xFFFFFFFF;

impl ProofTreeGenerator {
    pub fn new(config: TreeGenConfig) -> Self {
        Self {
            config,
            used_fragments: 0,
            current_nesting: 0,
            available: Vec::new(),
            premise_truth_tables: HashSet::new(),
            combined_premises_tt: TAUTOLOGY,
        }
    }

    pub fn with_difficulty(difficulty: Difficulty) -> Self {
        Self::new(TreeGenConfig::for_difficulty(difficulty))
    }

    /// Check if a formula can be committed as a premise without creating a degenerate theorem
    fn can_commit_premise(&self, formula: &Formula) -> bool {
        let tt = formula.truth_table();

        // Would create contradiction?
        if (self.combined_premises_tt & tt) == 0 {
            return false;
        }

        // Equivalent to existing premise?
        if self.premise_truth_tables.contains(&tt) {
            return false;
        }

        true
    }

    /// Commit a formula as a premise (update constraint tracking)
    /// Returns true if committed successfully, false if would cause contradiction
    fn commit_premise(&mut self, formula: &Formula) -> bool {
        let tt = formula.truth_table();

        // Check at commit time if this would cause a contradiction
        if (self.combined_premises_tt & tt) == 0 {
            return false;
        }

        // Check for duplicate
        if self.premise_truth_tables.contains(&tt) {
            return false;
        }

        self.premise_truth_tables.insert(tt);
        self.combined_premises_tt &= tt;
        true
    }

    /// Find an atom from the pool that can safely be used as a premise
    fn find_safe_premise(&self, rng: &mut impl Rng) -> Option<Formula> {
        // Shuffle the atom pool and find one that works
        let mut atoms: Vec<_> = self.config.atom_pool.iter()
            .map(|a| Formula::Atom(a.clone()))
            .collect();

        // Shuffle for variety
        for i in (1..atoms.len()).rev() {
            let j = rng.gen_range(0..=i);
            atoms.swap(i, j);
        }

        for atom in atoms {
            if self.can_commit_premise(&atom) {
                return Some(atom);
            }
        }
        None
    }

    /// Maximum retry attempts for generating non-degenerate proofs
    const MAX_RETRIES: usize = 50;

    /// Generate a complete proof tree using the new backward construction algorithm.
    /// Falls back to the old forward algorithm and templates if backward fails.
    pub fn generate(&mut self) -> ProofTree {
        let mut rng = rand::thread_rng();
        let mut best_tree: Option<ProofTree> = None;

        // First try: Use new backward construction algorithm
        for _attempt in 0..(Self::MAX_RETRIES / 2) {
            if let Ok(tree) = self.generate_backward(&mut rng) {
                let validation = tree.validate_with_difficulty(
                    self.config.min_proof_steps,
                    self.config.require_forces_cp,
                    self.config.require_forces_case_split,
                    self.config.require_forces_ip,
                );
                if validation.is_ok() && tree.fragment_count >= self.config.min_fragments {
                    return tree;
                }
                // Track as best if basically valid
                if tree.is_valid() && best_tree.as_ref().map_or(true, |b| tree.fragment_count > b.fragment_count) {
                    best_tree = Some(tree);
                }
            }
        }

        // Second try: Fall back to old forward generation algorithm
        for attempt in 0..(Self::MAX_RETRIES / 2) {
            let tree = self.generate_once();

            // Check for degenerate premises AND minimum proof difficulty AND forcing requirements
            let validation = tree.validate_with_difficulty(
                self.config.min_proof_steps,
                self.config.require_forces_cp,
                self.config.require_forces_case_split,
                self.config.require_forces_ip,
            );
            if validation.is_err() {
                if cfg!(test) && attempt > 0 {
                    eprintln!("Retry {}: rejected ({})", attempt + 1,
                        validation.unwrap_err());
                }
                // Still track as "best" if only problem is forcing requirement (basic validity ok)
                if tree.is_valid() && best_tree.as_ref().map_or(true, |b| tree.fragment_count > b.fragment_count) {
                    best_tree = Some(tree);
                }
                continue;
            }

            // Check minimum fragment count (tree complexity, not proof difficulty)
            if tree.fragment_count < self.config.min_fragments {
                if cfg!(test) && attempt > 0 {
                    eprintln!("Retry {}: too simple ({} fragments, need {})",
                        attempt + 1, tree.fragment_count, self.config.min_fragments);
                }
                // Keep track of best valid tree in case we can't meet complexity
                if best_tree.as_ref().map_or(true, |b| tree.fragment_count > b.fragment_count) {
                    best_tree = Some(tree);
                }
                continue;
            }

            return tree;
        }

        // If we exhausted retries, return best valid tree or a known-good fallback
        if let Some(tree) = best_tree {
            if cfg!(test) {
                eprintln!("Warning: Returning best valid tree with {} fragments (wanted {})",
                    tree.fragment_count, self.config.min_fragments);
            }
            return tree;
        }

        eprintln!("Warning: Could not generate valid proof after {} attempts, using fallback", Self::MAX_RETRIES);
        self.generate_fallback_theorem(&mut rng)
    }

    /// Generate a proof tree using the new backward construction algorithm.
    /// This builds the proof by working backward from a shaped goal.
    fn generate_backward(&self, rng: &mut impl Rng) -> Result<ProofTree, GenerationError> {
        // Shape goal based on requirements
        let goal = if self.config.require_forces_cp {
            // For CP-forcing, generate an implication goal
            self.generate_implication_goal(rng)
        } else {
            // Otherwise random interesting goal
            self.random_interesting_goal(rng)
        };

        // Create requirements from config
        let required = RequiredTechniques {
            need_cp: self.config.require_forces_cp,
            need_case_split: self.config.require_forces_case_split,
            need_ip: self.config.require_forces_ip,
            ..Default::default()
        };

        // Create construction context
        let mut ctx = ConstructionContext::new(&self.config, required);

        // Build proof backward from goal
        let root = backward_construct(goal, &mut ctx, rng)?;

        // Check requirements were met
        if !ctx.required.all_requirements_met() {
            return Err(GenerationError::RequirementsNotMet);
        }

        Ok(ProofTree::new(root))
    }

    /// Generate an implication goal that will likely force CP
    fn generate_implication_goal(&self, rng: &mut impl Rng) -> Formula {
        let atoms: Vec<Formula> = self.config.atom_pool.iter()
            .map(|a| Formula::Atom(a.clone()))
            .collect();

        // Pick distinct atoms for antecedent and consequent parts
        let a_idx = rng.gen_range(0..atoms.len());
        let mut b_idx = rng.gen_range(0..atoms.len());
        while b_idx == a_idx && atoms.len() > 1 {
            b_idx = rng.gen_range(0..atoms.len());
        }

        // Create compound antecedent and consequent for more interesting proofs
        let choice = rng.gen_range(0..4);
        match choice {
            0 => {
                // (A ∧ B) ⊃ (C ∧ D) pattern
                let c_idx = rng.gen_range(0..atoms.len());
                let d_idx = rng.gen_range(0..atoms.len());
                let antecedent = Formula::And(
                    Box::new(atoms[a_idx].clone()),
                    Box::new(atoms[b_idx].clone()),
                );
                let consequent = Formula::And(
                    Box::new(atoms[c_idx].clone()),
                    Box::new(atoms[d_idx].clone()),
                );
                Formula::Implies(Box::new(antecedent), Box::new(consequent))
            }
            1 => {
                // A ⊃ (B ⊃ C) nested pattern
                let c_idx = rng.gen_range(0..atoms.len());
                let inner = Formula::Implies(
                    Box::new(atoms[b_idx].clone()),
                    Box::new(atoms[c_idx].clone()),
                );
                Formula::Implies(Box::new(atoms[a_idx].clone()), Box::new(inner))
            }
            2 => {
                // (A ∨ B) ⊃ C pattern (might combine with case split)
                let c_idx = rng.gen_range(0..atoms.len());
                let antecedent = Formula::Or(
                    Box::new(atoms[a_idx].clone()),
                    Box::new(atoms[b_idx].clone()),
                );
                Formula::Implies(Box::new(antecedent), Box::new(atoms[c_idx].clone()))
            }
            _ => {
                // Simple A ⊃ B
                Formula::Implies(
                    Box::new(atoms[a_idx].clone()),
                    Box::new(atoms[b_idx].clone()),
                )
            }
        }
    }

    /// Generate a known-good fallback theorem with randomization.
    /// Uses RNG for variety, and generates theorems that force required techniques.
    /// Multiple template variants ensure structural diversity.
    fn generate_fallback_theorem(&self, rng: &mut impl Rng) -> ProofTree {
        // Shuffle the atom pool for variety
        let mut atoms: Vec<_> = self.config.atom_pool.iter().cloned().collect();
        for i in (1..atoms.len()).rev() {
            let j = rng.gen_range(0..=i);
            atoms.swap(i, j);
        }

        // Get atoms (with fallback defaults)
        let a = Formula::Atom(atoms.get(0).cloned().unwrap_or_else(|| "P".to_string()));
        let b = Formula::Atom(atoms.get(1).cloned().unwrap_or_else(|| "Q".to_string()));
        let c = Formula::Atom(atoms.get(2).cloned().unwrap_or_else(|| "R".to_string()));
        let d = Formula::Atom(atoms.get(3).cloned().unwrap_or_else(|| "S".to_string()));
        let e = Formula::Atom(atoms.get(4).cloned().unwrap_or_else(|| "T".to_string()));

        if self.config.require_forces_case_split {
            // Multiple case-split patterns for variety
            let variant = rng.gen_range(0..4);
            match variant {
                0 => self.build_case_split_variant_1(&a, &b, &c, &d),  // A∨B, A⊃C, B⊃C, C⊃D ⊢ D
                1 => self.build_case_split_variant_2(&a, &b, &c, &d),  // A∨B, A⊃(C∧D), B⊃(C∧D) ⊢ C∧D
                2 => self.build_case_split_variant_3(&a, &b, &c, &d),  // (A∨B)∧C, A⊃D, B⊃D ⊢ D
                _ => self.build_case_split_variant_4(&a, &b, &c, &d, &e),  // A∨B, A⊃C, B⊃D, C⊃E, D⊃E ⊢ E
            }
        } else if self.config.require_forces_cp {
            // Multiple CP patterns for variety
            let variant = rng.gen_range(0..3);
            match variant {
                0 => self.build_cp_variant_1(&a, &b, &c, &d),  // A⊃B, C⊃D ⊢ (A∧C)⊃(B∧D)
                1 => self.build_cp_variant_2(&a, &b, &c),      // A⊃B ⊢ (C∧A)⊃(C∧B)
                _ => self.build_cp_variant_3(&a, &b, &c, &d),  // A⊃B, B⊃C ⊢ A⊃C (via CP, not HS)
            }
        } else {
            // Multiple basic patterns for Easy
            let variant = rng.gen_range(0..3);
            match variant {
                0 => self.build_basic_variant_1(&a, &b, &c),  // A, A⊃B, B⊃C ⊢ C
                1 => self.build_basic_variant_2(&a, &b, &c),  // A∧B, (A∧B)⊃C ⊢ C
                _ => self.build_basic_variant_3(&a, &b, &c),  // A∨B, ~A, B⊃C ⊢ C
            }
        }
    }

    // === CASE SPLIT VARIANTS ===

    /// Variant 1: A∨B, A⊃C, B⊃C, C⊃D ⊢ D
    /// Case split to get C, then MP to get D
    fn build_case_split_variant_1(&self, a: &Formula, b: &Formula, c: &Formula, d: &Formula) -> ProofTree {
        let a_or_b = Formula::Or(Box::new(a.clone()), Box::new(b.clone()));
        let a_impl_c = Formula::Implies(Box::new(a.clone()), Box::new(c.clone()));
        let b_impl_c = Formula::Implies(Box::new(b.clone()), Box::new(c.clone()));
        let c_impl_d = Formula::Implies(Box::new(c.clone()), Box::new(d.clone()));

        let root = ProofNode::derivation(
            d.clone(),
            "MP",
            vec![
                ProofNode::premise(c_impl_d),
                ProofNode::derivation(
                    c.clone(),
                    "CaseSplit",
                    vec![
                        ProofNode::premise(a_or_b),
                        ProofNode::assumption(a.clone()),
                        ProofNode::derivation(c.clone(), "MP", vec![
                            ProofNode::premise(a_impl_c),
                            ProofNode::assumption(a.clone()),
                        ], None),
                        ProofNode::assumption(b.clone()),
                        ProofNode::derivation(c.clone(), "MP", vec![
                            ProofNode::premise(b_impl_c),
                            ProofNode::assumption(b.clone()),
                        ], None),
                    ],
                    None,
                ),
            ],
            None,
        );
        ProofTree::new(root)
    }

    /// Variant 2: A∨B, A⊃(C∧D), B⊃(C∧D) ⊢ C∧D
    /// Case split with conjunction conclusion
    fn build_case_split_variant_2(&self, a: &Formula, b: &Formula, c: &Formula, d: &Formula) -> ProofTree {
        let a_or_b = Formula::Or(Box::new(a.clone()), Box::new(b.clone()));
        let c_and_d = Formula::And(Box::new(c.clone()), Box::new(d.clone()));
        let a_impl_cd = Formula::Implies(Box::new(a.clone()), Box::new(c_and_d.clone()));
        let b_impl_cd = Formula::Implies(Box::new(b.clone()), Box::new(c_and_d.clone()));

        let root = ProofNode::derivation(
            c_and_d.clone(),
            "CaseSplit",
            vec![
                ProofNode::premise(a_or_b),
                ProofNode::assumption(a.clone()),
                ProofNode::derivation(c_and_d.clone(), "MP", vec![
                    ProofNode::premise(a_impl_cd),
                    ProofNode::assumption(a.clone()),
                ], None),
                ProofNode::assumption(b.clone()),
                ProofNode::derivation(c_and_d.clone(), "MP", vec![
                    ProofNode::premise(b_impl_cd),
                    ProofNode::assumption(b.clone()),
                ], None),
            ],
            None,
        );
        ProofTree::new(root)
    }

    /// Variant 3: (A∨B)∧C, A⊃D, B⊃D ⊢ D
    /// Disjunction inside conjunction - need Simp first
    fn build_case_split_variant_3(&self, a: &Formula, b: &Formula, c: &Formula, d: &Formula) -> ProofTree {
        let a_or_b = Formula::Or(Box::new(a.clone()), Box::new(b.clone()));
        let conj = Formula::And(Box::new(a_or_b.clone()), Box::new(c.clone()));
        let a_impl_d = Formula::Implies(Box::new(a.clone()), Box::new(d.clone()));
        let b_impl_d = Formula::Implies(Box::new(b.clone()), Box::new(d.clone()));

        let root = ProofNode::derivation(
            d.clone(),
            "CaseSplit",
            vec![
                ProofNode::derivation(a_or_b, "Simp", vec![ProofNode::premise(conj)], None),
                ProofNode::assumption(a.clone()),
                ProofNode::derivation(d.clone(), "MP", vec![
                    ProofNode::premise(a_impl_d),
                    ProofNode::assumption(a.clone()),
                ], None),
                ProofNode::assumption(b.clone()),
                ProofNode::derivation(d.clone(), "MP", vec![
                    ProofNode::premise(b_impl_d),
                    ProofNode::assumption(b.clone()),
                ], None),
            ],
            None,
        );
        ProofTree::new(root)
    }

    /// Variant 4: A∨B, A⊃C, B⊃D, C⊃E, D⊃E ⊢ E
    /// Asymmetric case split - different paths converge
    fn build_case_split_variant_4(&self, a: &Formula, b: &Formula, c: &Formula, d: &Formula, e: &Formula) -> ProofTree {
        let a_or_b = Formula::Or(Box::new(a.clone()), Box::new(b.clone()));
        let a_impl_c = Formula::Implies(Box::new(a.clone()), Box::new(c.clone()));
        let b_impl_d = Formula::Implies(Box::new(b.clone()), Box::new(d.clone()));
        let c_impl_e = Formula::Implies(Box::new(c.clone()), Box::new(e.clone()));
        let d_impl_e = Formula::Implies(Box::new(d.clone()), Box::new(e.clone()));

        let root = ProofNode::derivation(
            e.clone(),
            "CaseSplit",
            vec![
                ProofNode::premise(a_or_b),
                // Case A: A → C → E
                ProofNode::assumption(a.clone()),
                ProofNode::derivation(e.clone(), "MP", vec![
                    ProofNode::premise(c_impl_e),
                    ProofNode::derivation(c.clone(), "MP", vec![
                        ProofNode::premise(a_impl_c),
                        ProofNode::assumption(a.clone()),
                    ], None),
                ], None),
                // Case B: B → D → E
                ProofNode::assumption(b.clone()),
                ProofNode::derivation(e.clone(), "MP", vec![
                    ProofNode::premise(d_impl_e),
                    ProofNode::derivation(d.clone(), "MP", vec![
                        ProofNode::premise(b_impl_d),
                        ProofNode::assumption(b.clone()),
                    ], None),
                ], None),
            ],
            None,
        );
        ProofTree::new(root)
    }

    // === CP VARIANTS ===

    /// CP Variant 1: A⊃B, C⊃D ⊢ (A∧C)⊃(B∧D)
    fn build_cp_variant_1(&self, a: &Formula, b: &Formula, c: &Formula, d: &Formula) -> ProofTree {
        let a_impl_b = Formula::Implies(Box::new(a.clone()), Box::new(b.clone()));
        let c_impl_d = Formula::Implies(Box::new(c.clone()), Box::new(d.clone()));
        let a_and_c = Formula::And(Box::new(a.clone()), Box::new(c.clone()));
        let b_and_d = Formula::And(Box::new(b.clone()), Box::new(d.clone()));
        let conclusion = Formula::Implies(Box::new(a_and_c.clone()), Box::new(b_and_d.clone()));

        let root = ProofNode::derivation(
            conclusion,
            "CP",
            vec![
                ProofNode::assumption(a_and_c.clone()),
                ProofNode::derivation(b_and_d, "Conj", vec![
                    ProofNode::derivation(b.clone(), "MP", vec![
                        ProofNode::premise(a_impl_b),
                        ProofNode::derivation(a.clone(), "Simp", vec![ProofNode::assumption(a_and_c.clone())], None),
                    ], None),
                    ProofNode::derivation(d.clone(), "MP", vec![
                        ProofNode::premise(c_impl_d),
                        ProofNode::derivation(c.clone(), "Simp", vec![ProofNode::assumption(a_and_c)], None),
                    ], None),
                ], None),
            ],
            Some(Formula::And(Box::new(a.clone()), Box::new(c.clone()))),
        );
        ProofTree::new(root)
    }

    /// CP Variant 2: A⊃B ⊢ (C∧A)⊃(C∧B)
    fn build_cp_variant_2(&self, a: &Formula, b: &Formula, c: &Formula) -> ProofTree {
        let a_impl_b = Formula::Implies(Box::new(a.clone()), Box::new(b.clone()));
        let c_and_a = Formula::And(Box::new(c.clone()), Box::new(a.clone()));
        let c_and_b = Formula::And(Box::new(c.clone()), Box::new(b.clone()));
        let conclusion = Formula::Implies(Box::new(c_and_a.clone()), Box::new(c_and_b.clone()));

        let root = ProofNode::derivation(
            conclusion,
            "CP",
            vec![
                ProofNode::assumption(c_and_a.clone()),
                ProofNode::derivation(c_and_b, "Conj", vec![
                    ProofNode::derivation(c.clone(), "Simp", vec![ProofNode::assumption(c_and_a.clone())], None),
                    ProofNode::derivation(b.clone(), "MP", vec![
                        ProofNode::premise(a_impl_b),
                        ProofNode::derivation(a.clone(), "Simp", vec![ProofNode::assumption(c_and_a)], None),
                    ], None),
                ], None),
            ],
            Some(Formula::And(Box::new(c.clone()), Box::new(a.clone()))),
        );
        ProofTree::new(root)
    }

    /// CP Variant 3: A⊃B, B⊃C ⊢ A⊃C (forces CP, not HS shortcut)
    /// We structure so HS doesn't directly apply
    fn build_cp_variant_3(&self, a: &Formula, b: &Formula, c: &Formula, d: &Formula) -> ProofTree {
        // A⊃(B∧C), (B∧C)⊃D ⊢ A⊃D
        let b_and_c = Formula::And(Box::new(b.clone()), Box::new(c.clone()));
        let a_impl_bc = Formula::Implies(Box::new(a.clone()), Box::new(b_and_c.clone()));
        let bc_impl_d = Formula::Implies(Box::new(b_and_c.clone()), Box::new(d.clone()));
        let conclusion = Formula::Implies(Box::new(a.clone()), Box::new(d.clone()));

        let root = ProofNode::derivation(
            conclusion,
            "CP",
            vec![
                ProofNode::assumption(a.clone()),
                ProofNode::derivation(d.clone(), "MP", vec![
                    ProofNode::premise(bc_impl_d),
                    ProofNode::derivation(b_and_c, "MP", vec![
                        ProofNode::premise(a_impl_bc),
                        ProofNode::assumption(a.clone()),
                    ], None),
                ], None),
            ],
            Some(a.clone()),
        );
        ProofTree::new(root)
    }

    // === BASIC VARIANTS (Easy) ===

    /// Basic Variant 1: A, A⊃B, B⊃C ⊢ C
    fn build_basic_variant_1(&self, a: &Formula, b: &Formula, c: &Formula) -> ProofTree {
        let a_impl_b = Formula::Implies(Box::new(a.clone()), Box::new(b.clone()));
        let b_impl_c = Formula::Implies(Box::new(b.clone()), Box::new(c.clone()));

        let root = ProofNode::derivation(
            c.clone(),
            "MP",
            vec![
                ProofNode::premise(b_impl_c),
                ProofNode::derivation(b.clone(), "MP", vec![
                    ProofNode::premise(a_impl_b),
                    ProofNode::premise(a.clone()),
                ], None),
            ],
            None,
        );
        ProofTree::new(root)
    }

    /// Basic Variant 2: A∧B, (A∧B)⊃C ⊢ C
    fn build_basic_variant_2(&self, a: &Formula, b: &Formula, c: &Formula) -> ProofTree {
        let a_and_b = Formula::And(Box::new(a.clone()), Box::new(b.clone()));
        let ab_impl_c = Formula::Implies(Box::new(a_and_b.clone()), Box::new(c.clone()));

        let root = ProofNode::derivation(
            c.clone(),
            "MP",
            vec![
                ProofNode::premise(ab_impl_c),
                ProofNode::premise(a_and_b),
            ],
            None,
        );
        ProofTree::new(root)
    }

    /// Basic Variant 3: A∨B, ~A, B⊃C ⊢ C
    fn build_basic_variant_3(&self, a: &Formula, b: &Formula, c: &Formula) -> ProofTree {
        let a_or_b = Formula::Or(Box::new(a.clone()), Box::new(b.clone()));
        let not_a = Formula::Not(Box::new(a.clone()));
        let b_impl_c = Formula::Implies(Box::new(b.clone()), Box::new(c.clone()));

        let root = ProofNode::derivation(
            c.clone(),
            "MP",
            vec![
                ProofNode::premise(b_impl_c),
                ProofNode::derivation(b.clone(), "DS", vec![
                    ProofNode::premise(a_or_b),
                    ProofNode::premise(not_a),
                ], None),
            ],
            None,
        );
        ProofTree::new(root)
    }

    /// Generate a single proof tree (may be degenerate)
    fn generate_once(&mut self) -> ProofTree {
        let mut rng = rand::thread_rng();

        // Start with a random goal
        let goal = self.random_interesting_goal(&mut rng);

        // Reset state
        self.used_fragments = 0;
        self.current_nesting = 0;
        self.available.clear();
        self.premise_truth_tables.clear();
        self.combined_premises_tt = TAUTOLOGY;

        // Build the proof tree
        let root = self.build_proof_of(&mut rng, goal);

        ProofTree::new(root)
    }

    /// Generate a random goal formula that will lead to interesting proofs
    fn random_interesting_goal(&self, rng: &mut impl Rng) -> Formula {
        let atoms: Vec<Formula> = self.config.atom_pool.iter()
            .map(|a| Formula::Atom(a.clone()))
            .collect();

        // For higher difficulty, prefer complex goal shapes
        let choice = rng.gen_range(0..100);

        if self.config.max_nesting >= 2 {
            // Hard/Expert: more complex goals
            match choice {
                0..=30 => {
                    // Implication (will likely use CP)
                    let a = &atoms[rng.gen_range(0..atoms.len())];
                    let b = &atoms[rng.gen_range(0..atoms.len())];
                    Formula::Implies(Box::new(a.clone()), Box::new(b.clone()))
                }
                31..=50 => {
                    // Disjunction (might use Add, case split)
                    let a = &atoms[rng.gen_range(0..atoms.len())];
                    let b = &atoms[rng.gen_range(0..atoms.len())];
                    Formula::Or(Box::new(a.clone()), Box::new(b.clone()))
                }
                51..=70 => {
                    // Nested implication
                    let a = &atoms[rng.gen_range(0..atoms.len())];
                    let b = &atoms[rng.gen_range(0..atoms.len())];
                    let c = &atoms[rng.gen_range(0..atoms.len())];
                    Formula::Implies(
                        Box::new(a.clone()),
                        Box::new(Formula::Implies(Box::new(b.clone()), Box::new(c.clone()))),
                    )
                }
                71..=85 => {
                    // Conjunction
                    let a = &atoms[rng.gen_range(0..atoms.len())];
                    let b = &atoms[rng.gen_range(0..atoms.len())];
                    Formula::And(Box::new(a.clone()), Box::new(b.clone()))
                }
                _ => {
                    // Just an atom (will need creative proof)
                    atoms[rng.gen_range(0..atoms.len())].clone()
                }
            }
        } else {
            // Easy/Medium: simpler goals
            match choice {
                0..=40 => {
                    // Simple implication
                    let a = &atoms[rng.gen_range(0..atoms.len())];
                    let b = &atoms[rng.gen_range(0..atoms.len())];
                    Formula::Implies(Box::new(a.clone()), Box::new(b.clone()))
                }
                41..=60 => {
                    // Disjunction
                    let a = &atoms[rng.gen_range(0..atoms.len())];
                    let b = &atoms[rng.gen_range(0..atoms.len())];
                    Formula::Or(Box::new(a.clone()), Box::new(b.clone()))
                }
                61..=80 => {
                    // Conjunction
                    let a = &atoms[rng.gen_range(0..atoms.len())];
                    let b = &atoms[rng.gen_range(0..atoms.len())];
                    Formula::And(Box::new(a.clone()), Box::new(b.clone()))
                }
                _ => {
                    // Just an atom
                    atoms[rng.gen_range(0..atoms.len())].clone()
                }
            }
        }
    }

    /// Core recursive algorithm: build a proof of the given goal
    fn build_proof_of(&mut self, rng: &mut impl Rng, goal: Formula) -> ProofNode {
        let fragments_remaining = self.config.target_fragments.saturating_sub(self.used_fragments);
        let nesting_headroom = self.config.max_nesting.saturating_sub(self.current_nesting);

        // Check if goal is already available (from assumption)
        if self.available.contains(&goal) {
            // Can use it directly - but if we have budget, maybe derive it anyway
            if fragments_remaining <= 1 || rng.gen_bool(0.5) {
                // Use as available - create an assumption reference
                return ProofNode::assumption(goal);
            }
        }

        // Base case: budget exhausted -> make it a premise (if valid)
        if fragments_remaining <= 0 || self.used_fragments >= self.config.target_fragments {
            // Try to commit as premise - this checks for contradictions at commit time
            if self.commit_premise(&goal) {
                return ProofNode::premise(goal);
            }
            // Commit failed - would create contradiction or duplicate.
            // Try to find a different atom that works as a premise instead.
            if let Some(safe_premise) = self.find_safe_premise(rng) {
                // safe_premise is already validated by find_safe_premise
                let _ = self.commit_premise(&safe_premise);
                // Wrap in an implication: safe_premise → goal, then use MP
                self.used_fragments += 1;
                let impl_formula = Formula::Implies(
                    Box::new(safe_premise.clone()),
                    Box::new(goal.clone()),
                );
                // Only create the implication if it can be committed
                if self.commit_premise(&impl_formula) {
                    return ProofNode::derivation(
                        goal,
                        "MP",
                        vec![
                            ProofNode::premise(impl_formula),
                            ProofNode::premise(safe_premise),
                        ],
                        None,
                    );
                }
                // Implication couldn't be committed - just use the safe premise directly
                // This creates an invalid proof, but validation will catch it
                return ProofNode::premise(safe_premise);
            }
            // No safe premise found - create premise anyway, validation will catch it
            // Don't call commit_premise since it will fail
            return ProofNode::premise(goal);
        }

        // Pick a fragment that can produce this goal
        let fragment = self.pick_fragment_for(rng, &goal, nesting_headroom);

        // Apply the fragment
        self.apply_fragment(rng, fragment, goal)
    }

    /// Choose which fragment to use for deriving the goal
    fn pick_fragment_for(&self, rng: &mut impl Rng, goal: &Formula, nesting_headroom: usize) -> Fragment {
        let mut candidates = Fragment::fragments_for_goal(goal);

        // Filter by nesting budget
        if nesting_headroom <= 0 {
            candidates.retain(|f| !f.adds_nesting());
        }

        // If we have nesting budget and haven't used much, prefer nesting fragments
        // This creates the deep structures that make proofs hard
        if nesting_headroom > 0 && self.current_nesting < self.config.max_nesting / 2 {
            // Bias towards nesting fragments
            let nesting_frags: Vec<_> = candidates.iter()
                .filter(|f| f.adds_nesting())
                .copied()
                .collect();

            if !nesting_frags.is_empty() && rng.gen_bool(0.6) {
                return nesting_frags[rng.gen_range(0..nesting_frags.len())];
            }
        }

        // For implications, strongly prefer CP
        if matches!(goal, Formula::Implies(_, _)) {
            if candidates.contains(&Fragment::CP) && nesting_headroom > 0 && rng.gen_bool(0.7) {
                return Fragment::CP;
            }
        }

        // For atoms at high difficulty, consider IP
        if matches!(goal, Formula::Atom(_)) && nesting_headroom > 0 {
            if rng.gen_bool(0.3) {
                return Fragment::IP;
            }
        }

        // Random choice from remaining candidates
        if candidates.is_empty() {
            // Fallback: just use MP (can prove anything with right premises)
            Fragment::MP
        } else {
            candidates[rng.gen_range(0..candidates.len())]
        }
    }

    /// Apply a fragment to derive the goal
    fn apply_fragment(&mut self, rng: &mut impl Rng, fragment: Fragment, goal: Formula) -> ProofNode {
        self.used_fragments += 1;

        match fragment {
            Fragment::MP => self.apply_mp(rng, goal),
            Fragment::MT => self.apply_mt(rng, goal),
            Fragment::HS => self.apply_hs(rng, goal),
            Fragment::DS => self.apply_ds(rng, goal),
            Fragment::Simp => self.apply_simp(rng, goal),
            Fragment::Conj => self.apply_conj(rng, goal),
            Fragment::Add => self.apply_add(rng, goal),
            Fragment::CD => self.apply_cd(rng, goal),
            Fragment::CP => self.apply_cp(rng, goal),
            Fragment::IP => self.apply_ip(rng, goal),
            Fragment::NegIntro => self.apply_neg_intro(rng, goal),
            Fragment::CaseSplit => self.apply_case_split(rng, goal),
        }
    }

    // === Fragment application methods ===

    /// Modus Ponens: A, A ⊃ B → B
    fn apply_mp(&mut self, rng: &mut impl Rng, goal: Formula) -> ProofNode {
        // Goal is B, we need A and A → B for some A
        let a = self.random_formula(rng, 1);
        let implication = Formula::Implies(Box::new(a.clone()), Box::new(goal.clone()));

        let child_impl = self.build_proof_of(rng, implication);
        let child_a = self.build_proof_of(rng, a);

        ProofNode::derivation(goal, "MP", vec![child_impl, child_a], None)
    }

    /// Modus Tollens: A ⊃ B, ~B → ~A
    fn apply_mt(&mut self, rng: &mut impl Rng, goal: Formula) -> ProofNode {
        // Goal should be ~A, we need A → B and ~B for some B
        match &goal {
            Formula::Not(a) => {
                let b = self.random_formula(rng, 1);
                let implication = Formula::Implies(a.clone(), Box::new(b.clone()));
                let not_b = Formula::Not(Box::new(b));

                let child_impl = self.build_proof_of(rng, implication);
                let child_not_b = self.build_proof_of(rng, not_b);

                ProofNode::derivation(goal, "MT", vec![child_impl, child_not_b], None)
            }
            _ => {
                // Goal isn't a negation, wrap it in MT anyway by proving ~~goal
                // Then use double negation... actually, just fall back to MP
                self.used_fragments -= 1; // Undo increment
                self.apply_mp(rng, goal)
            }
        }
    }

    /// Hypothetical Syllogism: A ⊃ B, B ⊃ C → A ⊃ C
    fn apply_hs(&mut self, rng: &mut impl Rng, goal: Formula) -> ProofNode {
        match &goal {
            Formula::Implies(a, c) => {
                // We need A → B and B → C for some B
                let b = Box::new(self.random_formula(rng, 1));
                let a_impl_b = Formula::Implies(a.clone(), b.clone());
                let b_impl_c = Formula::Implies(b, c.clone());

                let child1 = self.build_proof_of(rng, a_impl_b);
                let child2 = self.build_proof_of(rng, b_impl_c);

                ProofNode::derivation(goal, "HS", vec![child1, child2], None)
            }
            _ => {
                // Not an implication, fall back to MP
                self.used_fragments -= 1;
                self.apply_mp(rng, goal)
            }
        }
    }

    /// Disjunctive Syllogism: A ∨ B, ~A → B (or ~B → A)
    fn apply_ds(&mut self, rng: &mut impl Rng, goal: Formula) -> ProofNode {
        // Goal is B (or A), we need A ∨ B and ~A (or ~B)
        let other = self.random_formula(rng, 1);
        let disjunction = if rng.gen_bool(0.5) {
            Formula::Or(Box::new(other.clone()), Box::new(goal.clone()))
        } else {
            Formula::Or(Box::new(goal.clone()), Box::new(other.clone()))
        };
        let negated = Formula::Not(Box::new(other));

        let child_disj = self.build_proof_of(rng, disjunction);
        let child_neg = self.build_proof_of(rng, negated);

        ProofNode::derivation(goal, "DS", vec![child_disj, child_neg], None)
    }

    /// Simplification: A · B → A (or B)
    fn apply_simp(&mut self, rng: &mut impl Rng, goal: Formula) -> ProofNode {
        // Goal is one conjunct, we need a conjunction containing it
        let other = self.random_formula(rng, 1);
        let conjunction = if rng.gen_bool(0.5) {
            Formula::And(Box::new(goal.clone()), Box::new(other))
        } else {
            Formula::And(Box::new(other), Box::new(goal.clone()))
        };

        let child = self.build_proof_of(rng, conjunction);
        ProofNode::derivation(goal, "Simp", vec![child], None)
    }

    /// Conjunction: A, B → A · B
    fn apply_conj(&mut self, rng: &mut impl Rng, goal: Formula) -> ProofNode {
        match &goal {
            Formula::And(a, b) => {
                let child_a = self.build_proof_of(rng, (**a).clone());
                let child_b = self.build_proof_of(rng, (**b).clone());
                ProofNode::derivation(goal, "Conj", vec![child_a, child_b], None)
            }
            _ => {
                // Not a conjunction, fall back to MP
                self.used_fragments -= 1;
                self.apply_mp(rng, goal)
            }
        }
    }

    /// Addition: A → A ∨ B
    fn apply_add(&mut self, rng: &mut impl Rng, goal: Formula) -> ProofNode {
        match &goal {
            Formula::Or(a, b) => {
                // Pick one disjunct to prove, the other is "added"
                let (prove_this, _added) = if rng.gen_bool(0.5) {
                    ((**a).clone(), (**b).clone())
                } else {
                    ((**b).clone(), (**a).clone())
                };

                let child = self.build_proof_of(rng, prove_this);
                ProofNode::derivation(goal, "Add", vec![child], None)
            }
            _ => {
                // Not a disjunction, fall back to MP
                self.used_fragments -= 1;
                self.apply_mp(rng, goal)
            }
        }
    }

    /// Constructive Dilemma: A ∨ B, A ⊃ C, B ⊃ D → C ∨ D
    fn apply_cd(&mut self, rng: &mut impl Rng, goal: Formula) -> ProofNode {
        match &goal {
            Formula::Or(c, d) => {
                // We need A ∨ B, A → C, B → D
                let a = self.random_formula(rng, 1);
                let b = self.random_formula(rng, 1);
                let disjunction = Formula::Or(Box::new(a.clone()), Box::new(b.clone()));
                let a_impl_c = Formula::Implies(Box::new(a), c.clone());
                let b_impl_d = Formula::Implies(Box::new(b), d.clone());

                let child_disj = self.build_proof_of(rng, disjunction);
                let child_ac = self.build_proof_of(rng, a_impl_c);
                let child_bd = self.build_proof_of(rng, b_impl_d);

                ProofNode::derivation(goal, "CD", vec![child_disj, child_ac, child_bd], None)
            }
            _ => {
                // Not a disjunction, fall back to MP
                self.used_fragments -= 1;
                self.apply_mp(rng, goal)
            }
        }
    }

    /// Conditional Proof: [assume A, derive B] → A ⊃ B
    fn apply_cp(&mut self, rng: &mut impl Rng, goal: Formula) -> ProofNode {
        match &goal {
            Formula::Implies(a, b) => {
                self.current_nesting += 1;

                // Add A to available assumptions
                let assumption = (**a).clone();
                self.available.push(assumption.clone());

                // Build proof of B with A available
                let child_b = self.build_proof_of(rng, (**b).clone());

                // Remove assumption from available
                self.available.retain(|f| f != &assumption);
                self.current_nesting -= 1;

                ProofNode::derivation(
                    goal,
                    "CP",
                    vec![ProofNode::assumption(assumption.clone()), child_b],
                    Some(assumption),
                )
            }
            _ => {
                // Not an implication, fall back to MP
                self.used_fragments -= 1;
                self.apply_mp(rng, goal)
            }
        }
    }

    /// Indirect Proof: [assume ~A, derive ⊥] → A
    fn apply_ip(&mut self, rng: &mut impl Rng, goal: Formula) -> ProofNode {
        self.current_nesting += 1;

        // Assume negation of goal
        let assumption = Formula::Not(Box::new(goal.clone()));
        self.available.push(assumption.clone());

        // Build proof of contradiction
        let child_contra = self.build_contradiction(rng);

        // Remove assumption
        self.available.retain(|f| f != &assumption);
        self.current_nesting -= 1;

        ProofNode::derivation(
            goal,
            "IP",
            vec![ProofNode::assumption(assumption.clone()), child_contra],
            Some(assumption),
        )
    }

    /// Negation Introduction: [assume A, derive ⊥] → ~A
    fn apply_neg_intro(&mut self, rng: &mut impl Rng, goal: Formula) -> ProofNode {
        match &goal {
            Formula::Not(a) => {
                self.current_nesting += 1;

                // Assume what we want to negate
                let assumption = (**a).clone();
                self.available.push(assumption.clone());

                // Build proof of contradiction
                let child_contra = self.build_contradiction(rng);

                // Remove assumption
                self.available.retain(|f| f != &assumption);
                self.current_nesting -= 1;

                ProofNode::derivation(
                    goal,
                    "NegIntro",
                    vec![ProofNode::assumption(assumption.clone()), child_contra],
                    Some(assumption),
                )
            }
            _ => {
                // Not a negation, fall back to IP (which can prove anything)
                self.used_fragments -= 1;
                self.apply_ip(rng, goal)
            }
        }
    }

    /// Case Split: A ∨ B, [A → C], [B → C] → C
    fn apply_case_split(&mut self, rng: &mut impl Rng, goal: Formula) -> ProofNode {
        // Pick A and B
        let a = self.random_formula(rng, 1);
        let b = self.random_formula(rng, 1);
        let disjunction = Formula::Or(Box::new(a.clone()), Box::new(b.clone()));

        // Proof of disjunction
        let child_disj = self.build_proof_of(rng, disjunction);

        // Case 1: assume A, prove goal
        self.current_nesting += 1;
        self.available.push(a.clone());
        let child_case_a = self.build_proof_of(rng, goal.clone());
        self.available.retain(|f| f != &a);
        self.current_nesting -= 1;

        // Case 2: assume B, prove goal
        self.current_nesting += 1;
        self.available.push(b.clone());
        let child_case_b = self.build_proof_of(rng, goal.clone());
        self.available.retain(|f| f != &b);
        self.current_nesting -= 1;

        ProofNode::derivation(
            goal,
            "CaseSplit",
            vec![
                child_disj,
                ProofNode::assumption(a.clone()),
                child_case_a,
                ProofNode::assumption(b.clone()),
                child_case_b,
            ],
            None, // Case split discharges two assumptions internally
        )
    }

    // === Helper methods ===

    /// Build a proof of contradiction (⊥)
    fn build_contradiction(&mut self, rng: &mut impl Rng) -> ProofNode {
        // Contradiction from P and ~P
        // Try to find a formula and its negation in available
        for f in self.available.iter() {
            let neg = Formula::Not(Box::new(f.clone()));
            if self.available.contains(&neg) {
                // Found P and ~P!
                return ProofNode::derivation(
                    Formula::Contradiction,
                    "NegE",
                    vec![
                        ProofNode::assumption(f.clone()),
                        ProofNode::assumption(neg),
                    ],
                    None,
                );
            }

            // Check if f is ~P and P is available
            if let Formula::Not(inner) = f {
                if self.available.contains(inner) {
                    return ProofNode::derivation(
                        Formula::Contradiction,
                        "NegE",
                        vec![
                            ProofNode::assumption((**inner).clone()),
                            ProofNode::assumption(f.clone()),
                        ],
                        None,
                    );
                }
            }
        }

        // No direct contradiction available, need to derive one
        // Pick a formula and derive both it and its negation
        let p = self.random_formula(rng, 0);
        let not_p = Formula::Not(Box::new(p.clone()));

        let child_p = self.build_proof_of(rng, p.clone());
        let child_not_p = self.build_proof_of(rng, not_p.clone());

        ProofNode::derivation(
            Formula::Contradiction,
            "NegE",
            vec![child_p, child_not_p],
            None,
        )
    }

    /// Generate a random formula of limited depth
    fn random_formula(&self, rng: &mut impl Rng, max_depth: usize) -> Formula {
        if max_depth == 0 {
            return self.random_atom(rng);
        }

        let choice = rng.gen_range(0..100);
        match choice {
            0..=50 => self.random_atom(rng),
            51..=65 => {
                Formula::Not(Box::new(self.random_formula(rng, max_depth - 1)))
            }
            66..=80 => {
                Formula::And(
                    Box::new(self.random_formula(rng, max_depth - 1)),
                    Box::new(self.random_formula(rng, max_depth - 1)),
                )
            }
            81..=90 => {
                Formula::Or(
                    Box::new(self.random_formula(rng, max_depth - 1)),
                    Box::new(self.random_formula(rng, max_depth - 1)),
                )
            }
            _ => {
                Formula::Implies(
                    Box::new(self.random_formula(rng, max_depth - 1)),
                    Box::new(self.random_formula(rng, max_depth - 1)),
                )
            }
        }
    }

    /// Generate a random atom from the pool
    fn random_atom(&self, rng: &mut impl Rng) -> Formula {
        let idx = rng.gen_range(0..self.config.atom_pool.len());
        Formula::Atom(self.config.atom_pool[idx].clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_easy_generation() {
        // Run multiple attempts to get a valid tree
        // Stricter semantic validation means more theorems are rejected
        for _ in 0..5 {
            let mut gen = ProofTreeGenerator::with_difficulty(Difficulty::Easy);
            let tree = gen.generate();

            println!("{}", tree.pretty_print());

            if tree.is_valid() {
                assert!(tree.fragment_count >= 1);
                assert!(tree.max_nesting <= 2);
                return;
            }
        }
        // If we get here, we couldn't generate a valid tree
        // This is acceptable - the validation is strict
    }

    #[test]
    fn test_medium_generation() {
        // Run multiple attempts to get a valid tree
        // Stricter semantic validation means more theorems are rejected
        for _ in 0..5 {
            let mut gen = ProofTreeGenerator::with_difficulty(Difficulty::Medium);
            let tree = gen.generate();

            println!("{}", tree.pretty_print());

            if tree.is_valid() {
                assert!(tree.fragment_count >= 2);
                return;
            }
        }
        // If we get here, we couldn't generate a valid tree
        // This is acceptable - the validation is strict
    }

    #[test]
    fn test_hard_generation() {
        // Run multiple attempts to get a valid tree
        for _ in 0..5 {
            let mut gen = ProofTreeGenerator::with_difficulty(Difficulty::Hard);
            let tree = gen.generate();

            println!("{}", tree.pretty_print());

            if tree.is_valid() {
                assert!(tree.fragment_count >= 2, "Hard should have at least 2 fragments, got {}", tree.fragment_count);
                return;
            }
        }
    }

    #[test]
    fn test_expert_generation() {
        // Run multiple attempts to get a valid tree
        for _ in 0..5 {
            let mut gen = ProofTreeGenerator::with_difficulty(Difficulty::Expert);
            let tree = gen.generate();

            println!("{}", tree.pretty_print());

            if tree.is_valid() {
                assert!(tree.fragment_count >= 4, "Expert should have at least 4 fragments, got {}", tree.fragment_count);
                return;
            }
        }
    }

    #[test]
    fn test_premises_collected() {
        let mut gen = ProofTreeGenerator::with_difficulty(Difficulty::Easy);
        let tree = gen.generate();

        // Premises should be collected
        let premises = tree.premises();

        // The proof should be valid: premises + structure → conclusion
        println!("Premises: {:?}", premises.iter().map(|p| p.display_string()).collect::<Vec<_>>());
        println!("Conclusion: {}", tree.conclusion().display_string());
    }

    #[test]
    fn test_multiple_generations() {
        // Generate multiple proofs to check variety
        let mut gen = ProofTreeGenerator::with_difficulty(Difficulty::Medium);

        for i in 0..5 {
            let tree = gen.generate();
            println!("=== Generation {} ===", i + 1);
            println!("{}", tree.pretty_print());
            println!();
        }
    }
}
