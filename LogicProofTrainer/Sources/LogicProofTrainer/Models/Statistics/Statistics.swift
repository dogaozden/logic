import Foundation

/// Statistics for a user's proof attempts
struct UserStatistics: Codable {
    var totalProofsAttempted: Int = 0
    var totalProofsCompleted: Int = 0
    var proofsByDifficulty: [Difficulty: DifficultyStats] = [:]
    var proofsByTheme: [Theme: ThemeStats] = [:]
    var ruleUsage: [String: Int] = [:]
    var streakDays: Int = 0
    var lastActivityDate: Date?

    /// Success rate as a percentage
    var successRate: Double {
        guard totalProofsAttempted > 0 else { return 0 }
        return Double(totalProofsCompleted) / Double(totalProofsAttempted) * 100
    }

    /// Most used rule
    var mostUsedRule: String? {
        ruleUsage.max(by: { $0.value < $1.value })?.key
    }
}

/// Statistics for a specific difficulty level
struct DifficultyStats: Codable {
    var attempted: Int = 0
    var completed: Int = 0
    var averageSteps: Double = 0
    var averageTimeSeconds: Double = 0

    var successRate: Double {
        guard attempted > 0 else { return 0 }
        return Double(completed) / Double(attempted) * 100
    }
}

/// Statistics for a specific theme
struct ThemeStats: Codable {
    var attempted: Int = 0
    var completed: Int = 0
    var averageSteps: Double = 0

    var successRate: Double {
        guard attempted > 0 else { return 0 }
        return Double(completed) / Double(attempted) * 100
    }
}

/// Record of a single proof attempt
struct ProofAttempt: Identifiable, Codable {
    let id: UUID
    let theoremId: UUID
    let startTime: Date
    var endTime: Date?
    var isCompleted: Bool
    var stepCount: Int
    var hintsUsed: Int
    var rulesUsed: [String]

    /// Duration in seconds
    var duration: TimeInterval? {
        guard let end = endTime else { return nil }
        return end.timeIntervalSince(startTime)
    }

    init(
        id: UUID = UUID(),
        theoremId: UUID,
        startTime: Date = Date(),
        endTime: Date? = nil,
        isCompleted: Bool = false,
        stepCount: Int = 0,
        hintsUsed: Int = 0,
        rulesUsed: [String] = []
    ) {
        self.id = id
        self.theoremId = theoremId
        self.startTime = startTime
        self.endTime = endTime
        self.isCompleted = isCompleted
        self.stepCount = stepCount
        self.hintsUsed = hintsUsed
        self.rulesUsed = rulesUsed
    }
}

// MARK: - Statistics Updates

extension UserStatistics {
    /// Updates statistics based on a completed proof attempt
    mutating func recordAttempt(_ attempt: ProofAttempt, theorem: Theorem) {
        totalProofsAttempted += 1

        if attempt.isCompleted {
            totalProofsCompleted += 1
        }

        // Update difficulty stats
        var diffStats = proofsByDifficulty[theorem.difficulty] ?? DifficultyStats()
        diffStats.attempted += 1
        if attempt.isCompleted {
            diffStats.completed += 1
            // Update running average
            let n = Double(diffStats.completed)
            diffStats.averageSteps = ((n - 1) * diffStats.averageSteps + Double(attempt.stepCount)) / n
            if let duration = attempt.duration {
                diffStats.averageTimeSeconds = ((n - 1) * diffStats.averageTimeSeconds + duration) / n
            }
        }
        proofsByDifficulty[theorem.difficulty] = diffStats

        // Update theme stats
        if let theme = theorem.theme {
            var themeStats = proofsByTheme[theme] ?? ThemeStats()
            themeStats.attempted += 1
            if attempt.isCompleted {
                themeStats.completed += 1
                let n = Double(themeStats.completed)
                themeStats.averageSteps = ((n - 1) * themeStats.averageSteps + Double(attempt.stepCount)) / n
            }
            proofsByTheme[theme] = themeStats
        }

        // Update rule usage
        for rule in attempt.rulesUsed {
            ruleUsage[rule, default: 0] += 1
        }

        // Update streak
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())

        if let lastDate = lastActivityDate {
            let lastDay = calendar.startOfDay(for: lastDate)
            let daysDiff = calendar.dateComponents([.day], from: lastDay, to: today).day ?? 0

            if daysDiff == 1 {
                // Consecutive day
                streakDays += 1
            } else if daysDiff > 1 {
                // Streak broken
                streakDays = 1
            }
            // daysDiff == 0 means same day, don't change streak
        } else {
            streakDays = 1
        }

        lastActivityDate = Date()
    }
}
