use serde::{Deserialize, Serialize};
use crate::models::formula::Formula;

/// Proof techniques that involve subproofs
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProofTechnique {
    /// Conditional Proof: Assume P, derive Q, conclude P → Q
    ConditionalProof,

    /// Indirect Proof (Reductio ad Absurdum): Assume ~P, derive contradiction, conclude P
    IndirectProof,

    /// Negation Introduction: Assume P, derive contradiction, conclude ~P
    NegationIntroduction,
}

impl ProofTechnique {
    pub fn name(&self) -> &'static str {
        match self {
            ProofTechnique::ConditionalProof => "Conditional Proof",
            ProofTechnique::IndirectProof => "Indirect Proof",
            ProofTechnique::NegationIntroduction => "Negation Introduction",
        }
    }

    pub fn abbreviation(&self) -> &'static str {
        match self {
            ProofTechnique::ConditionalProof => "CP",
            ProofTechnique::IndirectProof => "IP",
            ProofTechnique::NegationIntroduction => "~I",
        }
    }

    pub fn description(&self) -> &'static str {
        match self {
            ProofTechnique::ConditionalProof => {
                "Assume the antecedent P, derive the consequent Q within the subproof, \
                 then conclude P → Q outside the subproof."
            }
            ProofTechnique::IndirectProof => {
                "Assume the negation ~P, derive a contradiction ⊥ within the subproof, \
                 then conclude P outside the subproof."
            }
            ProofTechnique::NegationIntroduction => {
                "Assume P, derive a contradiction ⊥ within the subproof, \
                 then conclude ~P outside the subproof."
            }
        }
    }

    /// Get the conclusion formula given the assumption and the derived formula
    pub fn get_conclusion(&self, assumption: &Formula, derived: &Formula) -> Option<Formula> {
        match self {
            ProofTechnique::ConditionalProof => {
                // Assume P, derive Q → conclude P → Q
                Some(Formula::Implies(
                    Box::new(assumption.clone()),
                    Box::new(derived.clone()),
                ))
            }
            ProofTechnique::IndirectProof => {
                // Assume ~P, derive ⊥ → conclude P
                if !matches!(derived, Formula::Contradiction) {
                    return None;
                }
                // The assumption should be ~P, and we conclude P
                if let Formula::Not(inner) = assumption {
                    Some(inner.as_ref().clone())
                } else {
                    // If assumption is P (not negated), this is actually negation introduction
                    None
                }
            }
            ProofTechnique::NegationIntroduction => {
                // Assume P, derive ⊥ → conclude ~P
                if !matches!(derived, Formula::Contradiction) {
                    return None;
                }
                Some(Formula::Not(Box::new(assumption.clone())))
            }
        }
    }

    /// Verify that the conclusion follows correctly from the subproof
    pub fn verify_conclusion(
        &self,
        assumption: &Formula,
        derived: &Formula,
        conclusion: &Formula,
    ) -> bool {
        if let Some(expected) = self.get_conclusion(assumption, derived) {
            expected == *conclusion
        } else {
            false
        }
    }

    /// Get all proof techniques
    pub fn all() -> Vec<ProofTechnique> {
        vec![
            ProofTechnique::ConditionalProof,
            ProofTechnique::IndirectProof,
            ProofTechnique::NegationIntroduction,
        ]
    }

    /// Check if this technique requires a contradiction to be derived
    pub fn requires_contradiction(&self) -> bool {
        matches!(
            self,
            ProofTechnique::IndirectProof | ProofTechnique::NegationIntroduction
        )
    }

    /// Get the type of assumption expected for this technique
    pub fn expected_assumption_type(&self) -> AssumptionType {
        match self {
            ProofTechnique::ConditionalProof => AssumptionType::Any,
            ProofTechnique::IndirectProof => AssumptionType::NegationOfTarget,
            ProofTechnique::NegationIntroduction => AssumptionType::TargetItself,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AssumptionType {
    /// Any formula can be assumed
    Any,
    /// The negation of the target conclusion should be assumed
    NegationOfTarget,
    /// The formula itself (to prove its negation) should be assumed
    TargetItself,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_conditional_proof() {
        let assumption = Formula::parse("P").unwrap();
        let derived = Formula::parse("Q").unwrap();
        let expected = Formula::parse("P -> Q").unwrap();

        let conclusion = ProofTechnique::ConditionalProof
            .get_conclusion(&assumption, &derived)
            .unwrap();
        assert_eq!(conclusion, expected);
    }

    #[test]
    fn test_indirect_proof() {
        let assumption = Formula::parse("~P").unwrap();
        let derived = Formula::Contradiction;
        let expected = Formula::parse("P").unwrap();

        let conclusion = ProofTechnique::IndirectProof
            .get_conclusion(&assumption, &derived)
            .unwrap();
        assert_eq!(conclusion, expected);
    }

    #[test]
    fn test_negation_introduction() {
        let assumption = Formula::parse("P").unwrap();
        let derived = Formula::Contradiction;
        let expected = Formula::parse("~P").unwrap();

        let conclusion = ProofTechnique::NegationIntroduction
            .get_conclusion(&assumption, &derived)
            .unwrap();
        assert_eq!(conclusion, expected);
    }

    #[test]
    fn test_indirect_proof_requires_contradiction() {
        let assumption = Formula::parse("~P").unwrap();
        let derived = Formula::parse("Q").unwrap(); // Not a contradiction

        let conclusion = ProofTechnique::IndirectProof.get_conclusion(&assumption, &derived);
        assert!(conclusion.is_none());
    }
}
