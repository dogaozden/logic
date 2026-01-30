use serde::{Deserialize, Serialize};
use crate::models::formula::Formula;

/// All equivalence rules (replacement rules) in the natural deduction system
/// Consolidated to single rules that try all variants automatically
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EquivalenceRule {
    // De Morgan's Laws - tries both ~(P · Q) ≡ ~P ∨ ~Q and ~(P ∨ Q) ≡ ~P · ~Q
    DeMorgan,

    // Commutation - P · Q ≡ Q · P, P ∨ Q ≡ Q ∨ P
    Commutation,

    // Association - (P · Q) · R ≡ P · (Q · R), (P ∨ Q) ∨ R ≡ P ∨ (Q ∨ R)
    Association,

    // Distribution - tries both P · (Q ∨ R) ≡ (P · Q) ∨ (P · R) and P ∨ (Q · R) ≡ (P ∨ Q) · (P ∨ R)
    Distribution,

    // Contraposition - P → Q ≡ ~Q → ~P
    Contraposition,

    // Material Implication - P → Q ≡ ~P ∨ Q
    MaterialImplication,

    // Material Equivalence - P ≡ Q ≡ (P → Q) · (Q → P) ≡ (P · Q) ∨ (~P · ~Q)
    MaterialEquivalence,

    // Exportation - (P · Q) → R ≡ P → (Q → R)
    Exportation,

    // Tautology - P ≡ P · P, P ≡ P ∨ P
    Tautology,

    // Absorption - P · (P ∨ Q) ≡ P, P ∨ (P · Q) ≡ P
    Absorption,

    // Double Negation - P ≡ ~~P
    DoubleNegation,
}

impl EquivalenceRule {
    pub fn name(&self) -> &'static str {
        match self {
            EquivalenceRule::DeMorgan => "De Morgan's",
            EquivalenceRule::Commutation => "Commutation",
            EquivalenceRule::Association => "Association",
            EquivalenceRule::Distribution => "Distribution",
            EquivalenceRule::Contraposition => "Contraposition",
            EquivalenceRule::MaterialImplication => "Material Implication",
            EquivalenceRule::MaterialEquivalence => "Material Equivalence",
            EquivalenceRule::Exportation => "Exportation",
            EquivalenceRule::Tautology => "Tautology",
            EquivalenceRule::Absorption => "Absorption",
            EquivalenceRule::DoubleNegation => "Double Negation",
        }
    }

    pub fn abbreviation(&self) -> &'static str {
        match self {
            EquivalenceRule::DeMorgan => "DeM",
            EquivalenceRule::Commutation => "Com",
            EquivalenceRule::Association => "Assoc",
            EquivalenceRule::Distribution => "Dist",
            EquivalenceRule::Contraposition => "Contra",
            EquivalenceRule::MaterialImplication => "Impl",
            EquivalenceRule::MaterialEquivalence => "Equiv",
            EquivalenceRule::Exportation => "Exp",
            EquivalenceRule::Tautology => "Taut",
            EquivalenceRule::Absorption => "Abs",
            EquivalenceRule::DoubleNegation => "DN",
        }
    }

    /// Get all equivalent forms of the given formula using this rule
    /// Returns forms where the transformation was applied at the top level
    pub fn equivalent_forms(&self, formula: &Formula) -> Vec<Formula> {
        let mut results = Vec::new();

        match self {
            EquivalenceRule::DeMorgan => {
                // ~(P · Q) ≡ ~P ∨ ~Q (De Morgan for And)
                if let Formula::Not(inner) = formula {
                    if let Formula::And(p, q) = inner.as_ref() {
                        results.push(Formula::Or(
                            Box::new(Formula::Not(p.clone())),
                            Box::new(Formula::Not(q.clone())),
                        ));
                    }
                }
                if let Formula::Or(left, right) = formula {
                    if let (Formula::Not(p), Formula::Not(q)) = (left.as_ref(), right.as_ref()) {
                        results.push(Formula::Not(Box::new(Formula::And(
                            p.clone(),
                            q.clone(),
                        ))));
                    }
                }

                // ~(P ∨ Q) ≡ ~P · ~Q (De Morgan for Or)
                if let Formula::Not(inner) = formula {
                    if let Formula::Or(p, q) = inner.as_ref() {
                        results.push(Formula::And(
                            Box::new(Formula::Not(p.clone())),
                            Box::new(Formula::Not(q.clone())),
                        ));
                    }
                }
                if let Formula::And(left, right) = formula {
                    if let (Formula::Not(p), Formula::Not(q)) = (left.as_ref(), right.as_ref()) {
                        results.push(Formula::Not(Box::new(Formula::Or(
                            p.clone(),
                            q.clone(),
                        ))));
                    }
                }
            }

            EquivalenceRule::Commutation => {
                // P · Q ≡ Q · P, P ∨ Q ≡ Q ∨ P
                match formula {
                    Formula::And(p, q) => {
                        results.push(Formula::And(q.clone(), p.clone()));
                    }
                    Formula::Or(p, q) => {
                        results.push(Formula::Or(q.clone(), p.clone()));
                    }
                    _ => {}
                }
            }

            EquivalenceRule::Association => {
                // (P · Q) · R ≡ P · (Q · R)
                // (P ∨ Q) ∨ R ≡ P ∨ (Q ∨ R)
                match formula {
                    Formula::And(left, r) => {
                        if let Formula::And(p, q) = left.as_ref() {
                            results.push(Formula::And(
                                p.clone(),
                                Box::new(Formula::And(q.clone(), r.clone())),
                            ));
                        }
                    }
                    Formula::Or(left, r) => {
                        if let Formula::Or(p, q) = left.as_ref() {
                            results.push(Formula::Or(
                                p.clone(),
                                Box::new(Formula::Or(q.clone(), r.clone())),
                            ));
                        }
                    }
                    _ => {}
                }
                // Also handle the other direction
                match formula {
                    Formula::And(p, right) => {
                        if let Formula::And(q, r) = right.as_ref() {
                            results.push(Formula::And(
                                Box::new(Formula::And(p.clone(), q.clone())),
                                r.clone(),
                            ));
                        }
                    }
                    Formula::Or(p, right) => {
                        if let Formula::Or(q, r) = right.as_ref() {
                            results.push(Formula::Or(
                                Box::new(Formula::Or(p.clone(), q.clone())),
                                r.clone(),
                            ));
                        }
                    }
                    _ => {}
                }
            }

            EquivalenceRule::Distribution => {
                // P · (Q ∨ R) ≡ (P · Q) ∨ (P · R) (And over Or)
                if let Formula::And(p, right) = formula {
                    if let Formula::Or(q, r) = right.as_ref() {
                        results.push(Formula::Or(
                            Box::new(Formula::And(p.clone(), q.clone())),
                            Box::new(Formula::And(p.clone(), r.clone())),
                        ));
                    }
                }
                if let Formula::Or(left, right) = formula {
                    if let (Formula::And(p1, q), Formula::And(p2, r)) = (left.as_ref(), right.as_ref()) {
                        if p1 == p2 {
                            results.push(Formula::And(
                                p1.clone(),
                                Box::new(Formula::Or(q.clone(), r.clone())),
                            ));
                        }
                    }
                }

                // P ∨ (Q · R) ≡ (P ∨ Q) · (P ∨ R) (Or over And)
                if let Formula::Or(p, right) = formula {
                    if let Formula::And(q, r) = right.as_ref() {
                        results.push(Formula::And(
                            Box::new(Formula::Or(p.clone(), q.clone())),
                            Box::new(Formula::Or(p.clone(), r.clone())),
                        ));
                    }
                }
                if let Formula::And(left, right) = formula {
                    if let (Formula::Or(p1, q), Formula::Or(p2, r)) = (left.as_ref(), right.as_ref()) {
                        if p1 == p2 {
                            results.push(Formula::Or(
                                p1.clone(),
                                Box::new(Formula::And(q.clone(), r.clone())),
                            ));
                        }
                    }
                }
            }

            EquivalenceRule::Contraposition => {
                // P → Q ≡ ~Q → ~P
                if let Formula::Implies(p, q) = formula {
                    results.push(Formula::Implies(
                        Box::new(Formula::Not(q.clone())),
                        Box::new(Formula::Not(p.clone())),
                    ));
                }
                // Also handle double negation cases
                if let Formula::Implies(not_q, not_p) = formula {
                    if let (Formula::Not(q), Formula::Not(p)) = (not_q.as_ref(), not_p.as_ref()) {
                        results.push(Formula::Implies(p.clone(), q.clone()));
                    }
                }
            }

            EquivalenceRule::MaterialImplication => {
                // P → Q ≡ ~P ∨ Q
                if let Formula::Implies(p, q) = formula {
                    results.push(Formula::Or(
                        Box::new(Formula::Not(p.clone())),
                        q.clone(),
                    ));
                }
                if let Formula::Or(left, q) = formula {
                    if let Formula::Not(p) = left.as_ref() {
                        results.push(Formula::Implies(p.clone(), q.clone()));
                    }
                }
            }

            EquivalenceRule::MaterialEquivalence => {
                // P ≡ Q ≡ (P → Q) · (Q → P) ≡ (P · Q) ∨ (~P · ~Q)
                if let Formula::Biconditional(p, q) = formula {
                    // To conjunction of implications
                    results.push(Formula::And(
                        Box::new(Formula::Implies(p.clone(), q.clone())),
                        Box::new(Formula::Implies(q.clone(), p.clone())),
                    ));
                    // To disjunction form
                    results.push(Formula::Or(
                        Box::new(Formula::And(p.clone(), q.clone())),
                        Box::new(Formula::And(
                            Box::new(Formula::Not(p.clone())),
                            Box::new(Formula::Not(q.clone())),
                        )),
                    ));
                }
                // From conjunction of implications
                if let Formula::And(left, right) = formula {
                    if let (Formula::Implies(p1, q1), Formula::Implies(q2, p2)) =
                        (left.as_ref(), right.as_ref())
                    {
                        if p1 == p2 && q1 == q2 {
                            results.push(Formula::Biconditional(p1.clone(), q1.clone()));
                        }
                    }
                }
            }

            EquivalenceRule::Exportation => {
                // (P · Q) → R ≡ P → (Q → R)
                if let Formula::Implies(left, r) = formula {
                    if let Formula::And(p, q) = left.as_ref() {
                        results.push(Formula::Implies(
                            p.clone(),
                            Box::new(Formula::Implies(q.clone(), r.clone())),
                        ));
                    }
                }
                if let Formula::Implies(p, right) = formula {
                    if let Formula::Implies(q, r) = right.as_ref() {
                        results.push(Formula::Implies(
                            Box::new(Formula::And(p.clone(), q.clone())),
                            r.clone(),
                        ));
                    }
                }
            }

            EquivalenceRule::Tautology => {
                // P ≡ P · P, P ≡ P ∨ P
                // Expansion
                results.push(Formula::And(
                    Box::new(formula.clone()),
                    Box::new(formula.clone()),
                ));
                results.push(Formula::Or(
                    Box::new(formula.clone()),
                    Box::new(formula.clone()),
                ));
                // Contraction
                if let Formula::And(p, q) = formula {
                    if p == q {
                        results.push(p.as_ref().clone());
                    }
                }
                if let Formula::Or(p, q) = formula {
                    if p == q {
                        results.push(p.as_ref().clone());
                    }
                }
            }

            EquivalenceRule::Absorption => {
                // P · (P ∨ Q) ≡ P
                // P ∨ (P · Q) ≡ P
                if let Formula::And(p, right) = formula {
                    if let Formula::Or(p2, _) = right.as_ref() {
                        if p.as_ref() == p2.as_ref() {
                            results.push(p.as_ref().clone());
                        }
                    }
                }
                if let Formula::Or(p, right) = formula {
                    if let Formula::And(p2, _) = right.as_ref() {
                        if p.as_ref() == p2.as_ref() {
                            results.push(p.as_ref().clone());
                        }
                    }
                }
            }

            EquivalenceRule::DoubleNegation => {
                // P ≡ ~~P
                results.push(Formula::Not(Box::new(Formula::Not(Box::new(formula.clone())))));
                if let Formula::Not(inner) = formula {
                    if let Formula::Not(inner_inner) = inner.as_ref() {
                        results.push(inner_inner.as_ref().clone());
                    }
                }
            }
        }

        results
    }

    /// Check if the formula can be transformed to the target using this rule
    pub fn can_transform(&self, from: &Formula, to: &Formula) -> bool {
        self.equivalent_forms(from).contains(to)
    }

    /// Apply the rule to a subformula within a larger formula
    pub fn apply_to_subformula(&self, formula: &Formula, target_subformula: &Formula, replacement: &Formula) -> Option<Formula> {
        // Check if the replacement is valid
        if !self.can_transform(target_subformula, replacement) {
            return None;
        }

        // Recursively replace the subformula
        Some(Self::replace_subformula(formula, target_subformula, replacement))
    }

    fn replace_subformula(formula: &Formula, target: &Formula, replacement: &Formula) -> Formula {
        if formula == target {
            return replacement.clone();
        }

        match formula {
            Formula::Atom(_) | Formula::Contradiction => formula.clone(),
            Formula::Not(inner) => Formula::Not(Box::new(
                Self::replace_subformula(inner, target, replacement),
            )),
            Formula::And(left, right) => Formula::And(
                Box::new(Self::replace_subformula(left, target, replacement)),
                Box::new(Self::replace_subformula(right, target, replacement)),
            ),
            Formula::Or(left, right) => Formula::Or(
                Box::new(Self::replace_subformula(left, target, replacement)),
                Box::new(Self::replace_subformula(right, target, replacement)),
            ),
            Formula::Implies(left, right) => Formula::Implies(
                Box::new(Self::replace_subformula(left, target, replacement)),
                Box::new(Self::replace_subformula(right, target, replacement)),
            ),
            Formula::Biconditional(left, right) => Formula::Biconditional(
                Box::new(Self::replace_subformula(left, target, replacement)),
                Box::new(Self::replace_subformula(right, target, replacement)),
            ),
        }
    }

    /// Get all equivalence rules
    pub fn all() -> Vec<EquivalenceRule> {
        vec![
            EquivalenceRule::DeMorgan,
            EquivalenceRule::Commutation,
            EquivalenceRule::Association,
            EquivalenceRule::Distribution,
            EquivalenceRule::Contraposition,
            EquivalenceRule::MaterialImplication,
            EquivalenceRule::MaterialEquivalence,
            EquivalenceRule::Exportation,
            EquivalenceRule::Tautology,
            EquivalenceRule::Absorption,
            EquivalenceRule::DoubleNegation,
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_demorgan_and() {
        let formula = Formula::parse("~(P & Q)").unwrap();
        let expected = Formula::parse("~P | ~Q").unwrap();

        let forms = EquivalenceRule::DeMorgan.equivalent_forms(&formula);
        assert!(forms.contains(&expected));
    }

    #[test]
    fn test_demorgan_or() {
        let formula = Formula::parse("~(P | Q)").unwrap();
        let expected = Formula::parse("~P & ~Q").unwrap();

        let forms = EquivalenceRule::DeMorgan.equivalent_forms(&formula);
        assert!(forms.contains(&expected));
    }

    #[test]
    fn test_commutation() {
        let formula = Formula::parse("P & Q").unwrap();
        let expected = Formula::parse("Q & P").unwrap();

        let forms = EquivalenceRule::Commutation.equivalent_forms(&formula);
        assert!(forms.contains(&expected));
    }

    #[test]
    fn test_material_implication() {
        let formula = Formula::parse("P -> Q").unwrap();
        let expected = Formula::parse("~P | Q").unwrap();

        let forms = EquivalenceRule::MaterialImplication.equivalent_forms(&formula);
        assert!(forms.contains(&expected));
    }

    #[test]
    fn test_contraposition() {
        let formula = Formula::parse("P -> Q").unwrap();
        let expected = Formula::parse("~Q -> ~P").unwrap();

        let forms = EquivalenceRule::Contraposition.equivalent_forms(&formula);
        assert!(forms.contains(&expected));
    }

    #[test]
    fn test_double_negation() {
        let formula = Formula::parse("P").unwrap();
        let expected = Formula::parse("~~P").unwrap();

        let forms = EquivalenceRule::DoubleNegation.equivalent_forms(&formula);
        assert!(forms.contains(&expected));

        // And the reverse
        let forms = EquivalenceRule::DoubleNegation.equivalent_forms(&expected);
        assert!(forms.contains(&formula));
    }

    #[test]
    fn test_exportation() {
        let formula = Formula::parse("(P & Q) -> R").unwrap();
        let expected = Formula::parse("P -> (Q -> R)").unwrap();

        let forms = EquivalenceRule::Exportation.equivalent_forms(&formula);
        assert!(forms.contains(&expected));
    }
}
