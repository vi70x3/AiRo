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

describe("LoopConfidenceCalculator", () => {
	describe("High Similarity, Low Progress", () => {
		it("should increase score by 0.10 when similarity=0.8, progress=0.1, consecutive=0", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.0, consecutiveSimilarTurns: 0 })
			const recovery = createRecovery()
			const result = calc.calculate(state, 0.8, 0.1, recovery)
			expect(result.score).toBeCloseTo(0.1, 5)
			expect(result.consecutiveSimilarTurns).toBe(1)
		})

		it("should increase score by 0.15 when similarity=0.8, progress=0.1, consecutive=1", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.1, consecutiveSimilarTurns: 1 })
			const recovery = createRecovery()
			const result = calc.calculate(state, 0.8, 0.1, recovery)
			expect(result.score).toBeCloseTo(0.25, 5)
			expect(result.consecutiveSimilarTurns).toBe(2)
		})

		it("should increase score by 0.20 when similarity=0.8, progress=0.1, consecutive=2", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.25, consecutiveSimilarTurns: 2 })
			const recovery = createRecovery()
			const result = calc.calculate(state, 0.8, 0.1, recovery)
			expect(result.score).toBeCloseTo(0.45, 5)
			expect(result.consecutiveSimilarTurns).toBe(3)
		})

		it("should increase score by 0.25 when similarity=0.8, progress=0.1, consecutive=3", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.45, consecutiveSimilarTurns: 3 })
			const recovery = createRecovery()
			const result = calc.calculate(state, 0.8, 0.1, recovery)
			expect(result.score).toBeCloseTo(0.70, 5)
			expect(result.consecutiveSimilarTurns).toBe(4)
		})
	})

	describe("High Similarity, High Progress", () => {
		it("should increase score by 0.10 when similarity=0.8, progress=0.9, consecutive=0", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.0, consecutiveSimilarTurns: 0 })
			const recovery = createRecovery()
			const result = calc.calculate(state, 0.8, 0.9, recovery)
			expect(result.score).toBeCloseTo(0.1, 5)
			expect(result.consecutiveSimilarTurns).toBe(1)
		})

		it("should increase score by 0.15 when similarity=0.8, progress=0.9, consecutive=1", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.1, consecutiveSimilarTurns: 1 })
			const recovery = createRecovery()
			const result = calc.calculate(state, 0.8, 0.9, recovery)
			expect(result.score).toBeCloseTo(0.25, 5)
			expect(result.consecutiveSimilarTurns).toBe(2)
		})
	})

	describe("Low Similarity, High Progress", () => {
		it("should decrease score by 0.135 when similarity=0.4, progress=0.9, consecutive=0", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.5, consecutiveSimilarTurns: 0 })
			const recovery = createRecovery()
			const result = calc.calculate(state, 0.4, 0.9, recovery)
			expect(result.score).toBeCloseTo(0.365, 5)
			expect(result.consecutiveSimilarTurns).toBe(0)
		})

		it("should decrease score by 0.015 when similarity=0.4, progress=0.1, consecutive=0", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.5, consecutiveSimilarTurns: 0 })
			const recovery = createRecovery()
			const result = calc.calculate(state, 0.4, 0.1, recovery)
			expect(result.score).toBeCloseTo(0.485, 5)
			expect(result.consecutiveSimilarTurns).toBe(0)
		})
	})

	describe("Low Similarity, Low-No Progress", () => {
		it("should not decrease score when similarity=0.4, progress=0.0", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.5, consecutiveSimilarTurns: 0 })
			const recovery = createRecovery()
			const result = calc.calculate(state, 0.4, 0.0, recovery)
			expect(result.score).toBeCloseTo(0.5, 5)
			expect(result.consecutiveSimilarTurns).toBe(0)
		})

		it("should not decrease score when similarity=0.4, progress=0.01", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.5, consecutiveSimilarTurns: 0 })
			const recovery = createRecovery()
			const result = calc.calculate(state, 0.4, 0.01, recovery)
			expect(result.score).toBeCloseTo(0.4985, 5)
			expect(result.consecutiveSimilarTurns).toBe(0)
		})
	})

	describe("Repeated Cycles (Nonlinear Escalation)", () => {
		it("should escalate from 0.0 to 0.10 to 0.25 to 0.45 to 0.70 across 4 similar turns", () => {
			const calc = new LoopConfidenceCalculator()
			let state = createState({ score: 0.0, consecutiveSimilarTurns: 0 })
			let recovery = createRecovery()

			// Turn 1: 0.0 + 0.10 = 0.10, consecutive = 1
			state = calc.calculate(state, 0.8, 0.1, recovery)
			expect(state.score).toBeCloseTo(0.10, 5)
			expect(state.consecutiveSimilarTurns).toBe(1)

			// Turn 2: 0.10 + 0.15 = 0.25, consecutive = 2
			state = calc.calculate(state, 0.8, 0.1, recovery)
			expect(state.score).toBeCloseTo(0.25, 5)
			expect(state.consecutiveSimilarTurns).toBe(2)

			// Turn 3: 0.25 + 0.20 = 0.45, consecutive = 3
			state = calc.calculate(state, 0.8, 0.1, recovery)
			expect(state.score).toBeCloseTo(0.45, 5)
			expect(state.consecutiveSimilarTurns).toBe(3)

			// Turn 4: 0.45 + 0.25 = 0.70, consecutive = 4
			state = calc.calculate(state, 0.8, 0.1, recovery)
			expect(state.score).toBeCloseTo(0.70, 5)
			expect(state.consecutiveSimilarTurns).toBe(4)
		})
	})

	describe("Cooldown Behavior", () => {
		it("should trigger cooldown and decay score by 0.10 when new compression occurs", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.5, consecutiveSimilarTurns: 2 })
			const recovery = createRecovery({ lastCompressionId: "compression-1", turnsSinceLastCompression: 0 })
			const result = calc.calculate(state, 0.8, 0.1, recovery)
			expect(result.score).toBeCloseTo(0.40, 5)
			expect(result.consecutiveSimilarTurns).toBe(0)
			expect(result.cooldownActive).toBe(true) // turnsSinceLastCompression = 0 < 3, so isCooldownActive returns true
		})

		it("should trigger cooldown and decay score by 0.10 when cooldown is active (turnsSinceLastCompression < 3)", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.5, consecutiveSimilarTurns: 2 })
			const recovery = createRecovery({ lastCompressionId: "compression-1", turnsSinceLastCompression: 2 })
			const result = calc.calculate(state, 0.8, 0.1, recovery)
			expect(result.score).toBeCloseTo(0.40, 5)
			expect(result.consecutiveSimilarTurns).toBe(0)
			expect(result.cooldownActive).toBe(true) // turnsSinceLastCompression = 2 < 3
		})

		it("should not trigger cooldown when cooldown is not active (turnsSinceLastCompression >= 3)", () => {
			const calc = new LoopConfidenceCalculator()
			// First call to establish lastCompressionId
			const state1 = createState({ score: 0.5, consecutiveSimilarTurns: 2 })
			const recovery1 = createRecovery({ lastCompressionId: "compression-1", turnsSinceLastCompression: 3 })
			const result1 = calc.calculate(state1, 0.8, 0.1, recovery1)
			
			// Second call with same compression ID, turnsSinceLastCompression >= 3
			const state2 = createState({ score: 0.5, consecutiveSimilarTurns: 2 })
			const recovery2 = createRecovery({ lastCompressionId: "compression-1", turnsSinceLastCompression: 3 })
			const result2 = calc.calculate(state2, 0.8, 0.1, recovery2)
			
			expect(result2.score).toBeCloseTo(0.70, 5) // 0.5 + 0.1*(1+2*0.5) = 0.5 + 0.20 = 0.70
			expect(result2.consecutiveSimilarTurns).toBe(3)
			expect(result2.cooldownActive).toBe(false) // turnsSinceLastCompression = 3 >= 3, and not a new compression
		})

		it("should update lastCompressionAt when new compression occurs", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.5, consecutiveSimilarTurns: 0, lastCompressionAt: 1000 })
			const beforeCalc = Date.now()
			const recovery = createRecovery({ lastCompressionId: "compression-1", turnsSinceLastCompression: 0 })
			const result = calc.calculate(state, 0.8, 0.1, recovery)
			expect(result.lastCompressionAt).toBeGreaterThanOrEqual(beforeCalc)
			expect(result.lastCompressionAt).toBeLessThanOrEqual(Date.now())
		})

		it("should not update lastCompressionAt when no new compression", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.5, consecutiveSimilarTurns: 0, lastCompressionAt: 1000 })
			const recovery = createRecovery()
			const result = calc.calculate(state, 0.8, 0.1, recovery)
			expect(result.lastCompressionAt).toBe(1000)
		})
	})

	describe("Score Clamping", () => {
		it("should clamp score to 1.0 when it would exceed maximum", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.9, consecutiveSimilarTurns: 3 })
			const recovery = createRecovery()
			const result = calc.calculate(state, 0.8, 0.1, recovery)
			expect(result.score).toBe(1.0)
		})

		it("should clamp score to 0.0 when it would go below minimum", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.05, consecutiveSimilarTurns: 0 })
			const recovery = createRecovery()
			const result = calc.calculate(state, 0.4, 0.9, recovery)
			expect(result.score).toBe(0.0)
		})
	})

	describe("Config Override", () => {
		it("should use custom baseIncrement when provided", () => {
			const calc = new LoopConfidenceCalculator({ baseIncrement: 0.2 })
			const state = createState({ score: 0.0, consecutiveSimilarTurns: 0 })
			const recovery = createRecovery()
			const result = calc.calculate(state, 0.8, 0.1, recovery)
			expect(result.score).toBeCloseTo(0.2, 5)
		})

		it("should use custom baseDecrement when provided", () => {
			const calc = new LoopConfidenceCalculator({ baseDecrement: 0.2 })
			const state = createState({ score: 0.5, consecutiveSimilarTurns: 0 })
			const recovery = createRecovery()
			const result = calc.calculate(state, 0.4, 0.9, recovery)
			expect(result.score).toBeCloseTo(0.32, 5) // 0.5 - 0.2*0.9 = 0.5 - 0.18 = 0.32
		})

		it("should use custom similarityThreshold when provided", () => {
			const calc = new LoopConfidenceCalculator({ similarityThreshold: 0.7 })
			const state = createState({ score: 0.0, consecutiveSimilarTurns: 0 })
			const recovery = createRecovery()
			
			// similarity=0.65 < 0.7 threshold, should not increase
			const result1 = calc.calculate(state, 0.65, 0.1, recovery)
			expect(result1.score).toBeCloseTo(0.0, 5)
			expect(result1.consecutiveSimilarTurns).toBe(0)
			
			// similarity=0.75 >= 0.7 threshold, should increase
			const result2 = calc.calculate(state, 0.75, 0.1, recovery)
			expect(result2.score).toBeCloseTo(0.1, 5)
			expect(result2.consecutiveSimilarTurns).toBe(1)
		})

		it("should use custom cooldownTurns when provided", () => {
			const calc = new LoopConfidenceCalculator({ cooldownTurns: 5 })
			const state = createState({ score: 0.5, consecutiveSimilarTurns: 0 })
			
			// turnsSinceLastCompression = 4 < 5, should trigger cooldown
			const recovery1 = createRecovery({ lastCompressionId: "compression-1", turnsSinceLastCompression: 4 })
			const result1 = calc.calculate(state, 0.8, 0.1, recovery1)
			expect(result1.score).toBeCloseTo(0.40, 5)
			expect(result1.cooldownActive).toBe(true)
			
			// turnsSinceLastCompression = 5 >= 5, should not trigger cooldown
			const recovery2 = createRecovery({ lastCompressionId: "compression-1", turnsSinceLastCompression: 5 })
			const result2 = calc.calculate(state, 0.8, 0.1, recovery2)
			expect(result2.score).toBeCloseTo(0.60, 5)
			expect(result2.cooldownActive).toBe(false)
		})

		it("should use custom cooldownDecay when provided", () => {
			const calc = new LoopConfidenceCalculator({ cooldownDecay: 0.2 })
			const state = createState({ score: 0.5, consecutiveSimilarTurns: 0 })
			const recovery = createRecovery({ lastCompressionId: "compression-1", turnsSinceLastCompression: 0 })
			const result = calc.calculate(state, 0.8, 0.1, recovery)
			expect(result.score).toBeCloseTo(0.30, 5) // 0.5 - 0.2 = 0.30
		})
	})

	describe("State Immutability", () => {
		it("should not mutate the input state object", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.5, consecutiveSimilarTurns: 2 })
			const originalState = { ...state }
			const recovery = createRecovery()
			calc.calculate(state, 0.8, 0.1, recovery)
			expect(state).toEqual(originalState)
		})

		it("should not mutate the input recovery object", () => {
			const calc = new LoopConfidenceCalculator()
			const state = createState({ score: 0.5, consecutiveSimilarTurns: 0 })
			const recovery = createRecovery({ lastCompressionId: "compression-1", turnsSinceLastCompression: 0 })
			const originalRecovery = { ...recovery }
			calc.calculate(state, 0.8, 0.1, recovery)
			expect(recovery).toEqual(originalRecovery)
		})
	})
})
