import SwiftUI

/// View for browsing and selecting theorems to prove.
struct TheoremListView: View {
    @StateObject private var viewModel = TheoremListViewModel()
    @State private var selectedTheorem: Theorem?
    @State private var showingCreateTheorem: Bool = false

    var body: some View {
        NavigationSplitView {
            // Sidebar with filters
            List {
                Section("Difficulty") {
                    Button("All") {
                        viewModel.selectedDifficulty = nil
                    }
                    .foregroundColor(viewModel.selectedDifficulty == nil ? .accentColor : .primary)

                    ForEach(Difficulty.allCases, id: \.self) { difficulty in
                        Button(difficulty.displayName) {
                            viewModel.selectedDifficulty = difficulty
                        }
                        .foregroundColor(viewModel.selectedDifficulty == difficulty ? .accentColor : .primary)
                    }
                }

                Section("Theme") {
                    Button("All") {
                        viewModel.selectedTheme = nil
                    }
                    .foregroundColor(viewModel.selectedTheme == nil ? .accentColor : .primary)

                    ForEach(Theme.allCases, id: \.self) { theme in
                        Button(theme.displayName) {
                            viewModel.selectedTheme = theme
                        }
                        .foregroundColor(viewModel.selectedTheme == theme ? .accentColor : .primary)
                    }
                }
            }
            .listStyle(.sidebar)
            .frame(minWidth: 150, maxWidth: 250)
        } content: {
            // Theorem list
            List(viewModel.filteredTheorems, selection: $selectedTheorem) { theorem in
                TheoremRowView(theorem: theorem)
                    .tag(theorem)
                    .contextMenu {
                        if viewModel.customTheorems.contains(where: { $0.id == theorem.id }) {
                            Button(role: .destructive) {
                                viewModel.deleteTheorem(theorem)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
            }
            .searchable(text: $viewModel.searchText, prompt: "Search theorems...")
            .navigationTitle("Theorems")
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    Button {
                        selectedTheorem = viewModel.generateRandomTheorem()
                    } label: {
                        Label("Random", systemImage: "dice")
                    }

                    Button {
                        showingCreateTheorem = true
                    } label: {
                        Label("New", systemImage: "plus")
                    }
                }
            }
        } detail: {
            if let theorem = selectedTheorem {
                TheoremDetailView(theorem: theorem)
            } else {
                ContentUnavailableView("Select a Theorem", systemImage: "doc.text", description: Text("Choose a theorem from the list to start proving"))
            }
        }
        .sheet(isPresented: $showingCreateTheorem) {
            CreateTheoremView { theorem in
                viewModel.addCustomTheorem(theorem)
                selectedTheorem = theorem
            }
        }
    }
}

/// Row view for a theorem in the list
struct TheoremRowView: View {
    let theorem: Theorem

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let name = theorem.name {
                Text(name)
                    .font(.headline)
            }

            Text(theorem.displayString)
                .font(.system(.body, design: .monospaced))
                .lineLimit(2)

            HStack {
                DifficultyBadge(difficulty: theorem.difficulty)

                if let theme = theorem.theme {
                    Text(theme.displayName)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

/// Badge showing difficulty level
struct DifficultyBadge: View {
    let difficulty: Difficulty

    var body: some View {
        Text(difficulty.displayName)
            .font(.caption)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(backgroundColor)
            )
    }

    private var backgroundColor: Color {
        switch difficulty {
        case .easy: return .green.opacity(0.2)
        case .medium: return .yellow.opacity(0.2)
        case .hard: return .orange.opacity(0.2)
        case .expert: return .red.opacity(0.2)
        }
    }
}

/// Detail view for a selected theorem
struct TheoremDetailView: View {
    let theorem: Theorem
    @State private var navigateToProof: Bool = false

    var body: some View {
        VStack(spacing: 20) {
            // Theorem display
            VStack(alignment: .leading, spacing: 12) {
                if let name = theorem.name {
                    Text(name)
                        .font(.largeTitle)
                        .fontWeight(.bold)
                }

                GroupBox("Argument Form") {
                    VStack(alignment: .leading, spacing: 8) {
                        if !theorem.premises.isEmpty {
                            ForEach(Array(theorem.premises.enumerated()), id: \.offset) { index, premise in
                                HStack {
                                    Text("\(index + 1).")
                                        .foregroundColor(.secondary)
                                    Text(premise.displayString)
                                        .font(.system(.title3, design: .monospaced))
                                }
                            }

                            Divider()
                        }

                        HStack {
                            Text("∴")
                                .font(.title2)
                            Text(theorem.conclusion.displayString)
                                .font(.system(.title3, design: .monospaced))
                                .fontWeight(.semibold)
                        }
                    }
                    .padding()
                }

                HStack {
                    DifficultyBadge(difficulty: theorem.difficulty)

                    if let theme = theorem.theme {
                        Text(theme.displayName)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .frame(maxWidth: 500)

            // Start button
            NavigationLink(destination: ProofWorkspaceView(viewModel: ProofWorkspaceViewModel(theorem: theorem))) {
                Label("Start Proof", systemImage: "play.fill")
                    .font(.headline)
                    .padding()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .padding()
        .navigationTitle("Theorem Details")
    }
}

/// View for creating a custom theorem
struct CreateTheoremView: View {
    @Environment(\.dismiss) private var dismiss

    let onSave: (Theorem) -> Void

    @State private var premiseInputs: [String] = [""]
    @State private var conclusionInput: String = ""
    @State private var selectedDifficulty: Difficulty = .medium
    @State private var theoremName: String = ""
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Name (Optional)") {
                    TextField("e.g., My Theorem", text: $theoremName)
                }

                Section("Premises") {
                    ForEach(premiseInputs.indices, id: \.self) { index in
                        HStack {
                            TextField("Premise \(index + 1)", text: $premiseInputs[index])
                                .font(.system(.body, design: .monospaced))

                            if premiseInputs.count > 1 {
                                Button {
                                    premiseInputs.remove(at: index)
                                } label: {
                                    Image(systemName: "minus.circle")
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    Button {
                        premiseInputs.append("")
                    } label: {
                        Label("Add Premise", systemImage: "plus")
                    }
                }

                Section("Conclusion") {
                    TextField("e.g., P -> Q", text: $conclusionInput)
                        .font(.system(.body, design: .monospaced))
                }

                Section("Difficulty") {
                    Picker("Difficulty", selection: $selectedDifficulty) {
                        ForEach(Difficulty.allCases, id: \.self) { difficulty in
                            Text(difficulty.displayName).tag(difficulty)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                if let error = errorMessage {
                    Section {
                        Text(error)
                            .foregroundColor(.red)
                    }
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Create Theorem")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        createTheorem()
                    }
                }
            }
        }
        .frame(minWidth: 400, minHeight: 400)
    }

    private func createTheorem() {
        do {
            let premises = try premiseInputs
                .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
                .map { try Formula.parse($0) }

            guard !conclusionInput.trimmingCharacters(in: .whitespaces).isEmpty else {
                errorMessage = "Conclusion is required"
                return
            }

            let conclusion = try Formula.parse(conclusionInput)

            let theorem = Theorem(
                premises: premises,
                conclusion: conclusion,
                difficulty: selectedDifficulty,
                name: theoremName.isEmpty ? nil : theoremName
            )

            onSave(theorem)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Preview provider
struct TheoremListView_Previews: PreviewProvider {
    static var previews: some View {
        TheoremListView()
            .frame(width: 900, height: 600)
    }
}
