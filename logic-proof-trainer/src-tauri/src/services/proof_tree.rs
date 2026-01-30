use serde::{Deserialize, Serialize};
use crate::models::Formula;

/// Represents a node in a proof tree.
/// Each node either proves a formula directly (Premise/Assumption)
/// or derives it from child nodes via a rule application.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProofNode {
    /// A premise - an undischarged assumption that becomes part of the theorem
    Premise(Formula),

    /// An assumption made for a subproof (CP, IP, NegIntro)
    /// Will be discharged when the subproof closes
    Assumption(Formula),

    /// A derived formula from applying a rule to child nodes
    Derivation {
        /// The formula this node proves
        result: Formula,
        /// Which rule/fragment was applied
        rule: String,
        /// Sub-proofs feeding into this derivation
        children: Vec<ProofNode>,
        /// For subproof rules (CP, IP, NegIntro): the assumption made
        assumption: Option<Formula>,
    },
}

impl ProofNode {
    /// Create a new premise node
    pub fn premise(formula: Formula) -> Self {
        ProofNode::Premise(formula)
    }

    /// Create a new assumption node
    pub fn assumption(formula: Formula) -> Self {
        ProofNode::Assumption(formula)
    }

    /// Create a new derivation node
    pub fn derivation(
        result: Formula,
        rule: &str,
        children: Vec<ProofNode>,
        assumption: Option<Formula>,
    ) -> Self {
        ProofNode::Derivation {
            result,
            rule: rule.to_string(),
            children,
            assumption,
        }
    }

    /// Get the formula this node proves/establishes
    pub fn formula(&self) -> &Formula {
        match self {
            ProofNode::Premise(f) => f,
            ProofNode::Assumption(f) => f,
            ProofNode::Derivation { result, .. } => result,
        }
    }

    /// Check if this node is a premise
    pub fn is_premise(&self) -> bool {
        matches!(self, ProofNode::Premise(_))
    }

    /// Check if this node is an assumption
    pub fn is_assumption(&self) -> bool {
        matches!(self, ProofNode::Assumption(_))
    }

    /// Get the rule name if this is a derivation
    pub fn rule_name(&self) -> Option<&str> {
        match self {
            ProofNode::Derivation { rule, .. } => Some(rule),
            _ => None,
        }
    }

    /// Get children if this is a derivation
    pub fn children(&self) -> &[ProofNode] {
        match self {
            ProofNode::Derivation { children, .. } => children,
            _ => &[],
        }
    }

    /// Count total nodes in the tree
    pub fn node_count(&self) -> usize {
        match self {
            ProofNode::Premise(_) | ProofNode::Assumption(_) => 1,
            ProofNode::Derivation { children, .. } => {
                1 + children.iter().map(|c| c.node_count()).sum::<usize>()
            }
        }
    }

    /// Count derivation nodes (inference steps) in the tree
    pub fn derivation_count(&self) -> usize {
        match self {
            ProofNode::Premise(_) | ProofNode::Assumption(_) => 0,
            ProofNode::Derivation { children, .. } => {
                1 + children.iter().map(|c| c.derivation_count()).sum::<usize>()
            }
        }
    }

    /// Calculate maximum nesting depth (subproof depth)
    pub fn nesting_depth(&self) -> usize {
        match self {
            ProofNode::Premise(_) | ProofNode::Assumption(_) => 0,
            ProofNode::Derivation { rule, children, .. } => {
                let child_depth = children.iter()
                    .map(|c| c.nesting_depth())
                    .max()
                    .unwrap_or(0);

                // Rules that create subproofs add nesting
                if is_nesting_rule(rule) {
                    1 + child_depth
                } else {
                    child_depth
                }
            }
        }
    }

    /// Collect all undischarged premises (leaves that aren't in discharged scopes)
    pub fn collect_premises(&self) -> Vec<Formula> {
        let mut premises = Vec::new();
        self.collect_premises_inner(&mut premises);
        premises
    }

    fn collect_premises_inner(&self, premises: &mut Vec<Formula>) {
        match self {
            ProofNode::Premise(f) => {
                if !premises.contains(f) {
                    premises.push(f.clone());
                }
            }
            ProofNode::Assumption(_) => {
                // Assumptions are discharged by their enclosing subproof
                // Don't include them as premises
            }
            ProofNode::Derivation { children, .. } => {
                for child in children {
                    child.collect_premises_inner(premises);
                }
            }
        }
    }

    /// Pretty print the proof tree for debugging
    pub fn pretty_print(&self, indent: usize) -> String {
        let indent_str = "  ".repeat(indent);
        match self {
            ProofNode::Premise(f) => {
                format!("{}Premise: {}", indent_str, f.display_string())
            }
            ProofNode::Assumption(f) => {
                format!("{}Assumption: {}", indent_str, f.display_string())
            }
            ProofNode::Derivation { result, rule, children, assumption } => {
                let mut lines = Vec::new();

                // Print the derivation header
                if let Some(assume) = assumption {
                    lines.push(format!("{}[Assume {}]", indent_str, assume.display_string()));
                }

                // Print children
                for child in children {
                    lines.push(child.pretty_print(indent + 1));
                }

                // Print the conclusion
                lines.push(format!("{}{}: {}", indent_str, rule, result.display_string()));

                lines.join("\n")
            }
        }
    }
}

/// Check if a rule name represents a nesting (subproof-creating) rule
fn is_nesting_rule(rule: &str) -> bool {
    matches!(rule, "CP" | "IP" | "NegIntro" | "CaseSplit")
}

/// Error type for degenerate proof detection
#[derive(Debug, Clone)]
pub enum DegenerateProofError {
    /// Premises contain both P and ~P for some P
    ContradictoryPremises(Formula, Formula),
    /// A premise directly negates the conclusion
    PremiseNegatesConclusion(Formula),
    /// Conclusion is already a premise (question-begging)
    ConclusionIsPremise,
    /// Premise is a tautology (P ∨ ~P, ~P ∨ P, etc.)
    TautologicalPremise(Formula),
    /// Duplicate premises (not strictly degenerate, but wasteful)
    DuplicatePremises,
}

impl std::fmt::Display for DegenerateProofError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DegenerateProofError::ContradictoryPremises(p, not_p) => {
                write!(f, "Contradictory premises: {} and {}", p.display_string(), not_p.display_string())
            }
            DegenerateProofError::PremiseNegatesConclusion(p) => {
                write!(f, "Premise {} negates the conclusion", p.display_string())
            }
            DegenerateProofError::ConclusionIsPremise => {
                write!(f, "Conclusion is already a premise (question-begging)")
            }
            DegenerateProofError::TautologicalPremise(p) => {
                write!(f, "Tautological premise: {}", p.display_string())
            }
            DegenerateProofError::DuplicatePremises => {
                write!(f, "Duplicate premises detected")
            }
        }
    }
}

/// Check if two formulas are contradictory (one is the negation of the other)
fn are_contradictory(a: &Formula, b: &Formula) -> bool {
    // Check if b = ~a
    if let Formula::Not(inner) = b {
        if inner.as_ref() == a {
            return true;
        }
    }
    // Check if a = ~b
    if let Formula::Not(inner) = a {
        if inner.as_ref() == b {
            return true;
        }
    }
    false
}

/// Extract all formulas that are "directly available" from a formula.
/// This includes the formula itself, and for conjunctions, recursively extracts
/// both conjuncts (since they're available via Simplification).
fn extract_available(formula: &Formula, available: &mut Vec<Formula>) {
    // Add the formula itself
    if !available.contains(formula) {
        available.push(formula.clone());
    }

    // For conjunctions, both sides are available via Simp
    if let Formula::And(left, right) = formula {
        extract_available(left, available);
        extract_available(right, available);
    }
}

/// Collect all formulas that are directly derivable from premises
/// (premises themselves + anything available via Simplification)
fn collect_available_from_premises(premises: &[Formula]) -> Vec<Formula> {
    let mut available = Vec::new();
    for p in premises {
        extract_available(p, &mut available);
    }
    available
}

/// Check if a formula is a tautology (always true regardless of truth values)
/// Detects patterns like: P ∨ ~P, ~P ∨ P, P ⊃ P, etc.
fn is_tautology(formula: &Formula) -> bool {
    match formula {
        // P ∨ ~P or ~P ∨ P (law of excluded middle)
        Formula::Or(left, right) => {
            are_contradictory(left, right)
        }
        // P ⊃ P (self-implication)
        Formula::Implies(left, right) => {
            left == right
        }
        // P ≡ P (self-equivalence)
        Formula::Biconditional(left, right) => {
            left == right
        }
        // ~~P where inner is tautology
        Formula::Not(inner) => {
            if let Formula::Not(inner2) = inner.as_ref() {
                is_tautology(inner2)
            } else {
                false
            }
        }
        _ => false,
    }
}

/// Validate that premises don't create a degenerate theorem
pub fn validate_premises(premises: &[Formula], conclusion: &Formula) -> Result<(), DegenerateProofError> {
    // Expand premises to include everything available via Simplification
    let available = collect_available_from_premises(premises);

    // Check if conclusion is already available (question-begging)
    // This catches both direct premises and things derivable via Simp
    if available.contains(conclusion) {
        return Err(DegenerateProofError::ConclusionIsPremise);
    }

    // Check for tautological premises (P ∨ ~P, etc.)
    for p in premises {
        if is_tautology(p) {
            return Err(DegenerateProofError::TautologicalPremise(p.clone()));
        }
    }

    // Check for contradictory pairs in the expanded available set
    // This catches cases like: T . P as premise + ~P as premise
    // (P is available from T . P via Simp, contradicts ~P)
    for i in 0..available.len() {
        for j in (i + 1)..available.len() {
            if are_contradictory(&available[i], &available[j]) {
                return Err(DegenerateProofError::ContradictoryPremises(
                    available[i].clone(),
                    available[j].clone(),
                ));
            }
        }
    }

    // Check if any available formula negates the conclusion
    for f in &available {
        if are_contradictory(f, conclusion) {
            return Err(DegenerateProofError::PremiseNegatesConclusion(f.clone()));
        }
    }

    Ok(())
}

/// Represents a complete proof tree with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofTree {
    /// The root node of the proof tree
    pub root: ProofNode,
    /// Number of fragments/rules used
    pub fragment_count: usize,
    /// Maximum nesting depth achieved
    pub max_nesting: usize,
}

impl ProofTree {
    pub fn new(root: ProofNode) -> Self {
        let fragment_count = root.derivation_count();
        let max_nesting = root.nesting_depth();
        Self {
            root,
            fragment_count,
            max_nesting,
        }
    }

    /// Get the conclusion (what the proof proves)
    pub fn conclusion(&self) -> &Formula {
        self.root.formula()
    }

    /// Get the premises (undischarged assumptions)
    pub fn premises(&self) -> Vec<Formula> {
        self.root.collect_premises()
    }

    /// Check if this proof tree produces a degenerate theorem
    /// (contradictory premises, premise negates conclusion, etc.)
    pub fn validate(&self) -> Result<(), DegenerateProofError> {
        let premises = self.premises();
        let conclusion = self.conclusion();
        validate_premises(&premises, conclusion)
    }

    /// Check if this proof tree is valid (non-degenerate)
    pub fn is_valid(&self) -> bool {
        self.validate().is_ok()
    }

    /// Pretty print the entire proof tree
    pub fn pretty_print(&self) -> String {
        let premises = self.premises();
        let premises_str = if premises.is_empty() {
            "∅".to_string()
        } else {
            premises.iter()
                .map(|p| p.display_string())
                .collect::<Vec<_>>()
                .join(", ")
        };

        format!(
            "Theorem: {} ⊢ {}\n\
             Fragments: {}, Nesting: {}\n\n\
             Proof Tree:\n{}",
            premises_str,
            self.conclusion().display_string(),
            self.fragment_count,
            self.max_nesting,
            self.root.pretty_print(0)
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn atom(name: &str) -> Formula {
        Formula::Atom(name.to_string())
    }

    fn implies(a: Formula, b: Formula) -> Formula {
        Formula::Implies(Box::new(a), Box::new(b))
    }

    #[test]
    fn test_premise_node() {
        let p = atom("P");
        let node = ProofNode::premise(p.clone());
        assert!(node.is_premise());
        assert_eq!(node.formula(), &p);
        assert_eq!(node.node_count(), 1);
        assert_eq!(node.derivation_count(), 0);
    }

    #[test]
    fn test_simple_derivation() {
        // MP: P, P → Q ⊢ Q
        let p = atom("P");
        let q = atom("Q");
        let p_implies_q = implies(p.clone(), q.clone());

        let node = ProofNode::derivation(
            q.clone(),
            "MP",
            vec![
                ProofNode::premise(p_implies_q),
                ProofNode::premise(p),
            ],
            None,
        );

        assert_eq!(node.derivation_count(), 1);
        assert_eq!(node.nesting_depth(), 0);

        let premises = node.collect_premises();
        assert_eq!(premises.len(), 2);
    }

    #[test]
    fn test_cp_nesting() {
        // CP: ⊢ P → P (assume P, reiterate P, close)
        let p = atom("P");

        // Inside CP: just the assumption itself serves as proof of P
        let node = ProofNode::derivation(
            implies(p.clone(), p.clone()),
            "CP",
            vec![
                ProofNode::assumption(p.clone()), // The assumption proves P
            ],
            Some(p.clone()),
        );

        assert_eq!(node.derivation_count(), 1);
        assert_eq!(node.nesting_depth(), 1);

        // No premises - assumption is discharged
        let premises = node.collect_premises();
        assert_eq!(premises.len(), 0);
    }

    #[test]
    fn test_proof_tree() {
        let p = atom("P");
        let q = atom("Q");

        let root = ProofNode::derivation(
            q.clone(),
            "MP",
            vec![
                ProofNode::premise(implies(p.clone(), q.clone())),
                ProofNode::premise(p),
            ],
            None,
        );

        let tree = ProofTree::new(root);
        assert_eq!(tree.fragment_count, 1);
        assert_eq!(tree.max_nesting, 0);
        assert_eq!(tree.premises().len(), 2);
        assert_eq!(tree.conclusion(), &q);
    }

    #[test]
    fn test_contradictory_premises_detected() {
        use super::validate_premises;

        let p = atom("P");
        let not_p = Formula::Not(Box::new(p.clone()));
        let q = atom("Q");

        // P, ~P ⊢ Q should be detected as degenerate
        let premises = vec![p.clone(), not_p.clone()];
        let result = validate_premises(&premises, &q);

        assert!(result.is_err());
        match result.unwrap_err() {
            super::DegenerateProofError::ContradictoryPremises(_, _) => {}
            other => panic!("Expected ContradictoryPremises, got {:?}", other),
        }
    }

    #[test]
    fn test_premise_negates_conclusion_detected() {
        use super::validate_premises;

        let p = atom("P");
        let not_p = Formula::Not(Box::new(p.clone()));

        // ~P ⊢ P should be detected as degenerate
        let premises = vec![not_p.clone()];
        let result = validate_premises(&premises, &p);

        assert!(result.is_err());
        match result.unwrap_err() {
            super::DegenerateProofError::PremiseNegatesConclusion(_) => {}
            other => panic!("Expected PremiseNegatesConclusion, got {:?}", other),
        }
    }

    #[test]
    fn test_valid_premises_pass() {
        use super::validate_premises;

        let p = atom("P");
        let q = atom("Q");
        let p_implies_q = implies(p.clone(), q.clone());

        // P, P → Q ⊢ Q is valid (not degenerate)
        let premises = vec![p, p_implies_q];
        let result = validate_premises(&premises, &q);

        assert!(result.is_ok());
    }

    #[test]
    fn test_conclusion_is_premise_detected() {
        use super::validate_premises;

        let p = atom("P");
        let q = atom("Q");

        // P, Q ⊢ P is question-begging
        let premises = vec![p.clone(), q];
        let result = validate_premises(&premises, &p);

        assert!(result.is_err());
        match result.unwrap_err() {
            super::DegenerateProofError::ConclusionIsPremise => {}
            other => panic!("Expected ConclusionIsPremise, got {:?}", other),
        }
    }

    #[test]
    fn test_tautological_premise_detected() {
        use super::validate_premises;

        let p = atom("P");
        let q = atom("Q");
        // P ∨ ~P is a tautology
        let tautology = Formula::Or(
            Box::new(p.clone()),
            Box::new(Formula::Not(Box::new(p.clone()))),
        );

        // (P ∨ ~P) ⊢ Q has a tautological premise
        let premises = vec![tautology.clone()];
        let result = validate_premises(&premises, &q);

        assert!(result.is_err());
        match result.unwrap_err() {
            super::DegenerateProofError::TautologicalPremise(_) => {}
            other => panic!("Expected TautologicalPremise, got {:?}", other),
        }
    }

    #[test]
    fn test_self_implication_tautology() {
        use super::is_tautology;

        let p = atom("P");

        // P ⊃ P is a tautology
        let self_impl = implies(p.clone(), p.clone());
        assert!(is_tautology(&self_impl));

        // P ⊃ Q is not a tautology
        let q = atom("Q");
        let normal_impl = implies(p, q);
        assert!(!is_tautology(&normal_impl));
    }

    #[test]
    fn test_nested_conjunction_contradiction() {
        use super::validate_premises;

        let p = atom("P");
        let t = atom("T");
        let q = atom("Q");
        let not_p = Formula::Not(Box::new(p.clone()));

        // T . P contains P, and ~P is a premise
        // This should be caught as a contradiction (P available via Simp)
        let t_and_p = Formula::And(Box::new(t.clone()), Box::new(p.clone()));
        let premises = vec![t_and_p, not_p.clone()];

        let result = validate_premises(&premises, &q);
        assert!(result.is_err());
        match result.unwrap_err() {
            super::DegenerateProofError::ContradictoryPremises(a, b) => {
                // Should find P and ~P as contradictory
                assert!(
                    (a == p && b == not_p) || (a == not_p && b == p),
                    "Expected P and ~P, got {} and {}", a.display_string(), b.display_string()
                );
            }
            other => panic!("Expected ContradictoryPremises, got {:?}", other),
        }
    }

    #[test]
    fn test_deeply_nested_conjunction_contradiction() {
        use super::validate_premises;

        let p = atom("P");
        let q = atom("Q");
        let r = atom("R");
        let not_p = Formula::Not(Box::new(p.clone()));

        // (Q . (R . P)) contains P deeply nested
        let r_and_p = Formula::And(Box::new(r.clone()), Box::new(p.clone()));
        let nested = Formula::And(Box::new(q.clone()), Box::new(r_and_p));

        let premises = vec![nested, not_p.clone()];
        let goal = atom("S");

        let result = validate_premises(&premises, &goal);
        assert!(result.is_err(), "Should detect P vs ~P even when P is deeply nested in conjunction");
    }

    #[test]
    fn test_proof_tree_validation() {
        let p = atom("P");
        let not_p = Formula::Not(Box::new(p.clone()));
        let q = atom("Q");

        // Build a tree with contradictory premises
        let root = ProofNode::derivation(
            q.clone(),
            "DS", // Doesn't matter, just need premises
            vec![
                ProofNode::premise(p.clone()),
                ProofNode::premise(not_p.clone()),
            ],
            None,
        );

        let tree = ProofTree::new(root);
        assert!(!tree.is_valid());
        assert!(tree.validate().is_err());
    }
}
