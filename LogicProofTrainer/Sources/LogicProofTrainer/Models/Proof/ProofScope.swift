import Foundation

/// Represents a scope (subproof) in a Fitch-style proof.
/// Scopes are used for conditional proof, indirect proof, etc.
struct ProofScope: Identifiable, Equatable, Codable {
    let id: UUID

    /// The line number where this scope begins (the assumption line)
    var startLine: Int

    /// The line number where this scope ends (inclusive), nil if still open
    var endLine: Int?

    /// The proof technique this scope is for
    var technique: ProofTechnique

    /// The depth of nesting (0 for main proof, 1 for first-level subproof, etc.)
    var depth: Int

    /// Child scopes nested within this one
    var childScopes: [ProofScope]

    init(
        id: UUID = UUID(),
        startLine: Int,
        endLine: Int? = nil,
        technique: ProofTechnique,
        depth: Int,
        childScopes: [ProofScope] = []
    ) {
        self.id = id
        self.startLine = startLine
        self.endLine = endLine
        self.technique = technique
        self.depth = depth
        self.childScopes = childScopes
    }

    /// Whether this scope is currently open (not yet closed)
    var isOpen: Bool {
        endLine == nil
    }

    /// The range of lines in this scope, if closed
    var lineRange: ClosedRange<Int>? {
        guard let end = endLine else { return nil }
        return startLine...end
    }

    /// Returns whether a given line number is within this scope
    func contains(lineNumber: Int) -> Bool {
        if let end = endLine {
            return lineNumber >= startLine && lineNumber <= end
        }
        return lineNumber >= startLine
    }
}

/// Manages the scope structure of a proof
struct ScopeManager: Equatable, Codable {
    /// All scopes in the proof, including the implicit main scope
    var scopes: [ProofScope] = []

    /// The currently open scope stack (innermost last)
    var openScopes: [UUID] = []

    /// Current nesting depth
    var currentDepth: Int {
        openScopes.count
    }

    /// Opens a new scope at the given line
    mutating func openScope(at lineNumber: Int, technique: ProofTechnique) -> ProofScope {
        let scope = ProofScope(
            startLine: lineNumber,
            technique: technique,
            depth: currentDepth + 1
        )
        scopes.append(scope)
        openScopes.append(scope.id)
        return scope
    }

    /// Closes the innermost open scope at the given line
    mutating func closeScope(at lineNumber: Int) -> ProofScope? {
        guard let scopeId = openScopes.popLast(),
              let index = scopes.firstIndex(where: { $0.id == scopeId }) else {
            return nil
        }

        scopes[index].endLine = lineNumber
        return scopes[index]
    }

    /// Returns the innermost open scope, if any
    func currentScope() -> ProofScope? {
        guard let scopeId = openScopes.last else { return nil }
        return scopes.first { $0.id == scopeId }
    }

    /// Returns the depth at which a line was written
    func depth(at lineNumber: Int) -> Int {
        var depth = 0
        for scope in scopes {
            if scope.contains(lineNumber: lineNumber) && lineNumber > scope.startLine {
                depth = max(depth, scope.depth)
            } else if lineNumber == scope.startLine {
                depth = max(depth, scope.depth)
            }
        }
        return depth
    }

    /// Returns whether a line at `fromLine` can access (cite) a line at `targetLine`
    /// A line can only access lines in its own scope or enclosing scopes
    func canAccess(from fromLine: Int, target targetLine: Int) -> Bool {
        // Can't access lines that come after
        guard targetLine < fromLine else { return false }

        // Find all scopes that contain targetLine
        let targetScopes = scopes.filter { scope in
            if let end = scope.endLine {
                return targetLine >= scope.startLine && targetLine <= end
            }
            return targetLine >= scope.startLine
        }

        // Find all scopes that contain fromLine
        let fromScopes = scopes.filter { scope in
            if let end = scope.endLine {
                return fromLine >= scope.startLine && fromLine <= end
            }
            return fromLine >= scope.startLine
        }

        // Target line is accessible if it's not in a closed scope that doesn't contain fromLine
        for scope in targetScopes {
            if let end = scope.endLine {
                // Scope is closed
                // Can only access if fromLine is also in this scope
                let fromIsInScope = fromScopes.contains { $0.id == scope.id }
                if !fromIsInScope && fromLine > end {
                    return false
                }
            }
        }

        return true
    }
}
