import { ReasoningTurn, ProgressEvent, ProgressTier } from "@roo-code/types"

/**
 * ProgressDetector analyzes reasoning turns to determine whether the agent is
 * making meaningful progress or stuck in a repetitive loop.
 *
 * It compares the current turn against all previous turns to detect:
 * - Strong progress (1.0): new files, new hypotheses, major state transitions
 * - Medium progress (0.5): file modifications, new evidence, test activity
 * - Weak progress (0.2): repeated inspection, minor navigation
 *
 * The raw score is normalized against a maxPossible of 3.0 (cap at 3 strong
 * events per turn), yielding a final score from 0.0 to 1.0.
 *
 * All computation is deterministic and synchronous.
 */
export default class ProgressDetector {
	/**
	 * Detects progress events by comparing the current turn against all previous turns.
	 * Returns the detected events and a normalized progress score (0.0 to 1.0).
	 */
	detectProgress(currentTurn: ReasoningTurn, previousTurns: ReasoningTurn[]): { events: ProgressEvent[]; score: number } {
		const events: ProgressEvent[] = []
		const timestamp = currentTurn.timestamp

		// Build sets of everything seen in previous turns
		const seenFiles = new Set<string>()
		const seenHypotheses = new Set<string>()
		const seenConclusions = new Set<string>()

		for (const turn of previousTurns) {
			for (const f of turn.filesTouched) {
				seenFiles.add(f)
			}
			for (const h of turn.hypotheses) {
				seenHypotheses.add(this.normalize(h))
			}
			for (const c of turn.conclusions) {
				seenConclusions.add(this.normalize(c))
			}
		}

		// --- Strong Progress ---

		// New file created (only detect when we have a baseline from previous turns)
		const hasNewFile = previousTurns.length > 0 && currentTurn.filesTouched.some((f) => !seenFiles.has(f))
		if (hasNewFile) {
			events.push({
				type: "file_created",
				tier: ProgressTier.Strong,
				details: "New file(s) touched that were not seen in previous turns",
				timestamp,
			})
		}

		// New hypothesis introduced (only detect when we have a baseline)
		const hasNewHypothesis = previousTurns.length > 0 && currentTurn.hypotheses.some((h) => !seenHypotheses.has(this.normalize(h)))
		if (hasNewHypothesis) {
			events.push({
				type: "hypothesis_introduced",
				tier: ProgressTier.Strong,
				details: "New hypothesis introduced that was not seen in previous turns",
				timestamp,
			})
		}

		// Major state transition
		const hasMajorTransition = currentTurn.stateTransitions.some(
			(s) => s.includes("completed") || s.includes("resolved"),
		)
		if (hasMajorTransition) {
			events.push({
				type: "state_transition",
				tier: ProgressTier.Strong,
				details: "Major state transition (completed or resolved) detected",
				timestamp,
			})
		}

		// --- Medium Progress ---

		// Existing file modified: previously seen file(s) touched with modification tools (not just reads)
		const hasSeenFile = previousTurns.length > 0 && currentTurn.filesTouched.some((f) => seenFiles.has(f))
		const hasModificationTool =
			currentTurn.toolPattern.length > 0 &&
			currentTurn.toolPattern.some((t) => {
				const lower = t.toLowerCase()
				return !lower.includes("read") && !lower.includes("grep")
			})
		if (hasSeenFile && hasModificationTool) {
			events.push({
				type: "file_modified",
				tier: ProgressTier.Medium,
				details: "Previously seen file(s) touched with additional activity",
				timestamp,
			})
		}

		// New evidence collected (only detect when we have a baseline)
		const hasNewConclusion = previousTurns.length > 0 && currentTurn.conclusions.some((c) => !seenConclusions.has(this.normalize(c)))
		if (hasNewConclusion) {
			events.push({
				type: "evidence_collected",
				tier: ProgressTier.Medium,
				details: "New conclusion(s) not seen in previous turns",
				timestamp,
			})
		}

		// Test-related activity: toolPattern contains "test" and files differ from previous turn
		const hasTestTool = currentTurn.toolPattern.some((t) => t.toLowerCase().includes("test"))
		if (hasTestTool && previousTurns.length > 0) {
			const lastTurn = previousTurns[previousTurns.length - 1]
			const filesDiffer = !this.arraysEqual(currentTurn.filesTouched, lastTurn.filesTouched)
			if (filesDiffer) {
				events.push({
					type: "test_activity",
					tier: ProgressTier.Medium,
					details: "Test tool used with different files than previous turn",
					timestamp,
				})
			}
		}

		// --- Weak Progress ---

		// Repeated inspection: toolPattern contains only "read" or "grep" operations
		const isRepeatedInspection =
			currentTurn.toolPattern.length > 0 &&
			currentTurn.toolPattern.every((t) => {
				const lower = t.toLowerCase()
				return lower.includes("read") || lower.includes("grep")
			})
		if (isRepeatedInspection) {
			events.push({
				type: "repeated_inspection",
				tier: ProgressTier.Weak,
				details: "Only read/grep operations in tool pattern",
				timestamp,
			})
		}

		// Minor navigation: filesTouched is subset of previously touched files
		// with no new hypotheses or conclusions
		const allFilesSeen =
			currentTurn.filesTouched.length > 0 &&
			currentTurn.filesTouched.every((f) => seenFiles.has(f))
		const noNewHypotheses = currentTurn.hypotheses.every((h) => seenHypotheses.has(this.normalize(h)))
		const noNewConclusions = currentTurn.conclusions.every((c) => seenConclusions.has(this.normalize(c)))
		if (allFilesSeen && noNewHypotheses && noNewConclusions) {
			events.push({
				type: "minor_navigation",
				tier: ProgressTier.Weak,
				details: "Files touched are subset of previous files with no new hypotheses or conclusions",
				timestamp,
			})
		}

		// --- Score calculation ---
		const maxPossible = 3.0
		let rawScore = 0.0
		for (const event of events) {
			switch (event.tier) {
				case ProgressTier.Strong:
					rawScore += 1.0
					break
				case ProgressTier.Medium:
					rawScore += 0.5
					break
				case ProgressTier.Weak:
					rawScore += 0.2
					break
			}
		}
		const score = Math.min(rawScore / maxPossible, 1.0)

		return { events, score }
	}

	/**
	 * Normalizes a string for comparison (lowercase, trimmed).
	 */
	private normalize(s: string): string {
		return s.toLowerCase().trim()
	}

	/**
	 * Checks if two string arrays contain the same elements in the same order.
	 */
	private arraysEqual(a: string[], b: string[]): boolean {
		if (a.length !== b.length) {
			return false
		}
		const sortedA = [...a].sort()
		const sortedB = [...b].sort()
		for (let i = 0; i < sortedA.length; i++) {
			if (sortedA[i] !== sortedB[i]) {
				return false
			}
		}
		return true
	}
}