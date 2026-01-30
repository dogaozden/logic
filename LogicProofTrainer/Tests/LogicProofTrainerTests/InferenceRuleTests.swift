import XCTest
@testable import LogicProofTrainer

final class InferenceRuleTests: XCTestCase {

    // MARK: - Conjunction Rules

    func testConjunctionIntroduction() {
        let p = Formula.atom("P")
        let q = Formula.atom("Q")

        let result = InferenceRule.conjunctionIntroduction.apply(to: [p, q])
        XCTAssertEqual(result, .and(p, q))
    }

    func testConjunctionEliminationLeft() {
        let p = Formula.atom("P")
        let q = Formula.atom("Q")
        let pAndQ = Formula.and(p, q)

        let result = InferenceRule.conjunctionEliminationLeft.apply(to: [pAndQ])
        XCTAssertEqual(result, p)
    }

    func testConjunctionEliminationRight() {
        let p = Formula.atom("P")
        let q = Formula.atom("Q")
        let pAndQ = Formula.and(p, q)

        let result = InferenceRule.conjunctionEliminationRight.apply(to: [pAndQ])
        XCTAssertEqual(result, q)
    }

    // MARK: - Disjunction Rules

    func testDisjunctionIntroductionLeft() {
        let p = Formula.atom("P")
        let q = Formula.atom("Q")

        let result = InferenceRule.disjunctionIntroductionLeft.apply(to: [p], additionalFormula: q)
        XCTAssertEqual(result, .or(p, q))
    }

    func testDisjunctionIntroductionRight() {
        let p = Formula.atom("P")
        let q = Formula.atom("Q")

        let result = InferenceRule.disjunctionIntroductionRight.apply(to: [q], additionalFormula: p)
        XCTAssertEqual(result, .or(p, q))
    }

    func testDisjunctiveSyllogism() {
        let p = Formula.atom("P")
        let q = Formula.atom("Q")
        let pOrQ = Formula.or(p, q)
        let notP = Formula.not(p)

        // P ∨ Q, ~P ⊢ Q
        let result = InferenceRule.disjunctiveSyllogism.apply(to: [pOrQ, notP])
        XCTAssertEqual(result, q)

        // Also works with reversed order
        let result2 = InferenceRule.disjunctiveSyllogism.apply(to: [notP, pOrQ])
        XCTAssertEqual(result2, q)
    }

    func testDisjunctionElimination() {
        let p = Formula.atom("P")
        let q = Formula.atom("Q")
        let r = Formula.atom("R")
        let pOrQ = Formula.or(p, q)
        let pImpliesR = Formula.implies(p, r)
        let qImpliesR = Formula.implies(q, r)

        let result = InferenceRule.disjunctionElimination.apply(to: [pOrQ, pImpliesR, qImpliesR])
        XCTAssertEqual(result, r)
    }

    // MARK: - Conditional Rules

    func testModusPonens() {
        let p = Formula.atom("P")
        let q = Formula.atom("Q")
        let pImpliesQ = Formula.implies(p, q)

        // P → Q, P ⊢ Q
        let result = InferenceRule.modusPonens.apply(to: [pImpliesQ, p])
        XCTAssertEqual(result, q)

        // Also works with reversed order
        let result2 = InferenceRule.modusPonens.apply(to: [p, pImpliesQ])
        XCTAssertEqual(result2, q)
    }

    func testModusTollens() {
        let p = Formula.atom("P")
        let q = Formula.atom("Q")
        let pImpliesQ = Formula.implies(p, q)
        let notQ = Formula.not(q)

        // P → Q, ~Q ⊢ ~P
        let result = InferenceRule.modusTollens.apply(to: [pImpliesQ, notQ])
        XCTAssertEqual(result, .not(p))
    }

    func testHypotheticalSyllogism() {
        let p = Formula.atom("P")
        let q = Formula.atom("Q")
        let r = Formula.atom("R")
        let pImpliesQ = Formula.implies(p, q)
        let qImpliesR = Formula.implies(q, r)

        // P → Q, Q → R ⊢ P → R
        let result = InferenceRule.hypotheticalSyllogism.apply(to: [pImpliesQ, qImpliesR])
        XCTAssertEqual(result, .implies(p, r))
    }

    // MARK: - Negation Rules

    func testDoubleNegationIntroduction() {
        let p = Formula.atom("P")

        let result = InferenceRule.doubleNegationIntroduction.apply(to: [p])
        XCTAssertEqual(result, .not(.not(p)))
    }

    func testDoubleNegationElimination() {
        let p = Formula.atom("P")
        let notNotP = Formula.not(.not(p))

        let result = InferenceRule.doubleNegationElimination.apply(to: [notNotP])
        XCTAssertEqual(result, p)
    }

    // MARK: - Biconditional Rules

    func testBiconditionalIntroduction() {
        let p = Formula.atom("P")
        let q = Formula.atom("Q")
        let pImpliesQ = Formula.implies(p, q)
        let qImpliesP = Formula.implies(q, p)

        let result = InferenceRule.biconditionalIntroduction.apply(to: [pImpliesQ, qImpliesP])
        XCTAssertEqual(result, .biconditional(p, q))
    }

    func testBiconditionalEliminationLeft() {
        let p = Formula.atom("P")
        let q = Formula.atom("Q")
        let pIffQ = Formula.biconditional(p, q)

        // P ≡ Q, P ⊢ Q
        let result = InferenceRule.biconditionalEliminationLeft.apply(to: [pIffQ, p])
        XCTAssertEqual(result, q)
    }

    func testBiconditionalEliminationRight() {
        let p = Formula.atom("P")
        let q = Formula.atom("Q")
        let pIffQ = Formula.biconditional(p, q)

        // P ≡ Q, Q ⊢ P
        let result = InferenceRule.biconditionalEliminationRight.apply(to: [pIffQ, q])
        XCTAssertEqual(result, p)
    }

    // MARK: - Other Rules

    func testConstructiveDilemma() {
        let p = Formula.atom("P")
        let q = Formula.atom("Q")
        let r = Formula.atom("R")
        let s = Formula.atom("S")
        let pOrQ = Formula.or(p, q)
        let pImpliesR = Formula.implies(p, r)
        let qImpliesS = Formula.implies(q, s)

        // P ∨ Q, P → R, Q → S ⊢ R ∨ S
        let result = InferenceRule.constructiveDilemma.apply(to: [pOrQ, pImpliesR, qImpliesS])
        XCTAssertEqual(result, .or(r, s))
    }

    func testReiteration() {
        let p = Formula.atom("P")

        let result = InferenceRule.reiteration.apply(to: [p])
        XCTAssertEqual(result, p)
    }

    // MARK: - Verification Tests

    func testVerifyModusPonens() {
        let p = Formula.atom("P")
        let q = Formula.atom("Q")
        let pImpliesQ = Formula.implies(p, q)

        XCTAssertTrue(InferenceRule.modusPonens.verify(premises: [pImpliesQ, p], conclusion: q))
        XCTAssertFalse(InferenceRule.modusPonens.verify(premises: [pImpliesQ, p], conclusion: p))
    }

    // MARK: - Invalid Applications

    func testInvalidApplication() {
        let p = Formula.atom("P")

        // Modus ponens with only one premise
        XCTAssertNil(InferenceRule.modusPonens.apply(to: [p]))

        // Conjunction elimination on non-conjunction
        XCTAssertNil(InferenceRule.conjunctionEliminationLeft.apply(to: [p]))

        // Double negation elimination on single negation
        XCTAssertNil(InferenceRule.doubleNegationElimination.apply(to: [.not(p)]))
    }
}
