import SwiftUI
import Combine

/// View model for the theorem list/selection screen.
@MainActor
class TheoremListViewModel: ObservableObject {
    @Published var theorems: [Theorem] = []
    @Published var customTheorems: [Theorem] = []
    @Published var selectedDifficulty: Difficulty?
    @Published var selectedTheme: Theme?
    @Published var searchText: String = ""
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    private let generator = TheoremGenerator()

    init() {
        loadTheorems()
    }

    var filteredTheorems: [Theorem] {
        var result = theorems + customTheorems

        if let difficulty = selectedDifficulty {
            result = result.filter { $0.difficulty == difficulty }
        }

        if let theme = selectedTheme {
            result = result.filter { $0.theme == theme }
        }

        if !searchText.isEmpty {
            result = result.filter { theorem in
                theorem.displayString.localizedCaseInsensitiveContains(searchText) ||
                (theorem.name?.localizedCaseInsensitiveContains(searchText) ?? false)
            }
        }

        return result
    }

    func loadTheorems() {
        isLoading = true

        // Load classic theorems
        theorems = Theorem.classics

        // Load custom theorems
        Task {
            do {
                customTheorems = try await StorageService.shared.loadTheorems()
            } catch {
                errorMessage = "Failed to load custom theorems"
            }
            isLoading = false
        }
    }

    func generateRandomTheorem() -> Theorem {
        let config: TheoremGenerator.Config
        switch selectedDifficulty ?? .medium {
        case .easy: config = .easy
        case .medium: config = .medium
        case .hard: config = .hard
        case .expert: config = .expert
        }

        var gen = TheoremGenerator(config: config)
        return gen.generate()
    }

    func addCustomTheorem(_ theorem: Theorem) {
        customTheorems.append(theorem)

        Task {
            do {
                try await StorageService.shared.saveTheorems(customTheorems)
            } catch {
                errorMessage = "Failed to save theorem"
            }
        }
    }

    func deleteTheorem(_ theorem: Theorem) {
        customTheorems.removeAll { $0.id == theorem.id }

        Task {
            do {
                try await StorageService.shared.saveTheorems(customTheorems)
            } catch {
                errorMessage = "Failed to delete theorem"
            }
        }
    }

    func createTheorem(premises: [String], conclusion: String) throws -> Theorem {
        let parsedPremises = try premises.map { try Formula.parse($0) }
        let parsedConclusion = try Formula.parse(conclusion)

        return Theorem(
            premises: parsedPremises,
            conclusion: parsedConclusion,
            difficulty: .medium
        )
    }
}
