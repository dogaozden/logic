import Foundation

/// Manages communication with the Lean verification server.
actor LeanBridge {
    static let shared = LeanBridge()

    private var process: Process?
    private var stdin: FileHandle?
    private var stdout: FileHandle?
    private var requestId: Int = 0
    private var pendingRequests: [Int: CheckedContinuation<LeanResponse, Error>] = [:]
    private var isRunning = false

    enum LeanError: Error, LocalizedError {
        case serverNotRunning
        case encodingError
        case decodingError(String)
        case serverError(String)
        case timeout

        var errorDescription: String? {
            switch self {
            case .serverNotRunning: return "Lean server is not running"
            case .encodingError: return "Failed to encode request"
            case .decodingError(let msg): return "Failed to decode response: \(msg)"
            case .serverError(let msg): return "Server error: \(msg)"
            case .timeout: return "Request timed out"
            }
        }
    }

    // MARK: - Server Lifecycle

    /// Starts the Lean server process
    func start() async throws {
        guard !isRunning else { return }

        // Find the Lean server executable
        let serverPath = findServerExecutable()

        let process = Process()
        process.executableURL = URL(fileURLWithPath: serverPath)
        process.arguments = []

        let stdinPipe = Pipe()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()

        process.standardInput = stdinPipe
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        self.stdin = stdinPipe.fileHandleForWriting
        self.stdout = stdoutPipe.fileHandleForReading

        try process.run()
        self.process = process
        self.isRunning = true

        // Start reading responses
        Task {
            await readResponses()
        }
    }

    /// Stops the Lean server process
    func stop() {
        process?.terminate()
        process = nil
        stdin = nil
        stdout = nil
        isRunning = false
    }

    private func findServerExecutable() -> String {
        // Look for the compiled Lean server
        // In development, it might be in the build directory
        // In production, it should be bundled with the app
        let possiblePaths = [
            Bundle.main.bundlePath + "/Contents/Resources/LeanServer/server",
            "./LeanPackage/.lake/build/bin/server",
            "/usr/local/bin/logic-proof-trainer-server"
        ]

        for path in possiblePaths {
            if FileManager.default.fileExists(atPath: path) {
                return path
            }
        }

        // Default to PATH lookup
        return "server"
    }

    // MARK: - Request/Response

    private func sendRequest(_ request: LeanRequest) async throws -> LeanResponse {
        guard isRunning, let stdin = stdin else {
            throw LeanError.serverNotRunning
        }

        var req = request
        requestId += 1
        req.id = requestId

        guard let data = try? JSONEncoder().encode(req),
              let jsonString = String(data: data, encoding: .utf8) else {
            throw LeanError.encodingError
        }

        let message = jsonString + "\n"
        guard let messageData = message.data(using: .utf8) else {
            throw LeanError.encodingError
        }

        return try await withCheckedThrowingContinuation { continuation in
            pendingRequests[req.id] = continuation
            stdin.write(messageData)
        }
    }

    private func readResponses() async {
        guard let stdout = stdout else { return }

        while isRunning {
            do {
                let data = try stdout.availableData
                guard !data.isEmpty else {
                    try? await Task.sleep(nanoseconds: 10_000_000) // 10ms
                    continue
                }

                if let line = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
                   !line.isEmpty,
                   let responseData = line.data(using: .utf8),
                   let response = try? JSONDecoder().decode(LeanResponse.self, from: responseData) {
                    if let continuation = pendingRequests.removeValue(forKey: response.id) {
                        continuation.resume(returning: response)
                    }
                }
            } catch {
                // Log error but continue
                print("Error reading from Lean server: \(error)")
            }
        }
    }

    // MARK: - Verification Methods

    /// Verifies an inference rule application
    func verifyInference(
        rule: String,
        premises: [Formula],
        conclusion: Formula
    ) async throws -> VerificationResult {
        let request = LeanRequest(
            method: "verify_inference",
            params: [
                "rule": .string(rule),
                "premises": .array(premises.map { $0.toJSON() }),
                "conclusion": conclusion.toJSON()
            ]
        )

        let response = try await sendRequest(request)

        if let error = response.error {
            throw LeanError.serverError(error.message)
        }

        guard let result = response.result,
              let valid = result["valid"]?.boolValue else {
            throw LeanError.decodingError("Missing valid field")
        }

        return VerificationResult(isValid: valid, message: nil, derivedFormula: nil)
    }

    /// Verifies an equivalence rule application
    func verifyEquivalence(
        rule: String,
        from: Formula,
        to: Formula
    ) async throws -> VerificationResult {
        let request = LeanRequest(
            method: "verify_equivalence",
            params: [
                "rule": .string(rule),
                "from": from.toJSON(),
                "to": to.toJSON()
            ]
        )

        let response = try await sendRequest(request)

        if let error = response.error {
            throw LeanError.serverError(error.message)
        }

        guard let result = response.result,
              let valid = result["valid"]?.boolValue else {
            throw LeanError.decodingError("Missing valid field")
        }

        return VerificationResult(isValid: valid, message: nil, derivedFormula: nil)
    }

    /// Checks if a formula is a tautology
    func checkTautology(_ formula: Formula) async throws -> Bool {
        let request = LeanRequest(
            method: "check_tautology",
            params: ["formula": formula.toJSON()]
        )

        let response = try await sendRequest(request)

        if let error = response.error {
            throw LeanError.serverError(error.message)
        }

        guard let result = response.result,
              let tautology = result["tautology"]?.boolValue else {
            throw LeanError.decodingError("Missing tautology field")
        }

        return tautology
    }

    /// Finds a proof for a theorem
    func findProof(premises: [Formula], conclusion: Formula) async throws -> [(Formula, String)]? {
        let request = LeanRequest(
            method: "find_proof",
            params: [
                "premises": .array(premises.map { $0.toJSON() }),
                "conclusion": conclusion.toJSON()
            ]
        )

        let response = try await sendRequest(request)

        if let error = response.error {
            throw LeanError.serverError(error.message)
        }

        guard let result = response.result,
              let found = result["found"]?.boolValue else {
            throw LeanError.decodingError("Missing found field")
        }

        guard found, let steps = result["steps"]?.arrayValue else {
            return nil
        }

        return steps.compactMap { step -> (Formula, String)? in
            guard let formulaJSON = step["formula"],
                  let justification = step["justification"]?.stringValue,
                  let formula = Formula.fromJSON(formulaJSON) else {
                return nil
            }
            return (formula, justification)
        }
    }

    /// Ping the server to check if it's responsive
    func ping() async throws -> Bool {
        let request = LeanRequest(method: "ping", params: [:])
        let response = try await sendRequest(request)
        if let result = response.result?["pong"] {
            if case .string(let s) = result, s == "pong" {
                return true
            }
            return true
        }
        return false
    }
}

// MARK: - Request/Response Types

struct LeanRequest: Codable {
    var jsonrpc: String = "2.0"
    var id: Int = 0
    var method: String
    var params: [String: JSONValue]
}

struct LeanResponse: Codable {
    let jsonrpc: String
    let id: Int
    let result: [String: JSONValue]?
    let error: LeanErrorInfo?
}

struct LeanErrorInfo: Codable {
    let code: Int
    let message: String
}

// MARK: - JSON Value Type

enum JSONValue: Codable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case array([JSONValue])
    case object([String: JSONValue])
    case null

    var stringValue: String? {
        if case .string(let s) = self { return s }
        return nil
    }

    var intValue: Int? {
        if case .int(let i) = self { return i }
        return nil
    }

    var boolValue: Bool? {
        if case .bool(let b) = self { return b }
        return nil
    }

    var arrayValue: [[String: JSONValue]]? {
        if case .array(let arr) = self {
            return arr.compactMap { item in
                if case .object(let obj) = item { return obj }
                return nil
            }
        }
        return nil
    }

    subscript(key: String) -> JSONValue? {
        if case .object(let dict) = self {
            return dict[key]
        }
        return nil
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if let string = try? container.decode(String.self) {
            self = .string(string)
        } else if let int = try? container.decode(Int.self) {
            self = .int(int)
        } else if let double = try? container.decode(Double.self) {
            self = .double(double)
        } else if let bool = try? container.decode(Bool.self) {
            self = .bool(bool)
        } else if let array = try? container.decode([JSONValue].self) {
            self = .array(array)
        } else if let object = try? container.decode([String: JSONValue].self) {
            self = .object(object)
        } else if container.decodeNil() {
            self = .null
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unknown JSON value")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let s): try container.encode(s)
        case .int(let i): try container.encode(i)
        case .double(let d): try container.encode(d)
        case .bool(let b): try container.encode(b)
        case .array(let a): try container.encode(a)
        case .object(let o): try container.encode(o)
        case .null: try container.encodeNil()
        }
    }
}

// MARK: - Formula JSON Conversion

extension Formula {
    func toJSON() -> JSONValue {
        switch self {
        case .atom(let name):
            return .object(["type": .string("atom"), "name": .string(name)])
        case .not(let p):
            return .object(["type": .string("not"), "operand": p.toJSON()])
        case .and(let p, let q):
            return .object(["type": .string("and"), "left": p.toJSON(), "right": q.toJSON()])
        case .or(let p, let q):
            return .object(["type": .string("or"), "left": p.toJSON(), "right": q.toJSON()])
        case .implies(let p, let q):
            return .object(["type": .string("implies"), "left": p.toJSON(), "right": q.toJSON()])
        case .biconditional(let p, let q):
            return .object(["type": .string("biconditional"), "left": p.toJSON(), "right": q.toJSON()])
        case .contradiction:
            return .object(["type": .string("contradiction")])
        }
    }

    static func fromJSON(_ json: JSONValue) -> Formula? {
        guard case .object(let dict) = json,
              let typeValue = dict["type"],
              case .string(let type) = typeValue else {
            return nil
        }

        switch type {
        case "atom":
            guard let nameValue = dict["name"], case .string(let name) = nameValue else { return nil }
            return .atom(name)
        case "not":
            guard let operand = dict["operand"], let p = fromJSON(operand) else { return nil }
            return .not(p)
        case "and":
            guard let left = dict["left"], let right = dict["right"],
                  let p = fromJSON(left), let q = fromJSON(right) else { return nil }
            return .and(p, q)
        case "or":
            guard let left = dict["left"], let right = dict["right"],
                  let p = fromJSON(left), let q = fromJSON(right) else { return nil }
            return .or(p, q)
        case "implies":
            guard let left = dict["left"], let right = dict["right"],
                  let p = fromJSON(left), let q = fromJSON(right) else { return nil }
            return .implies(p, q)
        case "biconditional":
            guard let left = dict["left"], let right = dict["right"],
                  let p = fromJSON(left), let q = fromJSON(right) else { return nil }
            return .biconditional(p, q)
        case "contradiction":
            return .contradiction
        default:
            return nil
        }
    }
}

// MARK: - Verification Result

struct VerificationResult {
    let isValid: Bool
    let message: String?
    let derivedFormula: Formula?
}
