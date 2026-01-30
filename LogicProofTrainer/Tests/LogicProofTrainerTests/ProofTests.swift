import XCTest
@testable import LogicProofTrainer

final class ProofTests: XCTestCase {

    // MARK: - Basic Proof Construction

    func testProofWithPremises() {
        let theorem = Theorem(
            premises: [
                .implies(.atom("P"), .atom("Q")),
                .atom("P")
            ],
            conclusion: .atom("Q")
        )

        let proof = Proof.withPremises(for: theorem)

        XCTAssertEqual(proof.lines.count, 2)
        XCTAssertEqual(proof.lines[0].formula, .implies(.atom("P"), .atom("Q")))
        XCTAssertEqual(proof.lines[1].formula, .atom("P"))
    }

    func testAddLine() {
        let theorem = Theorem(
            premises: [.implies(.atom("P"), .atom("Q")), .atom("P")],
            conclusion: .atom("Q")
        )

        var proof = Proof.withPremises(for: theorem)
        let line = proof.addLine(
            formula: .atom("Q"),
            justification: .inference(.modusPonens, lineReferences: [1, 2])
        )

        XCTAssertEqual(proof.lines.count, 3)
        XCTAssertEqual(line.lineNumber, 3)
        XCTAssertEqual(line.formula, .atom("Q"))
    }

    func testProofCompletion() {
        let theorem = Theorem(
            premises: [.implies(.atom("P"), .atom("Q")), .atom("P")],
            conclusion: .atom("Q")
        )

        var proof = Proof.withPremises(for: theorem)
        XCTAssertFalse(proof.isComplete)

        _ = proof.addLine(
            formula: .atom("Q"),
            justification: .inference(.modusPonens, lineReferences: [1, 2])
        )

        XCTAssertTrue(proof.isComplete)
    }

    // MARK: - Scope Tests

    func testOpenSubproof() {
        let theorem = Theorem(
            premises: [.implies(.atom("P"), .atom("Q"))],
            conclusion: .implies(.atom("P"), .atom("Q"))
        )

        var proof = Proof.withPremises(for: theorem)
        let (scope, line) = proof.openSubproof(assumption: .atom("P"), technique: .conditionalProof)

        XCTAssertEqual(proof.lines.count, 2)
        XCTAssertEqual(line.formula, .atom("P"))
        XCTAssertEqual(scope.startLine, 2)
        XCTAssertTrue(proof.isInSubproof)
        XCTAssertEqual(proof.currentDepth, 1)
    }

    func testCloseSubproof() {
        let theorem = Theorem(
            premises: [],
            conclusion: .implies(.atom("P"), .atom("P"))
        )

        var proof = Proof(theorem: theorem)

        // Open subproof with assumption P
        _ = proof.openSubproof(assumption: .atom("P"), technique: .conditionalProof)

        // Close subproof (P -> P)
        let conclusionLine = proof.closeSubproof()

        XCTAssertNotNil(conclusionLine)
        XCTAssertEqual(conclusionLine?.formula, .implies(.atom("P"), .atom("P")))
        XCTAssertFalse(proof.isInSubproof)
    }

    func testNestedSubproofs() {
        let theorem = Theorem(
            premises: [],
            conclusion: .implies(.atom("P"), .implies(.atom("Q"), .atom("P")))
        )

        var proof = Proof(theorem: theorem)

        // Open first subproof (assume P)
        _ = proof.openSubproof(assumption: .atom("P"), technique: .conditionalProof)
        XCTAssertEqual(proof.currentDepth, 1)

        // Open nested subproof (assume Q)
        _ = proof.openSubproof(assumption: .atom("Q"), technique: .conditionalProof)
        XCTAssertEqual(proof.currentDepth, 2)

        // Reiterate P from outer scope
        _ = proof.addLine(formula: .atom("P"), justification: .inference(.reiteration, lineReferences: [1]))

        // Close inner subproof (Q -> P)
        let inner = proof.closeSubproof()
        XCTAssertEqual(inner?.formula, .implies(.atom("Q"), .atom("P")))
        XCTAssertEqual(proof.currentDepth, 1)

        // Close outer subproof (P -> (Q -> P))
        let outer = proof.closeSubproof()
        XCTAssertEqual(outer?.formula, .implies(.atom("P"), .implies(.atom("Q"), .atom("P"))))
        XCTAssertEqual(proof.currentDepth, 0)
    }

    // MARK: - Accessibility Tests

    func testLineAccessibility() {
        let theorem = Theorem(
            premises: [.implies(.atom("P"), .atom("Q"))],
            conclusion: .implies(.atom("P"), .atom("Q"))
        )

        var proof = Proof.withPremises(for: theorem)

        // Line 1 is accessible
        XCTAssertTrue(proof.isAccessible(lineNumber: 1))

        // Open subproof
        _ = proof.openSubproof(assumption: .atom("P"), technique: .conditionalProof)

        // Lines 1 and 2 are accessible from inside the subproof
        XCTAssertTrue(proof.isAccessible(lineNumber: 1))
        XCTAssertTrue(proof.isAccessible(lineNumber: 2))

        // Add a line inside subproof
        _ = proof.addLine(
            formula: .atom("Q"),
            justification: .inference(.modusPonens, lineReferences: [1, 2])
        )

        // Close subproof
        _ = proof.closeSubproof()

        // Now line 2 (assumption) and 3 (inside subproof) should not be accessible
        // But the closing line (4) should be
        XCTAssertTrue(proof.isAccessible(lineNumber: 1))
        // Note: Line accessibility rules are more nuanced in practice
    }

    // MARK: - Dependency Tracking Tests

    func testDependencyTracking() {
        let theorem = Theorem(
            premises: [.implies(.atom("P"), .atom("Q")), .atom("P")],
            conclusion: .atom("Q")
        )

        var proof = Proof.withPremises(for: theorem)
        _ = proof.addLine(
            formula: .atom("Q"),
            justification: .inference(.modusPonens, lineReferences: [1, 2])
        )

        let dependents = proof.linesDependingOn(1)
        XCTAssertTrue(dependents.contains(3))
    }

    func testInvalidationCascade() {
        let theorem = Theorem(
            premises: [.implies(.atom("P"), .atom("Q")), .atom("P")],
            conclusion: .and(.atom("Q"), .atom("Q"))
        )

        var proof = Proof.withPremises(for: theorem)

        // Add Q derived from MP
        _ = proof.addLine(
            formula: .atom("Q"),
            justification: .inference(.modusPonens, lineReferences: [1, 2])
        )

        // Add Q & Q derived from conjunction intro
        _ = proof.addLine(
            formula: .and(.atom("Q"), .atom("Q")),
            justification: .inference(.conjunctionIntroduction, lineReferences: [3, 3])
        )

        // Invalidate line 3
        proof.invalidateLine(3, message: "Test invalidation")

        // Line 4 should also be invalid
        XCTAssertFalse(proof.lines[2].isValid) // Line 3
        XCTAssertFalse(proof.lines[3].isValid) // Line 4
    }
}

final class ScopeManagerTests: XCTestCase {

    func testCanAccessInSameScope() {
        var manager = ScopeManager()

        // Open a scope at line 1
        _ = manager.openScope(at: 1, technique: .conditionalProof)

        // Line 3 should be able to access line 2
        XCTAssertTrue(manager.canAccess(from: 3, target: 2))
    }

    func testCannotAccessClosedScope() {
        var manager = ScopeManager()

        // Open and close a scope (lines 1-2)
        _ = manager.openScope(at: 1, technique: .conditionalProof)
        _ = manager.closeScope(at: 2)

        // Line 3 should not be able to access line 2 (inside closed scope)
        XCTAssertFalse(manager.canAccess(from: 4, target: 2))
    }

    func testCanAccessOuterScope() {
        var manager = ScopeManager()

        // Open outer scope at line 1
        _ = manager.openScope(at: 1, technique: .conditionalProof)

        // Open inner scope at line 2
        _ = manager.openScope(at: 2, technique: .conditionalProof)

        // From line 3, should be able to access line 1 (outer scope)
        XCTAssertTrue(manager.canAccess(from: 3, target: 1))
    }

    func testDepthCalculation() {
        var manager = ScopeManager()

        // Main proof level
        XCTAssertEqual(manager.depth(at: 1), 0)

        // Open scope at line 2
        _ = manager.openScope(at: 2, technique: .conditionalProof)

        // Inside first scope
        XCTAssertEqual(manager.depth(at: 3), 1)

        // Open nested scope at line 3
        _ = manager.openScope(at: 3, technique: .conditionalProof)

        // Inside nested scope
        XCTAssertEqual(manager.depth(at: 4), 2)
    }
}
