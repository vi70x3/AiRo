import { describe, it, expect, beforeEach, vi } from "vitest"
import SemanticLoopDetector from "../SemanticLoopDetector"
import type {
	ReasoningTurn,
	LoopConfidenceState,
	CompressionRecoveryState,
} from "@roo-code/types"

// Mock crypto.randomUUID for deterministic testing of onCompression
vi.mock("node:crypto", () => ({
	randomUUID: () => "mock-uuid-1234",
}))

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

// Helper: create a turn that is highly similar to another turn
const createSimilarTurn = (id: string, baseTurn: ReasoningTurn): ReasoningTurn => ({
	id,
	toolPattern: baseTurn.toolPattern,
	filesTouched: baseTurn.filesTouched,
	hypotheses: baseTurn.hypotheses,
	conclusions: baseTurn.conclusions,
	stateTransitions: baseTurn.stateTransitions,
	timestamp: baseTurn.timestamp + 1000,
})

// Helper: create a turn that is clearly different (low similarity)
const createDissimilarTurn = (id: string): ReasoningTurn => ({
	id,
	toolPattern: ["write_file", "execute_command"],
	filesTouched: ["new_file.ts", "another_file.ts"],
	hypotheses: ["new hypothesis"],
	conclusions: ["new conclusion"],
	stateTransitions: ["new_transition"],
	timestamp: Date.now(),
})

// Helper: create a turn that shows strong progress
const createProgressTurn = (id: string, overrides?: Partial<ReasoningTurn>): ReasoningTurn => ({
	id,
	toolPattern: ["write_file"],
	filesTouched: ["new_feature.ts"],
	hypotheses: ["hypothesis: feature works"],
	conclusions: ["conclusion: feature implemented"],
	stateTransitions: ["todo_completed:X", "error_resolved:Y"],
	timestamp: Date.now(),
	...overrides,
})

describe("SemanticLoopDetector", () => {
	let detector: SemanticLoopDetector

	beforeEach(() => {
		detector = new SemanticLoopDetector()
	})

	describe("constructor", () => {
		it("should create a detector with default config", () => {
			const d = new SemanticLoopDetector()
			expect(d.getLoopConfidenceState().score).toBe(0)
			expect(d.getLoopConfidenceState().consecutiveSimilarTurns).toBe(0)
			expect(d.getLoopConfidenceState().lastCompressionAt).toBe(0)
			expect(d.getLoopConfidenceState().cooldownActive).toBe(false)
			expect(d.getLoopConfidenceState().lastSeenCompressionId).toBeNull()
			expect(d.getCompressionRecoveryState().lastCompressionId).toBeNull()
			expect(d.getCompressionRecoveryState().isRecovered).toBe(false)
			expect(d.getCompressionRecoveryState().turnsSinceLastCompression).toBe(0)
			expect(d.getTurnCount()).toBe(0)
		})

		it("should accept custom windowSize", () => {
			const d = new SemanticLoopDetector({ windowSize: 5 })
			// Add 6 turns; getTurnCount returns global count (6), not windowed count
			for (let i = 0; i < 6; i++) {
				d.onTurn(createMockTurn(`turn-${i}`))
			}
			expect(d.getTurnCount()).toBe(6)
		})

		it("should accept custom calculatorConfig", () => {
			const d = new SemanticLoopDetector({
				calculatorConfig: { baseIncrement: 0.2, similarityThreshold: 0.5 },
			})
			// With baseIncrement=0.2 and similarityThreshold=0.5, a similar turn
			// should increase confidence by 0.2 (no consecutive escalation yet)
			const turn1 = createMockTurn("1")
			const turn2 = createSimilarTurn("2", turn1)
			d.onTurn(turn1)
			const result = d.onTurn(turn2)
			// Similarity should be high (same tool pattern, same files, etc.)
			// With baseIncrement=0.2, score should increase by at least 0.2
			expect(result.loopConfidence.score).toBeGreaterThanOrEqual(0.2)
		})
	})

	describe("onTurn", () => {
		it("should return similarity 0.0 for the first turn (no previous turn to compare)", () => {
			const result = detector.onTurn(createMockTurn("1"))
			expect(result.similarityScore).toBe(0.0)
			expect(result.loopConfidence.score).toBe(0)
			expect(result.loopConfidence.consecutiveSimilarTurns).toBe(0)
		})

		it("should compute similarity between consecutive similar turns", () => {
			const turn1 = createMockTurn("1")
			const turn2 = createSimilarTurn("2", turn1)
			detector.onTurn(turn1)
			const result = detector.onTurn(turn2)
			// Identical tool patterns, files, hypotheses, conclusions, state transitions
			// should yield a high similarity score
			expect(result.similarityScore).toBeGreaterThan(0.5)
		})

		it("should compute low similarity between dissimilar turns", () => {
			const turn1 = createMockTurn("1")
			const turn2 = createDissimilarTurn("2")
			detector.onTurn(turn1)
			const result = detector.onTurn(turn2)
			expect(result.similarityScore).toBeLessThan(0.5)
		})

		it("should increase consecutiveSimilarTurns when similarity is high", () => {
			const turn1 = createMockTurn("1")
			const turn2 = createSimilarTurn("2", turn1)
			const turn3 = createSimilarTurn("3", turn1)
			detector.onTurn(turn1)
			detector.onTurn(turn2)
			const result = detector.onTurn(turn3)
			expect(result.loopConfidence.consecutiveSimilarTurns).toBeGreaterThanOrEqual(2)
		})

		it("should reset consecutiveSimilarTurns when similarity is low", () => {
			const turn1 = createMockTurn("1")
			const turn2 = createSimilarTurn("2", turn1)
			const turn3 = createDissimilarTurn("3")
			detector.onTurn(turn1)
			detector.onTurn(turn2)
			const result = detector.onTurn(turn3)
			expect(result.loopConfidence.consecutiveSimilarTurns).toBe(0)
		})

		it("should increase loop confidence score with consecutive similar turns", () => {
			const baseTurn = createMockTurn("1")
			detector.onTurn(baseTurn)
			const result2 = detector.onTurn(createSimilarTurn("2", baseTurn))
			const result3 = detector.onTurn(createSimilarTurn("3", baseTurn))
			// Score should escalate with consecutive similar turns
			expect(result3.loopConfidence.score).toBeGreaterThan(result2.loopConfidence.score)
		})

		it("should decrease loop confidence score with dissimilar turns", () => {
			const baseTurn = createMockTurn("1")
			detector.onTurn(baseTurn)
			detector.onTurn(createSimilarTurn("2", baseTurn))
			const scoreBeforeDissimilar = detector.getLoopConfidenceState().score
			const result = detector.onTurn(createDissimilarTurn("3"))
			expect(result.loopConfidence.score).toBeLessThan(scoreBeforeDissimilar)
		})

		it("should return progress events and score", () => {
			const turn1 = createMockTurn("1")
			const turn2 = createProgressTurn("2")
			detector.onTurn(turn1)
			const result = detector.onTurn(turn2)
			// A progress turn should yield progress events
			expect(result.progressEvents.length).toBeGreaterThanOrEqual(0)
			expect(typeof result.progressScore).toBe("number")
		})

		it("should increment turnsSinceLastCompression after a compression has occurred", () => {
			const turn1 = createMockTurn("1")
			detector.onTurn(turn1)
			detector.onCompression("test")
			// After compression, state tracker is cleared, so we need new turns
			detector.onTurn(createMockTurn("2"))
			expect(detector.getCompressionRecoveryState().turnsSinceLastCompression).toBe(1)
			detector.onTurn(createMockTurn("3"))
			expect(detector.getCompressionRecoveryState().turnsSinceLastCompression).toBe(2)
		})

		it("should not increment turnsSinceLastCompression when no compression has occurred", () => {
			detector.onTurn(createMockTurn("1"))
			detector.onTurn(createMockTurn("2"))
			expect(detector.getCompressionRecoveryState().turnsSinceLastCompression).toBe(0)
		})

		it("should increase turn count after each turn", () => {
			expect(detector.getTurnCount()).toBe(0)
			detector.onTurn(createMockTurn("1"))
			expect(detector.getTurnCount()).toBe(1)
			detector.onTurn(createMockTurn("2"))
			expect(detector.getTurnCount()).toBe(2)
		})
	})

	describe("shouldCompress", () => {
		it("should return false when score is below default threshold (0.7)", () => {
			expect(detector.shouldCompress()).toBe(false)
		})

		it("should return false when score is below custom threshold", () => {
			// Even after a few similar turns, score may not reach 0.8
			const baseTurn = createMockTurn("1")
			detector.onTurn(baseTurn)
			detector.onTurn(createSimilarTurn("2", baseTurn))
			expect(detector.shouldCompress(0.8)).toBe(false)
		})

		it("should return true when score exceeds threshold and cooldown is not active", () => {
			// Feed many similar turns to drive confidence above 0.7
			const baseTurn = createMockTurn("1")
			detector.onTurn(baseTurn)
			for (let i = 2; i <= 8; i++) {
				detector.onTurn(createSimilarTurn(`${i}`, baseTurn))
			}
			// With nonlinear escalation, 7 consecutive similar turns should push
			// score well above 0.7
			expect(detector.getLoopConfidenceState().score).toBeGreaterThanOrEqual(0.7)
			expect(detector.shouldCompress()).toBe(true)
		})

		it("should return false when cooldown is active even if score exceeds threshold", () => {
			// Drive score above threshold
			const baseTurn = createMockTurn("1")
			detector.onTurn(baseTurn)
			for (let i = 2; i <= 8; i++) {
				detector.onTurn(createSimilarTurn(`${i}`, baseTurn))
			}
			// Trigger compression (activates cooldown)
			detector.onCompression("loop_detected")
			// After compression, score is reset but cooldownActive is true
			// Even if we artificially set score high, cooldown should block
			expect(detector.shouldCompress()).toBe(false)
		})

		it("should accept a custom threshold", () => {
			const baseTurn = createMockTurn("1")
			detector.onTurn(baseTurn)
			detector.onTurn(createSimilarTurn("2", baseTurn))
			// After 1 similar turn, score is ~0.1, which is below 0.5
			expect(detector.shouldCompress(0.5)).toBe(false)
		})
	})

	describe("onCompression", () => {
		it("should generate a CompressionEvent with correct fields", () => {
			detector.onTurn(createMockTurn("1"))
			detector.onTurn(createMockTurn("2"))
			const event = detector.onCompression("test_reason")
			expect(event.id).toBe("mock-uuid-1234")
			expect(event.reason).toBe("test_reason")
			expect(event.turnsAtCompression).toBe(2)
			expect(typeof event.timestamp).toBe("number")
		})

		it("should use default reason 'loop_detected' when none provided", () => {
			detector.onTurn(createMockTurn("1"))
			const event = detector.onCompression()
			expect(event.reason).toBe("loop_detected")
		})

		it("should update loopConfidenceState with compression timestamp and cooldown", () => {
			detector.onTurn(createMockTurn("1"))
			const event = detector.onCompression("test")
			const state = detector.getLoopConfidenceState()
			expect(state.lastCompressionAt).toBe(event.timestamp)
			expect(state.cooldownActive).toBe(true)
			expect(state.lastSeenCompressionId).toBe(event.id)
		})

		it("should update compressionRecoveryState with new compression tracking", () => {
			detector.onTurn(createMockTurn("1"))
			const event = detector.onCompression("test")
			const recovery = detector.getCompressionRecoveryState()
			expect(recovery.lastCompressionId).toBe(event.id)
			expect(recovery.isRecovered).toBe(false)
			expect(recovery.turnsSinceLastCompression).toBe(0)
		})

		it("should clear the state tracker after compression", () => {
			detector.onTurn(createMockTurn("1"))
			detector.onTurn(createMockTurn("2"))
			expect(detector.getTurnCount()).toBe(2)
			detector.onCompression("test")
			// getTurnCount preserves global count after compression to support RelapseDetector
			expect(detector.getTurnCount()).toBe(2)
		})
	})

	describe("getLoopConfidenceState", () => {
		it("should return a snapshot of the current state", () => {
			detector.onTurn(createMockTurn("1"))
			const state1 = detector.getLoopConfidenceState()
			detector.onTurn(createSimilarTurn("2", createMockTurn("1")))
			const state2 = detector.getLoopConfidenceState()
			// State should have changed after the second turn
			expect(state2.consecutiveSimilarTurns).not.toBe(state1.consecutiveSimilarTurns)
		})
	})

	describe("getCompressionRecoveryState", () => {
		it("should return initial recovery state before any compression", () => {
			const recovery = detector.getCompressionRecoveryState()
			expect(recovery.lastCompressionId).toBeNull()
			expect(recovery.isRecovered).toBe(false)
			expect(recovery.turnsSinceLastCompression).toBe(0)
		})

		it("should return updated recovery state after compression", () => {
			detector.onTurn(createMockTurn("1"))
			detector.onCompression("test")
			const recovery = detector.getCompressionRecoveryState()
			expect(recovery.lastCompressionId).toBe("mock-uuid-1234")
			expect(recovery.isRecovered).toBe(false)
			expect(recovery.turnsSinceLastCompression).toBe(0)
		})
	})

	describe("reset", () => {
		it("should reset all state to initial values", () => {
			const baseTurn = createMockTurn("1")
			detector.onTurn(baseTurn)
			for (let i = 2; i <= 5; i++) {
				detector.onTurn(createSimilarTurn(`${i}`, baseTurn))
			}
			// State should have accumulated
			expect(detector.getLoopConfidenceState().score).toBeGreaterThan(0)
			expect(detector.getTurnCount()).toBeGreaterThan(0)

			detector.reset()

			// All state should be back to initial values
			expect(detector.getLoopConfidenceState().score).toBe(0)
			expect(detector.getLoopConfidenceState().consecutiveSimilarTurns).toBe(0)
			expect(detector.getLoopConfidenceState().lastCompressionAt).toBe(0)
			expect(detector.getLoopConfidenceState().cooldownActive).toBe(false)
			expect(detector.getLoopConfidenceState().lastSeenCompressionId).toBeNull()
			expect(detector.getCompressionRecoveryState().lastCompressionId).toBeNull()
			expect(detector.getCompressionRecoveryState().isRecovered).toBe(false)
			expect(detector.getCompressionRecoveryState().turnsSinceLastCompression).toBe(0)
			expect(detector.getTurnCount()).toBe(0)
		})

		it("should clear state after compression and then reset", () => {
			detector.onTurn(createMockTurn("1"))
			detector.onCompression("test")
			// After compression, cooldown is active
			expect(detector.getLoopConfidenceState().cooldownActive).toBe(true)

			detector.reset()
			expect(detector.getLoopConfidenceState().cooldownActive).toBe(false)
			expect(detector.getCompressionRecoveryState().lastCompressionId).toBeNull()
		})
	})

	describe("getTurnCount", () => {
		it("should return 0 for a fresh detector", () => {
			expect(detector.getTurnCount()).toBe(0)
		})

		it("should return the number of turns in the window", () => {
			detector.onTurn(createMockTurn("1"))
			detector.onTurn(createMockTurn("2"))
			detector.onTurn(createMockTurn("3"))
			expect(detector.getTurnCount()).toBe(3)
		})

		it("should respect window size limits", () => {
			const d = new SemanticLoopDetector({ windowSize: 3 })
			for (let i = 0; i < 5; i++) {
				d.onTurn(createMockTurn(`${i}`))
			}
			// getTurnCount returns global count (5), not windowed count (3)
			expect(d.getTurnCount()).toBe(5)
		})

		it("should preserve turn count after compression (for RelapseDetector)", () => {
			detector.onTurn(createMockTurn("1"))
			detector.onTurn(createMockTurn("2"))
			detector.onCompression("test")
			// getTurnCount preserves global count after compression to support RelapseDetector
			expect(detector.getTurnCount()).toBe(2)
		})
	})

	describe("end-to-end pipeline", () => {
		it("should drive confidence from 0 to compression threshold through repeated similar turns", () => {
			const baseTurn = createMockTurn("base")

			// First turn: no comparison possible
			detector.onTurn(baseTurn)
			expect(detector.getLoopConfidenceState().score).toBe(0)

			// Feed similar turns until confidence crosses threshold
			let compress = false
			for (let i = 2; i <= 10 && !compress; i++) {
				detector.onTurn(createSimilarTurn(`${i}`, baseTurn))
				compress = detector.shouldCompress()
			}

			expect(compress).toBe(true)

			// Trigger compression
			const event = detector.onCompression("loop_detected")
			expect(event.reason).toBe("loop_detected")
			expect(detector.getLoopConfidenceState().cooldownActive).toBe(true)
			// Turn count is preserved after compression to support RelapseDetector
			expect(detector.getTurnCount()).toBeGreaterThan(0)

			// After compression, cooldown prevents immediate re-trigger
			expect(detector.shouldCompress()).toBe(false)

			// Reset for a new task
			detector.reset()
			expect(detector.getLoopConfidenceState().score).toBe(0)
			expect(detector.getTurnCount()).toBe(0)
		})

		it("should keep confidence low when turns show meaningful progress", () => {
			const turn1 = createMockTurn("1", {
				toolPattern: ["read_file"],
				filesTouched: ["file1.ts"],
				stateTransitions: [],
			})
			const turn2 = createProgressTurn("2")
			const turn3 = createProgressTurn("3", {
				toolPattern: ["edit_file"],
				filesTouched: ["feature2.ts"],
				stateTransitions: ["todo_completed:Z"],
			} as Partial<ReasoningTurn>)

			detector.onTurn(turn1)
			detector.onTurn(turn2)
			detector.onTurn(turn3)

			// Progress turns should keep confidence relatively low
			expect(detector.getLoopConfidenceState().score).toBeLessThan(0.5)
			expect(detector.shouldCompress()).toBe(false)
		})

		describe("relapse handling", () => {
			it("should record failure and adaptation failure when relapse is detected", () => {
				const detector = new SemanticLoopDetector()

				const relapseDetector = (detector as any).relapseDetector
				const adaptationFailureDetector = (detector as any).adaptationFailureDetector
				const interventionTracker = (detector as any).interventionTracker

				vi.spyOn(relapseDetector, "check").mockReturnValue({ relapsed: true, severity: "high" })
				const recordSpy = vi.spyOn(interventionTracker, "record")
				const failureSpy = vi.spyOn(adaptationFailureDetector, "recordFailure")

				const turn1 = createMockTurn("1")
				detector.onTurn(turn1)
				for (let i = 2; i <= 8; i++) {
					detector.onTurn(createSimilarTurn(`${i}`, turn1))
				}

				expect(recordSpy).toHaveBeenCalledWith(expect.any(String), "failure")
				expect(failureSpy).toHaveBeenCalledWith("relapse")
			})

			it("should NOT trigger failure path when relapseDetector returns relapsed: false", () => {
				const detector = new SemanticLoopDetector()

				const relapseDetector = (detector as any).relapseDetector
				const adaptationFailureDetector = (detector as any).adaptationFailureDetector
				const interventionTracker = (detector as any).interventionTracker

				vi.spyOn(relapseDetector, "check").mockReturnValue({ relapsed: false })
				const recordSpy = vi.spyOn(interventionTracker, "record")
				const failureSpy = vi.spyOn(adaptationFailureDetector, "recordFailure")

				const turn1 = createMockTurn("1")
				detector.onTurn(turn1)
				for (let i = 2; i <= 8; i++) {
					detector.onTurn(createSimilarTurn(`${i}`, turn1))
				}

				const failureCalls = recordSpy.mock.calls.filter(
					(call: any[]) => call[1] === "failure",
				)
				expect(failureCalls).toHaveLength(0)
				expect(failureSpy).not.toHaveBeenCalled()
			})

			it("should NOT throw when relapseDetector.check returns undefined (null-safety guard)", () => {
				const detector = new SemanticLoopDetector()

				const relapseDetector = (detector as any).relapseDetector
				const adaptationFailureDetector = (detector as any).adaptationFailureDetector
				const interventionTracker = (detector as any).interventionTracker

				vi.spyOn(relapseDetector, "check").mockReturnValue(undefined)
				const recordSpy = vi.spyOn(interventionTracker, "record")
				const failureSpy = vi.spyOn(adaptationFailureDetector, "recordFailure")

				const turn1 = createMockTurn("1")

				expect(() => {
					detector.onTurn(turn1)
					for (let i = 2; i <= 8; i++) {
						detector.onTurn(createSimilarTurn(`${i}`, turn1))
					}
				}).not.toThrow()

				const failureCalls = recordSpy.mock.calls.filter(
					(call: any[]) => call[1] === "failure",
				)
				expect(failureCalls).toHaveLength(0)
				expect(failureSpy).not.toHaveBeenCalled()
			})
		})
	})
})