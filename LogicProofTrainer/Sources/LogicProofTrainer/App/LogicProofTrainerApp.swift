import SwiftUI

@main
struct LogicProofTrainerApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .frame(minWidth: 800, minHeight: 500)
        }
        .windowStyle(.automatic)
        .defaultSize(width: 1100, height: 700)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Proof") {
                    // Handle new proof
                }
                .keyboardShortcut("n", modifiers: .command)
            }

            CommandMenu("Proof") {
                Button("Undo Last Step") {
                    // Handle undo
                }
                .keyboardShortcut("z", modifiers: .command)

                Divider()

                Button("Get Hint") {
                    // Handle hint
                }
                .keyboardShortcut("h", modifiers: [.command, .shift])

                Divider()

                Button("Save Proof") {
                    // Handle save
                }
                .keyboardShortcut("s", modifiers: .command)
            }

            CommandMenu("Rules") {
                Section("Inference Rules") {
                    ForEach(InferenceRule.allCases, id: \.self) { rule in
                        Button("\(rule.name) (\(rule.abbreviation))") {
                            // Apply rule
                        }
                    }
                }
            }
        }

        #if os(macOS)
        Settings {
            SettingsView()
        }
        #endif
    }
}

/// Main content view with navigation
struct ContentView: View {
    @State private var selectedTab: Tab = .theorems

    enum Tab: String, CaseIterable {
        case theorems = "Theorems"
        case statistics = "Statistics"
    }

    var body: some View {
        NavigationSplitView {
            List(Tab.allCases, id: \.self, selection: $selectedTab) { tab in
                Label(tab.rawValue, systemImage: iconForTab(tab))
                    .tag(tab)
            }
            .listStyle(.sidebar)
            .frame(minWidth: 150)
        } detail: {
            switch selectedTab {
            case .theorems:
                TheoremListView()
            case .statistics:
                StatisticsView()
            }
        }
    }

    private func iconForTab(_ tab: Tab) -> String {
        switch tab {
        case .theorems: return "doc.text"
        case .statistics: return "chart.bar"
        }
    }
}

/// Settings view
struct SettingsView: View {
    @AppStorage("showHintsAutomatically") private var showHintsAutomatically = false
    @AppStorage("defaultDifficulty") private var defaultDifficulty = Difficulty.medium.rawValue

    var body: some View {
        TabView {
            Form {
                Section("General") {
                    Toggle("Show hints automatically when stuck", isOn: $showHintsAutomatically)

                    Picker("Default difficulty", selection: $defaultDifficulty) {
                        ForEach(Difficulty.allCases, id: \.self) { difficulty in
                            Text(difficulty.displayName).tag(difficulty.rawValue)
                        }
                    }
                }
            }
            .formStyle(.grouped)
            .tabItem {
                Label("General", systemImage: "gear")
            }

            Form {
                Section("Display") {
                    // Future: font size, theme, etc.
                    Text("Display settings coming soon")
                        .foregroundColor(.secondary)
                }
            }
            .formStyle(.grouped)
            .tabItem {
                Label("Display", systemImage: "textformat")
            }

            Form {
                Section("Data") {
                    Button("Export Data...") {
                        exportData()
                    }

                    Button("Import Data...") {
                        importData()
                    }

                    Divider()

                    Button("Clear All Data", role: .destructive) {
                        Task {
                            try? await StorageService.shared.clearAllData()
                        }
                    }
                }
            }
            .formStyle(.grouped)
            .tabItem {
                Label("Data", systemImage: "externaldrive")
            }
        }
        .frame(width: 450, height: 300)
    }

    private func exportData() {
        Task {
            guard let data = try? await StorageService.shared.exportData() else { return }

            let panel = NSSavePanel()
            panel.allowedContentTypes = [.json]
            panel.nameFieldStringValue = "LogicProofTrainer_Export.json"

            if panel.runModal() == .OK, let url = panel.url {
                try? data.write(to: url)
            }
        }
    }

    private func importData() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.json]
        panel.allowsMultipleSelection = false

        if panel.runModal() == .OK, let url = panel.url {
            Task {
                if let data = try? Data(contentsOf: url) {
                    try? await StorageService.shared.importData(data)
                }
            }
        }
    }
}

/// Preview provider
struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
            .frame(width: 1000, height: 700)
    }
}
