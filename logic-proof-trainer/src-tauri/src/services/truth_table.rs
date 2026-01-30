use crate::models::Formula;
use std::collections::HashSet;

// Constants
const MASK_32: u32 = 0xFFFFFFFF;
const TAUTOLOGY: u32 = 0xFFFFFFFF;
const CONTRADICTION: u32 = 0x00000000;

/// Variable truth tables (standard row ordering PQRST from 11111 to 00000)
fn var_truth_table(name: &str) -> u32 {
    match name {
        "P" => 0xFFFF0000,
        "Q" => 0xFF00FF00,
        "R" => 0xF0F0F0F0,
        "S" => 0xCCCCCCCC,
        "T" => 0xAAAAAAAA,
        _ => 0xFFFF0000, // Default to P pattern for unknown vars
    }
}

/// Compute 32-bit truth table for any formula
pub fn compute_truth_table(formula: &Formula) -> u32 {
    match formula {
        Formula::Atom(name) => var_truth_table(name),
        Formula::Not(inner) => !compute_truth_table(inner) & MASK_32,
        Formula::And(l, r) => compute_truth_table(l) & compute_truth_table(r),
        Formula::Or(l, r) => compute_truth_table(l) | compute_truth_table(r),
        Formula::Implies(l, r) => (!compute_truth_table(l) | compute_truth_table(r)) & MASK_32,
        Formula::Biconditional(l, r) => !(compute_truth_table(l) ^ compute_truth_table(r)) & MASK_32,
        Formula::Contradiction => CONTRADICTION,
    }
}

// === Semantic Checks ===

/// Check if a formula is a tautology (always true)
pub fn is_tautology(formula: &Formula) -> bool {
    compute_truth_table(formula) == TAUTOLOGY
}

/// Check if a formula is a contradiction (always false)
pub fn is_contradiction(formula: &Formula) -> bool {
    compute_truth_table(formula) == CONTRADICTION
}

/// Check if two formulas are semantically equivalent
pub fn are_equivalent(f1: &Formula, f2: &Formula) -> bool {
    compute_truth_table(f1) == compute_truth_table(f2)
}

/// Check if a set of premises is consistent (not contradictory)
pub fn premises_consistent(premises: &[Formula]) -> bool {
    let combined: u32 = premises.iter()
        .map(|p| compute_truth_table(p))
        .fold(TAUTOLOGY, |acc, tt| acc & tt);
    combined != CONTRADICTION
}

/// Check if premises semantically entail a conclusion
pub fn entails(premises: &[Formula], conclusion: &Formula) -> bool {
    let combined_premises: u32 = premises.iter()
        .map(|p| compute_truth_table(p))
        .fold(TAUTOLOGY, |acc, tt| acc & tt);
    let conclusion_tt = compute_truth_table(conclusion);
    // Counterexample = row where premises true but conclusion false
    (combined_premises & (!conclusion_tt & MASK_32)) == CONTRADICTION
}

/// Check if any single premise alone entails the conclusion
pub fn single_premise_entails(premises: &[Formula], conclusion: &Formula) -> bool {
    let conclusion_tt = compute_truth_table(conclusion);
    for p in premises {
        let premise_tt = compute_truth_table(p);
        // Check if premise alone entails conclusion
        if (premise_tt & (!conclusion_tt & MASK_32)) == CONTRADICTION {
            return true;
        }
    }
    false
}

/// Check if the negation of the conclusion is semantically equivalent to any premise
pub fn conclusion_negation_available(premises: &[Formula], conclusion: &Formula) -> bool {
    let neg_conclusion_tt = !compute_truth_table(conclusion) & MASK_32;
    premises.iter().any(|p| compute_truth_table(p) == neg_conclusion_tt)
}

/// Check if a conditional conclusion is trivially provable via explosion
/// (i.e., one of the antecedents' negations is available as a premise)
pub fn conditional_trivial_via_explosion(premises: &[Formula], conclusion: &Formula) -> bool {
    // Extract antecedent chain from nested conditionals
    let mut antecedents = vec![];
    let mut current = conclusion;
    while let Formula::Implies(ant, cons) = current {
        antecedents.push(ant.as_ref());
        current = cons.as_ref();
    }
    if antecedents.is_empty() { return false; }

    // Check if ~antecedent is equivalent to any premise
    for ant in antecedents {
        let neg_ant_tt = !compute_truth_table(ant) & MASK_32;
        if premises.iter().any(|p| compute_truth_table(p) == neg_ant_tt) {
            return true;
        }
    }
    false
}

/// Check if all premises are necessary for the entailment
pub fn all_premises_necessary(premises: &[Formula], conclusion: &Formula) -> bool {
    if !entails(premises, conclusion) { return false; }
    for i in 0..premises.len() {
        let reduced: Vec<_> = premises.iter().enumerate()
            .filter(|(j, _)| *j != i)
            .map(|(_, p)| p.clone())
            .collect();
        if entails(&reduced, conclusion) {
            return false; // Premise i was redundant
        }
    }
    true
}

/// Check if there are redundant (semantically equivalent) premises
pub fn has_redundant_premises(premises: &[Formula]) -> bool {
    let truth_tables: Vec<u32> = premises.iter().map(compute_truth_table).collect();
    let unique: HashSet<u32> = truth_tables.iter().copied().collect();
    truth_tables.len() != unique.len()
}

// === Main Validation ===

use super::proof_tree::DegenerateProofError;

/// Validate that a theorem is non-degenerate
pub fn validate_theorem(premises: &[Formula], conclusion: &Formula) -> Result<(), DegenerateProofError> {
    validate_theorem_with_difficulty(premises, conclusion, None, false)
}

/// Validate theorem with optional difficulty-based requirements
/// - min_steps: minimum number of proof steps required
/// - requires_subproof: if true, theorem must require CP/IP (not solvable with basic rules alone)
pub fn validate_theorem_with_difficulty(
    premises: &[Formula],
    conclusion: &Formula,
    min_steps: Option<usize>,
    requires_subproof: bool,
) -> Result<(), DegenerateProofError> {
    // 1. Premises consistent
    if !premises_consistent(premises) {
        return Err(DegenerateProofError::ContradictoryPremises);
    }

    // 2. Conclusion not a tautology
    if is_tautology(conclusion) {
        return Err(DegenerateProofError::TautologicalConclusion);
    }

    // 3. No single premise entails conclusion
    if single_premise_entails(premises, conclusion) {
        return Err(DegenerateProofError::SinglePremiseEntails);
    }

    // 4. Negation of conclusion not available
    if conclusion_negation_available(premises, conclusion) {
        return Err(DegenerateProofError::NegationOfConclusionAvailable);
    }

    // 5. Conditional not trivially provable via explosion
    if conditional_trivial_via_explosion(premises, conclusion) {
        return Err(DegenerateProofError::ConditionalTrivialViaExplosion);
    }

    // 6. No redundant premises
    if has_redundant_premises(premises) {
        return Err(DegenerateProofError::RedundantPremises);
    }

    // 7. All premises necessary
    if !all_premises_necessary(premises, conclusion) {
        return Err(DegenerateProofError::UnnecessaryPremise);
    }

    // 8. Theorem must be valid
    if !entails(premises, conclusion) {
        return Err(DegenerateProofError::InvalidTheorem);
    }

    // 9. Check minimum proof steps (difficulty enforcement)
    if let Some(min) = min_steps {
        if let Some(actual) = super::proof_search::minimum_proof_steps(premises, conclusion, min) {
            if actual < min {
                return Err(DegenerateProofError::TooEasy {
                    min_steps: min,
                    actual_steps: actual,
                });
            }
        }
    }

    // 10. Check subproof requirement (for Hard/Expert difficulty)
    if requires_subproof {
        if !super::proof_search::requires_subproof(premises, conclusion, 15) {
            return Err(DegenerateProofError::NoSubproofRequired);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn atom(name: &str) -> Formula {
        Formula::Atom(name.to_string())
    }

    fn not(f: Formula) -> Formula {
        Formula::Not(Box::new(f))
    }

    fn and(a: Formula, b: Formula) -> Formula {
        Formula::And(Box::new(a), Box::new(b))
    }

    fn or(a: Formula, b: Formula) -> Formula {
        Formula::Or(Box::new(a), Box::new(b))
    }

    fn implies(a: Formula, b: Formula) -> Formula {
        Formula::Implies(Box::new(a), Box::new(b))
    }

    // === Truth Table Tests ===

    #[test]
    fn test_atom_truth_tables() {
        assert_eq!(compute_truth_table(&atom("P")), 0xFFFF0000);
        assert_eq!(compute_truth_table(&atom("Q")), 0xFF00FF00);
        assert_eq!(compute_truth_table(&atom("R")), 0xF0F0F0F0);
    }

    #[test]
    fn test_negation_truth_table() {
        // ~P should flip all bits of P
        let p_tt = compute_truth_table(&atom("P"));
        let not_p_tt = compute_truth_table(&not(atom("P")));
        assert_eq!(not_p_tt, !p_tt & MASK_32);
    }

    #[test]
    fn test_double_negation_equivalence() {
        // ~~P should be equivalent to P
        let p = atom("P");
        let not_not_p = not(not(atom("P")));
        assert!(are_equivalent(&p, &not_not_p));
    }

    #[test]
    fn test_demorgan() {
        // ~(P & Q) should be equivalent to ~P | ~Q
        let left = not(and(atom("P"), atom("Q")));
        let right = or(not(atom("P")), not(atom("Q")));
        assert!(are_equivalent(&left, &right));
    }

    #[test]
    fn test_implication_equivalence() {
        // P -> Q should be equivalent to ~P | Q
        let impl_form = implies(atom("P"), atom("Q"));
        let disj_form = or(not(atom("P")), atom("Q"));
        assert!(are_equivalent(&impl_form, &disj_form));
    }

    // === Tautology Tests ===

    #[test]
    fn test_lem_is_tautology() {
        // P | ~P is a tautology
        let lem = or(atom("P"), not(atom("P")));
        assert!(is_tautology(&lem));
    }

    #[test]
    fn test_self_implication_is_tautology() {
        // P -> P is a tautology
        let self_impl = implies(atom("P"), atom("P"));
        assert!(is_tautology(&self_impl));
    }

    #[test]
    fn test_atom_not_tautology() {
        assert!(!is_tautology(&atom("P")));
    }

    // === Contradiction Tests ===

    #[test]
    fn test_contradiction_constant() {
        assert!(is_contradiction(&Formula::Contradiction));
    }

    #[test]
    fn test_p_and_not_p_is_contradiction() {
        let contra = and(atom("P"), not(atom("P")));
        assert!(is_contradiction(&contra));
    }

    // === Semantic Entailment Tests ===

    #[test]
    fn test_mp_entailment() {
        // P, P -> Q entails Q
        let premises = vec![atom("P"), implies(atom("P"), atom("Q"))];
        let conclusion = atom("Q");
        assert!(entails(&premises, &conclusion));
    }

    #[test]
    fn test_single_premise_entails_disjunction() {
        // P single-handedly entails P | Q
        let premises = vec![atom("P")];
        let conclusion = or(atom("P"), atom("Q"));
        assert!(single_premise_entails(&premises, &conclusion));
    }

    #[test]
    fn test_single_premise_entails_double_negation() {
        // P single-handedly entails ~~P
        let premises = vec![atom("P")];
        let conclusion = not(not(atom("P")));
        assert!(single_premise_entails(&premises, &conclusion));
    }

    // === Degenerate Proof Tests ===

    #[test]
    fn test_reject_contradictory_premises() {
        // P, ~P |- Q should be rejected
        let premises = vec![atom("P"), not(atom("P"))];
        let conclusion = atom("Q");
        assert!(matches!(
            validate_theorem(&premises, &conclusion),
            Err(DegenerateProofError::ContradictoryPremises)
        ));
    }

    #[test]
    fn test_reject_tautological_conclusion() {
        // ... |- P | ~P should be rejected
        let premises = vec![atom("Q")];
        let conclusion = or(atom("P"), not(atom("P")));
        assert!(matches!(
            validate_theorem(&premises, &conclusion),
            Err(DegenerateProofError::TautologicalConclusion)
        ));
    }

    #[test]
    fn test_reject_single_premise_entails() {
        // P |- P should be rejected (begging the question)
        let premises = vec![atom("P")];
        let conclusion = atom("P");
        assert!(matches!(
            validate_theorem(&premises, &conclusion),
            Err(DegenerateProofError::SinglePremiseEntails)
        ));
    }

    #[test]
    fn test_reject_semantic_single_premise_entails() {
        // P |- ~~P should be rejected (semantically the same)
        let premises = vec![atom("P")];
        let conclusion = not(not(atom("P")));
        assert!(matches!(
            validate_theorem(&premises, &conclusion),
            Err(DegenerateProofError::SinglePremiseEntails)
        ));
    }

    #[test]
    fn test_reject_conjunction_entails_conjunct() {
        // P & Q |- P should be rejected
        let premises = vec![and(atom("P"), atom("Q"))];
        let conclusion = atom("P");
        assert!(matches!(
            validate_theorem(&premises, &conclusion),
            Err(DegenerateProofError::SinglePremiseEntails)
        ));
    }

    #[test]
    fn test_reject_disjunction_via_add() {
        // P |- P | Q should be rejected
        let premises = vec![atom("P")];
        let conclusion = or(atom("P"), atom("Q"));
        assert!(matches!(
            validate_theorem(&premises, &conclusion),
            Err(DegenerateProofError::SinglePremiseEntails)
        ));
    }

    #[test]
    fn test_reject_semantic_contradiction() {
        // T | T, ~T |- Q should be rejected (T|T is equivalent to T)
        let premises = vec![or(atom("T"), atom("T")), not(atom("T"))];
        let conclusion = atom("Q");
        assert!(matches!(
            validate_theorem(&premises, &conclusion),
            Err(DegenerateProofError::ContradictoryPremises)
        ));
    }

    #[test]
    fn test_reject_explosion_conditional() {
        // ~P |- P -> Q should be rejected
        // Note: This gets caught by SinglePremiseEntails first, because ~P semantically
        // entails P -> Q (since P -> Q is ~P | Q, and if ~P is true, so is ~P | Q)
        let premises = vec![not(atom("P"))];
        let conclusion = implies(atom("P"), atom("Q"));
        let result = validate_theorem(&premises, &conclusion);
        assert!(result.is_err());
        // Either SinglePremiseEntails or ConditionalTrivialViaExplosion is valid
        assert!(matches!(
            result.unwrap_err(),
            DegenerateProofError::SinglePremiseEntails | DegenerateProofError::ConditionalTrivialViaExplosion
        ));
    }

    #[test]
    fn test_reject_redundant_premises() {
        // P, P, Q |- P & Q should be rejected (redundant P)
        let premises = vec![atom("P"), atom("P"), atom("Q")];
        let conclusion = and(atom("P"), atom("Q"));
        assert!(matches!(
            validate_theorem(&premises, &conclusion),
            Err(DegenerateProofError::RedundantPremises)
        ));
    }

    #[test]
    fn test_reject_unnecessary_premise() {
        // P, Q, R |- P & Q should be rejected (R unnecessary)
        let premises = vec![atom("P"), atom("Q"), atom("R")];
        let conclusion = and(atom("P"), atom("Q"));
        assert!(matches!(
            validate_theorem(&premises, &conclusion),
            Err(DegenerateProofError::UnnecessaryPremise)
        ));
    }

    #[test]
    fn test_valid_mp_theorem() {
        // P, P -> Q |- Q is valid and non-degenerate
        let premises = vec![atom("P"), implies(atom("P"), atom("Q"))];
        let conclusion = atom("Q");
        assert!(validate_theorem(&premises, &conclusion).is_ok());
    }

    #[test]
    fn test_valid_hs_theorem() {
        // P -> Q, Q -> R |- P -> R is valid and non-degenerate
        let premises = vec![
            implies(atom("P"), atom("Q")),
            implies(atom("Q"), atom("R")),
        ];
        let conclusion = implies(atom("P"), atom("R"));
        assert!(validate_theorem(&premises, &conclusion).is_ok());
    }
}
