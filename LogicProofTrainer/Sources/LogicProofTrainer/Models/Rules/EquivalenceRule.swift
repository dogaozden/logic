import Foundation

/// Equivalence rules allow replacing a formula or subformula with a logically equivalent one.
enum EquivalenceRule: String, Rule, CaseIterable {
    case deMorgansAnd = "DeM"       // ~(P · Q) ≡ (~P ∨ ~Q)
    case deMorgansOr = "DeM'"       // ~(P ∨ Q) ≡ (~P · ~Q)
    case commutationAnd = "Com"     // P · Q ≡ Q · P
    case commutationOr = "Com'"     // P ∨ Q ≡ Q ∨ P
    case associationAnd = "Assoc"   // (P · Q) · R ≡ P · (Q · R)
    case associationOr = "Assoc'"   // (P ∨ Q) ∨ R ≡ P ∨ (Q ∨ R)
    case distributionAndOverOr = "Dist"   // P · (Q ∨ R) ≡ (P · Q) ∨ (P · R)
    case distributionOrOverAnd = "Dist'"  // P ∨ (Q · R) ≡ (P ∨ Q) · (P ∨ R)
    case contraposition = "Contra"  // P ⊃ Q ≡ ~Q ⊃ ~P
    case materialImplication = "Impl"  // P ⊃ Q ≡ ~P ∨ Q
    case materialEquivalence = "Equiv" // P ≡ Q ≡ (P ⊃ Q) · (Q ⊃ P)
    case exportation = "Exp"        // (P · Q) ⊃ R ≡ P ⊃ (Q ⊃ R)
    case tautology = "Taut"         // P ≡ P ∨ P, P ≡ P · P
    case absorption = "Abs"         // P ⊃ Q ≡ P ⊃ (P · Q)

    var id: String { rawValue }

    var name: String {
        switch self {
        case .deMorgansAnd: return "De Morgan's (And)"
        case .deMorgansOr: return "De Morgan's (Or)"
        case .commutationAnd: return "Commutation (And)"
        case .commutationOr: return "Commutation (Or)"
        case .associationAnd: return "Association (And)"
        case .associationOr: return "Association (Or)"
        case .distributionAndOverOr: return "Distribution (And over Or)"
        case .distributionOrOverAnd: return "Distribution (Or over And)"
        case .contraposition: return "Contraposition"
        case .materialImplication: return "Material Implication"
        case .materialEquivalence: return "Material Equivalence"
        case .exportation: return "Exportation"
        case .tautology: return "Tautology"
        case .absorption: return "Absorption"
        }
    }

    var abbreviation: String { rawValue }

    var description: String {
        switch self {
        case .deMorgansAnd: return "~(P · Q) ≡ ~P ∨ ~Q"
        case .deMorgansOr: return "~(P ∨ Q) ≡ ~P · ~Q"
        case .commutationAnd: return "P · Q ≡ Q · P"
        case .commutationOr: return "P ∨ Q ≡ Q ∨ P"
        case .associationAnd: return "(P · Q) · R ≡ P · (Q · R)"
        case .associationOr: return "(P ∨ Q) ∨ R ≡ P ∨ (Q ∨ R)"
        case .distributionAndOverOr: return "P · (Q ∨ R) ≡ (P · Q) ∨ (P · R)"
        case .distributionOrOverAnd: return "P ∨ (Q · R) ≡ (P ∨ Q) · (P ∨ R)"
        case .contraposition: return "P ⊃ Q ≡ ~Q ⊃ ~P"
        case .materialImplication: return "P ⊃ Q ≡ ~P ∨ Q"
        case .materialEquivalence: return "P ≡ Q ≡ (P ⊃ Q) · (Q ⊃ P)"
        case .exportation: return "(P · Q) ⊃ R ≡ P ⊃ (Q ⊃ R)"
        case .tautology: return "P ≡ P ∨ P ≡ P · P"
        case .absorption: return "P ⊃ Q ≡ P ⊃ (P · Q)"
        }
    }

    var category: RuleCategory { .equivalence }

    /// Returns all equivalent forms of a formula under this rule.
    /// For bidirectional equivalences, returns transformations in both directions.
    func equivalentForms(of formula: Formula) -> [Formula] {
        var results: [Formula] = []

        switch self {
        case .deMorgansAnd:
            // ~(P · Q) → ~P ∨ ~Q
            if case .not(.and(let p, let q)) = formula {
                results.append(.or(.not(p), .not(q)))
            }
            // ~P ∨ ~Q → ~(P · Q)
            if case .or(.not(let p), .not(let q)) = formula {
                results.append(.not(.and(p, q)))
            }

        case .deMorgansOr:
            // ~(P ∨ Q) → ~P · ~Q
            if case .not(.or(let p, let q)) = formula {
                results.append(.and(.not(p), .not(q)))
            }
            // ~P · ~Q → ~(P ∨ Q)
            if case .and(.not(let p), .not(let q)) = formula {
                results.append(.not(.or(p, q)))
            }

        case .commutationAnd:
            if case .and(let p, let q) = formula {
                results.append(.and(q, p))
            }

        case .commutationOr:
            if case .or(let p, let q) = formula {
                results.append(.or(q, p))
            }

        case .associationAnd:
            // (P · Q) · R → P · (Q · R)
            if case .and(.and(let p, let q), let r) = formula {
                results.append(.and(p, .and(q, r)))
            }
            // P · (Q · R) → (P · Q) · R
            if case .and(let p, .and(let q, let r)) = formula {
                results.append(.and(.and(p, q), r))
            }

        case .associationOr:
            // (P ∨ Q) ∨ R → P ∨ (Q ∨ R)
            if case .or(.or(let p, let q), let r) = formula {
                results.append(.or(p, .or(q, r)))
            }
            // P ∨ (Q ∨ R) → (P ∨ Q) ∨ R
            if case .or(let p, .or(let q, let r)) = formula {
                results.append(.or(.or(p, q), r))
            }

        case .distributionAndOverOr:
            // P · (Q ∨ R) → (P · Q) ∨ (P · R)
            if case .and(let p, .or(let q, let r)) = formula {
                results.append(.or(.and(p, q), .and(p, r)))
            }
            // (P · Q) ∨ (P · R) → P · (Q ∨ R)
            if case .or(.and(let p1, let q), .and(let p2, let r)) = formula, p1 == p2 {
                results.append(.and(p1, .or(q, r)))
            }

        case .distributionOrOverAnd:
            // P ∨ (Q · R) → (P ∨ Q) · (P ∨ R)
            if case .or(let p, .and(let q, let r)) = formula {
                results.append(.and(.or(p, q), .or(p, r)))
            }
            // (P ∨ Q) · (P ∨ R) → P ∨ (Q · R)
            if case .and(.or(let p1, let q), .or(let p2, let r)) = formula, p1 == p2 {
                results.append(.or(p1, .and(q, r)))
            }

        case .contraposition:
            // P ⊃ Q → ~Q ⊃ ~P
            if case .implies(let p, let q) = formula {
                results.append(.implies(.not(q), .not(p)))
            }
            // ~Q ⊃ ~P → P ⊃ Q (with double negation handling)
            if case .implies(.not(let q), .not(let p)) = formula {
                results.append(.implies(p, q))
            }

        case .materialImplication:
            // P ⊃ Q → ~P ∨ Q
            if case .implies(let p, let q) = formula {
                results.append(.or(.not(p), q))
            }
            // ~P ∨ Q → P ⊃ Q
            if case .or(.not(let p), let q) = formula {
                results.append(.implies(p, q))
            }

        case .materialEquivalence:
            // P ≡ Q → (P ⊃ Q) · (Q ⊃ P)
            if case .biconditional(let p, let q) = formula {
                results.append(.and(.implies(p, q), .implies(q, p)))
            }
            // (P ⊃ Q) · (Q ⊃ P) → P ≡ Q
            if case .and(.implies(let p1, let q1), .implies(let q2, let p2)) = formula,
               p1 == p2, q1 == q2 {
                results.append(.biconditional(p1, q1))
            }

        case .exportation:
            // (P · Q) ⊃ R → P ⊃ (Q ⊃ R)
            if case .implies(.and(let p, let q), let r) = formula {
                results.append(.implies(p, .implies(q, r)))
            }
            // P ⊃ (Q ⊃ R) → (P · Q) ⊃ R
            if case .implies(let p, .implies(let q, let r)) = formula {
                results.append(.implies(.and(p, q), r))
            }

        case .tautology:
            // P → P ∨ P, P → P · P
            results.append(.or(formula, formula))
            results.append(.and(formula, formula))

            // P ∨ P → P
            if case .or(let p, let q) = formula, p == q {
                results.append(p)
            }
            // P · P → P
            if case .and(let p, let q) = formula, p == q {
                results.append(p)
            }

        case .absorption:
            // P ⊃ Q → P ⊃ (P · Q)
            if case .implies(let p, let q) = formula {
                results.append(.implies(p, .and(p, q)))
            }
            // P ⊃ (P · Q) → P ⊃ Q
            if case .implies(let p, .and(let p2, let q)) = formula, p == p2 {
                results.append(.implies(p, q))
            }
        }

        return results
    }

    /// Verifies if transforming `from` to `to` is valid under this equivalence rule.
    func verify(from: Formula, to: Formula) -> Bool {
        equivalentForms(of: from).contains(to)
    }
}
