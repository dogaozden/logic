import Foundation

/// A proof rule that can be applied to derive new formulas
protocol Rule: Identifiable, Codable {
    var id: String { get }
    var name: String { get }
    var abbreviation: String { get }
    var description: String { get }

    /// The category of rule (inference, equivalence, or proof technique)
    var category: RuleCategory { get }
}

enum RuleCategory: String, Codable, CaseIterable {
    case inference = "Inference"
    case equivalence = "Equivalence"
    case proofTechnique = "Proof Technique"
}

/// Represents a reference to a rule application in a proof
struct RuleApplication: Equatable, Hashable, Codable {
    let ruleId: String
    let lineReferences: [Int]
    let scopeReference: ClosedRange<Int>?

    init(ruleId: String, lineReferences: [Int] = [], scopeReference: ClosedRange<Int>? = nil) {
        self.ruleId = ruleId
        self.lineReferences = lineReferences
        self.scopeReference = scopeReference
    }

    /// Display string for the rule application (e.g., "MP 1, 3" or "→I 2-5")
    var displayString: String {
        var result = ruleId

        if let scope = scopeReference {
            result += " \(scope.lowerBound)-\(scope.upperBound)"
        }

        if !lineReferences.isEmpty {
            let refs = lineReferences.map(String.init).joined(separator: ", ")
            if scopeReference != nil {
                result += ", \(refs)"
            } else {
                result += " \(refs)"
            }
        }

        return result
    }
}
