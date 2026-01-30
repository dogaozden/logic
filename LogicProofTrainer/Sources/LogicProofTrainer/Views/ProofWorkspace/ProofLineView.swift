import SwiftUI

/// Displays a single line in a Fitch-style proof.
struct ProofLineView: View {
    let line: ProofLine
    let depth: Int
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            // Indentation for subproof depth
            ForEach(0..<depth, id: \.self) { _ in
                Rectangle()
                    .fill(Color.accentColor.opacity(0.3))
                    .frame(width: 2)
                    .padding(.horizontal, 8)
            }

            // Line number
            Text("\(line.lineNumber).")
                .font(.system(.body, design: .monospaced))
                .foregroundColor(.secondary)
                .frame(width: 30, alignment: .trailing)
                .padding(.trailing, 8)

            // Formula
            Text(line.formula.displayString)
                .font(.system(.body, design: .monospaced))
                .foregroundColor(line.isValid ? .primary : .red)
                .frame(maxWidth: .infinity, alignment: .leading)

            // Justification
            Text(line.justification.displayString)
                .font(.system(.caption, design: .monospaced))
                .foregroundColor(.secondary)
                .frame(width: 100, alignment: .trailing)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(
            RoundedRectangle(cornerRadius: 4)
                .fill(backgroundColor)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(isSelected ? Color.accentColor : Color.clear, lineWidth: 2)
        )
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
        .help(line.validationMessage ?? line.justification.displayString)
    }

    private var backgroundColor: Color {
        if !line.isValid {
            return Color.red.opacity(0.1)
        }
        if isSelected {
            return Color.accentColor.opacity(0.1)
        }
        if case .assumption = line.justification {
            return Color.blue.opacity(0.05)
        }
        if case .premise = line.justification {
            return Color.gray.opacity(0.05)
        }
        return Color.clear
    }
}

/// Preview provider
struct ProofLineView_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 4) {
            ProofLineView(
                line: ProofLine(
                    lineNumber: 1,
                    formula: .implies(.atom("P"), .atom("Q")),
                    justification: .premise
                ),
                depth: 0,
                isSelected: false,
                onTap: {}
            )

            ProofLineView(
                line: ProofLine(
                    lineNumber: 2,
                    formula: .atom("P"),
                    justification: .assumption
                ),
                depth: 1,
                isSelected: true,
                onTap: {}
            )

            ProofLineView(
                line: ProofLine(
                    lineNumber: 3,
                    formula: .atom("Q"),
                    justification: .inference(.modusPonens, lineReferences: [1, 2]),
                    isValid: false,
                    validationMessage: "Line 2 is not accessible"
                ),
                depth: 1,
                isSelected: false,
                onTap: {}
            )
        }
        .padding()
        .frame(width: 500)
    }
}
