import Foundation

/// Represents a complete proof attempt for a theorem.
struct Proof: Identifiable, Equatable, Codable {
    let id: UUID

    /// The theorem being proved
    var theorem: Theorem

    /// All lines in the proof
    var lines: [ProofLine]

    /// Scope management for subproofs
    var scopeManager: ScopeManager

    /// Whether this proof is complete and valid
    var isComplete: Bool {
        guard let lastLine = lines.last else { return false }

        // Must conclude with the theorem's conclusion
        guard lastLine.formula == theorem.conclusion else { return false }

        // Last line must be at depth 0 (main proof level)
        guard scopeManager.depth(at: lastLine.lineNumber) == 0 else { return false }

        // All lines must be valid
        guard lines.allSatisfy({ $0.isValid }) else { return false }

        // All scopes must be closed
        guard scopeManager.openScopes.isEmpty else { return false }

        return true
    }

    /// The current line number (for the next line to be added)
    var nextLineNumber: Int {
        (lines.last?.lineNumber ?? 0) + 1
    }

    init(
        id: UUID = UUID(),
        theorem: Theorem,
        lines: [ProofLine] = [],
        scopeManager: ScopeManager = ScopeManager()
    ) {
        self.id = id
        self.theorem = theorem
        self.lines = lines
        self.scopeManager = scopeManager
    }

    /// Creates a new proof with premises already entered
    static func withPremises(for theorem: Theorem) -> Proof {
        var proof = Proof(theorem: theorem)

        for (index, premise) in theorem.premises.enumerated() {
            let line = ProofLine(
                lineNumber: index + 1,
                formula: premise,
                justification: .premise,
                isValid: true
            )
            proof.lines.append(line)
        }

        return proof
    }
}

// MARK: - Line Operations

extension Proof {
    /// Adds a new line to the proof
    mutating func addLine(formula: Formula, justification: Justification) -> ProofLine {
        let line = ProofLine(
            lineNumber: nextLineNumber,
            formula: formula,
            justification: justification
        )
        lines.append(line)
        return line
    }

    /// Gets the formula at a specific line number
    func formula(at lineNumber: Int) -> Formula? {
        lines.first { $0.lineNumber == lineNumber }?.formula
    }

    /// Gets the line at a specific line number
    func line(at lineNumber: Int) -> ProofLine? {
        lines.first { $0.lineNumber == lineNumber }
    }

    /// Returns all formulas that are accessible from the current position
    func accessibleFormulas() -> [(lineNumber: Int, formula: Formula)] {
        let currentLine = nextLineNumber
        return lines
            .filter { scopeManager.canAccess(from: currentLine, target: $0.lineNumber) }
            .map { ($0.lineNumber, $0.formula) }
    }

    /// Returns whether a specific line is accessible from the current position
    func isAccessible(lineNumber: Int) -> Bool {
        scopeManager.canAccess(from: nextLineNumber, target: lineNumber)
    }

    /// Updates a line's validity status
    mutating func setValidity(at lineNumber: Int, isValid: Bool, message: String? = nil) {
        guard let index = lines.firstIndex(where: { $0.lineNumber == lineNumber }) else { return }
        lines[index].isValid = isValid
        lines[index].validationMessage = message
    }
}

// MARK: - Scope Operations

extension Proof {
    /// Opens a new subproof with the given assumption
    mutating func openSubproof(assumption: Formula, technique: ProofTechnique) -> (scope: ProofScope, line: ProofLine) {
        let line = addLine(formula: assumption, justification: .assumption)
        let scope = scopeManager.openScope(at: line.lineNumber, technique: technique)
        return (scope, line)
    }

    /// Closes the current subproof and derives the conclusion
    mutating func closeSubproof() -> ProofLine? {
        guard let currentScope = scopeManager.currentScope(),
              let assumptionLine = line(at: currentScope.startLine),
              let lastLineInScope = lines.last else {
            return nil
        }

        // Close the scope
        guard let closedScope = scopeManager.closeScope(at: lastLineInScope.lineNumber) else {
            return nil
        }

        // Derive the conclusion based on the technique
        guard let derivedFormula = currentScope.technique.deriveFromSubproof(
            assumption: assumptionLine.formula,
            subproofConclusion: lastLineInScope.formula
        ) else {
            return nil
        }

        // Add the derived line
        let conclusionLine = addLine(
            formula: derivedFormula,
            justification: .subproofConclusion(currentScope.technique, scopeRange: closedScope.lineRange!)
        )

        return conclusionLine
    }

    /// Returns whether we're currently in a subproof
    var isInSubproof: Bool {
        !scopeManager.openScopes.isEmpty
    }

    /// Returns the current subproof depth
    var currentDepth: Int {
        scopeManager.currentDepth
    }
}

// MARK: - Dependency Tracking

extension Proof {
    /// Returns all line numbers that depend on the given line
    func linesDependingOn(_ lineNumber: Int) -> [Int] {
        var dependents: Set<Int> = []

        for line in lines where line.lineNumber > lineNumber {
            if line.justification.dependencies.contains(lineNumber) {
                dependents.insert(line.lineNumber)
            }
        }

        // Recursively find transitive dependents
        var allDependents = dependents
        for dependent in dependents {
            let transitive = linesDependingOn(dependent)
            allDependents.formUnion(transitive)
        }

        return Array(allDependents).sorted()
    }

    /// Invalidates a line and all lines that depend on it
    mutating func invalidateLine(_ lineNumber: Int, message: String) {
        setValidity(at: lineNumber, isValid: false, message: message)

        // Invalidate all dependent lines
        for dependentLine in linesDependingOn(lineNumber) {
            setValidity(at: dependentLine, isValid: false, message: "Depends on invalid line \(lineNumber)")
        }
    }
}
