import { describe, it, expect } from "vitest"
import LoopConfidenceCalculator from "../LoopConfidenceCalculator"
import type {
	LoopConfidenceState,
	CompressionRecoveryState,
} from "../../../../packages/types/src/loop-detection"

const createState = (overrides: Partial<LoopConfidenceState> = {}): LoopConfidenceState => ({
	score: 0.0,
	consecutiveSimilarTurns: 0,
	lastCompressionAt: 0,
	cooldownActive: false,
	lastSeenCompressionId: null,
	...overrides,
})

const createRecovery = (
	overrides: Partial<CompressionRecoveryState> = {},
): CompressionRecoveryState => ({
	lastCompressionId: null,
	isRecovered: true,
	turnsSinceLastCompression: Infinity,
	...overrides,
})

describe("LoopConfidenceCalculator purity", () => {
	describe("determinism", () => {
		it("should produce identical output for identical input (call 1 vs call 2)", () => {
			const calc1 = new LoopConfidenceCalculator()
			const calc2 = new LoopConfidenceCalculator()

			const state = createState({ score: 0.3, consecutiveSimilarTurns: 1 })
			const recovery = createRecovery()

			const result1 = calc1.calculate(state, 0.8, 0.1, recovery)
			const result2 = calc2.calculate(state, 0.8, 0.1, recovery)

			expect(result1.score).toBe(result2.score)
			expect(result1.consecutiveSimilarTurns).toBe(result2.consecutiveSimilarTurns)
			expect(result1.cooldownActive).toBe(result2.cooldownActive)
			expect(result1.lastSeenCompressionId).toBe(result2.lastSeenCompressionId)
		})

		it("should produce identical output when called multiple times with same state", () => {
			const calc = new LoopConfidenceCalculator()

			const state = createState({ score: 0.2, consecutiveSimilarTurns: 2 })
			const recovery = createRecovery()

			const result1 = calc.calculate(state, 0.7, 0.3, recovery)
			const result2 = calc.calculate(state, 0.7, 0.3, recovery)
			const result3 = calc.calculate(state, 0.7, 0.3, recovery)

			expect(result1.score).toBe(result2.score)
			expect(result2.score).toBe(result3.score)
			expect(result1.consecutiveSimilarTurns).toBe(result2.consecutiveSimilarTurns)
			expect(result2.consecutiveSimilarTurns).toBe(result3.consecutiveSimilarTurns)
			expect(result1.cooldownActive).toBe(result2.cooldownActive)
			expect(result2.cooldownActive).toBe(result3.cooldownActive)
		})

		it("should produce identical output from different instances", () => {
			const calcA = new LoopConfidenceCalculator()
			const calcB = new LoopConfidenceCalculator()

			const state = createState({
				score: 0.5,
				consecutiveSimilarTurns: 3,
				lastSeenCompressionId: "comp-1",
			})
			const recovery = createRecovery({
				lastCompressionId: "comp-1",
				turnsSinceLastCompression: 5,
			})

			const resultA = calcA.calculate(state, 0.9, 0.2, recovery)
			const resultB = calcB.calculate(state, 0.9, 0.2, recovery)

			expect(resultA).toEqual(resultB)
		})
	})

	describe("serialization round-trip", () => {
		it("should preserve behavior after JSON serialize/deserialize of state", () => {
			const calc = new LoopConfidenceCalculator()

			// Build a state through one calculation
			const initialState = createState({ score: 0.3, consecutiveSimilarTurns: 1 })
			const recovery = createRecovery()
			const result1 = calc.calculate(initialState, 0.8, 0.1, recovery)

			// Serialize and deserialize the result state
			const serialized = JSON.stringify(result1)
			const deserializedState: LoopConfidenceState = JSON.parse(serialized)

			// Feed the deserialized state to calculate again with same inputs
			const result2 = calc.calculate(deserializedState, 0.8, 0.1, recovery)

			// Now do the same without serialization in between
			const directResult2 = calc.calculate(result1, 0.8, 0.1, recovery)

			expect(result2.score).toBe(directResult2.score)
			expect(result2.consecutiveSimilarTurns).toBe(directResult2.consecutiveSimilarTurns)
			expect(result2.cooldownActive).toBe(directResult2.cooldownActive)
			expect(result2.lastSeenCompressionId).toBe(directResult2.lastSeenCompressionId)
		})

		it("should preserve cooldown state through serialization", () => {
			const calc = new LoopConfidenceCalculator()

			// Trigger cooldown with a new compression
			const state1 = createState({ score: 0.5, consecutiveSimilarTurns: 2, lastSeenCompressionId: null })
			const recovery1 = createRecovery({
				lastCompressionId: "compression-1",
				turnsSinceLastCompression: 0,
			})
			const result1 = calc.calculate(state1, 0.8, 0.1, recovery1)
			expect(result1.cooldownActive).toBe(true)

			// Serialize and deserialize
			const deserialized: LoopConfidenceState = JSON.parse(JSON.stringify(result1))

			// Continue with turnsSinceLastCompression = 1 (still in cooldown)
			const recovery2 = createRecovery({
				lastCompressionId: "compression-1",
				turnsSinceLastCompression: 1,
			})
			const result2 = calc.calculate(deserialized, 0.8, 0.1, recovery2)
			expect(result2.cooldownActive).toBe(true)
			expect(result2.score).toBeCloseTo(result1.score - 0.1, 5)
		})

		it("should preserve consecutiveSimilarTurns through serialization", () => {
			const calc = new LoopConfidenceCalculator()

			// Build up consecutiveSimilarTurns
			const state = createState({ score: 0.0, consecutiveSimilarTurns: 0 })
			const recovery = createRecovery()

			const result1 = calc.calculate(state, 0.8, 0.1, recovery)
			expect(result1.consecutiveSimilarTurns).toBe(1)

			// Serialize and deserialize
			const deserialized: LoopConfidenceState = JSON.parse(JSON.stringify(result1))

			// Next calculation should continue from count 1
			const result2 = calc.calculate(deserialized, 0.8, 0.1, recovery)
			expect(result2.consecutiveSimilarTurns).toBe(2)

			// Verify it matches non-serialized path
			const directResult2 = calc.calculate(result1, 0.8, 0.1, recovery)
			expect(result2.score).toBe(directResult2.score)
			expect(result2.consecutiveSimilarTurns).toBe(directResult2.consecutiveSimilarTurns)
		})

		it("should preserve lastSeenCompressionId through serialization", () => {
			const calc = new LoopConfidenceCalculator()

			// First call: new compression, lastSeenCompressionId is null
			const state1 = createState({ score: 0.5, consecutiveSimilarTurns: 0, lastSeenCompressionId: null })
			const recovery1 = createRecovery({
				lastCompressionId: "compression-abc",
				turnsSinceLastCompression: 0,
			})
			const result1 = calc.calculate(state1, 0.8, 0.1, recovery1)
			expect(result1.lastSeenCompressionId).toBe("compression-abc")

			// Serialize and deserialize
			const deserialized: LoopConfidenceState = JSON.parse(JSON.stringify(result1))

			// Second call: same compression ID, turnsSinceLastCompression >= cooldownTurns
			// Should NOT trigger cooldown because lastSeenCompressionId matches
			const recovery2 = createRecovery({
				lastCompressionId: "compression-abc",
				turnsSinceLastCompression: 3,
			})
			const result2 = calc.calculate(deserialized, 0.8, 0.1, recovery2)
			expect(result2.cooldownActive).toBe(false)
			expect(result2.lastSeenCompressionId).toBe("compression-abc")
		})
	})

	describe("cooldown behavior unchanged", () => {
		it("should trigger cooldown when lastSeenCompressionId changes", () => {
			const calc = new LoopConfidenceCalculator()

			// Start with lastSeenCompressionId: null
			const state = createState({
				score: 0.5,
				consecutiveSimilarTurns: 2,
				lastSeenCompressionId: null,
			})
			// Provide compressionRecovery with a new lastCompressionId
			const recovery = createRecovery({
				lastCompressionId: "compression-new",
				turnsSinceLastCompression: 0,
			})

			const result = calc.calculate(state, 0.8, 0.1, recovery)

			// cooldownActive should become true
			expect(result.cooldownActive).toBe(true)
			// Score should decay
			expect(result.score).toBeCloseTo(0.4, 5)
			// consecutiveSimilarTurns should reset
			expect(result.consecutiveSimilarTurns).toBe(0)
		})

		it("should not trigger cooldown when lastSeenCompressionId is unchanged", () => {
			const calc = new LoopConfidenceCalculator()

			// Set lastSeenCompressionId to same value as compressionRecovery.lastCompressionId
			const state = createState({
				score: 0.5,
				consecutiveSimilarTurns: 2,
				lastSeenCompressionId: "compression-1",
			})
			const recovery = createRecovery({
				lastCompressionId: "compression-1",
				turnsSinceLastCompression: 5,
			})

			const result = calc.calculate(state, 0.8, 0.1, recovery)

			// cooldownActive should remain false
			expect(result.cooldownActive).toBe(false)
			// Score should increase (not decay)
			expect(result.score).toBeGreaterThan(0.5)
		})

		it("should decay score during cooldown", () => {
			const calc = new LoopConfidenceCalculator()

			// Trigger cooldown
			const state1 = createState({
				score: 0.5,
				consecutiveSimilarTurns: 2,
				lastSeenCompressionId: null,
			})
			const recovery1 = createRecovery({
				lastCompressionId: "compression-1",
				turnsSinceLastCompression: 0,
			})
			const result1 = calc.calculate(state1, 0.8, 0.1, recovery1)
			expect(result1.score).toBeCloseTo(0.4, 5) // 0.5 - 0.1

			// Continue cooldown: turnsSinceLastCompression = 1
			const state2 = createState({
				score: result1.score,
				consecutiveSimilarTurns: result1.consecutiveSimilarTurns,
				lastSeenCompressionId: result1.lastSeenCompressionId,
			})
			const recovery2 = createRecovery({
				lastCompressionId: "compression-1",
				turnsSinceLastCompression: 1,
			})
			const result2 = calc.calculate(state2, 0.8, 0.1, recovery2)
			expect(result2.score).toBeCloseTo(0.3, 5) // 0.4 - 0.1
		})

		it("should prevent score increase during cooldown", () => {
			const calc = new LoopConfidenceCalculator()

			// Trigger cooldown with high similarity and low progress
			const state1 = createState({
				score: 0.5,
				consecutiveSimilarTurns: 0,
				lastSeenCompressionId: null,
			})
			const recovery1 = createRecovery({
				lastCompressionId: "compression-1",
				turnsSinceLastCompression: 0,
			})
			const result1 = calc.calculate(state1, 0.9, 0.0, recovery1)
			expect(result1.score).toBeCloseTo(0.4, 5) // decayed

			// Even with high similarity + low progress, score should not increase
			const state2 = createState({
				score: result1.score,
				consecutiveSimilarTurns: result1.consecutiveSimilarTurns,
				lastSeenCompressionId: result1.lastSeenCompressionId,
			})
			const recovery2 = createRecovery({
				lastCompressionId: "compression-1",
				turnsSinceLastCompression: 1,
			})
			const result2 = calc.calculate(state2, 0.9, 0.0, recovery2)
			// Score should remain decayed, not increase
			expect(result2.score).toBeCloseTo(0.3, 5)
		})

		it("should exit cooldown after cooldownTurns turns", () => {
			const calc = new LoopConfidenceCalculator()

			// Trigger cooldown first turn
			const state0 = createState({
				score: 0.5,
				consecutiveSimilarTurns: 0,
				lastSeenCompressionId: null,
			})
			const recovery0 = createRecovery({
				lastCompressionId: "compression-1",
				turnsSinceLastCompression: 0,
			})
			const result0 = calc.calculate(state0, 0.8, 0.1, recovery0)
			expect(result0.cooldownActive).toBe(true)

			// Continue cooldown turns 1 and 2
			let prevState = result0
			for (let turn = 1; turn <= 2; turn++) {
				const state = createState({
					score: prevState.score,
					consecutiveSimilarTurns: prevState.consecutiveSimilarTurns,
					lastSeenCompressionId: prevState.lastSeenCompressionId,
				})
				const recovery = createRecovery({
					lastCompressionId: "compression-1",
					turnsSinceLastCompression: turn,
				})
				const res = calc.calculate(state, 0.8, 0.1, recovery)
				expect(res.cooldownActive).toBe(true)
				prevState = res
			}

			// Turn 3: cooldown should expire
			const stateAfter = createState({
				score: prevState.score,
				consecutiveSimilarTurns: prevState.consecutiveSimilarTurns,
				lastSeenCompressionId: prevState.lastSeenCompressionId,
			})
			const recoveryAfter = createRecovery({
				lastCompressionId: "compression-1",
				turnsSinceLastCompression: 3,
			})
			const finalResult = calc.calculate(stateAfter, 0.8, 0.1, recoveryAfter)
			expect(finalResult.cooldownActive).toBe(false)
			// Score should now increase (not decay)
			expect(finalResult.score).toBeGreaterThan(prevState.score)
		})
	})

	describe("instance independence", () => {
		it("should not share state between instances", () => {
			const calc1 = new LoopConfidenceCalculator()
			const calc2 = new LoopConfidenceCalculator()

			// Use calc1 for several turns with compression
			const state1a = createState({ score: 0.5, consecutiveSimilarTurns: 0, lastSeenCompressionId: null })
			const recovery1a = createRecovery({
				lastCompressionId: "compression-1",
				turnsSinceLastCompression: 0,
			})
			const result1a = calc1.calculate(state1a, 0.8, 0.1, recovery1a)
			expect(result1a.cooldownActive).toBe(true)

			// calc2 should behave as if fresh — no memory of calc1's history
			const state2 = createState({ score: 0.5, consecutiveSimilarTurns: 0, lastSeenCompressionId: null })
			const recovery2 = createRecovery()
			const result2 = calc2.calculate(state2, 0.8, 0.1, recovery2)
			expect(result2.cooldownActive).toBe(false)
			expect(result2.score).toBeGreaterThan(0.5)
		})

		it("should not retain memory between calls", () => {
			const calc = new LoopConfidenceCalculator()

			// Call with compression event
			const state1 = createState({ score: 0.5, consecutiveSimilarTurns: 0, lastSeenCompressionId: null })
			const recovery1 = createRecovery({
				lastCompressionId: "compression-1",
				turnsSinceLastCompression: 0,
			})
			const result1 = calc.calculate(state1, 0.8, 0.1, recovery1)
			expect(result1.cooldownActive).toBe(true)

			// Call again with same compression ID (no new compression)
			// Second call should not see cooldown from first call's internal state
			// (because state is now in LoopConfidenceState, not internal)
			const state2 = createState({
				score: result1.score,
				consecutiveSimilarTurns: result1.consecutiveSimilarTurns,
				lastSeenCompressionId: result1.lastSeenCompressionId,
			})
			const recovery2 = createRecovery({
				lastCompressionId: "compression-1",
				turnsSinceLastCompression: 3,
			})
			const result2 = calc.calculate(state2, 0.8, 0.1, recovery2)
			expect(result2.cooldownActive).toBe(false)
			expect(result2.score).toBeGreaterThan(result1.score)
		})
	})
})
