import Foundation

/// Handles persistence of proofs, theorems, and user statistics.
actor StorageService {
    static let shared = StorageService()

    private let fileManager = FileManager.default
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private var appSupportURL: URL {
        let urls = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)
        let appSupport = urls[0].appendingPathComponent("LogicProofTrainer", isDirectory: true)

        // Create directory if needed
        try? fileManager.createDirectory(at: appSupport, withIntermediateDirectories: true)

        return appSupport
    }

    private var proofsURL: URL {
        appSupportURL.appendingPathComponent("proofs", isDirectory: true)
    }

    private var theoremsURL: URL {
        appSupportURL.appendingPathComponent("theorems.json")
    }

    private var statisticsURL: URL {
        appSupportURL.appendingPathComponent("statistics.json")
    }

    private var attemptsURL: URL {
        appSupportURL.appendingPathComponent("attempts", isDirectory: true)
    }

    init() {
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    }

    // MARK: - Proofs

    func saveProof(_ proof: Proof) async throws {
        try fileManager.createDirectory(at: proofsURL, withIntermediateDirectories: true)

        let fileURL = proofsURL.appendingPathComponent("\(proof.id.uuidString).json")
        let data = try encoder.encode(proof)
        try data.write(to: fileURL)
    }

    func loadProof(id: UUID) async throws -> Proof? {
        let fileURL = proofsURL.appendingPathComponent("\(id.uuidString).json")
        guard fileManager.fileExists(atPath: fileURL.path) else { return nil }

        let data = try Data(contentsOf: fileURL)
        return try decoder.decode(Proof.self, from: data)
    }

    func loadAllProofs() async throws -> [Proof] {
        guard fileManager.fileExists(atPath: proofsURL.path) else { return [] }

        let files = try fileManager.contentsOfDirectory(at: proofsURL, includingPropertiesForKeys: nil)
        var proofs: [Proof] = []

        for file in files where file.pathExtension == "json" {
            let data = try Data(contentsOf: file)
            if let proof = try? decoder.decode(Proof.self, from: data) {
                proofs.append(proof)
            }
        }

        return proofs
    }

    func deleteProof(id: UUID) async throws {
        let fileURL = proofsURL.appendingPathComponent("\(id.uuidString).json")
        try fileManager.removeItem(at: fileURL)
    }

    // MARK: - Custom Theorems

    func saveTheorems(_ theorems: [Theorem]) async throws {
        let data = try encoder.encode(theorems)
        try data.write(to: theoremsURL)
    }

    func loadTheorems() async throws -> [Theorem] {
        guard fileManager.fileExists(atPath: theoremsURL.path) else { return [] }

        let data = try Data(contentsOf: theoremsURL)
        return try decoder.decode([Theorem].self, from: data)
    }

    // MARK: - Statistics

    func saveStatistics(_ stats: UserStatistics) async throws {
        let data = try encoder.encode(stats)
        try data.write(to: statisticsURL)
    }

    func loadStatistics() async throws -> UserStatistics {
        guard fileManager.fileExists(atPath: statisticsURL.path) else {
            return UserStatistics()
        }

        let data = try Data(contentsOf: statisticsURL)
        return try decoder.decode(UserStatistics.self, from: data)
    }

    // MARK: - Proof Attempts

    func saveAttempt(_ attempt: ProofAttempt) async throws {
        try fileManager.createDirectory(at: attemptsURL, withIntermediateDirectories: true)

        let fileURL = attemptsURL.appendingPathComponent("\(attempt.id.uuidString).json")
        let data = try encoder.encode(attempt)
        try data.write(to: fileURL)
    }

    func loadAttempts(for theoremId: UUID) async throws -> [ProofAttempt] {
        guard fileManager.fileExists(atPath: attemptsURL.path) else { return [] }

        let files = try fileManager.contentsOfDirectory(at: attemptsURL, includingPropertiesForKeys: nil)
        var attempts: [ProofAttempt] = []

        for file in files where file.pathExtension == "json" {
            let data = try Data(contentsOf: file)
            if let attempt = try? decoder.decode(ProofAttempt.self, from: data),
               attempt.theoremId == theoremId {
                attempts.append(attempt)
            }
        }

        return attempts.sorted { $0.startTime > $1.startTime }
    }

    func loadAllAttempts() async throws -> [ProofAttempt] {
        guard fileManager.fileExists(atPath: attemptsURL.path) else { return [] }

        let files = try fileManager.contentsOfDirectory(at: attemptsURL, includingPropertiesForKeys: nil)
        var attempts: [ProofAttempt] = []

        for file in files where file.pathExtension == "json" {
            let data = try Data(contentsOf: file)
            if let attempt = try? decoder.decode(ProofAttempt.self, from: data) {
                attempts.append(attempt)
            }
        }

        return attempts.sorted { $0.startTime > $1.startTime }
    }

    // MARK: - Export/Import

    func exportData() async throws -> Data {
        struct ExportData: Codable {
            var proofs: [Proof]
            var theorems: [Theorem]
            var statistics: UserStatistics
            var attempts: [ProofAttempt]
        }

        let exportData = ExportData(
            proofs: try await loadAllProofs(),
            theorems: try await loadTheorems(),
            statistics: try await loadStatistics(),
            attempts: try await loadAllAttempts()
        )

        return try encoder.encode(exportData)
    }

    func importData(_ data: Data) async throws {
        struct ExportData: Codable {
            var proofs: [Proof]
            var theorems: [Theorem]
            var statistics: UserStatistics
            var attempts: [ProofAttempt]
        }

        let imported = try decoder.decode(ExportData.self, from: data)

        for proof in imported.proofs {
            try await saveProof(proof)
        }

        try await saveTheorems(imported.theorems)
        try await saveStatistics(imported.statistics)

        for attempt in imported.attempts {
            try await saveAttempt(attempt)
        }
    }

    // MARK: - Clear Data

    func clearAllData() async throws {
        if fileManager.fileExists(atPath: appSupportURL.path) {
            try fileManager.removeItem(at: appSupportURL)
        }
    }
}
