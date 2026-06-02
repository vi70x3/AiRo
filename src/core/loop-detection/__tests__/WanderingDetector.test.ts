import { describe, it, expect } from "vitest"

import WanderingDetector from "../WanderingDetector"

describe("WanderingDetector", () => {
	const makeTurn = (files: string[] = [], tools: string[] = ["read_file"]) => ({
		id: `${Date.now()}-${Math.random()}`,
		toolPattern: tools,
		filesTouched: files,
		hypotheses: [] as string[],
		conclusions: [] as string[],
		stateTransitions: [] as string[],
		timestamp: Date.now(),
	})

	it("starts with non-wandering state", () => {
		const d = new WanderingDetector()
		expect(d.isWandering()).toBe(false)
	})

	it("returns null recovery hint when not wandering", () => {
		const d = new WanderingDetector()
		expect(d.getRecoveryHint()).toBeNull()
	})

	it("skips grace period turns", () => {
		const d = new WanderingDetector({ gracePeriod: 3, wanderingTurnsThreshold: 2, minUniqueFiles: 1 })
		d.onTurnResult(0.1, 0.1, makeTurn(["a.ts"]))
		d.onTurnResult(0.1, 0.1, makeTurn(["b.ts"]))
		d.onTurnResult(0.1, 0.1, makeTurn(["c.ts"]))
		expect(d.isWandering()).toBe(false)
	})

	it("detects wandering after threshold turns with enough unique files", () => {
		const d = new WanderingDetector({ gracePeriod: 0, wanderingTurnsThreshold: 3, minUniqueFiles: 2 })
		d.onTurnResult(0.1, 0.05, makeTurn(["a.ts"]))
		d.onTurnResult(0.1, 0.05, makeTurn(["b.ts"]))
		d.onTurnResult(0.1, 0.1, makeTurn(["c.ts"]))
		expect(d.isWandering()).toBe(true)
	})

	it("does not detect wandering with too few unique files", () => {
		const d = new WanderingDetector({ gracePeriod: 0, wanderingTurnsThreshold: 3, minUniqueFiles: 5 })
		d.onTurnResult(0.1, 0.1, makeTurn(["a.ts"]))
		d.onTurnResult(0.1, 0.1, makeTurn(["a.ts"]))
		d.onTurnResult(0.1, 0.1, makeTurn(["a.ts"]))
		expect(d.isWandering()).toBe(false)
	})

	it("resets wandering state when progress is made", () => {
		const d = new WanderingDetector({ gracePeriod: 0, wanderingTurnsThreshold: 3, minUniqueFiles: 1 })
		d.onTurnResult(0.1, 0.1, makeTurn(["a.ts"]))
		d.onTurnResult(0.1, 0.1, makeTurn(["b.ts"]))
		d.onTurnResult(0.1, 0.5, makeTurn(["c.ts"])) // high progress
		expect(d.isWandering()).toBe(false)
	})

	it("resets wandering state when similarity is high", () => {
		const d = new WanderingDetector({ gracePeriod: 0, wanderingTurnsThreshold: 3, minUniqueFiles: 1 })
		d.onTurnResult(0.1, 0.1, makeTurn(["a.ts"]))
		d.onTurnResult(0.1, 0.1, makeTurn(["b.ts"]))
		d.onTurnResult(0.8, 0.1, makeTurn(["c.ts"])) // high similarity
		expect(d.isWandering()).toBe(false)
	})

	it("returns recovery hint when wandering", () => {
		const d = new WanderingDetector({ gracePeriod: 0, wanderingTurnsThreshold: 3, minUniqueFiles: 1 })
		d.onTurnResult(0.1, 0.05, makeTurn(["a.ts"]))
		d.onTurnResult(0.1, 0.05, makeTurn(["b.ts"]))
		d.onTurnResult(0.1, 0.05, makeTurn(["c.ts"]))
		const hint = d.getRecoveryHint()
		expect(hint).not.toBeNull()
		expect(hint?.category).toBe("strategy_change")
	})

	it("tracks cumulative progress correctly", () => {
		const d = new WanderingDetector({ gracePeriod: 0 })
		d.onTurnResult(0.1, 0.1, makeTurn(["a.ts"]))
		d.onTurnResult(0.1, 0.1, makeTurn(["b.ts"]))
		const state = d.getState()
		expect(state.cumulativeProgress).toBeCloseTo(0.2)
	})

	it("tracks unique files and tools", () => {
		const d = new WanderingDetector({ gracePeriod: 0 })
		d.onTurnResult(0.1, 0.1, makeTurn(["a.ts", "b.ts"], ["read_file", "write_to_file"]))
		const state = d.getState()
		expect(state.uniqueFilesTouched).toBe(2)
		expect(state.uniqueToolsUsed).toBe(2)
	})

	it("full reset clears all state", () => {
		const d = new WanderingDetector({ gracePeriod: 0, wanderingTurnsThreshold: 3, minUniqueFiles: 1 })
		d.onTurnResult(0.1, 0.1, makeTurn(["a.ts"]))
		d.onTurnResult(0.1, 0.1, makeTurn(["b.ts"]))
		d.onTurnResult(0.1, 0.1, makeTurn(["c.ts"]))
		d.reset()
		expect(d.isWandering()).toBe(false)
		expect(d.getState().consecutiveWanderingTurns).toBe(0)
	})
})
