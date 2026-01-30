import Foundation

/// Verifies proof steps for correctness.
/// This is a Swift-native verifier. The Lean bridge provides additional verification.
struct ProofVerifier {

    /// Result of verifying a proof step
    struct VerificationResult {
        let isValid: Bool
        let message: String?
        let derivedFormula: Formula?
    }

    /// Verifies a proposed proof step
    func verify(
        formula: Formula,
        justification: Justification,
        in proof: Proof
    ) -> VerificationResult {
        switch justification {
        case .premise:
            return verifyPremise(formula: formula, in: proof)

        case .assumption:
            return verifyAssumption(formula: formula, in: proof)

        case .inference(let rule, let lineRefs):
            return verifyInference(formula: formula, rule: rule, lineRefs: lineRefs, in: proof)

        case .equivalence(let rule, let lineRef):
            return verifyEquivalence(formula: formula, rule: rule, lineRef: lineRef, in: proof)

        case .subproofConclusion(let technique, let scopeRange):
            return verifySubproofConclusion(formula: formula, technique: technique, scopeRange: scopeRange, in: proof)
        }
    }

    // MARK: - Verification Methods

    private func verifyPremise(formula: Formula, in proof: Proof) -> VerificationResult {
        // Premises can only be at the start and must match theorem premises
        let premiseCount = proof.lines.filter {
            if case .premise = $0.justification { return true }
            return false
        }.count

        guard premiseCount < proof.theorem.premises.count else {
            return VerificationResult(
                isValid: false,
                message: "All premises have already been stated",
                derivedFormula: nil
            )
        }

        let expectedPremise = proof.theorem.premises[premiseCount]
        guard formula == expectedPremise else {
            return VerificationResult(
                isValid: false,
                message: "Formula doesn't match premise \(premiseCount + 1): expected \(expectedPremise.displayString)",
                derivedFormula: nil
            )
        }

        return VerificationResult(isValid: true, message: nil, derivedFormula: formula)
    }

    private func verifyAssumption(formula: Formula, in proof: Proof) -> VerificationResult {
        // Assumptions are always valid when opening a subproof
        // The validity of the assumption depends on the proof technique being used
        return VerificationResult(isValid: true, message: nil, derivedFormula: formula)
    }

    private func verifyInference(
        formula: Formula,
        rule: InferenceRule,
        lineRefs: [Int],
        in proof: Proof
    ) -> VerificationResult {
        // Check that all referenced lines exist and are accessible
        var premises: [Formula] = []
        for lineRef in lineRefs {
            guard let line = proof.line(at: lineRef) else {
                return VerificationResult(
                    isValid: false,
                    message: "Line \(lineRef) does not exist",
                    derivedFormula: nil
                )
            }

            guard proof.isAccessible(lineNumber: lineRef) else {
                return VerificationResult(
                    isValid: false,
                    message: "Line \(lineRef) is not accessible (in a closed subproof)",
                    derivedFormula: nil
                )
            }

            guard line.isValid else {
                return VerificationResult(
                    isValid: false,
                    message: "Line \(lineRef) is invalid",
                    derivedFormula: nil
                )
            }

            premises.append(line.formula)
        }

        // Check premise count
        guard premises.count == rule.premiseCount else {
            return VerificationResult(
                isValid: false,
                message: "\(rule.name) requires \(rule.premiseCount) premise(s), got \(premises.count)",
                derivedFormula: nil
            )
        }

        // For rules that require additional formula (like ∨I), we need special handling
        if rule.requiresAdditionalFormula {
            // The formula itself tells us what the additional formula is
            if rule.verify(premises: premises, conclusion: formula, additionalFormula: extractAdditionalFormula(for: rule, from: formula, premises: premises)) {
                return VerificationResult(isValid: true, message: nil, derivedFormula: formula)
            } else {
                return VerificationResult(
                    isValid: false,
                    message: "Invalid application of \(rule.name)",
                    derivedFormula: nil
                )
            }
        }

        // Apply the rule and check if it produces the expected formula
        guard let derived = rule.apply(to: premises) else {
            return VerificationResult(
                isValid: false,
                message: "Cannot apply \(rule.name) to the given premises",
                derivedFormula: nil
            )
        }

        guard derived == formula else {
            return VerificationResult(
                isValid: false,
                message: "\(rule.name) derives \(derived.displayString), not \(formula.displayString)",
                derivedFormula: nil
            )
        }

        return VerificationResult(isValid: true, message: nil, derivedFormula: derived)
    }

    private func extractAdditionalFormula(for rule: InferenceRule, from conclusion: Formula, premises: [Formula]) -> Formula? {
        switch rule {
        case .disjunctionIntroductionLeft:
            // P ∨ Q from P, additional is Q
            if case .or(let p, let q) = conclusion, premises.contains(p) {
                return q
            }
        case .disjunctionIntroductionRight:
            // P ∨ Q from Q, additional is P
            if case .or(let p, let q) = conclusion, premises.contains(q) {
                return p
            }
        default:
            break
        }
        return nil
    }

    private func verifyEquivalence(
        formula: Formula,
        rule: EquivalenceRule,
        lineRef: Int,
        in proof: Proof
    ) -> VerificationResult {
        guard let line = proof.line(at: lineRef) else {
            return VerificationResult(
                isValid: false,
                message: "Line \(lineRef) does not exist",
                derivedFormula: nil
            )
        }

        guard proof.isAccessible(lineNumber: lineRef) else {
            return VerificationResult(
                isValid: false,
                message: "Line \(lineRef) is not accessible",
                derivedFormula: nil
            )
        }

        guard line.isValid else {
            return VerificationResult(
                isValid: false,
                message: "Line \(lineRef) is invalid",
                derivedFormula: nil
            )
        }

        // Check if the formula is a valid transformation
        let equivalentForms = rule.equivalentForms(of: line.formula)

        // Also check subformula replacements
        let allTransformations = equivalentForms + findSubformulaTransformations(of: line.formula, using: rule)

        guard allTransformations.contains(formula) else {
            return VerificationResult(
                isValid: false,
                message: "Invalid application of \(rule.name)",
                derivedFormula: nil
            )
        }

        return VerificationResult(isValid: true, message: nil, derivedFormula: formula)
    }

    /// Finds all formulas that can be derived by applying the equivalence rule to any subformula
    private func findSubformulaTransformations(of formula: Formula, using rule: EquivalenceRule) -> [Formula] {
        var results: [Formula] = []

        switch formula {
        case .atom, .contradiction:
            break

        case .not(let p):
            // Transform the inner formula
            for transformed in rule.equivalentForms(of: p) {
                results.append(.not(transformed))
            }
            // Recurse into subformula
            for subTransformed in findSubformulaTransformations(of: p, using: rule) {
                results.append(.not(subTransformed))
            }

        case .and(let p, let q):
            for transformedP in rule.equivalentForms(of: p) {
                results.append(.and(transformedP, q))
            }
            for transformedQ in rule.equivalentForms(of: q) {
                results.append(.and(p, transformedQ))
            }
            for subTransformed in findSubformulaTransformations(of: p, using: rule) {
                results.append(.and(subTransformed, q))
            }
            for subTransformed in findSubformulaTransformations(of: q, using: rule) {
                results.append(.and(p, subTransformed))
            }

        case .or(let p, let q):
            for transformedP in rule.equivalentForms(of: p) {
                results.append(.or(transformedP, q))
            }
            for transformedQ in rule.equivalentForms(of: q) {
                results.append(.or(p, transformedQ))
            }
            for subTransformed in findSubformulaTransformations(of: p, using: rule) {
                results.append(.or(subTransformed, q))
            }
            for subTransformed in findSubformulaTransformations(of: q, using: rule) {
                results.append(.or(p, subTransformed))
            }

        case .implies(let p, let q):
            for transformedP in rule.equivalentForms(of: p) {
                results.append(.implies(transformedP, q))
            }
            for transformedQ in rule.equivalentForms(of: q) {
                results.append(.implies(p, transformedQ))
            }
            for subTransformed in findSubformulaTransformations(of: p, using: rule) {
                results.append(.implies(subTransformed, q))
            }
            for subTransformed in findSubformulaTransformations(of: q, using: rule) {
                results.append(.implies(p, subTransformed))
            }

        case .biconditional(let p, let q):
            for transformedP in rule.equivalentForms(of: p) {
                results.append(.biconditional(transformedP, q))
            }
            for transformedQ in rule.equivalentForms(of: q) {
                results.append(.biconditional(p, transformedQ))
            }
            for subTransformed in findSubformulaTransformations(of: p, using: rule) {
                results.append(.biconditional(subTransformed, q))
            }
            for subTransformed in findSubformulaTransformations(of: q, using: rule) {
                results.append(.biconditional(p, subTransformed))
            }
        }

        return results
    }

    private func verifySubproofConclusion(
        formula: Formula,
        technique: ProofTechnique,
        scopeRange: ClosedRange<Int>,
        in proof: Proof
    ) -> VerificationResult {
        // Find the assumption line (first line of scope)
        guard let assumptionLine = proof.line(at: scopeRange.lowerBound),
              case .assumption = assumptionLine.justification else {
            return VerificationResult(
                isValid: false,
                message: "Subproof must start with an assumption",
                derivedFormula: nil
            )
        }

        // Find the last line of the subproof
        guard let conclusionLine = proof.line(at: scopeRange.upperBound) else {
            return VerificationResult(
                isValid: false,
                message: "Invalid subproof range",
                derivedFormula: nil
            )
        }

        // Verify the derivation matches the technique
        guard let derived = technique.deriveFromSubproof(
            assumption: assumptionLine.formula,
            subproofConclusion: conclusionLine.formula
        ) else {
            return VerificationResult(
                isValid: false,
                message: "Cannot close subproof with \(technique.name): requires \(technique.requiredConclusion == .contradiction ? "contradiction" : "valid derivation")",
                derivedFormula: nil
            )
        }

        guard derived == formula else {
            return VerificationResult(
                isValid: false,
                message: "\(technique.name) derives \(derived.displayString), not \(formula.displayString)",
                derivedFormula: nil
            )
        }

        return VerificationResult(isValid: true, message: nil, derivedFormula: derived)
    }
}
