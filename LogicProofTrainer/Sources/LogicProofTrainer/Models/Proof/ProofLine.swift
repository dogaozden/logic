import Foundation

/// Represents a single line in a proof.
struct ProofLine: Identifiable, Equatable, Codable {
    let id: UUID
    var lineNumber: Int
    var formula: Formula
    var justification: Justification
    var isValid: Bool
    var validationMessage: String?

    init(
        id: UUID = UUID(),
        lineNumber: Int,
        formula: Formula,
        justification: Justification,
        isValid: Bool = true,
        validationMessage: String? = nil
    ) {
        self.id = id
        self.lineNumber = lineNumber
        self.formula = formula
        self.justification = justification
        self.isValid = isValid
        self.validationMessage = validationMessage
    }
}

/// The justification for a proof line.
enum Justification: Equatable, Codable {
    /// A premise of the argument
    case premise

    /// An assumption for a subproof (conditional proof, indirect proof, etc.)
    case assumption

    /// Derived by applying an inference rule to one or more lines
    case inference(InferenceRule, lineReferences: [Int])

    /// Derived by applying an equivalence rule to a line
    case equivalence(EquivalenceRule, lineReference: Int)

    /// Derived by closing a subproof with a proof technique
    case subproofConclusion(ProofTechnique, scopeRange: ClosedRange<Int>)

    /// Display string for the justification
    var displayString: String {
        switch self {
        case .premise:
            return "Premise"
        case .assumption:
            return "Assumption"
        case .inference(let rule, let refs):
            let refStr = refs.map(String.init).joined(separator: ", ")
            return "\(rule.abbreviation) \(refStr)"
        case .equivalence(let rule, let ref):
            return "\(rule.abbreviation) \(ref)"
        case .subproofConclusion(let technique, let range):
            return "\(technique.abbreviation) \(range.lowerBound)-\(range.upperBound)"
        }
    }

    /// The line numbers this justification depends on
    var dependencies: [Int] {
        switch self {
        case .premise, .assumption:
            return []
        case .inference(_, let refs):
            return refs
        case .equivalence(_, let ref):
            return [ref]
        case .subproofConclusion(_, let range):
            return Array(range)
        }
    }
}
