import Foundation

/// Parses ASCII propositional logic formulas into Formula AST.
///
/// Grammar (in order of precedence, lowest to highest):
///   formula     ::= biconditional
///   biconditional ::= implication ('<->' biconditional)?
///   implication ::= disjunction ('->' implication)?
///   disjunction ::= conjunction ('|' disjunction)?
///   conjunction ::= negation ('&' conjunction)?
///   negation    ::= '~' negation | primary
///   primary     ::= atom | '(' formula ')' | '_|_'
///   atom        ::= [A-Z][a-zA-Z0-9]*
struct FormulaParser {

    enum ParseError: Error, LocalizedError {
        case unexpectedEndOfInput
        case unexpectedCharacter(Character, at: Int)
        case expectedClosingParenthesis(at: Int)
        case invalidAtom(at: Int)
        case trailingCharacters(at: Int)

        var errorDescription: String? {
            switch self {
            case .unexpectedEndOfInput:
                return "Unexpected end of input"
            case .unexpectedCharacter(let char, let pos):
                return "Unexpected character '\(char)' at position \(pos)"
            case .expectedClosingParenthesis(let pos):
                return "Expected ')' at position \(pos)"
            case .invalidAtom(let pos):
                return "Invalid atom at position \(pos). Atoms must start with an uppercase letter."
            case .trailingCharacters(let pos):
                return "Unexpected characters after formula at position \(pos)"
            }
        }
    }

    private var input: String
    private var index: String.Index
    private var position: Int

    init(input: String) {
        self.input = input
        self.index = input.startIndex
        self.position = 0
    }

    /// Parse the input string into a Formula
    static func parse(_ input: String) throws -> Formula {
        var parser = FormulaParser(input: input)
        let formula = try parser.parseFormula()

        parser.skipWhitespace()
        if !parser.isAtEnd {
            throw ParseError.trailingCharacters(at: parser.position)
        }

        return formula
    }

    // MARK: - Parsing Methods

    private mutating func parseFormula() throws -> Formula {
        try parseBiconditional()
    }

    private mutating func parseBiconditional() throws -> Formula {
        var left = try parseImplication()

        while match("<->") {
            let right = try parseImplication()
            left = .biconditional(left, right)
        }

        return left
    }

    private mutating func parseImplication() throws -> Formula {
        let left = try parseDisjunction()

        // Right-associative
        if match("->") {
            let right = try parseImplication()
            return .implies(left, right)
        }

        return left
    }

    private mutating func parseDisjunction() throws -> Formula {
        var left = try parseConjunction()

        while match("|") {
            let right = try parseConjunction()
            left = .or(left, right)
        }

        return left
    }

    private mutating func parseConjunction() throws -> Formula {
        var left = try parseNegation()

        while match("&") {
            let right = try parseNegation()
            left = .and(left, right)
        }

        return left
    }

    private mutating func parseNegation() throws -> Formula {
        if match("~") {
            let operand = try parseNegation()
            return .not(operand)
        }

        return try parsePrimary()
    }

    private mutating func parsePrimary() throws -> Formula {
        skipWhitespace()

        guard !isAtEnd else {
            throw ParseError.unexpectedEndOfInput
        }

        // Check for contradiction
        if match("_|_") {
            return .contradiction
        }

        // Check for parenthesized expression
        if match("(") {
            let formula = try parseFormula()
            skipWhitespace()
            guard match(")") else {
                throw ParseError.expectedClosingParenthesis(at: position)
            }
            return formula
        }

        // Must be an atom
        return try parseAtom()
    }

    private mutating func parseAtom() throws -> Formula {
        skipWhitespace()

        guard !isAtEnd else {
            throw ParseError.unexpectedEndOfInput
        }

        let startPos = position

        // Atoms must start with uppercase letter
        guard let first = peek(), first.isUppercase else {
            if let char = peek() {
                throw ParseError.unexpectedCharacter(char, at: position)
            }
            throw ParseError.invalidAtom(at: position)
        }

        var name = String(advance())

        // Continue with alphanumeric characters
        while let char = peek(), char.isLetter || char.isNumber {
            name.append(advance())
        }

        return .atom(name)
    }

    // MARK: - Helper Methods

    private var isAtEnd: Bool {
        index >= input.endIndex
    }

    private func peek() -> Character? {
        guard !isAtEnd else { return nil }
        return input[index]
    }

    private mutating func advance() -> Character {
        let char = input[index]
        index = input.index(after: index)
        position += 1
        return char
    }

    private mutating func skipWhitespace() {
        while let char = peek(), char.isWhitespace {
            _ = advance()
        }
    }

    private mutating func match(_ expected: String) -> Bool {
        skipWhitespace()

        var tempIndex = index
        var tempPosition = position

        for char in expected {
            guard tempIndex < input.endIndex, input[tempIndex] == char else {
                return false
            }
            tempIndex = input.index(after: tempIndex)
            tempPosition += 1
        }

        index = tempIndex
        position = tempPosition
        return true
    }
}

// MARK: - Convenience Extensions

extension Formula {
    /// Parse a formula from an ASCII string
    static func parse(_ input: String) throws -> Formula {
        try FormulaParser.parse(input)
    }
}
