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
    /// Depth of formula substitutions (0 = no substitution, 1-2 = complex formulas)
    pub substitution_depth: usize,
}

impl ObfuscateConfig {
    /// Create configuration from a difficulty value (1-100)
    pub fn for_difficulty_value(d: u8) -> Self {
        let d_clamped = d.clamp(1, 100) as usize;

        // Scale atom pool based on difficulty
        // 1-40: 2 atoms, 41-60: 3 atoms, 61-80: 4 atoms, 81-100: 5 atoms
        let atom_count = match d_clamped {
            1..=40 => 2,
            41..=60 => 3,
            61..=80 => 4,
            _ => 5,
        };
        let atoms = ["P", "Q", "R", "S", "T"]
            .into_iter()
            .take(atom_count)
            .map(String::from)
            .collect();

        // Scale transform count based on difficulty tiers
        // Easy (1-25): 1-3 transforms
        // Medium (26-45): 3-6 transforms
        // Hard (46-70): 6-11 transforms
        // Expert (71-85): 11-16 transforms
        // Nightmare (86-95): 16-20 transforms
        // Marathon (96-100): 20-24 transforms
        let transform_count = match d_clamped {
            1..=25 => 1 + (d_clamped - 1) * 2 / 24, // 1-3
            26..=45 => 3 + (d_clamped - 26) * 3 / 19, // 3-6
            46..=70 => 6 + (d_clamped - 46) * 5 / 24, // 6-11
            71..=85 => 11 + (d_clamped - 71) * 5 / 14, // 11-16
            86..=95 => 16 + (d_clamped - 86) * 4 / 9, // 16-20
            _ => 20 + (d_clamped - 96) * 4 / 4, // 20-24
        };

        // Layer 3: substitution depth based on difficulty
        // 1-69: 0 (no substitution)
        // 70-84: 1 (simple substitutions like A ∨ B)
        // 85-100: 2 (nested substitutions like (A ∨ B) ⊃ C)
        let substitution_depth = match d_clamped {
            1..=69 => 0,
            70..=84 => 1,
            _ => 2,
        };

        Self {
            atom_pool: atoms,
            transform_count,
            difficulty: Self::preset_for_value(d),
            difficulty_value: d,
            substitution_depth,
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
    // === Complex forms for high difficulty (≥70) ===
    /// Constructive Dilemma Full: P∨Q, P⊃R, Q⊃R ⊢ R (forces case analysis)
    ConstructiveDilemmaFull,
    /// Nested CP: P⊃(Q⊃R), P, Q ⊢ R (nested conditionals)
    NestedCP,
    /// Chain4: P⊃Q, Q⊃R, R⊃S, P ⊢ S (long chain)
    Chain4,
}

impl BaseForm {
    /// Get standard forms (used for lower difficulties)
    fn standard() -> Vec<BaseForm> {
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

    /// Get complex forms (used only for high difficulty ≥70)
    fn complex() -> Vec<BaseForm> {
        vec![
            BaseForm::ConstructiveDilemmaFull,
            BaseForm::NestedCP,
            BaseForm::Chain4,
        ]
    }

    fn all() -> Vec<BaseForm> {
        let mut forms = Self::standard();
        forms.extend(Self::complex());
        forms
    }

    /// Get forms that can use the given number of atoms and difficulty
    fn for_atom_count_and_difficulty(count: usize, difficulty: u8) -> Vec<BaseForm> {
        let base_forms = match count {
            0..=1 => vec![], // Need at least 2 atoms
            2 => vec![
                BaseForm::ModusPonens,
                BaseForm::ModusTollens,
                BaseForm::DisjunctiveSyllogism,
                BaseForm::Simplification,
                BaseForm::Conjunction,
            ],
            3 => {
                // 3 atoms: standard forms + NestedCP and ConstructiveDilemmaFull
                let mut forms = Self::standard();
                if difficulty >= 70 {
                    forms.push(BaseForm::NestedCP);
                    forms.push(BaseForm::ConstructiveDilemmaFull);
                }
                forms
            }
            _ => {
                // 4+ atoms: all forms including Chain4
                if difficulty >= 70 {
                    Self::all()
                } else {
                    Self::standard()
                }
            }
        };
        base_forms
    }

    /// Legacy method for compatibility
    fn for_atom_count(count: usize) -> Vec<BaseForm> {
        Self::for_atom_count_and_difficulty(count, 50) // default to medium difficulty
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
        // Layer 1: Generate simple base theorem
        let (premises, conclusion) = self.generate_base_theorem(rng);

        // Layer 3: Apply atom substitutions for high difficulty
        // This replaces simple atoms (P, Q, R) with complex formulas (A∨~B, C.D, E⊃F)
        // dramatically increasing the "surface area" for equivalence transformations
        let (premises, conclusion) = self.apply_substitutions(premises, conclusion, rng);

        // Layer 2: Wrap as single tautology
        let wrapped = self.wrap_as_conditional(&premises, &conclusion);

        // Verify the wrapped formula is a tautology before transforming
        debug_assert!(is_tautology(&wrapped), "Wrapped formula should be a tautology");

        // Apply random transformations
        let obfuscated = self.apply_transformations(wrapped, rng);

        // Verify the obfuscated formula is still a tautology
        debug_assert!(is_tautology(&obfuscated), "Obfuscated formula should still be a tautology");

        // Return as tautology (no premises)
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
        let available_forms = BaseForm::for_atom_count_and_difficulty(atoms.len(), self.config.difficulty_value);

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
            BaseForm::ConstructiveDilemmaFull => {
                // P∨Q, P⊃R, Q⊃R ⊢ R (forces case analysis)
                (
                    vec![
                        Formula::Or(Box::new(p.clone()), Box::new(q.clone())),
                        Formula::Implies(Box::new(p), Box::new(r.clone())),
                        Formula::Implies(Box::new(q), Box::new(r.clone())),
                    ],
                    r,
                )
            }
            BaseForm::NestedCP => {
                // P⊃(Q⊃R), P, Q ⊢ R (nested conditionals)
                (
                    vec![
                        Formula::Implies(
                            Box::new(p.clone()),
                            Box::new(Formula::Implies(Box::new(q.clone()), Box::new(r.clone()))),
                        ),
                        p,
                        q,
                    ],
                    r,
                )
            }
            BaseForm::Chain4 => {
                // P⊃Q, Q⊃R, R⊃S, P ⊢ S (long chain)
                (
                    vec![
                        Formula::Implies(Box::new(p.clone()), Box::new(q.clone())),
                        Formula::Implies(Box::new(q), Box::new(r.clone())),
                        Formula::Implies(Box::new(r), Box::new(s.clone())),
                        p,
                    ],
                    s,
                )
            }
        }
    }

    /// Layer 3: Apply atom substitutions for high difficulty.
    /// Replaces simple atoms (P, Q, R) with complex formulas (A∨~B, C.D, E⊃F).
    fn apply_substitutions(
        &self,
        premises: Vec<Formula>,
        conclusion: Formula,
        rng: &mut impl Rng,
    ) -> (Vec<Formula>, Formula) {
        if self.config.substitution_depth == 0 {
            return (premises, conclusion);
        }

        // Collect all unique atoms from the base theorem
        let mut base_atoms: Vec<String> = vec![];
        for p in &premises {
            for atom in p.atoms() {
                if !base_atoms.contains(&atom) {
                    base_atoms.push(atom);
                }
            }
        }
        for atom in conclusion.atoms() {
            if !base_atoms.contains(&atom) {
                base_atoms.push(atom);
            }
        }

        // Sort for deterministic behavior
        base_atoms.sort();

        // Create substitution atoms (A, B, C, D, E, F, ...)
        // We need 2 atoms per base atom for interesting substitutions
        let sub_atoms: Vec<String> = ('A'..='Z')
            .take(base_atoms.len() * 2)
            .map(|c| c.to_string())
            .collect();

        // Build substitution map: P -> complex formula using A,B; Q -> complex formula using C,D; etc.
        let mut substitutions: std::collections::HashMap<String, Formula> = std::collections::HashMap::new();
        for (i, atom) in base_atoms.iter().enumerate() {
            let start_idx = i * 2;
            let end_idx = (start_idx + 2).min(sub_atoms.len());
            let atom_slice = &sub_atoms[start_idx..end_idx];
            let replacement = self.random_formula(rng, self.config.substitution_depth, atom_slice);
            substitutions.insert(atom.clone(), replacement);
        }

        // Apply substitutions to all premises and conclusion
        let new_premises: Vec<Formula> = premises
            .into_iter()
            .map(|p| self.substitute_all(&p, &substitutions))
            .collect();
        let new_conclusion = self.substitute_all(&conclusion, &substitutions);

        (new_premises, new_conclusion)
    }

    /// Generate a random formula of given depth using the provided atoms.
    fn random_formula(&self, rng: &mut impl Rng, depth: usize, atoms: &[String]) -> Formula {
        // Base case: return atom if depth is 0 or randomly (30% chance)
        if depth == 0 || atoms.is_empty() || rng.gen_bool(0.3) {
            let idx = rng.gen_range(0..atoms.len().max(1));
            return if atoms.is_empty() {
                Formula::Atom("X".to_string()) // fallback
            } else {
                Formula::Atom(atoms[idx].clone())
            };
        }

        // Pick random connective
        match rng.gen_range(0..4) {
            0 => Formula::Not(Box::new(self.random_formula(rng, depth - 1, atoms))),
            1 => Formula::And(
                Box::new(self.random_formula(rng, depth - 1, atoms)),
                Box::new(self.random_formula(rng, depth - 1, atoms)),
            ),
            2 => Formula::Or(
                Box::new(self.random_formula(rng, depth - 1, atoms)),
                Box::new(self.random_formula(rng, depth - 1, atoms)),
            ),
            _ => Formula::Implies(
                Box::new(self.random_formula(rng, depth - 1, atoms)),
                Box::new(self.random_formula(rng, depth - 1, atoms)),
            ),
        }
    }

    /// Apply all substitutions from the map to a formula.
    fn substitute_all(&self, formula: &Formula, subs: &std::collections::HashMap<String, Formula>) -> Formula {
        match formula {
            Formula::Atom(name) => {
                subs.get(name).cloned().unwrap_or_else(|| formula.clone())
            }
            Formula::Not(inner) => {
                Formula::Not(Box::new(self.substitute_all(inner, subs)))
            }
            Formula::And(l, r) => {
                Formula::And(
                    Box::new(self.substitute_all(l, subs)),
                    Box::new(self.substitute_all(r, subs)),
                )
            }
            Formula::Or(l, r) => {
                Formula::Or(
                    Box::new(self.substitute_all(l, subs)),
                    Box::new(self.substitute_all(r, subs)),
                )
            }
            Formula::Implies(l, r) => {
                Formula::Implies(
                    Box::new(self.substitute_all(l, subs)),
                    Box::new(self.substitute_all(r, subs)),
                )
            }
            Formula::Biconditional(l, r) => {
                Formula::Biconditional(
                    Box::new(self.substitute_all(l, subs)),
                    Box::new(self.substitute_all(r, subs)),
                )
            }
            Formula::Contradiction => Formula::Contradiction,
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
        // For difficulty ≥ 85 (Nightmare/Marathon), force gnarly combinations first
        if self.config.difficulty_value >= 85 {
            formula = self.apply_gnarly_combos(formula, rng);
        }

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

    /// Apply gnarly transformation combos that create especially difficult proofs.
    /// These force specific hard patterns like:
    /// - Contraposition + De Morgan chains
    /// - Material Implication + Distribution (creates case splits)
    /// - Exportation + double negation
    fn apply_gnarly_combos(&self, mut formula: Formula, rng: &mut impl Rng) -> Formula {
        // Pick 1-3 gnarly combos based on difficulty
        let combo_count = if self.config.difficulty_value >= 96 { 3 } else { 2 };

        let gnarly_rules = [
            // Combo 1: Contraposition + De Morgan chain
            vec![EquivalenceRule::Contraposition, EquivalenceRule::DeMorgan],
            // Combo 2: Implication + Distribution (creates case splits)
            vec![EquivalenceRule::Implication, EquivalenceRule::Distribution],
            // Combo 3: Exportation + Double Negation
            vec![EquivalenceRule::Exportation, EquivalenceRule::DoubleNegation],
            // Combo 4: Equivalence + De Morgan
            vec![EquivalenceRule::Equivalence, EquivalenceRule::DeMorgan],
        ];

        // Shuffle and pick combos
        let mut indices: Vec<usize> = (0..gnarly_rules.len()).collect();
        for i in (1..indices.len()).rev() {
            let j = rng.gen_range(0..=i);
            indices.swap(i, j);
        }

        for i in 0..combo_count.min(indices.len()) {
            let combo = &gnarly_rules[indices[i]];
            for rule in combo {
                if let Some(transformed) = self.try_apply_specific_rule(&formula, *rule, rng) {
                    formula = transformed;
                }
            }
        }

        formula
    }

    /// Try to apply a specific equivalence rule to some subformula
    fn try_apply_specific_rule(&self, formula: &Formula, rule: EquivalenceRule, rng: &mut impl Rng) -> Option<Formula> {
        let subformulas = formula.subformulas();
        if subformulas.is_empty() {
            return None;
        }

        // Shuffle subformulas
        let mut indices: Vec<usize> = (0..subformulas.len()).collect();
        for i in (1..indices.len()).rev() {
            let j = rng.gen_range(0..=i);
            indices.swap(i, j);
        }

        for &idx in &indices {
            let subformula = &subformulas[idx];
            let equivalents = rule.equivalent_forms(subformula);

            if !equivalents.is_empty() {
                let equivalent = &equivalents[rng.gen_range(0..equivalents.len())];
                let result = EquivalenceRule::replace_subformula(formula, subformula, equivalent);

                if is_tautology(&result) {
                    return Some(result);
                }
            }
        }

        None
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
        assert!(config.transform_count <= 3, "Easy should have 1-3 transforms, got {}", config.transform_count);
        assert_eq!(config.atom_pool.len(), 2);
    }

    #[test]
    fn test_config_expert() {
        let config = ObfuscateConfig::for_difficulty_value(80);
        assert_eq!(config.difficulty, Difficulty::Expert);
        assert!(config.transform_count >= 11, "Expert should have 11+ transforms, got {}", config.transform_count);
        assert!(config.atom_pool.len() >= 4, "Expert (80) should have 4 atoms");
    }

    #[test]
    fn test_config_nightmare() {
        let config = ObfuscateConfig::for_difficulty_value(90);
        assert_eq!(config.difficulty, Difficulty::Expert); // Still maps to Expert preset
        assert!(config.transform_count >= 16, "Nightmare should have 16+ transforms, got {}", config.transform_count);
        assert_eq!(config.atom_pool.len(), 5, "Nightmare (90) should have 5 atoms");
    }

    #[test]
    fn test_config_marathon() {
        let config = ObfuscateConfig::for_difficulty_value(98);
        assert_eq!(config.difficulty, Difficulty::Expert); // Still maps to Expert preset
        assert!(config.transform_count >= 20, "Marathon should have 20+ transforms, got {}", config.transform_count);
        assert_eq!(config.atom_pool.len(), 5, "Marathon should have 5 atoms");
    }

    #[test]
    fn test_difficulty_scaling_progression() {
        // Verify transform counts increase with difficulty
        let configs: Vec<_> = [10, 30, 50, 75, 90, 98]
            .iter()
            .map(|&d| (d, ObfuscateConfig::for_difficulty_value(d)))
            .collect();

        for window in configs.windows(2) {
            let (d1, c1) = &window[0];
            let (d2, c2) = &window[1];
            assert!(
                c2.transform_count >= c1.transform_count,
                "Transforms should increase: d={} has {}, d={} has {}",
                d1, c1.transform_count, d2, c2.transform_count
            );
        }
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

    #[test]
    fn test_substitution_config_scaling() {
        // Low difficulty: no substitution
        let low_config = ObfuscateConfig::for_difficulty_value(50);
        assert_eq!(low_config.substitution_depth, 0, "Low difficulty should have no substitution");

        // Medium-high difficulty: simple substitution
        let mid_config = ObfuscateConfig::for_difficulty_value(75);
        assert_eq!(mid_config.substitution_depth, 1, "Difficulty 75 should have depth 1 substitution");

        // High difficulty: complex substitution
        let high_config = ObfuscateConfig::for_difficulty_value(90);
        assert_eq!(high_config.substitution_depth, 2, "High difficulty should have depth 2 substitution");
    }

    #[test]
    fn test_substitution_increases_complexity() {
        let mut rng = rand::thread_rng();

        // High difficulty: has substitution
        let high_config = ObfuscateConfig::for_difficulty_value(90);
        assert!(high_config.substitution_depth >= 1);

        let gen = ObfuscateGenerator::new(high_config);
        let theorem = gen.generate(&mut rng);

        // Should be a tautology
        assert!(is_tautology(&theorem.conclusion), "Generated formula should be a tautology");

        // Should have multiple atoms (A, B, C, D, etc. from substitutions)
        let atoms = theorem.conclusion.atoms();
        assert!(atoms.len() >= 3, "High difficulty with substitutions should have 3+ atoms, got {}", atoms.len());

        // Should be deep
        assert!(theorem.conclusion.depth() >= 4, "High difficulty should produce deep formulas, got {}", theorem.conclusion.depth());
    }

    #[test]
    fn test_substitution_preserves_validity() {
        let mut rng = rand::thread_rng();

        // Test multiple times for randomness
        for difficulty in [70, 80, 90, 100] {
            let config = ObfuscateConfig::for_difficulty_value(difficulty);
            let gen = ObfuscateGenerator::new(config);

            for _ in 0..5 {
                let theorem = gen.generate(&mut rng);
                assert!(
                    is_tautology(&theorem.conclusion),
                    "Difficulty {} should produce tautology, got: {}",
                    difficulty,
                    theorem.conclusion.display_string()
                );
            }
        }
    }

    #[test]
    fn test_random_formula_generation() {
        let config = ObfuscateConfig::for_difficulty_value(90);
        let gen = ObfuscateGenerator::new(config);
        let mut rng = rand::thread_rng();

        // Test that random formulas have expected properties
        let atoms = vec!["A".to_string(), "B".to_string()];

        for _ in 0..10 {
            let formula = gen.random_formula(&mut rng, 2, &atoms);
            let formula_atoms = formula.atoms();

            // All atoms should be from the provided list
            for atom in formula_atoms.iter() {
                assert!(
                    atoms.contains(atom),
                    "Formula atom {} not in provided atoms {:?}",
                    atom, atoms
                );
            }

            // Should have reasonable depth
            assert!(formula.depth() <= 4, "Random formula depth should be bounded");
        }
    }
}
