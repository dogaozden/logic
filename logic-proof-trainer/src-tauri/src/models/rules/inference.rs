use serde::{Deserialize, Serialize};
use crate::models::formula::Formula;

/// All inference rules in the natural deduction system
/// Consolidated to single rules that try all variants automatically
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum InferenceRule {
    // Basic rules
    ModusPonens,          // P → Q, P ⊢ Q
    ModusTollens,         // P → Q, ~Q ⊢ ~P
    HypotheticalSyllogism, // P → Q, Q → R ⊢ P → R
    DisjunctiveSyllogism, // P ∨ Q, ~P ⊢ Q (or ~Q ⊢ P)
    ConstructiveDilemma,  // (P → Q) · (R → S), P ∨ R ⊢ Q ∨ S

    // Conjunction rules
    ConjunctionIntro,     // P, Q ⊢ P · Q
    ConjunctionElim,      // P · Q ⊢ P or P · Q ⊢ Q (tries both)

    // Disjunction rules
    DisjunctionIntro,     // P ⊢ P ∨ Q or P ⊢ Q ∨ P (tries both based on target)
    DisjunctionElim,      // P ∨ Q, P → R, Q → R ⊢ R

    // Double negation - tries both directions
    DoubleNegation,       // P ⊢ ~~P or ~~P ⊢ P

    // Biconditional rules
    BiconditionalIntro,   // P → Q, Q → P ⊢ P ≡ Q
    BiconditionalElim,    // P ≡ Q, P ⊢ Q or P ≡ Q, Q ⊢ P (tries both)

    // Reiteration
    Reiteration,          // P ⊢ P
}

impl InferenceRule {
    pub fn name(&self) -> &'static str {
        match self {
            InferenceRule::ModusPonens => "Modus Ponens",
            InferenceRule::ModusTollens => "Modus Tollens",
            InferenceRule::HypotheticalSyllogism => "Hypothetical Syllogism",
            InferenceRule::DisjunctiveSyllogism => "Disjunctive Syllogism",
            InferenceRule::ConstructiveDilemma => "Constructive Dilemma",
            InferenceRule::ConjunctionIntro => "Conjunction Introduction",
            InferenceRule::ConjunctionElim => "Conjunction Elimination",
            InferenceRule::DisjunctionIntro => "Disjunction Introduction",
            InferenceRule::DisjunctionElim => "Disjunction Elimination",
            InferenceRule::DoubleNegation => "Double Negation",
            InferenceRule::BiconditionalIntro => "Biconditional Introduction",
            InferenceRule::BiconditionalElim => "Biconditional Elimination",
            InferenceRule::Reiteration => "Reiteration",
        }
    }

    pub fn abbreviation(&self) -> &'static str {
        match self {
            InferenceRule::ModusPonens => "MP",
            InferenceRule::ModusTollens => "MT",
            InferenceRule::HypotheticalSyllogism => "HS",
            InferenceRule::DisjunctiveSyllogism => "DS",
            InferenceRule::ConstructiveDilemma => "CD",
            InferenceRule::ConjunctionIntro => "∧I",
            InferenceRule::ConjunctionElim => "∧E",
            InferenceRule::DisjunctionIntro => "∨I",
            InferenceRule::DisjunctionElim => "∨E",
            InferenceRule::DoubleNegation => "DN",
            InferenceRule::BiconditionalIntro => "≡I",
            InferenceRule::BiconditionalElim => "≡E",
            InferenceRule::Reiteration => "R",
        }
    }

    /// Number of premises required for this rule
    pub fn premise_count(&self) -> usize {
        match self {
            InferenceRule::ModusPonens => 2,
            InferenceRule::ModusTollens => 2,
            InferenceRule::HypotheticalSyllogism => 2,
            InferenceRule::DisjunctiveSyllogism => 2,
            InferenceRule::ConstructiveDilemma => 2,
            InferenceRule::ConjunctionIntro => 2,
            InferenceRule::ConjunctionElim => 1,
            InferenceRule::DisjunctionIntro => 1,
            InferenceRule::DisjunctionElim => 3,
            InferenceRule::DoubleNegation => 1,
            InferenceRule::BiconditionalIntro => 2,
            InferenceRule::BiconditionalElim => 2,
            InferenceRule::Reiteration => 1,
        }
    }

    /// Does this rule require additional formula input?
    pub fn requires_formula_input(&self) -> bool {
        matches!(self, InferenceRule::DisjunctionIntro)
    }

    /// Get all possible conclusions from applying this rule to the premises
    /// This returns all valid conclusions (for rules with variants like ConjunctionElim)
    pub fn all_conclusions(&self, premises: &[&Formula], additional: Option<&Formula>) -> Vec<Formula> {
        let mut results = Vec::new();

        match self {
            InferenceRule::ModusPonens => {
                // P → Q, P ⊢ Q
                if premises.len() != 2 {
                    return results;
                }
                for (i, j) in [(0, 1), (1, 0)] {
                    if let Formula::Implies(antecedent, consequent) = premises[i] {
                        if antecedent.as_ref() == premises[j] {
                            results.push(consequent.as_ref().clone());
                        }
                    }
                }
            }

            InferenceRule::ModusTollens => {
                // P → Q, ~Q ⊢ ~P
                if premises.len() != 2 {
                    return results;
                }
                for (i, j) in [(0, 1), (1, 0)] {
                    if let Formula::Implies(antecedent, consequent) = premises[i] {
                        if let Formula::Not(inner) = premises[j] {
                            if consequent.as_ref() == inner.as_ref() {
                                results.push(Formula::Not(antecedent.clone()));
                            }
                        }
                    }
                }
            }

            InferenceRule::HypotheticalSyllogism => {
                // P → Q, Q → R ⊢ P → R
                if premises.len() != 2 {
                    return results;
                }
                for (i, j) in [(0, 1), (1, 0)] {
                    if let Formula::Implies(p, q1) = premises[i] {
                        if let Formula::Implies(q2, r) = premises[j] {
                            if q1.as_ref() == q2.as_ref() {
                                results.push(Formula::Implies(p.clone(), r.clone()));
                            }
                        }
                    }
                }
            }

            InferenceRule::DisjunctiveSyllogism => {
                // P ∨ Q, ~P ⊢ Q  or  P ∨ Q, ~Q ⊢ P
                if premises.len() != 2 {
                    return results;
                }
                for (i, j) in [(0, 1), (1, 0)] {
                    if let Formula::Or(left, right) = premises[i] {
                        if let Formula::Not(negated) = premises[j] {
                            if negated.as_ref() == left.as_ref() {
                                results.push(right.as_ref().clone());
                            }
                            if negated.as_ref() == right.as_ref() {
                                results.push(left.as_ref().clone());
                            }
                        }
                    }
                }
            }

            InferenceRule::ConstructiveDilemma => {
                // (P → Q) · (R → S), P ∨ R ⊢ Q ∨ S
                if premises.len() != 2 {
                    return results;
                }
                for (i, j) in [(0, 1), (1, 0)] {
                    if let Formula::And(left_conj, right_conj) = premises[i] {
                        if let (
                            Formula::Implies(p, q),
                            Formula::Implies(r, s),
                        ) = (left_conj.as_ref(), right_conj.as_ref())
                        {
                            if let Formula::Or(left_disj, right_disj) = premises[j] {
                                if p.as_ref() == left_disj.as_ref() && r.as_ref() == right_disj.as_ref() {
                                    results.push(Formula::Or(q.clone(), s.clone()));
                                }
                                if p.as_ref() == right_disj.as_ref() && r.as_ref() == left_disj.as_ref() {
                                    results.push(Formula::Or(q.clone(), s.clone()));
                                }
                            }
                        }
                    }
                }
            }

            InferenceRule::ConjunctionIntro => {
                // P, Q ⊢ P · Q
                if premises.len() != 2 {
                    return results;
                }
                results.push(Formula::And(
                    Box::new(premises[0].clone()),
                    Box::new(premises[1].clone()),
                ));
            }

            InferenceRule::ConjunctionElim => {
                // P · Q ⊢ P and P · Q ⊢ Q (both variants)
                if premises.len() != 1 {
                    return results;
                }
                if let Formula::And(left, right) = premises[0] {
                    results.push(left.as_ref().clone());
                    results.push(right.as_ref().clone());
                }
            }

            InferenceRule::DisjunctionIntro => {
                // P ⊢ P ∨ Q and P ⊢ Q ∨ P (requires additional formula)
                if premises.len() != 1 {
                    return results;
                }
                if let Some(additional) = additional {
                    // P ∨ Q (premise on left)
                    results.push(Formula::Or(
                        Box::new(premises[0].clone()),
                        Box::new(additional.clone()),
                    ));
                    // Q ∨ P (premise on right)
                    results.push(Formula::Or(
                        Box::new(additional.clone()),
                        Box::new(premises[0].clone()),
                    ));
                }
            }

            InferenceRule::DisjunctionElim => {
                // P ∨ Q, P → R, Q → R ⊢ R
                if premises.len() != 3 {
                    return results;
                }
                // Try all permutations
                for (i, j, k) in [
                    (0, 1, 2), (0, 2, 1), (1, 0, 2), (1, 2, 0), (2, 0, 1), (2, 1, 0),
                ] {
                    if let Formula::Or(p, q) = premises[i] {
                        if let Formula::Implies(p2, r1) = premises[j] {
                            if let Formula::Implies(q2, r2) = premises[k] {
                                if p.as_ref() == p2.as_ref()
                                    && q.as_ref() == q2.as_ref()
                                    && r1.as_ref() == r2.as_ref()
                                {
                                    results.push(r1.as_ref().clone());
                                }
                            }
                        }
                    }
                }
            }

            InferenceRule::DoubleNegation => {
                // P ⊢ ~~P and ~~P ⊢ P (both directions)
                if premises.len() != 1 {
                    return results;
                }
                // Introduction: P ⊢ ~~P
                results.push(Formula::Not(Box::new(Formula::Not(Box::new(
                    premises[0].clone(),
                )))));
                // Elimination: ~~P ⊢ P
                if let Formula::Not(inner) = premises[0] {
                    if let Formula::Not(inner_inner) = inner.as_ref() {
                        results.push(inner_inner.as_ref().clone());
                    }
                }
            }

            InferenceRule::BiconditionalIntro => {
                // P → Q, Q → P ⊢ P ≡ Q
                if premises.len() != 2 {
                    return results;
                }
                for (i, j) in [(0, 1), (1, 0)] {
                    if let Formula::Implies(p1, q1) = premises[i] {
                        if let Formula::Implies(q2, p2) = premises[j] {
                            if p1.as_ref() == p2.as_ref() && q1.as_ref() == q2.as_ref() {
                                results.push(Formula::Biconditional(p1.clone(), q1.clone()));
                            }
                        }
                    }
                }
            }

            InferenceRule::BiconditionalElim => {
                // P ≡ Q, P ⊢ Q and P ≡ Q, Q ⊢ P (both directions)
                if premises.len() != 2 {
                    return results;
                }
                for (i, j) in [(0, 1), (1, 0)] {
                    if let Formula::Biconditional(p, q) = premises[i] {
                        if p.as_ref() == premises[j] {
                            results.push(q.as_ref().clone());
                        }
                        if q.as_ref() == premises[j] {
                            results.push(p.as_ref().clone());
                        }
                    }
                }
            }

            InferenceRule::Reiteration => {
                // P ⊢ P
                if premises.len() != 1 {
                    return results;
                }
                results.push(premises[0].clone());
            }
        }

        results
    }

    /// Apply the rule to the given premises (returns first valid conclusion)
    pub fn apply(&self, premises: &[&Formula], additional: Option<&Formula>) -> Option<Formula> {
        self.all_conclusions(premises, additional).into_iter().next()
    }

    /// Verify that the conclusion follows from the premises using this rule
    pub fn verify(&self, premises: &[&Formula], conclusion: &Formula, additional: Option<&Formula>) -> bool {
        self.all_conclusions(premises, additional).contains(conclusion)
    }

    /// Get all inference rules
    pub fn all() -> Vec<InferenceRule> {
        vec![
            InferenceRule::ModusPonens,
            InferenceRule::ModusTollens,
            InferenceRule::HypotheticalSyllogism,
            InferenceRule::DisjunctiveSyllogism,
            InferenceRule::ConstructiveDilemma,
            InferenceRule::ConjunctionIntro,
            InferenceRule::ConjunctionElim,
            InferenceRule::DisjunctionIntro,
            InferenceRule::DisjunctionElim,
            InferenceRule::DoubleNegation,
            InferenceRule::BiconditionalIntro,
            InferenceRule::BiconditionalElim,
            InferenceRule::Reiteration,
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_modus_ponens() {
        let p_implies_q = Formula::parse("P -> Q").unwrap();
        let p = Formula::parse("P").unwrap();
        let q = Formula::parse("Q").unwrap();

        let result = InferenceRule::ModusPonens.apply(&[&p_implies_q, &p], None);
        assert_eq!(result, Some(q.clone()));

        // Order shouldn't matter
        let result = InferenceRule::ModusPonens.apply(&[&p, &p_implies_q], None);
        assert_eq!(result, Some(q));
    }

    #[test]
    fn test_modus_tollens() {
        let p_implies_q = Formula::parse("P -> Q").unwrap();
        let not_q = Formula::parse("~Q").unwrap();
        let not_p = Formula::parse("~P").unwrap();

        let result = InferenceRule::ModusTollens.apply(&[&p_implies_q, &not_q], None);
        assert_eq!(result, Some(not_p));
    }

    #[test]
    fn test_hypothetical_syllogism() {
        let p_implies_q = Formula::parse("P -> Q").unwrap();
        let q_implies_r = Formula::parse("Q -> R").unwrap();
        let p_implies_r = Formula::parse("P -> R").unwrap();

        let result = InferenceRule::HypotheticalSyllogism.apply(&[&p_implies_q, &q_implies_r], None);
        assert_eq!(result, Some(p_implies_r));
    }

    #[test]
    fn test_disjunctive_syllogism() {
        let p_or_q = Formula::parse("P | Q").unwrap();
        let not_p = Formula::parse("~P").unwrap();
        let q = Formula::parse("Q").unwrap();

        let result = InferenceRule::DisjunctiveSyllogism.apply(&[&p_or_q, &not_p], None);
        assert_eq!(result, Some(q));
    }

    #[test]
    fn test_conjunction_intro() {
        let p = Formula::parse("P").unwrap();
        let q = Formula::parse("Q").unwrap();
        let p_and_q = Formula::parse("P & Q").unwrap();

        let result = InferenceRule::ConjunctionIntro.apply(&[&p, &q], None);
        assert_eq!(result, Some(p_and_q));
    }

    #[test]
    fn test_conjunction_elim() {
        let p_and_q = Formula::parse("P & Q").unwrap();
        let p = Formula::parse("P").unwrap();
        let q = Formula::parse("Q").unwrap();

        // Should return both possible conclusions
        let conclusions = InferenceRule::ConjunctionElim.all_conclusions(&[&p_and_q], None);
        assert!(conclusions.contains(&p));
        assert!(conclusions.contains(&q));

        // Verify works with either
        assert!(InferenceRule::ConjunctionElim.verify(&[&p_and_q], &p, None));
        assert!(InferenceRule::ConjunctionElim.verify(&[&p_and_q], &q, None));
    }

    #[test]
    fn test_double_negation() {
        let p = Formula::parse("P").unwrap();
        let not_not_p = Formula::parse("~~P").unwrap();

        // Both directions should work
        assert!(InferenceRule::DoubleNegation.verify(&[&p], &not_not_p, None));
        assert!(InferenceRule::DoubleNegation.verify(&[&not_not_p], &p, None));
    }

    #[test]
    fn test_disjunction_intro() {
        let p = Formula::parse("P").unwrap();
        let q = Formula::parse("Q").unwrap();
        let p_or_q = Formula::parse("P | Q").unwrap();
        let q_or_p = Formula::parse("Q | P").unwrap();

        // Both placements should work
        assert!(InferenceRule::DisjunctionIntro.verify(&[&p], &p_or_q, Some(&q)));
        assert!(InferenceRule::DisjunctionIntro.verify(&[&p], &q_or_p, Some(&q)));
    }

    #[test]
    fn test_biconditional_elim() {
        let p_iff_q = Formula::parse("P <-> Q").unwrap();
        let p = Formula::parse("P").unwrap();
        let q = Formula::parse("Q").unwrap();

        // Both directions should work
        assert!(InferenceRule::BiconditionalElim.verify(&[&p_iff_q, &p], &q, None));
        assert!(InferenceRule::BiconditionalElim.verify(&[&p_iff_q, &q], &p, None));
    }

    #[test]
    fn test_reiteration() {
        let p = Formula::parse("P").unwrap();
        let result = InferenceRule::Reiteration.apply(&[&p], None);
        assert_eq!(result, Some(p));
    }
}
