import Foundation

/// Proof techniques that involve subproofs (scopes) rather than direct inference.
enum ProofTechnique: String, Rule, CaseIterable {
    /// Conditional Proof: Assume P, derive Q, conclude P ⊃ Q
    case conditionalProof = "→I"

    /// Indirect Proof (Reductio): Assume ~P, derive ⊥, conclude P
    case indirectProof = "IP"

    /// Negation Introduction: Assume P, derive ⊥, conclude ~P
    case negationIntroduction = "~I"

    var id: String { rawValue }

    var name: String {
        switch self {
        case .conditionalProof: return "Conditional Proof"
        case .indirectProof: return "Indirect Proof (Reductio)"
        case .negationIntroduction: return "Negation Introduction"
        }
    }

    var abbreviation: String { rawValue }

    var description: String {
        switch self {
        case .conditionalProof:
            return "Assume P, derive Q in a subproof, conclude P ⊃ Q"
        case .indirectProof:
            return "Assume ~P, derive ⊥ in a subproof, conclude P"
        case .negationIntroduction:
            return "Assume P, derive ⊥ in a subproof, conclude ~P"
        }
    }

    var category: RuleCategory { .proofTechnique }

    /// Returns the type of assumption required to start this technique
    var assumptionType: AssumptionType {
        switch self {
        case .conditionalProof: return .arbitrary
        case .indirectProof: return .negationOfTarget
        case .negationIntroduction: return .arbitrary
        }
    }

    /// Returns what must be derived in the subproof
    var requiredConclusion: SubproofRequirement {
        switch self {
        case .conditionalProof: return .anyFormula
        case .indirectProof: return .contradiction
        case .negationIntroduction: return .contradiction
        }
    }

    /// Given the assumption and final formula of a subproof, returns the derived formula
    func deriveFromSubproof(assumption: Formula, subproofConclusion: Formula) -> Formula? {
        switch self {
        case .conditionalProof:
            return .implies(assumption, subproofConclusion)

        case .indirectProof:
            guard subproofConclusion == .contradiction else { return nil }
            // Assumption should be ~P, we derive P
            if case .not(let p) = assumption {
                return p
            }
            return nil

        case .negationIntroduction:
            guard subproofConclusion == .contradiction else { return nil }
            // We derive ~(assumption)
            return .not(assumption)
        }
    }

    /// Verifies if closing a subproof with this technique is valid
    func verify(assumption: Formula, subproofConclusion: Formula, derivedFormula: Formula) -> Bool {
        deriveFromSubproof(assumption: assumption, subproofConclusion: subproofConclusion) == derivedFormula
    }
}

/// The type of assumption required to start a proof technique
enum AssumptionType {
    /// Can assume any formula (for conditional proof)
    case arbitrary
    /// Must assume the negation of the target formula (for indirect proof)
    case negationOfTarget
}

/// What must be concluded in a subproof for a technique
enum SubproofRequirement {
    /// Any formula (for conditional proof)
    case anyFormula
    /// Must derive a contradiction (for IP and ~I)
    case contradiction
}
