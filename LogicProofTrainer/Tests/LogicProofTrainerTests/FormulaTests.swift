import XCTest
@testable import LogicProofTrainer

final class FormulaTests: XCTestCase {

    // MARK: - Parser Tests

    func testParseAtom() throws {
        let formula = try Formula.parse("P")
        XCTAssertEqual(formula, .atom("P"))
    }

    func testParseMultiCharAtom() throws {
        let formula = try Formula.parse("Prop1")
        XCTAssertEqual(formula, .atom("Prop1"))
    }

    func testParseNegation() throws {
        let formula = try Formula.parse("~P")
        XCTAssertEqual(formula, .not(.atom("P")))
    }

    func testParseDoubleNegation() throws {
        let formula = try Formula.parse("~~P")
        XCTAssertEqual(formula, .not(.not(.atom("P"))))
    }

    func testParseConjunction() throws {
        let formula = try Formula.parse("P & Q")
        XCTAssertEqual(formula, .and(.atom("P"), .atom("Q")))
    }

    func testParseDisjunction() throws {
        let formula = try Formula.parse("P | Q")
        XCTAssertEqual(formula, .or(.atom("P"), .atom("Q")))
    }

    func testParseConditional() throws {
        let formula = try Formula.parse("P -> Q")
        XCTAssertEqual(formula, .implies(.atom("P"), .atom("Q")))
    }

    func testParseBiconditional() throws {
        let formula = try Formula.parse("P <-> Q")
        XCTAssertEqual(formula, .biconditional(.atom("P"), .atom("Q")))
    }

    func testParseContradiction() throws {
        let formula = try Formula.parse("_|_")
        XCTAssertEqual(formula, .contradiction)
    }

    func testParseParentheses() throws {
        let formula = try Formula.parse("(P & Q) -> R")
        XCTAssertEqual(formula, .implies(.and(.atom("P"), .atom("Q")), .atom("R")))
    }

    func testParsePrecedence() throws {
        // Negation binds tighter than conjunction
        let f1 = try Formula.parse("~P & Q")
        XCTAssertEqual(f1, .and(.not(.atom("P")), .atom("Q")))

        // Conjunction binds tighter than disjunction
        let f2 = try Formula.parse("P & Q | R")
        XCTAssertEqual(f2, .or(.and(.atom("P"), .atom("Q")), .atom("R")))

        // Disjunction binds tighter than conditional
        let f3 = try Formula.parse("P | Q -> R")
        XCTAssertEqual(f3, .implies(.or(.atom("P"), .atom("Q")), .atom("R")))

        // Conditional is right-associative
        let f4 = try Formula.parse("P -> Q -> R")
        XCTAssertEqual(f4, .implies(.atom("P"), .implies(.atom("Q"), .atom("R"))))
    }

    func testParseComplex() throws {
        let formula = try Formula.parse("(P -> Q) & (Q -> R) -> (P -> R)")
        XCTAssertEqual(formula, .implies(
            .and(
                .implies(.atom("P"), .atom("Q")),
                .implies(.atom("Q"), .atom("R"))
            ),
            .implies(.atom("P"), .atom("R"))
        ))
    }

    // MARK: - Display String Tests

    func testDisplayString() {
        let formula = Formula.implies(.atom("P"), .atom("Q"))
        XCTAssertEqual(formula.displayString, "P ⊃ Q")
    }

    func testDisplayStringConjunction() {
        let formula = Formula.and(.atom("P"), .atom("Q"))
        XCTAssertEqual(formula.displayString, "P · Q")
    }

    func testDisplayStringDisjunction() {
        let formula = Formula.or(.atom("P"), .atom("Q"))
        XCTAssertEqual(formula.displayString, "P ∨ Q")
    }

    func testDisplayStringBiconditional() {
        let formula = Formula.biconditional(.atom("P"), .atom("Q"))
        XCTAssertEqual(formula.displayString, "P ≡ Q")
    }

    func testDisplayStringWithParentheses() {
        let formula = Formula.implies(.and(.atom("P"), .atom("Q")), .atom("R"))
        XCTAssertEqual(formula.displayString, "(P · Q) ⊃ R")
    }

    // MARK: - ASCII String Tests

    func testAsciiString() {
        let formula = Formula.implies(.atom("P"), .atom("Q"))
        XCTAssertEqual(formula.asciiString, "P -> Q")
    }

    // MARK: - Round-Trip Tests

    func testRoundTrip() throws {
        let formulas = [
            "P",
            "~P",
            "P & Q",
            "P | Q",
            "P -> Q",
            "P <-> Q",
            "~(P & Q)",
            "(P -> Q) & (Q -> P)",
            "~~P",
            "_|_"
        ]

        for formulaStr in formulas {
            let parsed = try Formula.parse(formulaStr)
            let ascii = parsed.asciiString
            let reparsed = try Formula.parse(ascii)
            XCTAssertEqual(parsed, reparsed, "Round-trip failed for: \(formulaStr)")
        }
    }

    // MARK: - Atoms Tests

    func testAtoms() {
        let formula = Formula.implies(
            .and(.atom("P"), .atom("Q")),
            .or(.atom("R"), .atom("P"))
        )
        XCTAssertEqual(formula.atoms, ["P", "Q", "R"])
    }

    // MARK: - Depth Tests

    func testDepth() {
        XCTAssertEqual(Formula.atom("P").depth, 0)
        XCTAssertEqual(Formula.not(.atom("P")).depth, 1)
        XCTAssertEqual(Formula.and(.atom("P"), .atom("Q")).depth, 1)
        XCTAssertEqual(Formula.implies(.and(.atom("P"), .atom("Q")), .atom("R")).depth, 2)
    }

    // MARK: - Substitution Tests

    func testSubstitution() {
        let formula = Formula.implies(.atom("P"), .atom("Q"))
        let substituted = formula.substituting("P", with: .and(.atom("A"), .atom("B")))
        XCTAssertEqual(substituted, .implies(.and(.atom("A"), .atom("B")), .atom("Q")))
    }

    // MARK: - Error Cases

    func testParseErrorUnexpectedCharacter() {
        XCTAssertThrowsError(try Formula.parse("p")) // lowercase not allowed
    }

    func testParseErrorUnexpectedEndOfInput() {
        XCTAssertThrowsError(try Formula.parse("P ->"))
    }

    func testParseErrorMissingClosingParen() {
        XCTAssertThrowsError(try Formula.parse("(P & Q"))
    }

    func testParseErrorTrailingCharacters() {
        XCTAssertThrowsError(try Formula.parse("P Q"))
    }
}
