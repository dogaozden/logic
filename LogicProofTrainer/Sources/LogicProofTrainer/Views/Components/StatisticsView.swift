import SwiftUI

/// Dashboard view showing user statistics and progress.
struct StatisticsView: View {
    @StateObject private var viewModel = StatisticsViewModel()

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Overview cards
                LazyVGrid(columns: [
                    GridItem(.flexible()),
                    GridItem(.flexible()),
                    GridItem(.flexible()),
                    GridItem(.flexible())
                ], spacing: 16) {
                    StatCard(
                        title: "Proofs Completed",
                        value: "\(viewModel.statistics.totalProofsCompleted)",
                        subtitle: "of \(viewModel.statistics.totalProofsAttempted) attempted",
                        icon: "checkmark.circle.fill",
                        color: .green
                    )

                    StatCard(
                        title: "Success Rate",
                        value: viewModel.successRateFormatted,
                        subtitle: "overall",
                        icon: "percent",
                        color: .blue
                    )

                    StatCard(
                        title: "Current Streak",
                        value: "\(viewModel.statistics.streakDays)",
                        subtitle: "days",
                        icon: "flame.fill",
                        color: .orange
                    )

                    StatCard(
                        title: "Favorite Rule",
                        value: viewModel.mostUsedRuleFormatted,
                        subtitle: "most used",
                        icon: "star.fill",
                        color: .yellow
                    )
                }

                // Difficulty breakdown
                GroupBox("By Difficulty") {
                    if viewModel.difficultyBreakdown.isEmpty {
                        ContentUnavailableView("No Data", systemImage: "chart.bar", description: Text("Complete some proofs to see statistics"))
                    } else {
                        VStack(spacing: 12) {
                            ForEach(viewModel.difficultyBreakdown, id: \.0) { difficulty, stats in
                                DifficultyStatRow(difficulty: difficulty, stats: stats)
                            }
                        }
                        .padding()
                    }
                }

                // Theme breakdown
                GroupBox("By Theme") {
                    if viewModel.themeBreakdown.isEmpty {
                        ContentUnavailableView("No Data", systemImage: "chart.pie", description: Text("Complete some proofs to see statistics"))
                    } else {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 200))], spacing: 12) {
                            ForEach(viewModel.themeBreakdown, id: \.0) { theme, stats in
                                ThemeStatCard(theme: theme, stats: stats)
                            }
                        }
                        .padding()
                    }
                }

                // Top rules
                GroupBox("Most Used Rules") {
                    if viewModel.topRules.isEmpty {
                        ContentUnavailableView("No Data", systemImage: "list.number", description: Text("Apply some rules to see statistics"))
                    } else {
                        VStack(spacing: 8) {
                            ForEach(viewModel.topRules, id: \.0) { rule, count in
                                HStack {
                                    Text(rule)
                                        .font(.system(.body, design: .monospaced))
                                        .fontWeight(.medium)

                                    Spacer()

                                    Text("\(count) uses")
                                        .foregroundColor(.secondary)
                                }
                                .padding(.horizontal)
                            }
                        }
                        .padding(.vertical)
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Statistics")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    viewModel.loadStatistics()
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
    }
}

/// A card displaying a single statistic
struct StatCard: View {
    let title: String
    let value: String
    let subtitle: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .foregroundColor(color)
                Text(title)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Text(value)
                .font(.title)
                .fontWeight(.bold)

            Text(subtitle)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(nsColor: .controlBackgroundColor))
        )
    }
}

/// Row showing stats for a difficulty level
struct DifficultyStatRow: View {
    let difficulty: Difficulty
    let stats: DifficultyStats

    var body: some View {
        HStack {
            DifficultyBadge(difficulty: difficulty)
                .frame(width: 80)

            // Progress bar
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Rectangle()
                        .fill(Color.secondary.opacity(0.2))
                        .frame(height: 8)
                        .cornerRadius(4)

                    Rectangle()
                        .fill(progressColor)
                        .frame(width: geometry.size.width * CGFloat(stats.successRate / 100), height: 8)
                        .cornerRadius(4)
                }
            }
            .frame(height: 8)

            Text("\(stats.completed)/\(stats.attempted)")
                .font(.caption)
                .foregroundColor(.secondary)
                .frame(width: 60, alignment: .trailing)

            Text(String(format: "%.0f%%", stats.successRate))
                .font(.caption)
                .fontWeight(.medium)
                .frame(width: 40, alignment: .trailing)
        }
    }

    private var progressColor: Color {
        switch difficulty {
        case .easy: return .green
        case .medium: return .yellow
        case .hard: return .orange
        case .expert: return .red
        }
    }
}

/// Card showing stats for a theme
struct ThemeStatCard: View {
    let theme: Theme
    let stats: ThemeStats

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(theme.displayName)
                .font(.subheadline)
                .fontWeight(.medium)

            HStack {
                Text("\(stats.completed)/\(stats.attempted)")
                    .font(.caption)

                Spacer()

                Text(String(format: "%.0f%%", stats.successRate))
                    .font(.caption)
                    .fontWeight(.medium)
            }
            .foregroundColor(.secondary)

            // Mini progress bar
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Rectangle()
                        .fill(Color.secondary.opacity(0.2))
                        .frame(height: 4)
                        .cornerRadius(2)

                    Rectangle()
                        .fill(Color.accentColor)
                        .frame(width: geometry.size.width * CGFloat(stats.successRate / 100), height: 4)
                        .cornerRadius(2)
                }
            }
            .frame(height: 4)
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.secondary.opacity(0.05))
        )
    }
}

/// Preview provider
struct StatisticsView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationStack {
            StatisticsView()
        }
        .frame(width: 800, height: 600)
    }
}
