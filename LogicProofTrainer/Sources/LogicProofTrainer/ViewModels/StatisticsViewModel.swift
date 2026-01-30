import SwiftUI
import Combine

/// View model for the statistics dashboard.
@MainActor
class StatisticsViewModel: ObservableObject {
    @Published var statistics: UserStatistics = UserStatistics()
    @Published var recentAttempts: [ProofAttempt] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    init() {
        loadStatistics()
    }

    func loadStatistics() {
        isLoading = true

        Task {
            do {
                statistics = try await StorageService.shared.loadStatistics()
                recentAttempts = try await StorageService.shared.loadAllAttempts()
                    .prefix(10)
                    .map { $0 }
            } catch {
                errorMessage = "Failed to load statistics"
            }
            isLoading = false
        }
    }

    func recordAttempt(_ attempt: ProofAttempt, theorem: Theorem) {
        statistics.recordAttempt(attempt, theorem: theorem)

        Task {
            do {
                try await StorageService.shared.saveStatistics(statistics)
                try await StorageService.shared.saveAttempt(attempt)
            } catch {
                errorMessage = "Failed to save statistics"
            }
        }
    }

    func clearStatistics() {
        Task {
            do {
                try await StorageService.shared.clearAllData()
                statistics = UserStatistics()
                recentAttempts = []
            } catch {
                errorMessage = "Failed to clear data"
            }
        }
    }

    // MARK: - Computed Properties for Display

    var successRateFormatted: String {
        String(format: "%.1f%%", statistics.successRate)
    }

    var mostUsedRuleFormatted: String {
        statistics.mostUsedRule ?? "None"
    }

    var difficultyBreakdown: [(Difficulty, DifficultyStats)] {
        Difficulty.allCases.compactMap { difficulty in
            guard let stats = statistics.proofsByDifficulty[difficulty] else { return nil }
            return (difficulty, stats)
        }
    }

    var themeBreakdown: [(Theme, ThemeStats)] {
        Theme.allCases.compactMap { theme in
            guard let stats = statistics.proofsByTheme[theme] else { return nil }
            return (theme, stats)
        }
    }

    var topRules: [(String, Int)] {
        statistics.ruleUsage
            .sorted { $0.value > $1.value }
            .prefix(5)
            .map { ($0.key, $0.value) }
    }
}
