import { describe, it, expect, beforeEach } from "vitest"
import { SemanticStateTracker } from "../SemanticStateTracker"
import { ReasoningTurn } from "../../../../packages/types/src/loop-detection"

describe("SemanticStateTracker", () => {
	let tracker: SemanticStateTracker
	const windowSize = 3

	beforeEach(() => {
		tracker = new SemanticStateTracker(windowSize)
	})

	const createMockTurn = (id: string): ReasoningTurn => ({
		id,
		toolPattern: ["read_file"],
		filesTouched: ["file1.ts"],
		hypotheses: ["hypothesis 1"],
		conclusions: ["conclusion 1"],
		stateTransitions: ["transition 1"],
		timestamp: Date.now(),
	})

	it("should add turns correctly", () => {
		const turn1 = createMockTurn("1")
		const turn2 = createMockTurn("2")

		tracker.addTurn(turn1)
		tracker.addTurn(turn2)

		const turns = tracker.getTurns()
		expect(turns).toHaveLength(2)
		expect(turns[0].id).toBe("1")
		expect(turns[1].id).toBe("2")
	})

	it("should respect the window size", () => {
		tracker.addTurn(createMockTurn("1"))
		tracker.addTurn(createMockTurn("2"))
		tracker.addTurn(createMockTurn("3"))
		tracker.addTurn(createMockTurn("4"))

		const turns = tracker.getTurns()
		expect(turns).toHaveLength(windowSize)
		expect(turns[0].id).toBe("2")
		expect(turns[1].id).toBe("3")
		expect(turns[2].id).toBe("4")
	})

	it("should return the latest turn", () => {
		tracker.addTurn(createMockTurn("1"))
		tracker.addTurn(createMockTurn("2"))

		const latest = tracker.getLatestTurn()
		expect(latest?.id).toBe("2")
	})

	it("should return undefined for latest turn when empty", () => {
		expect(tracker.getLatestTurn()).toBeUndefined()
	})

	it("should clear turns", () => {
		tracker.addTurn(createMockTurn("1"))
		tracker.clear()
		expect(tracker.getTurns()).toHaveLength(0)
	})
})
