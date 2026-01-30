import SwiftUI

/// Main proof workspace view combining all proof editing components.
struct ProofWorkspaceView: View {
    @StateObject var viewModel: ProofWorkspaceViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var showingHint: Bool = false
    @State private var currentHint: String?
    @State private var showingSaveConfirmation: Bool = false

    var body: some View {
        HSplitView {
            // Main proof area
            VStack(spacing: 0) {
                // Proof display
                FitchBoxView(
                    proof: viewModel.proof,
                    selectedLines: viewModel.selectedLines,
                    onLineSelected: { viewModel.toggleLineSelection($0) }
                )

                Divider()

                // Input area
                inputArea
            }
            .frame(minWidth: 400)

            // Rule palette sidebar
            RulePaletteView(
                selectedRule: $viewModel.selectedRule,
                onRuleSelected: { viewModel.applyRule($0) }
            )
            .frame(minWidth: 220, idealWidth: 280, maxWidth: 350)
        }
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                // Undo button
                Button {
                    viewModel.undoLastLine()
                } label: {
                    Image(systemName: "arrow.uturn.backward")
                }
                .help("Undo last line")
                .disabled(viewModel.proof.lines.count <= viewModel.proof.theorem.premises.count)

                // Hint button
                Button {
                    currentHint = viewModel.getHint()
                    showingHint = true
                } label: {
                    Image(systemName: "lightbulb")
                }
                .help("Get a hint")

                // Save button
                Button {
                    Task {
                        await viewModel.saveProof()
                        showingSaveConfirmation = true
                    }
                } label: {
                    Image(systemName: "square.and.arrow.down")
                }
                .help("Save proof")
            }
        }
        .alert("Hint", isPresented: $showingHint) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(currentHint ?? "No hint available")
        }
        .alert("Saved", isPresented: $showingSaveConfirmation) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Your proof has been saved.")
        }
        .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
            Button("OK") {
                viewModel.errorMessage = nil
            }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
        .navigationTitle(viewModel.proof.theorem.name ?? "Proof")
    }

    private var inputArea: some View {
        VStack(spacing: 12) {
            // Formula input
            FormulaInputWithToolbar(
                text: $viewModel.formulaInput,
                placeholder: "Enter formula (e.g., P -> Q)",
                onSubmit: applySelectedRule
            )

            // Selected lines indicator
            if !viewModel.selectedLines.isEmpty {
                HStack {
                    Text("Selected lines: ")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(viewModel.selectedLines.sorted().map(String.init).joined(separator: ", "))
                        .font(.system(.caption, design: .monospaced))

                    Spacer()

                    Button("Clear") {
                        viewModel.clearSelection()
                    }
                    .font(.caption)
                }
            }

            // Quick action buttons
            HStack {
                // Apply selected rule
                if let rule = viewModel.selectedRule {
                    Button {
                        applySelectedRule()
                    } label: {
                        HStack {
                            Text("Apply \(rule.abbreviation)")
                            if !viewModel.selectedLines.isEmpty {
                                Text("to lines \(viewModel.selectedLines.sorted().map(String.init).joined(separator: ", "))")
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                    .buttonStyle(.borderedProminent)
                }

                Spacer()

                // Subproof controls
                if viewModel.proof.isInSubproof {
                    Button("Close Subproof") {
                        viewModel.closeSubproof()
                    }
                    .buttonStyle(.bordered)
                }
            }

            // Subproof status
            if viewModel.proof.isInSubproof {
                HStack {
                    Image(systemName: "arrow.turn.down.right")
                        .foregroundColor(.accentColor)
                    Text("In subproof (depth \(viewModel.proof.currentDepth))")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                }
            }
        }
        .padding()
        .background(Color(nsColor: .controlBackgroundColor))
    }

    private func applySelectedRule() {
        guard let rule = viewModel.selectedRule else {
            viewModel.errorMessage = "Select a rule first"
            return
        }
        viewModel.applyRule(rule)
    }
}

/// Preview provider
struct ProofWorkspaceView_Previews: PreviewProvider {
    static var previews: some View {
        let theorem = Theorem(
            premises: [
                .implies(.atom("P"), .atom("Q")),
                .atom("P")
            ],
            conclusion: .atom("Q"),
            difficulty: .easy,
            name: "Modus Ponens"
        )

        NavigationStack {
            ProofWorkspaceView(viewModel: ProofWorkspaceViewModel(theorem: theorem))
        }
        .frame(width: 800, height: 600)
    }
}
