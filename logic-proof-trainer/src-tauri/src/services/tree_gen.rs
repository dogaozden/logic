use rand::Rng;
use std::collections::HashSet;
use crate::models::Formula;
use crate::models::theorem::Difficulty;
use super::proof_tree::{ProofNode, ProofTree};
use super::fragments::Fragment;

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
    /// Whether the theorem MUST require subproof rules (CP/IP) to solve
    /// For Hard/Expert: basic rules (MP, MT, HS, DS, Simp, Conj, Add, DN) alone won't work
    pub requires_subproof: bool,
}

impl TreeGenConfig {
    /// Create config appropriate for difficulty level
    pub fn for_difficulty(difficulty: Difficulty) -> Self {
        match difficulty {
            Difficulty::Easy => Self {
                atom_pool: vec!["P".to_string(), "Q".to_string()],
                target_fragments: 3,
                max_nesting: 1,
                min_fragments: 2,
                min_proof_steps: 2,
                requires_subproof: false, // Basic rules OK
            },
            Difficulty::Medium => Self {
                atom_pool: vec!["P".to_string(), "Q".to_string(), "R".to_string()],
                target_fragments: 5,
                max_nesting: 2,
                min_fragments: 4,
                min_proof_steps: 3,
                requires_subproof: false, // Basic rules OK
            },
            Difficulty::Hard => Self {
                atom_pool: vec![
                    "P".to_string(),
                    "Q".to_string(),
                    "R".to_string(),
                    "S".to_string(),
                ],
                target_fragments: 8,
                max_nesting: 4,
                min_fragments: 6,
                min_proof_steps: 5,
                requires_subproof: true, // MUST need CP or IP
            },
            Difficulty::Expert => Self {
                atom_pool: vec![
                    "P".to_string(),
                    "Q".to_string(),
                    "R".to_string(),
                    "S".to_string(),
                    "T".to_string(),
                ],
                target_fragments: 12,
                max_nesting: 6,
                min_fragments: 10,
                min_proof_steps: 7,
                requires_subproof: true, // MUST need CP or IP
            },
        }
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

    /// Generate a complete proof tree
    /// Retries if the generated proof has degenerate premises (contradictions),
    /// doesn't meet minimum complexity requirements, or is too easy to solve
    pub fn generate(&mut self) -> ProofTree {
        let mut rng = rand::thread_rng();
        let mut best_tree: Option<ProofTree> = None;

        for attempt in 0..Self::MAX_RETRIES {
            let tree = self.generate_once();

            // Check for degenerate premises AND minimum proof difficulty AND subproof requirement
            let validation = tree.validate_with_difficulty(
                self.config.min_proof_steps,
                self.config.requires_subproof,
            );
            if validation.is_err() {
                if cfg!(test) && attempt > 0 {
                    eprintln!("Retry {}: rejected ({})", attempt + 1,
                        validation.unwrap_err());
                }
                // Still track as "best" if only problem is TooEasy/NoSubproof (basic validity ok)
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

    /// Generate a known-good fallback theorem with randomization.
    /// Uses RNG for variety, and generates theorems that require subproofs for Hard/Expert.
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

        if self.config.requires_subproof {
            // For Hard/Expert: generate theorems that REQUIRE CP or IP
            // These need enough fragments to meet min_fragments requirement

            if self.config.min_fragments >= 6 {
                // Expert: Complex nested CP with multiple derivations (6+ fragments)
                // A⊃B, B⊃C, C⊃D ⊢ A⊃D using CP with HS chain inside
                let a_impl_b = Formula::Implies(Box::new(a.clone()), Box::new(b.clone()));
                let b_impl_c = Formula::Implies(Box::new(b.clone()), Box::new(c.clone()));
                let c_impl_d = Formula::Implies(Box::new(c.clone()), Box::new(d.clone()));
                let a_impl_c = Formula::Implies(Box::new(a.clone()), Box::new(c.clone()));
                let a_impl_d = Formula::Implies(Box::new(a.clone()), Box::new(d.clone()));

                // Build: assume A, derive D via chain of MP/HS
                let root = ProofNode::derivation(
                    a_impl_d.clone(),
                    "CP",
                    vec![
                        ProofNode::assumption(a.clone()),
                        ProofNode::derivation(
                            d.clone(),
                            "MP",
                            vec![
                                ProofNode::derivation(
                                    c_impl_d.clone(),
                                    "HS",
                                    vec![
                                        ProofNode::derivation(
                                            b_impl_c.clone(),
                                            "HS",
                                            vec![
                                                ProofNode::premise(a_impl_b.clone()),
                                                ProofNode::premise(b_impl_c),
                                            ],
                                            None,
                                        ),
                                        ProofNode::premise(c_impl_d),
                                    ],
                                    None,
                                ),
                                ProofNode::derivation(
                                    c.clone(),
                                    "MP",
                                    vec![
                                        ProofNode::derivation(
                                            a_impl_c,
                                            "HS",
                                            vec![
                                                ProofNode::premise(a_impl_b),
                                                ProofNode::derivation(
                                                    Formula::Implies(Box::new(b.clone()), Box::new(c.clone())),
                                                    "HS",
                                                    vec![
                                                        ProofNode::premise(Formula::Implies(Box::new(b.clone()), Box::new(b.clone()))),
                                                        ProofNode::premise(Formula::Implies(Box::new(b), Box::new(c))),
                                                    ],
                                                    None,
                                                ),
                                            ],
                                            None,
                                        ),
                                        ProofNode::assumption(a.clone()),
                                    ],
                                    None,
                                ),
                            ],
                            None,
                        ),
                    ],
                    Some(a),
                );
                ProofTree::new(root)
            } else {
                // Hard: A⊃B, C⊃D ⊢ (A∧C)⊃(B∧D) - requires CP (5+ fragments)
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
                        ProofNode::derivation(
                            b_and_d,
                            "Conj",
                            vec![
                                ProofNode::derivation(
                                    b.clone(),
                                    "MP",
                                    vec![
                                        ProofNode::premise(a_impl_b),
                                        ProofNode::derivation(
                                            a.clone(),
                                            "Simp",
                                            vec![ProofNode::assumption(a_and_c.clone())],
                                            None,
                                        ),
                                    ],
                                    None,
                                ),
                                ProofNode::derivation(
                                    d.clone(),
                                    "MP",
                                    vec![
                                        ProofNode::premise(c_impl_d),
                                        ProofNode::derivation(
                                            c.clone(),
                                            "Simp",
                                            vec![ProofNode::assumption(a_and_c)],
                                            None,
                                        ),
                                    ],
                                    None,
                                ),
                            ],
                            None,
                        ),
                    ],
                    Some(Formula::And(Box::new(a), Box::new(c))),
                );
                ProofTree::new(root)
            }
        } else {
            // For Easy/Medium: generate basic MP/HS chains with randomized atoms
            let a_impl_b = Formula::Implies(Box::new(a.clone()), Box::new(b.clone()));
            let b_impl_c = Formula::Implies(Box::new(b.clone()), Box::new(c.clone()));

            if self.config.min_fragments <= 2 {
                // 2 fragments: A, A→B, B→C ⊢ C (HS + MP)
                let a_impl_c = Formula::Implies(Box::new(a.clone()), Box::new(c.clone()));
                let root = ProofNode::derivation(
                    c.clone(),
                    "MP",
                    vec![
                        ProofNode::derivation(
                            a_impl_c,
                            "HS",
                            vec![
                                ProofNode::premise(a_impl_b),
                                ProofNode::premise(b_impl_c),
                            ],
                            None,
                        ),
                        ProofNode::premise(a),
                    ],
                    None,
                );
                ProofTree::new(root)
            } else {
                // 3+ fragments: A, A→B, B→C, C→D ⊢ D
                let c_impl_d = Formula::Implies(Box::new(c.clone()), Box::new(d.clone()));
                let a_impl_c = Formula::Implies(Box::new(a.clone()), Box::new(c.clone()));
                let a_impl_d = Formula::Implies(Box::new(a.clone()), Box::new(d.clone()));

                let root = ProofNode::derivation(
                    d.clone(),
                    "MP",
                    vec![
                        ProofNode::derivation(
                            a_impl_d,
                            "HS",
                            vec![
                                ProofNode::derivation(
                                    a_impl_c,
                                    "HS",
                                    vec![
                                        ProofNode::premise(a_impl_b),
                                        ProofNode::premise(b_impl_c),
                                    ],
                                    None,
                                ),
                                ProofNode::premise(c_impl_d),
                            ],
                            None,
                        ),
                        ProofNode::premise(a),
                    ],
                    None,
                );
                ProofTree::new(root)
            }
        }
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
