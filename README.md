<p align="center">
  <a href="https://github.com/vi70x3/airo/releases">
    <img src="https://img.shields.io/github/downloads/vi70x3/airo/total?style=flat&logo=vscode" alt="Latest Nightly Release">
  </a>
  <a href="https://app.deepsource.com/gh/vi70x4/AiRo/" target="_blank"><img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/vi70x4/AiRo.svg/?label=code+coverage&show_trend=true&token=5cHwCeZo4DT18G34XmGaJZXJ"/></a>
  <a href="https://app.deepsource.com/gh/vi70x4/AiRo/" target="_blank"><img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/vi70x4/AiRo.svg/?label=active+issues&show_trend=true&token=5cHwCeZo4DT18G34XmGaJZXJ"/></a>
  <a href="https://app.deepsource.com/gh/vi70x4/AiRo/" target="_blank"><img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/vi70x4/AiRo.svg/?label=resolved+issues&show_trend=true&token=5cHwCeZo4DT18G34XmGaJZXJ"/></a>
</p>

# AiRo Code

<details>
<summary> <h4> ⚠️ Show Disclaimer </h4> </summary>
  
**SECURITY NOTICE:** This fork is optimized for complete automation. Because it bypasses all manual confirmation prompts, it is recommended to run it within an isolated environment, such as a dedicated `code-server` instance or a secure graphical container with VSCode.

</details>

## Key Differences in This Fork
*   **Spec-driven by default:** Replaces Architect mode with [Kiro](http://kiro.dev/)-style Spec mode and Code mode with Vibe mode with appropriate prompt engineering.
*   **Streamlined Automation:** Removes the restrictive "Roo is having trouble" halts to prevent interrupted automation runs.
*   **Instance Separation:** Isolates modes and model configurations per instance, allowing you to run multiple independent AiRo tabs side-by-side within one VScode window.
*   **Asynchronous Subtasks (Alpha, enable in experimental settings):** Introduces the `async_task` toolset to run subtasks concurrently. Each subtask opens in a new editor tab, utilizing git worktrees and merging automatically upon completion.
    *   *Note:* `new_task` and `async_task` are restricted to the Orchestrator or custom modes (not available in standard Vibe, Spec, Ask, or Debug modes).
    *   [ ] Integration with [superpowers](https://github.com/obra/superpowers)
*   **Tools Control:** Adds a Tools section in settings to individually toggle all the default AiRo tools available to agent.
*   **Planned Integration:** 
    *   [ ] Integration with [vi70x3/airi](https://github.com/vi70x3/airi) to append AiRo context snapshots to AIRI heartbeats.

---

## Coming Soon

### 1. Swarm Architecture

The Swarm Architecture transitions parallel task execution into a structured coordination model featuring three distinct roles (Coordinator, Worktree Managers, and Agents) managed by a central daemon.

#### A. Central Daemon & Crash Recovery
* **Daemon Core (`Daemon`)**: Acts as the central state hub. It manages the global registry of active agents, coordinates communication channels, persists plan state, and takes periodic snapshots of global swarm state for recovery.
* **Crash Detector (`CrashDetector`)**: Monitors agent status via heartbeats, process liveness, and progress timeouts to detect unexpected process termination, timeout stalls, or missed heartbeats.
* **Checkpoint & Recovery (`ResumeCheckpointManager`, `RecoveryValidator`)**: Persists structured agent progress checkpoints (`ResumeCheckpoint`) to disk. On daemon restart or agent crash, the validator reviews snapshots and checkpoints to flag inconsistencies (e.g., orphaned worktrees, tasks assigned to crashed agents) and attempts automated state repair.

#### B. Context Store & Communication
* **Context Store (`ContextStore`)**: Implements a shared key-value database for coordination state. It supports atomic operations to prevent write-race conditions between parallel agents:
  * **Compare-and-Set (CAS)**: Updates keys only if the current value matches an expected state.
  * **Transactional Updates**: Multi-key modifications executed as an atomic batch with rollback on validation failure.
  * **Atomic Increments**: Numerical updates with delta addition or subtraction.
* **Communication Infrastructure**: Provides Direct Messages (DMs), a global broadcast channel, and topic-based Channels managed by a `ChannelManager` that maintains bounded message history with offset, limit, and time-range query support.

#### C. Conflict & Negotiation Management
* **Intent Avoidance (`IntentAvoidance`)**: A proactive conflict-prevention system. Before modifying a file, agents declare their intent (`IntentNotification`), enabling other agents to wait, redirect, or coordinate to prevent concurrent write collisions.
* **Working Set Comparison (`WorkingSetComparator`)**: Evaluates overlapping file access across different agents' active work areas (`WorkingSet`), assigning a conflict risk level (none, low, medium, high, critical) and recommending coordination actions.
* **Negotiation Manager (`NegotiationManager`, `ConflictTracker`)**: Coordinates structured multi-agent negotiation protocols (propose, accept, reject, close) to resolve conflicts without coordinator intervention, logging all events to a persistent conflict timeline.
* **Semantic Conflict Detection (`SemanticConflictDetector`)**: Analyzes file modifications at a structural level rather than raw text diffs to identify:
  * Incompatible JavaScript/TypeScript function signatures and class inheritance structures.
  * API contract mismatches on interfaces and type aliases.
  * Nested JSON configuration value clashes.
  * Dependency version mismatches in `package.json`.

#### D. Git Worktree & Integration
* **Git Operations Wrapper (`GitOperations`)**: Manages isolated git worktrees. Handles automated branch creation, worktree mounting, status checking, staging, committing, and cleanups.
* **Merge Integration (`MergePreparationIntegration`, `MergePreparer`)**: Evaluates task completions and worktree states against automatic merge criteria, producing status reports and triggering merges once all blockages and validation checks clear.

#### E. Planning & Visualization
* **Plan Versioning (`PlanVersioning`)**: Tracks plan evolutions over time. Generates detailed `PlanDiff` structures (added, removed, or modified tasks) on plan mutation, keeping full snapshots of recent plans in memory while pruning older ones.
* **Plan Quality Validator (`PlanQualityValidator`)**: Performs static analysis on plan structures to detect circular dependencies, orphan tasks with no connections, invalid or empty task scopes, and duplicate task IDs.
* **UI Widgets (`SwarmInfoWidget`, `PlanInfoWidget`)**: React-based panels displaying real-time agent graphs, communication channels, task directed acyclic graphs (DAGs), critical path lengths, and task blockages.

---

### 2. Semantic Loop Detection & Auto-Condense on Model Switch

This system detects reasoning loops, wandering behaviors, and model changes, taking automated action to reduce context complexity and guide the agent back to a productive path.

#### A. Structured State & Similarity Tracking
* **Semantic Tracker (`SemanticStateTracker`)**: Maintains a bounded sliding window of structured `ReasoningTurn` events containing tool patterns, touched files, hypotheses, conclusions, and state transitions.
* **Similarity Scorer (`SimilarityScorer`)**: Computes pairwise turn similarity (0.0 to 1.0) using weighted structured signals:
  * **Tool Pattern Overlap (0.35)**: Evaluated using Longest Common Subsequence (LCS) alignment.
  * **File Set Overlap (0.25)**: Evaluated using Jaccard similarity.
  * **Hypothesis (0.20) and Conclusion (0.10) Overlap**: Evaluated using normalized case-insensitive set comparisons.
  * **State Transitions (0.10)**: Analyzes state progression.

#### B. Progress & Wandering Detectors
* **Progress Detector (`ProgressDetector`)**: Classifies turns into tiered progress categories (Strong, Medium, Weak) based on file creation, new hypotheses, state changes, file edits, and test activity, outputting a normalized progress score.
* **Wandering Detector (`WanderingDetector`)**: Detects non-convergent, non-repetitive exploration (low pairwise similarity but low progress over a prolonged turn sequence), recommending corrective actions before the agent exhausts its context window.
* **Loop Confidence (`LoopConfidenceCalculator`)**: Computes loop confidence scores. Employs nonlinear escalation when similar turns persist, applies proportional decay during productive turns, and enforces a multi-turn cooldown post-compression.

#### C. Strategy Memory
* **Strategy Classifier (`StrategyClassifier`)**: Groups sequences of turns into coarse-grained tool categories (Read, Write, Execute, Explore, Delegate, Complete, Meta).
* **Strategy Memory (`StrategyMemory`)**: Retains a history of strategies tried by the agent. Identifies strategy cycling by checking for exact sequence repetitions or alternating patterns (e.g., A-B-A-B).

#### D. Model Switch Auto-Condensation
* **Model Usage Tracker (`ModelUsageTracker`)**: Tracks which model and provider served each turn. If a user switches to a different model, the system detects this change and can force conversation history condensation (summarization) so that the incoming model receives a clean context summary rather than raw history from a model it has no relation to.

---

### 3. Verification & Testing

The codebase includes corresponding test suites using the **Vitest** framework to verify these systems under isolated and simulated conditions:
* **Loop Detection Tests**: Confirm the correctness of the sliding window tracker, the Jaccard/LCS similarity algorithms, progress and wandering thresholds, and the pure, state-carrying confidence calculator.
* **Swarm & Crash Recovery Tests**: Validate snapshot consistency checkups, transaction rollbacks in the context store, process exit crash detection, checkpoint management, and Git worktree mount/cleanup operations.


---

## Core Capabilities

*   **Code Generation:** Write code from natural language prompts and specifications.
*   **Context-Aware Modes:** Adapt the assistant's behavior using Code, Architect, Ask, Debug, or Custom modes.
*   **Refactoring & Debugging:** Analyze existing codebases, isolate bugs, and apply fixes.
*   **Documentation:** Generate and maintain inline comments, READMEs, and technical documents.
*   **MCP Support:** Extend functionality using Model Context Protocol (MCP) servers.

---

## Included Modes

AiRo Code tailors its system prompts based on your current task:

*   **Vibe Mode:** For standard development, editing, and file operations.
*   **Spec Mode:** For system design, planning, and structural changes.
*   **Ask Mode:** For querying the codebase, clarifying concepts, and documentation.
*   **Debug Mode:** For tracing errors, examining logs, and diagnosing issues.
*   **Custom Modes:** For defining specialized instructions tailored to your team's specific workflow.

Learn more: [Using Modes](https://roocodeinc.github.io/Roo-Code/basic-usage/using-modes) • [Custom Modes](https://roocodeinc.github.io/Roo-Code/advanced-usage/custom-modes)

---

## Resources

*   **[Documentation](https://roocodeinc.github.io/AiRo-Code/):** Guides for installation, configuration, and feature usage.
