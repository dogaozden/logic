import Foundation

/// Generates provable theorems by building valid proof trees backwards.
/// This ensures all generated theorems have at least one valid proof.
struct TheoremGenerator {

    /// Configuration for theorem generation
    struct Config {
        var difficulty: Difficulty
        var maxPremises: Int
        var maxDepth: Int
        var preferredTheme: Theme?
        var allowedRules: Set<String>

        static let easy = Config(
            difficulty: .easy,
            maxPremises: 2,
            maxDepth: 2,
            preferredTheme: nil,
            allowedRules: Set(["MP", "MT", "∧E", "∧E'", "∨I", "∨I'", "DS", "DNE", "R"])
        )

        static let medium = Config(
            difficulty: .medium,
            maxPremises: 3,
            maxDepth: 4,
            preferredTheme: nil,
            allowedRules: Set(InferenceRule.allCases.map(\.abbreviation))
        )

        static let hard = Config(
            difficulty: .hard,
            maxPremises: 4,
            maxDepth: 6,
            preferredTheme: nil,
            allowedRules: Set(InferenceRule.allCases.map(\.abbreviation) + ProofTechnique.allCases.map(\.abbreviation))
        )

        static let expert = Config(
            difficulty: .expert,
            maxPremises: 5,
            maxDepth: 8,
            preferredTheme: nil,
            allowedRules: Set(InferenceRule.allCases.map(\.abbreviation) + ProofTechnique.allCases.map(\.abbreviation) + EquivalenceRule.allCases.map(\.abbreviation))
        )
    }

    /// A node in the proof tree being constructed backwards
    private struct ProofNode {
        var formula: Formula
        var children: [ProofNode]
        var rule: String
        var depth: Int
    }

    private var config: Config
    private var usedAtoms: Set<String> = ["P", "Q", "R", "S", "T"]

    init(config: Config = .medium) {
        self.config = config
    }

    /// Generates a random provable theorem
    func generate() -> Theorem {
        // Start with a random conclusion
        let conclusion = generateRandomFormula(depth: 0, maxDepth: config.maxDepth / 2)

        // Build proof tree backwards to find necessary premises
        let (premises, _) = buildProofBackwards(target: conclusion, depth: 0)

        // Limit premises
        let limitedPremises = Array(premises.prefix(config.maxPremises))

        return Theorem(
            premises: limitedPremises,
            conclusion: conclusion,
            difficulty: config.difficulty,
            theme: inferTheme(premises: limitedPremises, conclusion: conclusion)
        )
    }

    /// Generates a theorem with a specific conclusion
    func generate(withConclusion conclusion: Formula) -> Theorem {
        let (premises, _) = buildProofBackwards(target: conclusion, depth: 0)
        let limitedPremises = Array(premises.prefix(config.maxPremises))

        return Theorem(
            premises: limitedPremises,
            conclusion: conclusion,
            difficulty: config.difficulty,
            theme: inferTheme(premises: limitedPremises, conclusion: conclusion)
        )
    }

    // MARK: - Backwards Proof Construction

    /// Builds a proof tree backwards from the target formula, returning the necessary premises
    private func buildProofBackwards(target: Formula, depth: Int) -> (premises: [Formula], proofTree: ProofNode) {
        // If we've reached max depth, treat as premise
        if depth >= config.maxDepth {
            return ([target], ProofNode(formula: target, children: [], rule: "Premise", depth: depth))
        }

        // Try to find a rule that can derive this formula
        if let (rule, antecedents) = findDerivationRule(for: target) {
            var allPremises: [Formula] = []
            var childNodes: [ProofNode] = []

            for antecedent in antecedents {
                let (subPremises, subTree) = buildProofBackwards(target: antecedent, depth: depth + 1)
                allPremises.append(contentsOf: subPremises)
                childNodes.append(subTree)
            }

            // Remove duplicates while preserving order
            var seen = Set<String>()
            allPremises = allPremises.filter { formula in
                let key = formula.asciiString
                if seen.contains(key) { return false }
                seen.insert(key)
                return true
            }

            return (allPremises, ProofNode(formula: target, children: childNodes, rule: rule, depth: depth))
        }

        // No applicable rule, treat as premise
        return ([target], ProofNode(formula: target, children: [], rule: "Premise", depth: depth))
    }

    /// Finds a rule that can derive the target formula and returns the required antecedents
    private func findDerivationRule(for target: Formula) -> (rule: String, antecedents: [Formula])? {
        // Shuffle rules for variety
        let rules = InferenceRule.allCases.shuffled()

        for rule in rules {
            guard config.allowedRules.contains(rule.abbreviation) else { continue }

            if let antecedents = findAntecedents(for: target, using: rule) {
                return (rule.abbreviation, antecedents)
            }
        }

        return nil
    }

    /// For a given target and rule, finds antecedents that would derive the target
    private func findAntecedents(for target: Formula, using rule: InferenceRule) -> [Formula]? {
        switch rule {
        case .modusPonens:
            // To derive Q, we need P → Q and P for some P
            let p = generateRandomFormula(depth: 0, maxDepth: 2)
            return [.implies(p, target), p]

        case .modusTollens:
            // To derive ~P, we need P → Q and ~Q for some Q
            if case .not(let p) = target {
                let q = generateRandomFormula(depth: 0, maxDepth: 2)
                return [.implies(p, q), .not(q)]
            }

        case .conjunctionIntroduction:
            // To derive P · Q, we need P and Q
            if case .and(let p, let q) = target {
                return [p, q]
            }

        case .conjunctionEliminationLeft:
            // To derive P, we need P · Q for some Q
            let q = generateRandomFormula(depth: 0, maxDepth: 2)
            return [.and(target, q)]

        case .conjunctionEliminationRight:
            // To derive Q, we need P · Q for some P
            let p = generateRandomFormula(depth: 0, maxDepth: 2)
            return [.and(p, target)]

        case .disjunctionIntroductionLeft:
            // To derive P ∨ Q, we need P
            if case .or(let p, _) = target {
                return [p]
            }

        case .disjunctionIntroductionRight:
            // To derive P ∨ Q, we need Q
            if case .or(_, let q) = target {
                return [q]
            }

        case .disjunctiveSyllogism:
            // To derive Q, we need P ∨ Q and ~P
            let p = generateRandomFormula(depth: 0, maxDepth: 2)
            return [.or(p, target), .not(p)]

        case .hypotheticalSyllogism:
            // To derive P → R, we need P → Q and Q → R
            if case .implies(let p, let r) = target {
                let q = generateRandomFormula(depth: 0, maxDepth: 2)
                return [.implies(p, q), .implies(q, r)]
            }

        case .doubleNegationElimination:
            // To derive P, we need ~~P
            return [.not(.not(target))]

        case .doubleNegationIntroduction:
            // To derive ~~P, we need P
            if case .not(.not(let p)) = target {
                return [p]
            }

        case .biconditionalIntroduction:
            // To derive P ≡ Q, we need P → Q and Q → P
            if case .biconditional(let p, let q) = target {
                return [.implies(p, q), .implies(q, p)]
            }

        case .biconditionalEliminationLeft:
            // To derive Q, we need P ≡ Q and P
            let p = generateRandomFormula(depth: 0, maxDepth: 2)
            return [.biconditional(p, target), p]

        case .biconditionalEliminationRight:
            // To derive P, we need P ≡ Q and Q
            let q = generateRandomFormula(depth: 0, maxDepth: 2)
            return [.biconditional(target, q), q]

        case .disjunctionElimination:
            // To derive R, we need P ∨ Q, P → R, Q → R
            let p = generateRandomFormula(depth: 0, maxDepth: 1)
            let q = generateRandomFormula(depth: 0, maxDepth: 1)
            return [.or(p, q), .implies(p, target), .implies(q, target)]

        case .constructiveDilemma:
            // To derive R ∨ S, we need P ∨ Q, P → R, Q → S
            if case .or(let r, let s) = target {
                let p = generateRandomFormula(depth: 0, maxDepth: 1)
                let q = generateRandomFormula(depth: 0, maxDepth: 1)
                return [.or(p, q), .implies(p, r), .implies(q, s)]
            }

        case .reiteration:
            return [target]
        }

        return nil
    }

    // MARK: - Random Formula Generation

    private func generateRandomFormula(depth: Int, maxDepth: Int) -> Formula {
        // At max depth, only return atoms
        if depth >= maxDepth {
            return .atom(usedAtoms.randomElement()!)
        }

        // Choose a random connective with some probability
        let choice = Int.random(in: 0..<100)

        if choice < 40 {
            // Atom (40% chance)
            return .atom(usedAtoms.randomElement()!)
        } else if choice < 55 {
            // Negation (15% chance)
            return .not(generateRandomFormula(depth: depth + 1, maxDepth: maxDepth))
        } else if choice < 70 {
            // Conjunction (15% chance)
            return .and(
                generateRandomFormula(depth: depth + 1, maxDepth: maxDepth),
                generateRandomFormula(depth: depth + 1, maxDepth: maxDepth)
            )
        } else if choice < 85 {
            // Disjunction (15% chance)
            return .or(
                generateRandomFormula(depth: depth + 1, maxDepth: maxDepth),
                generateRandomFormula(depth: depth + 1, maxDepth: maxDepth)
            )
        } else {
            // Implication (15% chance)
            return .implies(
                generateRandomFormula(depth: depth + 1, maxDepth: maxDepth),
                generateRandomFormula(depth: depth + 1, maxDepth: maxDepth)
            )
        }
    }

    // MARK: - Theme Inference

    private func inferTheme(premises: [Formula], conclusion: Formula) -> Theme {
        // Check for common patterns
        if premises.contains(where: { if case .implies = $0 { return true }; return false }) {
            if premises.count == 2 {
                // Check for modus ponens/tollens patterns
                for premise in premises {
                    if case .implies(let p, let q) = premise {
                        if premises.contains(p) && conclusion == q {
                            return .modusPonens
                        }
                        if premises.contains(.not(q)) && conclusion == .not(p) {
                            return .modusTollens
                        }
                    }
                }
            }
        }

        if premises.contains(where: { if case .or = $0 { return true }; return false }) {
            return .disjunctiveSyllogism
        }

        if case .implies = conclusion {
            return .conditionalProof
        }

        if premises.isEmpty || premises.allSatisfy({ $0.mainConnective == nil }) {
            return .indirectProof
        }

        return .mixed
    }
}
