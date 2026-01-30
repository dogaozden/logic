import Foundation

/// Represents a propositional logic formula as an abstract syntax tree.
/// Uses indirect enum to allow recursive structure.
indirect enum Formula: Equatable, Hashable, Codable {
    /// Atomic proposition (e.g., "P", "Q", "R")
    case atom(String)

    /// Negation (~P)
    case not(Formula)

    /// Conjunction (P & Q, displayed as P · Q)
    case and(Formula, Formula)

    /// Disjunction (P | Q, displayed as P ∨ Q)
    case or(Formula, Formula)

    /// Material conditional (P -> Q, displayed as P ⊃ Q)
    case implies(Formula, Formula)

    /// Biconditional (P <-> Q, displayed as P ≡ Q)
    case biconditional(Formula, Formula)

    /// Contradiction (⊥), used in indirect proofs
    case contradiction
}

// MARK: - Operator Type for Parenthesization

private enum OperatorType {
    case negation
    case conjunction
    case disjunction
    case conditional
    case biconditional

    var precedence: Int {
        switch self {
        case .negation: return 50
        case .conjunction: return 40
        case .disjunction: return 30
        case .conditional: return 20
        case .biconditional: return 10
        }
    }
}

// MARK: - Display Formatting

extension Formula {
    /// Returns the formula as a string with logical symbols (·, ∨, ⊃, ~, ≡)
    var displayString: String {
        switch self {
        case .atom(let name):
            return name
        case .not(let p):
            return "~\(p.displayStringParenthesized(for: .negation))"
        case .and(let p, let q):
            return "\(p.displayStringParenthesized(for: .conjunction)) · \(q.displayStringParenthesized(for: .conjunction))"
        case .or(let p, let q):
            return "\(p.displayStringParenthesized(for: .disjunction)) ∨ \(q.displayStringParenthesized(for: .disjunction))"
        case .implies(let p, let q):
            return "\(p.displayStringParenthesized(for: .conditional)) ⊃ \(q.displayStringParenthesized(for: .conditional))"
        case .biconditional(let p, let q):
            return "\(p.displayStringParenthesized(for: .biconditional)) ≡ \(q.displayStringParenthesized(for: .biconditional))"
        case .contradiction:
            return "⊥"
        }
    }

    /// Returns the formula as ASCII input string (&, |, ->, ~, <->)
    var asciiString: String {
        switch self {
        case .atom(let name):
            return name
        case .not(let p):
            return "~\(p.asciiStringParenthesized(for: .negation))"
        case .and(let p, let q):
            return "\(p.asciiStringParenthesized(for: .conjunction)) & \(q.asciiStringParenthesized(for: .conjunction))"
        case .or(let p, let q):
            return "\(p.asciiStringParenthesized(for: .disjunction)) | \(q.asciiStringParenthesized(for: .disjunction))"
        case .implies(let p, let q):
            return "\(p.asciiStringParenthesized(for: .conditional)) -> \(q.asciiStringParenthesized(for: .conditional))"
        case .biconditional(let p, let q):
            return "\(p.asciiStringParenthesized(for: .biconditional)) <-> \(q.asciiStringParenthesized(for: .biconditional))"
        case .contradiction:
            return "_|_"
        }
    }

    /// Operator precedence (higher = binds tighter)
    private var precedence: Int {
        switch self {
        case .atom, .contradiction: return 100
        case .not: return 50
        case .and: return 40
        case .or: return 30
        case .implies: return 20
        case .biconditional: return 10
        }
    }

    /// Returns whether this formula needs parentheses when used as a subformula of the given operator
    private func needsParentheses(for parentOp: OperatorType) -> Bool {
        // Atoms and contradiction never need parens
        if case .atom = self { return false }
        if case .contradiction = self { return false }

        // Negation handled specially - only needs parens if it's a compound formula being negated
        if parentOp == .negation {
            switch self {
            case .atom, .not, .contradiction: return false
            default: return true
            }
        }

        return self.precedence < parentOp.precedence
    }

    private func displayStringParenthesized(for parentOp: OperatorType) -> String {
        if needsParentheses(for: parentOp) {
            return "(\(displayString))"
        }
        return displayString
    }

    private func asciiStringParenthesized(for parentOp: OperatorType) -> String {
        if needsParentheses(for: parentOp) {
            return "(\(asciiString))"
        }
        return asciiString
    }
}

// MARK: - Subformula Access

extension Formula {
    /// Returns all atomic propositions in this formula
    var atoms: Set<String> {
        switch self {
        case .atom(let name):
            return [name]
        case .not(let p):
            return p.atoms
        case .and(let p, let q), .or(let p, let q), .implies(let p, let q), .biconditional(let p, let q):
            return p.atoms.union(q.atoms)
        case .contradiction:
            return []
        }
    }

    /// Returns the main connective of this formula, if any
    var mainConnective: Connective? {
        switch self {
        case .atom, .contradiction: return nil
        case .not: return .not
        case .and: return .and
        case .or: return .or
        case .implies: return .implies
        case .biconditional: return .biconditional
        }
    }

    /// The depth of nesting in this formula
    var depth: Int {
        switch self {
        case .atom, .contradiction:
            return 0
        case .not(let p):
            return 1 + p.depth
        case .and(let p, let q), .or(let p, let q), .implies(let p, let q), .biconditional(let p, let q):
            return 1 + max(p.depth, q.depth)
        }
    }

    /// Returns the immediate subformulas
    var subformulas: [Formula] {
        switch self {
        case .atom, .contradiction:
            return []
        case .not(let p):
            return [p]
        case .and(let p, let q), .or(let p, let q), .implies(let p, let q), .biconditional(let p, let q):
            return [p, q]
        }
    }
}

// MARK: - Connective Enum

enum Connective: String, CaseIterable, Codable {
    case not = "~"
    case and = "&"
    case or = "|"
    case implies = "->"
    case biconditional = "<->"

    var displaySymbol: String {
        switch self {
        case .not: return "~"
        case .and: return "·"
        case .or: return "∨"
        case .implies: return "⊃"
        case .biconditional: return "≡"
        }
    }

    var name: String {
        switch self {
        case .not: return "Negation"
        case .and: return "Conjunction"
        case .or: return "Disjunction"
        case .implies: return "Conditional"
        case .biconditional: return "Biconditional"
        }
    }
}

// MARK: - Substitution

extension Formula {
    /// Substitutes all occurrences of a variable with a formula
    func substituting(_ variable: String, with replacement: Formula) -> Formula {
        switch self {
        case .atom(let name):
            return name == variable ? replacement : self
        case .not(let p):
            return .not(p.substituting(variable, with: replacement))
        case .and(let p, let q):
            return .and(p.substituting(variable, with: replacement), q.substituting(variable, with: replacement))
        case .or(let p, let q):
            return .or(p.substituting(variable, with: replacement), q.substituting(variable, with: replacement))
        case .implies(let p, let q):
            return .implies(p.substituting(variable, with: replacement), q.substituting(variable, with: replacement))
        case .biconditional(let p, let q):
            return .biconditional(p.substituting(variable, with: replacement), q.substituting(variable, with: replacement))
        case .contradiction:
            return self
        }
    }
}

// MARK: - CustomStringConvertible

extension Formula: CustomStringConvertible {
    var description: String {
        displayString
    }
}
