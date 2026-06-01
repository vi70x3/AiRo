# Design Document - Semantic Loop Detection (Revised)

## Overview

Semantic Loop Detection identifies and breaks reasoning loops by analyzing structured signals from agent turns rather than raw text. It tracks tool patterns, file interactions, and state transitions to compute a loop confidence score. When a loop is detected, it triggers context compression with a specialized recovery prompt.

## Architecture

### Component Diagram

1.  **SemanticLoopDetector**: Orchestrates detection and recovery.
2.  **SemanticStateTracker**: Maintains a rolling window of `ReasoningTurn` objects.
3.  **SimilarityScorer**: Computes similarity using structured signals.
4.  **ProgressDetector**: Evaluates turn impact based on a tiered progress model.
5.  **LoopConfidenceCalculator**: Manages confidence levels and cooldowns.
6.  **CompressionRecoveryTracker**: Monitors task progress following a loop-break compression.

## Integration Points

### 1. Task Execution Loop (`src/core/task/Task.ts`)
Hooks into `recursivelyMakeClineRequests` to capture turn data after tool execution.

### 2. Context Management
Triggers `manageContext` when confidence exceeds threshold and cooldown is inactive.

### 3. Recovery Tracking
Updates the `CompressionRecoveryTracker` when the agent successfully performs a "Strong" progress action after a compression event.

## Data Structures

### ReasoningTurn
```typescript
interface ReasoningTurn {
    id: string;
    toolPattern: string[];      // Ordered list of tool names
    filesTouched: Set<string>;   // Files read or modified
    hypotheses: string[];       // Extracted hypotheses (if available via markers)
    conclusions: string[];      // Extracted conclusions (if available via markers)
    stateTransitions: string[];  // e.g., "todo_completed:X", "error_resolved:Y"
    timestamp: number;
}
```

### LoopConfidenceState
```typescript
interface LoopConfidenceState {
    score: number;
    consecutiveSimilarTurns: number;
    lastCompressionAt: number;   // Timestamp of last loop-triggered compression
    cooldownActive: boolean;
}
```

## Algorithms

### 1. Structured Similarity
Similarity is a weighted average of:
*   **Tool Pattern Overlap**: Jaccard similarity of tool sequences.
*   **File Set Overlap**: Overlap in files accessed across turns.
*   **Hypothesis/Conclusion Drift**: Detection of repeated or stagnant hypotheses.

### 2. Tiered Progress Scoring
*   **Strong Progress**:
    *   Creation of new files/artifacts.
    *   Modification of existing code (write_to_file, replace).
    *   Explicit task completion (`attempt_completion`).
*   **Medium Progress**:
    *   Discovery of new evidence (e.g., search results containing previously unknown strings).
    *   Introduction of a new hypothesis.
*   **Weak Progress**:
    *   Redundant tool invocations.
    *   Reading files previously accessed in the same state.

### 3. Compression Recovery
Tracking `isRecovered`:
*   True if a "Strong Progress" event occurs within N turns of a loop-triggered compression.
*   False if a new loop is detected immediately.

### 4. Cooldown Mechanism
After a loop-triggered compression, a cooldown period (e.g., 3 turns) prevents immediate re-triggering, allowing the agent time to re-orient.

## Performance Constraints
*   **No raw text processing**: Eliminates token-heavy text similarity.
*   **Synchronous & Local**: Minimal overhead on the main execution loop.
*   **Provider Agnostic**: Works whether or not the provider exposes chain-of-thought blocks.
