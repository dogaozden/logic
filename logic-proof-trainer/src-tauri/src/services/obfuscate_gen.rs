//! Two-layer theorem generation with equivalence obfuscation.
//!
//! Strategy:
//! 1. Generate simple valid theorem (base)
//! 2. Wrap as single formula: (P1 ∧ P2 ∧ ...) ⊃ C
//! 3. Apply N random equivalence transformations
//!
//! Key insight: Semantic validity is GUARANTEED because equivalence
//! transformations preserve truth tables.

use rand::Rng;
use crate::models::Formula;
use crate::models::rules::equivalence::EquivalenceRule;
use crate::models::theorem::{Difficulty, Theme, Theorem};
use crate::services::truth_table::is_tautology;

/// Configuration for obfuscation generation
#[derive(Debug, Clone)]
pub struct ObfuscateConfig {
    pub atom_pool: Vec<String>,
    pub transform_count: usize,
    pub difficulty: Difficulty,
    pub difficulty_value: u8,
}

impl ObfuscateConfig {
    /// Create configuration from a difficulty value (1-100)
    pub fn for_difficulty_value(d: u8) -> Self {
        let d_clamped = d.clamp(1, 100) as usize;

        // Scale atom pool: 2 atoms at easy, up to 4 at expert
        let atom_count = 2 + (d_clamped * 2 / 100);
        let atoms = ["P", "Q", "R", "S", "T"]
            .into_iter()
            .take(atom_count)
            .map(String::from)
            .collect();

        // Scale transform count based on difficulty
        // Easy (1-25): 1-2 transforms
        // Medium (26-45): 3-4 transforms
        // Hard (46-70): 5-7 transforms
        // Expert (71-100): 8-11 transforms
        let transform_count = match d_clamped {
            1..=25 => 1 + (d_clamped - 1) / 25, // 1-2
            26..=45 => 3 + (d_clamped - 26) / 20, // 3-4
            46..=70 => 5 + (d_clamped - 46) / 12, // 5-7
            _ => 8 + (d_clamped - 71) / 10, // 8-11
        };

        Self {
            atom_pool: atoms,
            transform_count,
            difficulty: Self::preset_for_value(d),
            difficulty_value: d,
        }
    }

    fn preset_for_value(value: u8) -> Difficulty {
        match value {
            1..=25 => Difficulty::Easy,
            26..=45 => Difficulty::Medium,
            46..=70 => Difficulty::Hard,
            _ => Difficulty::Expert,
        }
    }
}

/// Base argument forms for generating simple valid theorems
#[derive(Debug, Clone, Copy)]
enum BaseForm {
    /// Modus Ponens: P, P ⊃ Q ⊢ Q
    ModusPonens,
    /// Modus Tollens: P ⊃ Q, ~Q ⊢ ~P
    ModusTollens,
    /// Hypothetical Syllogism: P ⊃ Q, Q ⊃ R ⊢ P ⊃ R
    HypotheticalSyllogism,
    /// Disjunctive Syllogism: P ∨ Q, ~P ⊢ Q
    DisjunctiveSyllogism,
    /// Simplification: P ∧ Q ⊢ P
    Simplification,
    /// Conjunction: P, Q ⊢ P ∧ Q
    Conjunction,
    /// Constructive Dilemma: (P ⊃ Q) ∧ (R ⊃ S), P ∨ R ⊢ Q ∨ S
    ConstructiveDilemma,
}

impl BaseForm {
    fn all() -> Vec<BaseForm> {
        vec![
            BaseForm::ModusPonens,
            BaseForm::ModusTollens,
            BaseForm::HypotheticalSyllogism,
            BaseForm::DisjunctiveSyllogism,
            BaseForm::Simplification,
            BaseForm::Conjunction,
            BaseForm::ConstructiveDilemma,
        ]
    }

    /// Get forms that can use the given number of atoms
    fn for_atom_count(count: usize) -> Vec<BaseForm> {
        match count {
            0..=1 => vec![], // Need at least 2 atoms
            2 => vec![
                BaseForm::ModusPonens,
                BaseForm::ModusTollens,
                BaseForm::DisjunctiveSyllogism,
                BaseForm::Simplification,
                BaseForm::Conjunction,
            ],
            _ => BaseForm::all(), // 3+ atoms can use any form
        }
    }
}

/// Main generator struct
pub struct ObfuscateGenerator {
    config: ObfuscateConfig,
}

impl ObfuscateGenerator {
    pub fn new(config: ObfuscateConfig) -> Self {
        Self { config }
    }

    /// Generate an obfuscated theorem (tautology format)
    pub fn generate(&self, rng: &mut impl Rng) -> Theorem {
        // Step 1: Generate simple base theorem
        let (premises, conclusion) = self.generate_base_theorem(rng);

        // Step 2: Wrap as single tautology
        let wrapped = self.wrap_as_conditional(&premises, &conclusion);

        // Verify the wrapped formula is a tautology before transforming
        debug_assert!(is_tautology(&wrapped), "Wrapped formula should be a tautology");

        // Step 3: Apply random transformations
        let obfuscated = self.apply_transformations(wrapped, rng);

        // Verify the obfuscated formula is still a tautology
        debug_assert!(is_tautology(&obfuscated), "Obfuscated formula should still be a tautology");

        // Step 4: Return as tautology (no premises)
        Theorem::with_difficulty_value(
            vec![], // No premises - it's a tautology
            obfuscated,
            self.config.difficulty,
            self.config.difficulty_value,
            Some(Theme::Equivalence),
            None,
        )
    }

    /// Generate a simple valid argument form
    fn generate_base_theorem(&self, rng: &mut impl Rng) -> (Vec<Formula>, Formula) {
        let atoms = &self.config.atom_pool;
        let available_forms = BaseForm::for_atom_count(atoms.len());

        if available_forms.is_empty() {
            // Fallback to simple tautology P ⊃ P
            let p = Formula::Atom(atoms[0].clone());
            return (vec![], Formula::Implies(Box::new(p.clone()), Box::new(p)));
        }

        let form = available_forms[rng.gen_range(0..available_forms.len())];

        // Get atoms for this form
        let p = Formula::Atom(atoms[0].clone());
        let q = Formula::Atom(atoms[1 % atoms.len()].clone());
        let r = if atoms.len() > 2 {
            Formula::Atom(atoms[2].clone())
        } else {
            Formula::Atom(atoms[0].clone())
        };
        let s = if atoms.len() > 3 {
            Formula::Atom(atoms[3].clone())
        } else {
            Formula::Atom(atoms[1 % atoms.len()].clone())
        };

        match form {
            BaseForm::ModusPonens => {
                // P, P ⊃ Q ⊢ Q
                (
                    vec![
                        p.clone(),
                        Formula::Implies(Box::new(p), Box::new(q.clone())),
                    ],
                    q,
                )
            }
            BaseForm::ModusTollens => {
                // P ⊃ Q, ~Q ⊢ ~P
                (
                    vec![
                        Formula::Implies(Box::new(p.clone()), Box::new(q.clone())),
                        Formula::Not(Box::new(q)),
                    ],
                    Formula::Not(Box::new(p)),
                )
            }
            BaseForm::HypotheticalSyllogism => {
                // P ⊃ Q, Q ⊃ R ⊢ P ⊃ R
                (
                    vec![
                        Formula::Implies(Box::new(p.clone()), Box::new(q.clone())),
                        Formula::Implies(Box::new(q), Box::new(r.clone())),
                    ],
                    Formula::Implies(Box::new(p), Box::new(r)),
                )
            }
            BaseForm::DisjunctiveSyllogism => {
                // P ∨ Q, ~P ⊢ Q
                (
                    vec![
                        Formula::Or(Box::new(p.clone()), Box::new(q.clone())),
                        Formula::Not(Box::new(p)),
                    ],
                    q,
                )
            }
            BaseForm::Simplification => {
                // P ∧ Q ⊢ P
                (
                    vec![Formula::And(Box::new(p.clone()), Box::new(q))],
                    p,
                )
            }
            BaseForm::Conjunction => {
                // P, Q ⊢ P ∧ Q
                (
                    vec![p.clone(), q.clone()],
                    Formula::And(Box::new(p), Box::new(q)),
                )
            }
            BaseForm::ConstructiveDilemma => {
                // (P ⊃ Q) ∧ (R ⊃ S), P ∨ R ⊢ Q ∨ S
                (
                    vec![
                        Formula::And(
                            Box::new(Formula::Implies(Box::new(p.clone()), Box::new(q.clone()))),
                            Box::new(Formula::Implies(Box::new(r.clone()), Box::new(s.clone()))),
                        ),
                        Formula::Or(Box::new(p), Box::new(r)),
                    ],
                    Formula::Or(Box::new(q), Box::new(s)),
                )
            }
        }
    }

    /// Wrap premises and conclusion as a single conditional tautology
    /// (P1 ∧ P2 ∧ ... ∧ Pn) ⊃ C
    fn wrap_as_conditional(&self, premises: &[Formula], conclusion: &Formula) -> Formula {
        if premises.is_empty() {
            // If no premises, the conclusion itself should be a tautology
            // But for consistency, wrap as T ⊃ C where T is the conclusion
            // Actually, just return the conclusion if it's already a tautology
            return conclusion.clone();
        }

        // Combine all premises with conjunction
        let antecedent = premises.iter()
            .cloned()
            .reduce(|acc, p| Formula::And(Box::new(acc), Box::new(p)))
            .unwrap_or_else(|| conclusion.clone());

        Formula::Implies(Box::new(antecedent), Box::new(conclusion.clone()))
    }

    /// Apply random equivalence transformations
    fn apply_transformations(&self, mut formula: Formula, rng: &mut impl Rng) -> Formula {
        let mut successful_transforms = 0;
        let mut attempts = 0;
        let max_attempts = self.config.transform_count * 10;

        while successful_transforms < self.config.transform_count && attempts < max_attempts {
            attempts += 1;
            if let Some(transformed) = self.try_apply_random_equivalence(&formula, rng) {
                formula = transformed;
                successful_transforms += 1;
            }
        }

        // Simplification pass: collapse excessive negations (~~~~P → P)
        simplify_negations(formula)
    }

    /// Try to apply a random equivalence transformation to some subformula
    fn try_apply_random_equivalence(&self, formula: &Formula, rng: &mut impl Rng) -> Option<Formula> {
        // Get all subformulas
        let subformulas = formula.subformulas();
        if subformulas.is_empty() {
            return None;
        }

        // Shuffle the subformulas to try in random order
        let mut indices: Vec<usize> = (0..subformulas.len()).collect();
        for i in (1..indices.len()).rev() {
            let j = rng.gen_range(0..=i);
            indices.swap(i, j);
        }

        // For each subformula, try to find an applicable rule
        for &idx in &indices {
            let subformula = &subformulas[idx];

            // Get all applicable rules for this subformula
            let applicable = self.find_applicable_rules(subformula);
            if applicable.is_empty() {
                continue;
            }

            // Pick a random applicable rule
            let (_rule, equivalent) = &applicable[rng.gen_range(0..applicable.len())];

            // Apply the transformation
            let result = EquivalenceRule::replace_subformula(formula, subformula, equivalent);

            // Sanity check: the result should still be a tautology
            if is_tautology(&result) {
                return Some(result);
            }
            // If not (shouldn't happen), try another
        }

        None
    }

    /// Find all rules that can be applied to this formula, with their results
    fn find_applicable_rules(&self, formula: &Formula) -> Vec<(EquivalenceRule, Formula)> {
        let mut results = Vec::new();

        for rule in EquivalenceRule::all() {
            // Skip Tautology rule as it can cause infinite growth
            if matches!(rule, EquivalenceRule::Tautology) {
                // Only allow Tautology contraction, not expansion
                if let Formula::And(p, q) = formula {
                    if p == q {
                        results.push((rule, p.as_ref().clone()));
                    }
                }
                if let Formula::Or(p, q) = formula {
                    if p == q {
                        results.push((rule, p.as_ref().clone()));
                    }
                }
                continue;
            }

            // Skip Double Negation introduction if formula already has 2+ leading negations
            if matches!(rule, EquivalenceRule::DoubleNegation) {
                if count_leading_negations(formula) >= 2 {
                    // Only allow DN elimination (~~P → P), not introduction (P → ~~P)
                    if let Formula::Not(inner) = formula {
                        if let Formula::Not(inner2) = inner.as_ref() {
                            results.push((rule, inner2.as_ref().clone()));
                        }
                    }
                    continue;
                }
            }

            let equivalents = rule.equivalent_forms(formula);
            for equiv in equivalents {
                results.push((rule, equiv));
            }
        }

        results
    }
}

/// Count leading negations in a formula (e.g., ~~~P has 3)
fn count_leading_negations(formula: &Formula) -> usize {
    match formula {
        Formula::Not(inner) => 1 + count_leading_negations(inner),
        _ => 0,
    }
}

/// Simplify excessive negations throughout a formula
/// Collapses ~~~~P → ~~P → P (removes pairs of negations)
fn simplify_negations(formula: Formula) -> Formula {
    match formula {
        Formula::Not(inner) => {
            let simplified_inner = simplify_negations(*inner);
            // Check if inner is also a negation - if so, eliminate both
            if let Formula::Not(inner2) = simplified_inner {
                // ~~X → X (after X is simplified)
                simplify_negations(*inner2)
            } else {
                Formula::Not(Box::new(simplified_inner))
            }
        }
        Formula::And(left, right) => Formula::And(
            Box::new(simplify_negations(*left)),
            Box::new(simplify_negations(*right)),
        ),
        Formula::Or(left, right) => Formula::Or(
            Box::new(simplify_negations(*left)),
            Box::new(simplify_negations(*right)),
        ),
        Formula::Implies(left, right) => Formula::Implies(
            Box::new(simplify_negations(*left)),
            Box::new(simplify_negations(*right)),
        ),
        Formula::Biconditional(left, right) => Formula::Biconditional(
            Box::new(simplify_negations(*left)),
            Box::new(simplify_negations(*right)),
        ),
        // Atoms and Contradiction pass through unchanged
        other => other,
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::truth_table::{is_tautology, are_equivalent};

    #[test]
    fn test_config_easy() {
        let config = ObfuscateConfig::for_difficulty_value(10);
        assert_eq!(config.difficulty, Difficulty::Easy);
        assert!(config.transform_count <= 2);
        assert_eq!(config.atom_pool.len(), 2);
    }

    #[test]
    fn test_config_expert() {
        let config = ObfuscateConfig::for_difficulty_value(90);
        assert_eq!(config.difficulty, Difficulty::Expert);
        assert!(config.transform_count >= 8);
        assert!(config.atom_pool.len() >= 3);
    }

    #[test]
    fn test_wrap_as_conditional() {
        let config = ObfuscateConfig::for_difficulty_value(50);
        let gen = ObfuscateGenerator::new(config);

        let p = Formula::Atom("P".to_string());
        let q = Formula::Atom("Q".to_string());

        // P, P→Q ⊢ Q becomes (P ∧ (P→Q)) → Q
        let premises = vec![
            p.clone(),
            Formula::Implies(Box::new(p.clone()), Box::new(q.clone())),
        ];
        let wrapped = gen.wrap_as_conditional(&premises, &q);

        // The wrapped formula should be a tautology
        assert!(is_tautology(&wrapped));
    }

    #[test]
    fn test_generate_produces_tautology() {
        let config = ObfuscateConfig::for_difficulty_value(30);
        let gen = ObfuscateGenerator::new(config);
        let mut rng = rand::thread_rng();

        // Generate multiple theorems and verify they're all tautologies
        for _ in 0..10 {
            let theorem = gen.generate(&mut rng);
            assert!(theorem.premises.is_empty(), "Should be a tautology with no premises");
            assert!(is_tautology(&theorem.conclusion), "Conclusion should be a tautology");
        }
    }

    #[test]
    fn test_transformations_preserve_validity() {
        let config = ObfuscateConfig::for_difficulty_value(50);
        let gen = ObfuscateGenerator::new(config);
        let mut rng = rand::thread_rng();

        // Test with a simple known tautology
        let p = Formula::Atom("P".to_string());
        let q = Formula::Atom("Q".to_string());

        // MP wrapped: (P ∧ (P→Q)) → Q
        let original = Formula::Implies(
            Box::new(Formula::And(
                Box::new(p.clone()),
                Box::new(Formula::Implies(Box::new(p.clone()), Box::new(q.clone()))),
            )),
            Box::new(q.clone()),
        );

        assert!(is_tautology(&original));

        let transformed = gen.apply_transformations(original.clone(), &mut rng);
        assert!(is_tautology(&transformed));
        assert!(are_equivalent(&original, &transformed));
    }

    #[test]
    fn test_base_forms_produce_valid_theorems() {
        let config = ObfuscateConfig::for_difficulty_value(50);
        let gen = ObfuscateGenerator::new(config);
        let mut rng = rand::thread_rng();

        for _ in 0..20 {
            let (premises, conclusion) = gen.generate_base_theorem(&mut rng);
            let wrapped = gen.wrap_as_conditional(&premises, &conclusion);
            assert!(is_tautology(&wrapped), "Base theorem should wrap to tautology");
        }
    }

    #[test]
    fn test_difficulty_scaling() {
        let mut rng = rand::thread_rng();

        // Easy should have simpler formulas
        let easy_config = ObfuscateConfig::for_difficulty_value(10);
        let easy_gen = ObfuscateGenerator::new(easy_config);
        let easy_theorem = easy_gen.generate(&mut rng);

        // Expert should have more complex formulas
        let expert_config = ObfuscateConfig::for_difficulty_value(90);
        let expert_gen = ObfuscateGenerator::new(expert_config);
        let expert_theorem = expert_gen.generate(&mut rng);

        // Both should be valid tautologies
        assert!(is_tautology(&easy_theorem.conclusion));
        assert!(is_tautology(&expert_theorem.conclusion));

        // Expert should generally be deeper/more complex
        // (not always guaranteed due to randomness, but usually true)
    }

    #[test]
    fn test_simplify_negations() {
        let p = Formula::Atom("P".to_string());

        // ~~P → P
        let double_neg = Formula::Not(Box::new(Formula::Not(Box::new(p.clone()))));
        let simplified = super::simplify_negations(double_neg);
        assert_eq!(simplified, p);

        // ~~~~P → P
        let quad_neg = Formula::Not(Box::new(Formula::Not(Box::new(
            Formula::Not(Box::new(Formula::Not(Box::new(p.clone()))))
        ))));
        let simplified = super::simplify_negations(quad_neg);
        assert_eq!(simplified, p);

        // ~~~P → ~P
        let triple_neg = Formula::Not(Box::new(Formula::Not(Box::new(
            Formula::Not(Box::new(p.clone()))
        ))));
        let simplified = super::simplify_negations(triple_neg);
        assert_eq!(simplified, Formula::Not(Box::new(p.clone())));

        // Nested: ~~(P ∧ ~~Q) → (P ∧ Q)
        let q = Formula::Atom("Q".to_string());
        let nested = Formula::Not(Box::new(Formula::Not(Box::new(
            Formula::And(
                Box::new(p.clone()),
                Box::new(Formula::Not(Box::new(Formula::Not(Box::new(q.clone())))))
            )
        ))));
        let simplified = super::simplify_negations(nested);
        assert_eq!(simplified, Formula::And(Box::new(p), Box::new(q)));
    }

    #[test]
    fn test_count_leading_negations() {
        let p = Formula::Atom("P".to_string());
        assert_eq!(super::count_leading_negations(&p), 0);

        let neg_p = Formula::Not(Box::new(p.clone()));
        assert_eq!(super::count_leading_negations(&neg_p), 1);

        let double_neg = Formula::Not(Box::new(Formula::Not(Box::new(p.clone()))));
        assert_eq!(super::count_leading_negations(&double_neg), 2);

        let triple_neg = Formula::Not(Box::new(Formula::Not(Box::new(
            Formula::Not(Box::new(p.clone()))
        ))));
        assert_eq!(super::count_leading_negations(&triple_neg), 3);
    }
}
