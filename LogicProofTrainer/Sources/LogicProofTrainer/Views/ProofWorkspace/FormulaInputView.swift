import SwiftUI

/// Input field for entering formulas with ASCII notation.
struct FormulaInputView: View {
    @Binding var text: String
    let placeholder: String
    let onSubmit: () -> Void

    @State private var parsedFormula: Formula?
    @State private var parseError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                TextField(placeholder, text: $text)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(.body, design: .monospaced))
                    .onSubmit(onSubmit)
                    .onChange(of: text) { _, newValue in
                        validateInput(newValue)
                    }

                // Submit button
                Button(action: onSubmit) {
                    Image(systemName: "return")
                }
                .disabled(parsedFormula == nil && !text.isEmpty)
                .keyboardShortcut(.return, modifiers: [])
            }

            // Live preview and validation
            HStack {
                if let formula = parsedFormula {
                    Text("Preview: ")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(formula.displayString)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundColor(.green)
                } else if let error = parseError {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.red)
                }

                Spacer()

                // Syntax help
                Button {
                    // Show syntax help
                } label: {
                    Image(systemName: "questionmark.circle")
                        .font(.caption)
                }
                .buttonStyle(.plain)
                .help(syntaxHelp)
            }
        }
    }

    private func validateInput(_ input: String) {
        guard !input.isEmpty else {
            parsedFormula = nil
            parseError = nil
            return
        }

        do {
            parsedFormula = try Formula.parse(input)
            parseError = nil
        } catch {
            parsedFormula = nil
            parseError = error.localizedDescription
        }
    }

    private var syntaxHelp: String {
        """
        Syntax:
        • Atoms: P, Q, R, etc. (uppercase letters)
        • Negation: ~P
        • Conjunction: P & Q (displayed as P · Q)
        • Disjunction: P | Q (displayed as P ∨ Q)
        • Conditional: P -> Q (displayed as P ⊃ Q)
        • Biconditional: P <-> Q (displayed as P ≡ Q)
        • Contradiction: _|_ (displayed as ⊥)
        • Parentheses: (P & Q) -> R
        """
    }
}

/// A toolbar for inserting common symbols
struct FormulaToolbar: View {
    @Binding var text: String

    let symbols: [(String, String, String)] = [
        ("~", "~", "Negation"),
        ("&", " & ", "Conjunction"),
        ("|", " | ", "Disjunction"),
        ("→", " -> ", "Conditional"),
        ("↔", " <-> ", "Biconditional"),
        ("⊥", "_|_", "Contradiction"),
        ("()", "()", "Parentheses")
    ]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(symbols, id: \.0) { display, insert, help in
                Button {
                    insertSymbol(insert)
                } label: {
                    Text(display)
                        .font(.system(.body, design: .monospaced))
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.bordered)
                .help(help)
            }
        }
    }

    private func insertSymbol(_ symbol: String) {
        text += symbol
    }
}

/// Combined input view with toolbar
struct FormulaInputWithToolbar: View {
    @Binding var text: String
    let placeholder: String
    let onSubmit: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            FormulaToolbar(text: $text)

            FormulaInputView(
                text: $text,
                placeholder: placeholder,
                onSubmit: onSubmit
            )
        }
    }
}

/// Preview provider
struct FormulaInputView_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 20) {
            FormulaInputView(
                text: .constant("P -> Q"),
                placeholder: "Enter formula...",
                onSubmit: {}
            )

            FormulaInputWithToolbar(
                text: .constant(""),
                placeholder: "Enter formula...",
                onSubmit: {}
            )
        }
        .padding()
        .frame(width: 400)
    }
}
