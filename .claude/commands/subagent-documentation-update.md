---
description: Send six Sonnet sub-agents to understand the repo and update DOCUMENTATION.md
allowed-tools: Read, Glob, Grep, Edit, Task, Write
---

# Sub-Agent Documentation Update

Send six Sonnet sub-agents to go and understand the repo and go back to documentation.md and update the documentation.

## Instructions

1. **Launch six Sonnet sub-agents in parallel** using the Task tool with `model: "sonnet"` and `subagent_type: "general-purpose"`. Each agent should focus on a different area of the codebase:

   - **Agent 1 - Swift Source Files**: Read and understand all `.swift` source files in the project. Summarize every class, struct, enum, protocol, and their responsibilities.
   - **Agent 2 - UI & Views**: Read and understand all SwiftUI views, UI components, and user interaction flows. Document the UI architecture and navigation.
   - **Agent 3 - Logic Engine**: Read and understand the proof logic, theorem generation, natural deduction rules, and validation system. Document how proofs work.
   - **Agent 4 - Data Models & State**: Read and understand all data models, state management, persistence, and data flow. Document the data architecture.
   - **Agent 5 - Project Configuration**: Read and understand project configuration files (`.xcodeproj`, `Info.plist`, `Package.swift`, etc.), build settings, dependencies, and project structure. Document the project setup.
   - **Agent 6 - Current Documentation Review**: Read the current `logic-proof-trainer/DOCUMENTATION.md` thoroughly and identify all sections, what's documented, what's missing, and what's outdated.

2. **Collect all results** from the six agents.

3. **Read the current DOCUMENTATION.md** at `logic-proof-trainer/DOCUMENTATION.md`.

4. **Update DOCUMENTATION.md** by synthesizing all agent findings:
   - Add any missing information
   - Update any outdated sections
   - Preserve existing style and formatting
   - Be comprehensive but concise
   - Don't remove correct existing content

5. **Provide a summary** of what was updated.
