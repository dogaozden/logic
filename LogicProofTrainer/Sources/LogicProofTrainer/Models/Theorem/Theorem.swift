import Foundation

/// Represents a theorem to be proved.
struct Theorem: Identifiable, Equatable, Hashable, Codable {
    let id: UUID

    /// The premises of the argument
    var premises: [Formula]

    /// The conclusion to be proved
    var conclusion: Formula

    /// Difficulty level
    var difficulty: Difficulty

    /// Optional theme/category
    var theme: Theme?

    /// Optional human-readable name
    var name: String?

    init(
        id: UUID = UUID(),
        premises: [Formula],
        conclusion: Formula,
        difficulty: Difficulty = .medium,
        theme: Theme? = nil,
        name: String? = nil
    ) {
        self.id = id
        self.premises = premises
        self.conclusion = conclusion
        self.difficulty = difficulty
        self.theme = theme
        self.name = name
    }

    /// Display string showing the argument form
    /// e.g., "P ⊃ Q, P ∴ Q"
    var displayString: String {
        let premiseStr = premises.map(\.displayString).joined(separator: ", ")
        if premiseStr.isEmpty {
            return "∴ \(conclusion.displayString)"
        }
        return "\(premiseStr) ∴ \(conclusion.displayString)"
    }

    /// ASCII string for the argument
    var asciiString: String {
        let premiseStr = premises.map(\.asciiString).joined(separator: ", ")
        if premiseStr.isEmpty {
            return ":. \(conclusion.asciiString)"
        }
        return "\(premiseStr) :. \(conclusion.asciiString)"
    }
}

// MARK: - Difficulty

enum Difficulty: String, Codable, CaseIterable, Comparable {
    case easy
    case medium
    case hard
    case expert

    var displayName: String {
        rawValue.capitalized
    }

    var sortOrder: Int {
        switch self {
        case .easy: return 0
        case .medium: return 1
        case .hard: return 2
        case .expert: return 3
        }
    }

    static func < (lhs: Difficulty, rhs: Difficulty) -> Bool {
        lhs.sortOrder < rhs.sortOrder
    }
}

// MARK: - Theme

enum Theme: String, Codable, CaseIterable {
    case modusPonens = "Modus Ponens"
    case modusTollens = "Modus Tollens"
    case hypotheticalSyllogism = "Hypothetical Syllogism"
    case disjunctiveSyllogism = "Disjunctive Syllogism"
    case constructiveDilemma = "Constructive Dilemma"
    case conditionalProof = "Conditional Proof"
    case indirectProof = "Indirect Proof"
    case deMorgans = "De Morgan's Laws"
    case biconditional = "Biconditionals"
    case mixed = "Mixed"

    var displayName: String {
        rawValue
    }
}

// MARK: - Classic Theorems

extension Theorem {
    /// Collection of classic propositional logic theorems
    static let classics: [Theorem] = [
        // Simple Modus Ponens
        Theorem(
            premises: [
                .implies(.atom("P"), .atom("Q")),
                .atom("P")
            ],
            conclusion: .atom("Q"),
            difficulty: .easy,
            theme: .modusPonens,
            name: "Modus Ponens"
        ),

        // Modus Tollens
        Theorem(
            premises: [
                .implies(.atom("P"), .atom("Q")),
                .not(.atom("Q"))
            ],
            conclusion: .not(.atom("P")),
            difficulty: .easy,
            theme: .modusTollens,
            name: "Modus Tollens"
        ),

        // Hypothetical Syllogism
        Theorem(
            premises: [
                .implies(.atom("P"), .atom("Q")),
                .implies(.atom("Q"), .atom("R"))
            ],
            conclusion: .implies(.atom("P"), .atom("R")),
            difficulty: .easy,
            theme: .hypotheticalSyllogism,
            name: "Hypothetical Syllogism"
        ),

        // Disjunctive Syllogism
        Theorem(
            premises: [
                .or(.atom("P"), .atom("Q")),
                .not(.atom("P"))
            ],
            conclusion: .atom("Q"),
            difficulty: .easy,
            theme: .disjunctiveSyllogism,
            name: "Disjunctive Syllogism"
        ),

        // Law of Excluded Middle (requires IP)
        Theorem(
            premises: [],
            conclusion: .or(.atom("P"), .not(.atom("P"))),
            difficulty: .medium,
            theme: .indirectProof,
            name: "Law of Excluded Middle"
        ),

        // Double Negation
        Theorem(
            premises: [.not(.not(.atom("P")))],
            conclusion: .atom("P"),
            difficulty: .easy,
            theme: .mixed,
            name: "Double Negation Elimination"
        ),

        // Contraposition
        Theorem(
            premises: [.implies(.atom("P"), .atom("Q"))],
            conclusion: .implies(.not(.atom("Q")), .not(.atom("P"))),
            difficulty: .medium,
            theme: .conditionalProof,
            name: "Contraposition"
        ),

        // Constructive Dilemma
        Theorem(
            premises: [
                .or(.atom("P"), .atom("Q")),
                .implies(.atom("P"), .atom("R")),
                .implies(.atom("Q"), .atom("S"))
            ],
            conclusion: .or(.atom("R"), .atom("S")),
            difficulty: .medium,
            theme: .constructiveDilemma,
            name: "Constructive Dilemma"
        ),

        // De Morgan's Law (And)
        Theorem(
            premises: [.not(.and(.atom("P"), .atom("Q")))],
            conclusion: .or(.not(.atom("P")), .not(.atom("Q"))),
            difficulty: .easy,
            theme: .deMorgans,
            name: "De Morgan's Law (And)"
        ),

        // Export-Import
        Theorem(
            premises: [.implies(.and(.atom("P"), .atom("Q")), .atom("R"))],
            conclusion: .implies(.atom("P"), .implies(.atom("Q"), .atom("R"))),
            difficulty: .medium,
            theme: .conditionalProof,
            name: "Exportation"
        ),

        // Peirce's Law (requires classical logic)
        Theorem(
            premises: [],
            conclusion: .implies(
                .implies(
                    .implies(.atom("P"), .atom("Q")),
                    .atom("P")
                ),
                .atom("P")
            ),
            difficulty: .hard,
            theme: .indirectProof,
            name: "Peirce's Law"
        ),

        // Biconditional to Conjunction
        Theorem(
            premises: [.biconditional(.atom("P"), .atom("Q"))],
            conclusion: .and(
                .implies(.atom("P"), .atom("Q")),
                .implies(.atom("Q"), .atom("P"))
            ),
            difficulty: .easy,
            theme: .biconditional,
            name: "Biconditional Elimination"
        ),

        // Complex Chain
        Theorem(
            premises: [
                .implies(.atom("P"), .atom("Q")),
                .implies(.atom("Q"), .atom("R")),
                .implies(.atom("R"), .atom("S")),
                .atom("P")
            ],
            conclusion: .atom("S"),
            difficulty: .medium,
            theme: .hypotheticalSyllogism,
            name: "Chain of Implications"
        ),

        // Absorption
        Theorem(
            premises: [.implies(.atom("P"), .atom("Q"))],
            conclusion: .implies(.atom("P"), .and(.atom("P"), .atom("Q"))),
            difficulty: .medium,
            theme: .conditionalProof,
            name: "Absorption"
        ),

        // Distribution
        Theorem(
            premises: [.and(.atom("P"), .or(.atom("Q"), .atom("R")))],
            conclusion: .or(.and(.atom("P"), .atom("Q")), .and(.atom("P"), .atom("R"))),
            difficulty: .medium,
            theme: .mixed,
            name: "Distribution (And over Or)"
        )
    ]
}
