import Foundation

/// Inference rules derive a new formula from one or more premises.
/// These are the standard rules of natural deduction.
enum InferenceRule: String, Rule, CaseIterable {
    // Conjunction rules
    case conjunctionIntroduction = "∧I"
    case conjunctionEliminationLeft = "∧E"
    case conjunctionEliminationRight = "∧E'"

    // Disjunction rules
    case disjunctionIntroductionLeft = "∨I"
    case disjunctionIntroductionRight = "∨I'"
    case disjunctionElimination = "∨E"

    // Conditional rules
    case modusPonens = "MP"      // Also known as →E
    case modusTollens = "MT"

    // Negation rules
    case doubleNegationIntroduction = "DNI"
    case doubleNegationElimination = "DNE"

    // Biconditional rules
    case biconditionalIntroduction = "≡I"
    case biconditionalEliminationLeft = "≡E"
    case biconditionalEliminationRight = "≡E'"

    // Other rules
    case hypotheticalSyllogism = "HS"
    case disjunctiveSyllogism = "DS"
    case constructiveDilemma = "CD"

    // Reiteration (for use in subproofs)
    case reiteration = "R"

    var id: String { rawValue }

    var name: String {
        switch self {
        case .conjunctionIntroduction: return "Conjunction Introduction"
        case .conjunctionEliminationLeft: return "Conjunction Elimination (Left)"
        case .conjunctionEliminationRight: return "Conjunction Elimination (Right)"
        case .disjunctionIntroductionLeft: return "Disjunction Introduction (Left)"
        case .disjunctionIntroductionRight: return "Disjunction Introduction (Right)"
        case .disjunctionElimination: return "Disjunction Elimination"
        case .modusPonens: return "Modus Ponens"
        case .modusTollens: return "Modus Tollens"
        case .doubleNegationIntroduction: return "Double Negation Introduction"
        case .doubleNegationElimination: return "Double Negation Elimination"
        case .biconditionalIntroduction: return "Biconditional Introduction"
        case .biconditionalEliminationLeft: return "Biconditional Elimination (Left)"
        case .biconditionalEliminationRight: return "Biconditional Elimination (Right)"
        case .hypotheticalSyllogism: return "Hypothetical Syllogism"
        case .disjunctiveSyllogism: return "Disjunctive Syllogism"
        case .constructiveDilemma: return "Constructive Dilemma"
        case .reiteration: return "Reiteration"
        }
    }

    var abbreviation: String { rawValue }

    var description: String {
        switch self {
        case .conjunctionIntroduction:
            return "From P and Q, derive P · Q"
        case .conjunctionEliminationLeft:
            return "From P · Q, derive P"
        case .conjunctionEliminationRight:
            return "From P · Q, derive Q"
        case .disjunctionIntroductionLeft:
            return "From P, derive P ∨ Q"
        case .disjunctionIntroductionRight:
            return "From Q, derive P ∨ Q"
        case .disjunctionElimination:
            return "From P ∨ Q, P ⊃ R, and Q ⊃ R, derive R"
        case .modusPonens:
            return "From P ⊃ Q and P, derive Q"
        case .modusTollens:
            return "From P ⊃ Q and ~Q, derive ~P"
        case .doubleNegationIntroduction:
            return "From P, derive ~~P"
        case .doubleNegationElimination:
            return "From ~~P, derive P"
        case .biconditionalIntroduction:
            return "From P ⊃ Q and Q ⊃ P, derive P ≡ Q"
        case .biconditionalEliminationLeft:
            return "From P ≡ Q and P, derive Q"
        case .biconditionalEliminationRight:
            return "From P ≡ Q and Q, derive P"
        case .hypotheticalSyllogism:
            return "From P ⊃ Q and Q ⊃ R, derive P ⊃ R"
        case .disjunctiveSyllogism:
            return "From P ∨ Q and ~P, derive Q"
        case .constructiveDilemma:
            return "From P ∨ Q, P ⊃ R, and Q ⊃ S, derive R ∨ S"
        case .reiteration:
            return "Restate a formula from an accessible line"
        }
    }

    var category: RuleCategory { .inference }

    /// Number of premises required for this rule
    var premiseCount: Int {
        switch self {
        case .conjunctionIntroduction: return 2
        case .conjunctionEliminationLeft, .conjunctionEliminationRight: return 1
        case .disjunctionIntroductionLeft, .disjunctionIntroductionRight: return 1
        case .disjunctionElimination: return 3
        case .modusPonens, .modusTollens: return 2
        case .doubleNegationIntroduction, .doubleNegationElimination: return 1
        case .biconditionalIntroduction: return 2
        case .biconditionalEliminationLeft, .biconditionalEliminationRight: return 2
        case .hypotheticalSyllogism: return 2
        case .disjunctiveSyllogism: return 2
        case .constructiveDilemma: return 3
        case .reiteration: return 1
        }
    }

    /// Whether this rule requires additional formula input (e.g., for ∨I)
    var requiresAdditionalFormula: Bool {
        switch self {
        case .disjunctionIntroductionLeft, .disjunctionIntroductionRight:
            return true
        default:
            return false
        }
    }
}

// MARK: - Rule Application Logic

extension InferenceRule {
    /// Attempts to apply this rule to the given premises, returning the derived formula if valid.
    /// Returns nil if the rule cannot be applied to these premises.
    func apply(to premises: [Formula], additionalFormula: Formula? = nil) -> Formula? {
        switch self {
        case .conjunctionIntroduction:
            guard premises.count == 2 else { return nil }
            return .and(premises[0], premises[1])

        case .conjunctionEliminationLeft:
            guard premises.count == 1, case .and(let p, _) = premises[0] else { return nil }
            return p

        case .conjunctionEliminationRight:
            guard premises.count == 1, case .and(_, let q) = premises[0] else { return nil }
            return q

        case .disjunctionIntroductionLeft:
            guard premises.count == 1, let q = additionalFormula else { return nil }
            return .or(premises[0], q)

        case .disjunctionIntroductionRight:
            guard premises.count == 1, let p = additionalFormula else { return nil }
            return .or(p, premises[0])

        case .disjunctionElimination:
            guard premises.count == 3,
                  case .or(let p, let q) = premises[0],
                  case .implies(let p2, let r) = premises[1],
                  case .implies(let q2, let r2) = premises[2],
                  p == p2, q == q2, r == r2
            else { return nil }
            return r

        case .modusPonens:
            guard premises.count == 2 else { return nil }
            // Try both orders
            if case .implies(let p, let q) = premises[0], premises[1] == p {
                return q
            }
            if case .implies(let p, let q) = premises[1], premises[0] == p {
                return q
            }
            return nil

        case .modusTollens:
            guard premises.count == 2 else { return nil }
            // Try both orders
            if case .implies(let p, let q) = premises[0], premises[1] == .not(q) {
                return .not(p)
            }
            if case .implies(let p, let q) = premises[1], premises[0] == .not(q) {
                return .not(p)
            }
            return nil

        case .doubleNegationIntroduction:
            guard premises.count == 1 else { return nil }
            return .not(.not(premises[0]))

        case .doubleNegationElimination:
            guard premises.count == 1, case .not(.not(let p)) = premises[0] else { return nil }
            return p

        case .biconditionalIntroduction:
            guard premises.count == 2 else { return nil }
            // Try both orders
            if case .implies(let p, let q) = premises[0],
               case .implies(let q2, let p2) = premises[1],
               p == p2, q == q2 {
                return .biconditional(p, q)
            }
            if case .implies(let p, let q) = premises[1],
               case .implies(let q2, let p2) = premises[0],
               p == p2, q == q2 {
                return .biconditional(p, q)
            }
            return nil

        case .biconditionalEliminationLeft:
            guard premises.count == 2 else { return nil }
            // Try both orders
            if case .biconditional(let p, let q) = premises[0], premises[1] == p {
                return q
            }
            if case .biconditional(let p, let q) = premises[1], premises[0] == p {
                return q
            }
            return nil

        case .biconditionalEliminationRight:
            guard premises.count == 2 else { return nil }
            // Try both orders
            if case .biconditional(let p, let q) = premises[0], premises[1] == q {
                return p
            }
            if case .biconditional(let p, let q) = premises[1], premises[0] == q {
                return p
            }
            return nil

        case .hypotheticalSyllogism:
            guard premises.count == 2 else { return nil }
            // Try both orders
            if case .implies(let p, let q) = premises[0],
               case .implies(let q2, let r) = premises[1],
               q == q2 {
                return .implies(p, r)
            }
            if case .implies(let p, let q) = premises[1],
               case .implies(let q2, let r) = premises[0],
               q == q2 {
                return .implies(p, r)
            }
            return nil

        case .disjunctiveSyllogism:
            guard premises.count == 2 else { return nil }
            // P ∨ Q, ~P → Q
            if case .or(let p, let q) = premises[0], premises[1] == .not(p) {
                return q
            }
            if case .or(let p, let q) = premises[1], premises[0] == .not(p) {
                return q
            }
            // P ∨ Q, ~Q → P
            if case .or(let p, let q) = premises[0], premises[1] == .not(q) {
                return p
            }
            if case .or(let p, let q) = premises[1], premises[0] == .not(q) {
                return p
            }
            return nil

        case .constructiveDilemma:
            guard premises.count == 3,
                  case .or(let p, let q) = premises[0],
                  case .implies(let p2, let r) = premises[1],
                  case .implies(let q2, let s) = premises[2],
                  p == p2, q == q2
            else { return nil }
            return .or(r, s)

        case .reiteration:
            guard premises.count == 1 else { return nil }
            return premises[0]
        }
    }

    /// Checks if the given conclusion can be derived from the premises using this rule
    func verify(premises: [Formula], conclusion: Formula, additionalFormula: Formula? = nil) -> Bool {
        apply(to: premises, additionalFormula: additionalFormula) == conclusion
    }
}
