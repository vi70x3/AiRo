import { describe, it, expect, beforeEach } from "vitest"
import { SemanticStateTracker } from "../SemanticStateTracker"
import { ReasoningTurn } from "@roo-code/types"

describe("SemanticStateTracker", () => {
	let tracker: SemanticStateTracker
	const windowSize = 3

	beforeEach(() => {
		tracker = new SemanticStateTracker(windowSize)
	})

	const createMockTurn = (id: string, overrides: Partial<ReasoningTurn> = {}): ReasoningTurn => ({
		id,
		toolPattern: ["read_file"],
		filesTouched: ["file1.ts"],
		hypotheses: ["hypothesis 1"],
		conclusions: ["conclusion 1"],
		stateTransitions: ["transition 1"],
		timestamp: Date.now(),
		...overrides,
	})

	describe("addTurn", () => {
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

		it("should respect the window size (eviction logic)", () => {
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

		it("should handle window boundaries correctly", () => {
			// Exactly window size
			tracker.addTurn(createMockTurn("1"))
			tracker.addTurn(createMockTurn("2"))
			tracker.addTurn(createMockTurn("3"))
			expect(tracker.getTurns()).toHaveLength(3)

			// One more triggers eviction
			tracker.addTurn(createMockTurn("4"))
			expect(tracker.getTurns()).toHaveLength(3)
			expect(tracker.getTurns()[0].id).toBe("2")
		})

		it("should throw error for invalid input (null/undefined)", () => {
			expect(() => tracker.addTurn(null as any)).toThrow("Invalid ReasoningTurn: must be an object")
			expect(() => tracker.addTurn(undefined as any)).toThrow("Invalid ReasoningTurn: must be an object")
		})

		it("should throw error for missing or invalid id", () => {
			expect(() => tracker.addTurn({} as any)).toThrow("Invalid ReasoningTurn: missing or invalid id")
			expect(() => tracker.addTurn({ id: 123 } as any)).toThrow("Invalid ReasoningTurn: missing or invalid id")
		})

		it("should throw error for invalid toolPattern", () => {
			expect(() => tracker.addTurn({ id: "1", toolPattern: "invalid" } as any)).toThrow(
				"Invalid ReasoningTurn: toolPattern must be an array",
			)
		})

		it("should throw error for invalid filesTouched", () => {
			expect(() => tracker.addTurn({ id: "1", toolPattern: [], filesTouched: null } as any)).toThrow(
				"Invalid ReasoningTurn: filesTouched must be an array",
			)
		})

		it("should throw error for invalid hypotheses", () => {
			expect(() =>
				tracker.addTurn({ id: "1", toolPattern: [], filesTouched: [], hypotheses: "invalid" } as any),
			).toThrow("Invalid ReasoningTurn: hypotheses must be an array")
		})

		it("should throw error for invalid conclusions", () => {
			expect(() =>
				tracker.addTurn({ id: "1", toolPattern: [], filesTouched: [], hypotheses: [], conclusions: {} } as any),
			).toThrow("Invalid ReasoningTurn: conclusions must be an array")
		})

		it("should throw error for invalid stateTransitions", () => {
			expect(() =>
				tracker.addTurn({
					id: "1",
					toolPattern: [],
					filesTouched: [],
					hypotheses: [],
					conclusions: [],
					stateTransitions: 123,
				} as any),
			).toThrow("Invalid ReasoningTurn: stateTransitions must be an array")
		})

		it("should throw error for invalid timestamp", () => {
			expect(() =>
				tracker.addTurn({
					id: "1",
					toolPattern: [],
					filesTouched: [],
					hypotheses: [],
					conclusions: [],
					stateTransitions: [],
					timestamp: "now",
				} as any),
			).toThrow("Invalid ReasoningTurn: timestamp must be a number")
		})
	})

	describe("getLatestTurn", () => {
		it("should return the latest turn", () => {
			tracker.addTurn(createMockTurn("1"))
			tracker.addTurn(createMockTurn("2"))

			const latest = tracker.getLatestTurn()
			expect(latest?.id).toBe("2")
		})

		it("should return undefined for latest turn when empty (empty state)", () => {
			expect(tracker.getLatestTurn()).toBeUndefined()
		})
	})

	describe("clear", () => {
		it("should clear turns (clear/reset)", () => {
			tracker.addTurn(createMockTurn("1"))
			tracker.clear()
			expect(tracker.getTurns()).toHaveLength(0)
		})
	})

	it("should provide session-only storage (in-memory test)", () => {
		const tracker1 = new SemanticStateTracker(10)
		tracker1.addTurn(createMockTurn("T1"))

		const tracker2 = new SemanticStateTracker(10)
		expect(tracker2.getTurns()).toHaveLength(0)
		expect(tracker1.getTurns()).toHaveLength(1)
	})
})
