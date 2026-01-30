import SwiftUI

/// Renders a Fitch-style proof with nested subproof boxes.
struct FitchBoxView: View {
    let proof: Proof
    let selectedLines: Set<Int>
    let onLineSelected: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            // Goal display
            GoalView(theorem: proof.theorem)
                .padding(.bottom, 8)

            Divider()

            // Proof lines
            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(proof.lines) { line in
                        let depth = proof.scopeManager.depth(at: line.lineNumber)
                        let isFirstInScope = isFirstLineInScope(line.lineNumber)
                        let isLastInScope = isLastLineInScope(line.lineNumber)

                        VStack(spacing: 0) {
                            // Scope start indicator
                            if isFirstInScope && depth > 0 {
                                ScopeStartView(depth: depth)
                            }

                            ProofLineView(
                                line: line,
                                depth: depth,
                                isSelected: selectedLines.contains(line.lineNumber),
                                onTap: { onLineSelected(line.lineNumber) }
                            )

                            // Scope end indicator
                            if isLastInScope && depth > 0 {
                                ScopeEndView(depth: depth)
                            }
                        }
                    }
                }
                .padding()
            }

            // Completion indicator
            if proof.isComplete {
                CompletionBanner()
            }
        }
    }

    private func isFirstLineInScope(_ lineNumber: Int) -> Bool {
        proof.scopeManager.scopes.contains { $0.startLine == lineNumber }
    }

    private func isLastLineInScope(_ lineNumber: Int) -> Bool {
        proof.scopeManager.scopes.contains { $0.endLine == lineNumber }
    }
}

/// Displays the theorem goal
struct GoalView: View {
    let theorem: Theorem

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Goal")
                .font(.caption)
                .foregroundColor(.secondary)

            HStack {
                if !theorem.premises.isEmpty {
                    Text(theorem.premises.map(\.displayString).joined(separator: ", "))
                        .font(.system(.body, design: .monospaced))
                }

                Text("∴")
                    .font(.system(.title3, design: .default))

                Text(theorem.conclusion.displayString)
                    .font(.system(.body, design: .monospaced))
                    .fontWeight(.semibold)
            }

            if let name = theorem.name {
                Text(name)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.secondary.opacity(0.1))
        )
    }
}

/// Visual indicator for the start of a scope
struct ScopeStartView: View {
    let depth: Int

    var body: some View {
        HStack(spacing: 0) {
            ForEach(0..<depth, id: \.self) { i in
                if i == depth - 1 {
                    // Opening bracket for this scope
                    VStack(spacing: 0) {
                        Rectangle()
                            .fill(Color.accentColor)
                            .frame(width: 2, height: 4)
                        HStack(spacing: 0) {
                            Rectangle()
                                .fill(Color.accentColor)
                                .frame(width: 2, height: 2)
                            Rectangle()
                                .fill(Color.accentColor)
                                .frame(width: 8, height: 2)
                        }
                    }
                    .padding(.horizontal, 8)
                } else {
                    Rectangle()
                        .fill(Color.accentColor.opacity(0.3))
                        .frame(width: 2)
                        .padding(.horizontal, 8)
                }
            }
            Spacer()
        }
        .frame(height: 8)
    }
}

/// Visual indicator for the end of a scope
struct ScopeEndView: View {
    let depth: Int

    var body: some View {
        HStack(spacing: 0) {
            ForEach(0..<depth, id: \.self) { i in
                if i == depth - 1 {
                    // Closing bracket for this scope
                    VStack(spacing: 0) {
                        HStack(spacing: 0) {
                            Rectangle()
                                .fill(Color.accentColor)
                                .frame(width: 2, height: 2)
                            Rectangle()
                                .fill(Color.accentColor)
                                .frame(width: 8, height: 2)
                        }
                        Rectangle()
                            .fill(Color.accentColor)
                            .frame(width: 2, height: 4)
                    }
                    .padding(.horizontal, 8)
                } else {
                    Rectangle()
                        .fill(Color.accentColor.opacity(0.3))
                        .frame(width: 2)
                        .padding(.horizontal, 8)
                }
            }
            Spacer()
        }
        .frame(height: 8)
    }
}

/// Banner shown when proof is complete
struct CompletionBanner: View {
    var body: some View {
        HStack {
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.green)
            Text("Proof Complete!")
                .fontWeight(.semibold)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color.green.opacity(0.1))
        .cornerRadius(8)
    }
}

/// Preview provider
struct FitchBoxView_Previews: PreviewProvider {
    static var previews: some View {
        let theorem = Theorem(
            premises: [
                .implies(.atom("P"), .atom("Q")),
                .atom("P")
            ],
            conclusion: .atom("Q"),
            name: "Modus Ponens"
        )

        FitchBoxView(
            proof: Proof.withPremises(for: theorem),
            selectedLines: [1],
            onLineSelected: { _ in }
        )
        .frame(width: 600, height: 400)
    }
}
