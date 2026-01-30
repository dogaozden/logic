import SwiftUI
import Combine

/// Main view model for the proof workspace.
@MainActor
class ProofWorkspaceViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published var proof: Proof
    @Published var selectedLines: Set<Int> = []
    @Published var formulaInput: String = ""
    @Published var selectedRule: AnyRule?
    @Published var errorMessage: String?
    @Published var showingRulePalette: Bool = false
    @Published var isComplete: Bool = false
    @Published var currentAttempt: ProofAttempt

    // MARK: - Services

    private let verifier = ProofVerifier()
    private var dependencyTracker: DependencyTracker

    // MARK: - Initialization

    init(theorem: Theorem) {
        let initialProof = Proof.withPremises(for: theorem)
        self.proof = initialProof
        self.dependencyTracker = DependencyTracker.from(proof: initialProof)
        self.currentAttempt = ProofAttempt(theoremId: theorem.id)
    }

    // MARK: - Line Selection

    func toggleLineSelection(_ lineNumber: Int) {
        if selectedLines.contains(lineNumber) {
            selectedLines.remove(lineNumber)
        } else {
            selectedLines.insert(lineNumber)
        }
    }

    func clearSelection() {
        selectedLines.removeAll()
    }

    // MARK: - Formula Input

    func parseFormulaInput() -> Formula? {
        do {
            return try Formula.parse(formulaInput)
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    // MARK: - Rule Application

    func applyRule(_ rule: AnyRule) {
        errorMessage = nil

        switch rule {
        case .inference(let inferenceRule):
            applyInferenceRule(inferenceRule)
        case .equivalence(let equivalenceRule):
            applyEquivalenceRule(equivalenceRule)
        case .technique(let technique):
            applyProofTechnique(technique)
        }
    }

    private func applyInferenceRule(_ rule: InferenceRule) {
        let lineRefs = Array(selectedLines).sorted()

        // Get formulas from selected lines
        let premises = lineRefs.compactMap { proof.formula(at: $0) }

        guard premises.count == rule.premiseCount else {
            errorMessage = "\(rule.name) requires \(rule.premiseCount) line(s), but \(premises.count) selected"
            return
        }

        // Check accessibility
        for lineRef in lineRefs {
            guard proof.isAccessible(lineNumber: lineRef) else {
                errorMessage = "Line \(lineRef) is not accessible"
                return
            }
        }

        // For rules requiring additional formula (like ∨I), parse from input
        var additionalFormula: Formula?
        if rule.requiresAdditionalFormula {
            guard let formula = parseFormulaInput() else {
                errorMessage = "\(rule.name) requires an additional formula"
                return
            }
            additionalFormula = formula
        }

        // Try to apply the rule
        guard let derived = rule.apply(to: premises, additionalFormula: additionalFormula) else {
            errorMessage = "Cannot apply \(rule.name) to selected lines"
            return
        }

        // Add the line
        let justification = Justification.inference(rule, lineReferences: lineRefs)
        let line = proof.addLine(formula: derived, justification: justification)

        // Update dependency tracker
        dependencyTracker.addDependencies(line: line.lineNumber, dependsOn: lineRefs)

        // Track rule usage
        currentAttempt.rulesUsed.append(rule.abbreviation)
        currentAttempt.stepCount += 1

        // Clear selection and check completion
        clearSelection()
        formulaInput = ""
        checkCompletion()
    }

    private func applyEquivalenceRule(_ rule: EquivalenceRule) {
        guard selectedLines.count == 1, let lineRef = selectedLines.first else {
            errorMessage = "\(rule.name) requires exactly 1 line selected"
            return
        }

        guard proof.isAccessible(lineNumber: lineRef) else {
            errorMessage = "Line \(lineRef) is not accessible"
            return
        }

        guard let formula = parseFormulaInput() else {
            errorMessage = "Enter the resulting formula"
            return
        }

        guard let sourceLine = proof.line(at: lineRef) else {
            errorMessage = "Invalid line reference"
            return
        }

        // Verify the equivalence
        let result = verifier.verify(
            formula: formula,
            justification: .equivalence(rule, lineReference: lineRef),
            in: proof
        )

        guard result.isValid else {
            errorMessage = result.message ?? "Invalid application of \(rule.name)"
            return
        }

        // Add the line
        let justification = Justification.equivalence(rule, lineReference: lineRef)
        let line = proof.addLine(formula: formula, justification: justification)

        // Update dependency tracker
        dependencyTracker.addDependency(line: line.lineNumber, dependsOn: lineRef)

        // Track rule usage
        currentAttempt.rulesUsed.append(rule.abbreviation)
        currentAttempt.stepCount += 1

        // Clear selection and check completion
        clearSelection()
        formulaInput = ""
        checkCompletion()
    }

    private func applyProofTechnique(_ technique: ProofTechnique) {
        if proof.isInSubproof && technique == proof.scopeManager.currentScope()?.technique {
            // Trying to close the current subproof
            closeSubproof()
        } else {
            // Opening a new subproof
            openSubproof(technique: technique)
        }
    }

    // MARK: - Subproof Management

    func openSubproof(technique: ProofTechnique) {
        guard let assumption = parseFormulaInput() else {
            errorMessage = "Enter an assumption to start the subproof"
            return
        }

        let (_, line) = proof.openSubproof(assumption: assumption, technique: technique)

        currentAttempt.rulesUsed.append(technique.abbreviation)
        currentAttempt.stepCount += 1

        clearSelection()
        formulaInput = ""
    }

    func closeSubproof() {
        guard let conclusionLine = proof.closeSubproof() else {
            errorMessage = "Cannot close subproof"
            return
        }

        currentAttempt.stepCount += 1
        checkCompletion()
    }

    // MARK: - Direct Line Addition

    /// Adds a line with manual formula and justification input
    func addLine(formula: Formula, justification: Justification) {
        let result = verifier.verify(formula: formula, justification: justification, in: proof)

        var line = proof.addLine(formula: formula, justification: justification)
        line.isValid = result.isValid
        line.validationMessage = result.message

        if let index = proof.lines.firstIndex(where: { $0.id == line.id }) {
            proof.lines[index] = line
        }

        if !result.isValid {
            // Mark dependent lines as invalid
            let dependents = dependencyTracker.cascadeInvalidation(from: line.lineNumber)
            for dep in dependents {
                proof.setValidity(at: dep, isValid: false, message: "Depends on invalid line \(line.lineNumber)")
            }
        }

        // Update tracker
        dependencyTracker.addDependencies(line: line.lineNumber, dependsOn: justification.dependencies)

        currentAttempt.stepCount += 1
        checkCompletion()
    }

    // MARK: - Undo

    func undoLastLine() {
        guard proof.lines.count > proof.theorem.premises.count else { return }

        let removedLine = proof.lines.removeLast()
        dependencyTracker.removeLine(removedLine.lineNumber)

        // If we removed an assumption, we need to handle scope
        if case .assumption = removedLine.justification {
            _ = proof.scopeManager.closeScope(at: removedLine.lineNumber)
        }

        currentAttempt.stepCount = max(0, currentAttempt.stepCount - 1)
        isComplete = false
    }

    // MARK: - Completion Check

    private func checkCompletion() {
        if proof.isComplete {
            isComplete = true
            currentAttempt.isCompleted = true
            currentAttempt.endTime = Date()
        }
    }

    // MARK: - Hints

    func getHint() -> String? {
        currentAttempt.hintsUsed += 1

        // Simple hint system - suggest next logical step
        let conclusion = proof.theorem.conclusion

        // Check if conclusion can be derived directly
        let accessibleFormulas = proof.accessibleFormulas()

        // Check for modus ponens opportunity
        for (lineNum, formula) in accessibleFormulas {
            if case .implies(let p, let q) = formula, q == conclusion {
                if accessibleFormulas.contains(where: { $0.formula == p }) {
                    return "Try using Modus Ponens with line \(lineNum)"
                } else {
                    return "You have \(formula.displayString). Try deriving \(p.displayString)"
                }
            }
        }

        // Check for conjunction/disjunction elimination
        for (lineNum, formula) in accessibleFormulas {
            if case .and = formula {
                return "Line \(lineNum) is a conjunction. Consider using ∧E"
            }
            if case .or(let p, let q) = formula {
                if accessibleFormulas.contains(where: { $0.formula == .not(p) }) {
                    return "Try Disjunctive Syllogism with line \(lineNum)"
                }
            }
        }

        // Suggest conditional proof for implication conclusions
        if case .implies(let p, _) = conclusion {
            if !proof.isInSubproof {
                return "The conclusion is a conditional. Try assuming \(p.displayString) and using Conditional Proof"
            }
        }

        return "Consider what rules could help you derive \(conclusion.displayString)"
    }

    // MARK: - Save/Load

    func saveProof() async {
        do {
            try await StorageService.shared.saveProof(proof)
            try await StorageService.shared.saveAttempt(currentAttempt)
        } catch {
            errorMessage = "Failed to save: \(error.localizedDescription)"
        }
    }
}

// MARK: - Rule Wrapper

/// Type-erased rule for unified handling
enum AnyRule: Identifiable {
    case inference(InferenceRule)
    case equivalence(EquivalenceRule)
    case technique(ProofTechnique)

    var id: String {
        switch self {
        case .inference(let r): return "inf_\(r.id)"
        case .equivalence(let r): return "eq_\(r.id)"
        case .technique(let r): return "tech_\(r.id)"
        }
    }

    var name: String {
        switch self {
        case .inference(let r): return r.name
        case .equivalence(let r): return r.name
        case .technique(let r): return r.name
        }
    }

    var abbreviation: String {
        switch self {
        case .inference(let r): return r.abbreviation
        case .equivalence(let r): return r.abbreviation
        case .technique(let r): return r.abbreviation
        }
    }

    var description: String {
        switch self {
        case .inference(let r): return r.description
        case .equivalence(let r): return r.description
        case .technique(let r): return r.description
        }
    }

    var category: RuleCategory {
        switch self {
        case .inference: return .inference
        case .equivalence: return .equivalence
        case .technique: return .proofTechnique
        }
    }

    static var allRules: [AnyRule] {
        InferenceRule.allCases.map { .inference($0) } +
        EquivalenceRule.allCases.map { .equivalence($0) } +
        ProofTechnique.allCases.map { .technique($0) }
    }
}
