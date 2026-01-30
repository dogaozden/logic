import SwiftUI

/// Displays available rules organized by category for selection.
struct RulePaletteView: View {
    @Binding var selectedRule: AnyRule?
    let onRuleSelected: (AnyRule) -> Void

    @State private var expandedCategory: RuleCategory? = .inference

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Rules")
                .font(.headline)
                .padding(.horizontal, 12)
                .padding(.top, 12)

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    // Inference Rules
                    RuleCategorySection(
                        category: .inference,
                        rules: InferenceRule.allCases.map { .inference($0) },
                        isExpanded: expandedCategory == .inference,
                        selectedRule: selectedRule,
                        onToggle: { toggleCategory(.inference) },
                        onRuleSelected: onRuleSelected
                    )

                    // Equivalence Rules
                    RuleCategorySection(
                        category: .equivalence,
                        rules: EquivalenceRule.allCases.map { .equivalence($0) },
                        isExpanded: expandedCategory == .equivalence,
                        selectedRule: selectedRule,
                        onToggle: { toggleCategory(.equivalence) },
                        onRuleSelected: onRuleSelected
                    )

                    // Proof Techniques
                    RuleCategorySection(
                        category: .proofTechnique,
                        rules: ProofTechnique.allCases.map { .technique($0) },
                        isExpanded: expandedCategory == .proofTechnique,
                        selectedRule: selectedRule,
                        onToggle: { toggleCategory(.proofTechnique) },
                        onRuleSelected: onRuleSelected
                    )
                }
                .padding()
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private func toggleCategory(_ category: RuleCategory) {
        withAnimation(.easeInOut(duration: 0.2)) {
            if expandedCategory == category {
                expandedCategory = nil
            } else {
                expandedCategory = category
            }
        }
    }
}

/// A collapsible section for a rule category
struct RuleCategorySection: View {
    let category: RuleCategory
    let rules: [AnyRule]
    let isExpanded: Bool
    let selectedRule: AnyRule?
    let onToggle: () -> Void
    let onRuleSelected: (AnyRule) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Category header
            Button(action: onToggle) {
                HStack {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption)
                        .frame(width: 16)

                    Text(category.rawValue)
                        .font(.subheadline)
                        .fontWeight(.semibold)

                    Spacer()

                    Text("\(rules.count)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            // Rules list
            if isExpanded {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(rules) { rule in
                        RuleButton(
                            rule: rule,
                            isSelected: selectedRule?.id == rule.id,
                            onTap: { onRuleSelected(rule) }
                        )
                    }
                }
                .padding(.leading, 20)
            }
        }
    }
}

/// A button for selecting a rule
struct RuleButton: View {
    let rule: AnyRule
    let isSelected: Bool
    let onTap: () -> Void

    @State private var isHovered: Bool = false

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 8) {
                Text(rule.abbreviation)
                    .font(.system(.caption, design: .monospaced))
                    .fontWeight(.medium)
                    .foregroundColor(.accentColor)

                Text(rule.name)
                    .font(.caption)
                    .fixedSize(horizontal: true, vertical: false)

                Spacer(minLength: 4)
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 12)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(backgroundColor)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(isSelected ? Color.accentColor : Color.clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
        .help(rule.description)
    }

    private var backgroundColor: Color {
        if isSelected {
            return Color.accentColor.opacity(0.2)
        }
        if isHovered {
            return Color.secondary.opacity(0.1)
        }
        return Color.clear
    }
}

/// A compact rule picker for inline use
struct CompactRulePicker: View {
    @Binding var selectedRule: AnyRule?

    var body: some View {
        Menu {
            ForEach(RuleCategory.allCases, id: \.self) { category in
                Section(category.rawValue) {
                    ForEach(rulesForCategory(category)) { rule in
                        Button {
                            selectedRule = rule
                        } label: {
                            HStack {
                                Text(rule.abbreviation)
                                    .font(.system(.body, design: .monospaced))
                                Text(rule.name)
                            }
                        }
                    }
                }
            }
        } label: {
            HStack {
                Text(selectedRule?.abbreviation ?? "Select Rule")
                Image(systemName: "chevron.down")
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.secondary.opacity(0.1))
            )
        }
    }

    private func rulesForCategory(_ category: RuleCategory) -> [AnyRule] {
        switch category {
        case .inference:
            return InferenceRule.allCases.map { .inference($0) }
        case .equivalence:
            return EquivalenceRule.allCases.map { .equivalence($0) }
        case .proofTechnique:
            return ProofTechnique.allCases.map { .technique($0) }
        }
    }
}

/// Preview provider
struct RulePaletteView_Previews: PreviewProvider {
    static var previews: some View {
        RulePaletteView(
            selectedRule: .constant(.inference(.modusPonens)),
            onRuleSelected: { _ in }
        )
        .frame(width: 280, height: 400)
    }
}
