import Foundation

/// Tracks dependencies between proof lines and handles invalidation cascading.
struct DependencyTracker {
    /// A graph of line dependencies
    private var dependencies: [Int: Set<Int>] = [:]

    /// Reverse mapping: what lines depend on each line
    private var dependents: [Int: Set<Int>] = [:]

    /// Adds a dependency: `line` depends on `dependsOn`
    mutating func addDependency(line: Int, dependsOn: Int) {
        dependencies[line, default: []].insert(dependsOn)
        dependents[dependsOn, default: []].insert(line)
    }

    /// Adds multiple dependencies
    mutating func addDependencies(line: Int, dependsOn: [Int]) {
        for dep in dependsOn {
            addDependency(line: line, dependsOn: dep)
        }
    }

    /// Removes all dependencies for a line
    mutating func removeLine(_ line: Int) {
        // Remove from dependents of lines this line depends on
        if let deps = dependencies[line] {
            for dep in deps {
                dependents[dep]?.remove(line)
            }
        }

        // Remove the line's own dependencies
        dependencies.removeValue(forKey: line)

        // Remove dependents of this line (they'll need re-evaluation)
        dependents.removeValue(forKey: line)
    }

    /// Returns all lines that directly or indirectly depend on the given line
    func allDependents(of line: Int) -> Set<Int> {
        var result = Set<Int>()
        var queue = Array(dependents[line] ?? [])

        while !queue.isEmpty {
            let current = queue.removeFirst()
            if result.insert(current).inserted {
                queue.append(contentsOf: dependents[current] ?? [])
            }
        }

        return result
    }

    /// Returns the direct dependencies of a line
    func directDependencies(of line: Int) -> Set<Int> {
        dependencies[line] ?? []
    }

    /// Returns all lines that directly depend on the given line
    func directDependents(of line: Int) -> Set<Int> {
        dependents[line] ?? []
    }

    /// Checks if there's a dependency cycle involving the given line
    func hasCycle(from line: Int) -> Bool {
        var visited = Set<Int>()
        var stack = Set<Int>()

        func dfs(_ node: Int) -> Bool {
            if stack.contains(node) {
                return true // Found a cycle
            }
            if visited.contains(node) {
                return false // Already processed
            }

            visited.insert(node)
            stack.insert(node)

            for dep in dependencies[node] ?? [] {
                if dfs(dep) {
                    return true
                }
            }

            stack.remove(node)
            return false
        }

        return dfs(line)
    }

    /// Returns lines in topological order (dependencies before dependents)
    func topologicalOrder() -> [Int] {
        var visited = Set<Int>()
        var result: [Int] = []

        func visit(_ node: Int) {
            guard !visited.contains(node) else { return }
            visited.insert(node)

            for dep in dependencies[node] ?? [] {
                visit(dep)
            }

            result.append(node)
        }

        for line in dependencies.keys.sorted() {
            visit(line)
        }

        return result
    }
}

// MARK: - Proof Integration

extension DependencyTracker {
    /// Builds a dependency tracker from an existing proof
    static func from(proof: Proof) -> DependencyTracker {
        var tracker = DependencyTracker()

        for line in proof.lines {
            let deps = line.justification.dependencies
            tracker.addDependencies(line: line.lineNumber, dependsOn: deps)
        }

        return tracker
    }

    /// Given an invalid line, returns all lines that should also be marked invalid
    func cascadeInvalidation(from invalidLine: Int) -> Set<Int> {
        allDependents(of: invalidLine)
    }
}
