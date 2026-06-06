import { describe, it, expect, beforeEach, vi } from "vitest"
import SemanticLoopDetector from "../SemanticLoopDetector"
import type {
	ReasoningTurn,
	LoopConfidenceState,
	CompressionRecoveryState,
} from "../../../../packages/types/src/loop-detection"
import { ProgressTier } from "../../../../packages/types/src/loop-detection"

// Counter-based UUID mock so multiple compressions get distinct IDs
let uuidCounter = 0
vi.mock("node:crypto", () => ({
	randomUUID: () => `mock-uuid-${++uuidCounter}`,
}))

/**
 * Integration tests for SemanticLoopDetector — the coordinator that wires together
 * SemanticStateTracker, SimilarityScorer, ProgressDetector, and LoopConfidenceCalculator.
 *
 * These tests exercise the full pipeline end-to-end, verifying that the four
 * components interact correctly under realistic agent behaviour scenarios.
 * No individual component is mocked; the real implementations are used.
 */
describe("SemanticLoopDetector — Integration Tests", () => {
	let detector: SemanticLoopDetector

	beforeEach(() => {
		uuidCounter = 0
		detector = new SemanticLoopDetector()
	})

	// ─── Helpers ───────────────────────────────────────────────────────────

	const makeTurn = (id: string, overrides: Partial<ReasoningTurn> = {}): ReasoningTurn => ({
		id,
		toolPattern: [],
		filesTouched: [],
		hypotheses: [],
		conclusions: [],
		stateTransitions: [],
		timestamp: Date.now(),
		...overrides,
	})

	/** Factory for identical read-grep loop turns. */
	const loopTurn = (id: string): ReasoningTurn =>
		makeTurn(id, {
			toolPattern: ["read_file", "grep"],
			filesTouched: ["auth.ts"],
			hypotheses: ["bug in auth"],
			conclusions: [],
			stateTransitions: [],
		})

	// ─── Scenario 1: Productive Agent (No Loop) ───────────────────────────

	describe("Scenario 1: Productive Agent — no loop detected", () => {
		it("should keep confidence low and never recommend compression", () => {
			// Turn 1: Read file A, form hypothesis "bug in auth"
			const turn1 = makeTurn("t1", {
				toolPattern: ["read_file"],
				filesTouched: ["auth.ts"],
				hypotheses: ["bug in auth"],
				conclusions: [],
				stateTransitions: [],
			})

			// Turn 2: Read file B, grep for pattern, add hypothesis "missing validation"
			const turn2 = makeTurn("t2", {
				toolPattern: ["read_file", "grep"],
				filesTouched: ["validation.ts"],
				hypotheses: ["bug in auth", "missing validation"],
				conclusions: [],
				stateTransitions: [],
			})

			// Turn 3: Edit file A, add conclusion "fixed auth bug"
			const turn3 = makeTurn("t3", {
				toolPattern: ["edit_file"],
				filesTouched: ["auth.ts"],
				hypotheses: ["bug in auth", "missing validation"],
				conclusions: ["fixed auth bug"],
				stateTransitions: ["error_resolved:auth"],
			})

			// Turn 4: Run tests, add conclusion "all tests pass"
			const turn4 = makeTurn("t4", {
				toolPattern: ["execute_command"],
				filesTouched: [],
				hypotheses: ["bug in auth", "missing validation"],
				conclusions: ["fixed auth bug", "all tests pass"],
				stateTransitions: ["todo_completed:fix-auth"],
			})

			const r1 = detector.onTurn(turn1)
			const r2 = detector.onTurn(turn2)
			const r3 = detector.onTurn(turn3)
			const r4 = detector.onTurn(turn4)

			// ── Similarity ──
			// Turn 1 has no previous turn → similarity = 0
			expect(r1.similarityScore).toBe(0.0)
			// Turn 2 vs Turn 1: different files, some hypothesis overlap → moderate (~0.43)
			expect(r2.similarityScore).toBeGreaterThan(0)
			expect(r2.similarityScore).toBeLessThan(0.6)
			// Turn 3 vs Turn 2: very different tools/files → low (~0.20)
			expect(r3.similarityScore).toBeLessThan(0.5)
			// Turn 4 vs Turn 3: different tools, no files → low (~0.25)
			expect(r4.similarityScore).toBeLessThan(0.5)

			// ── Progress ──
			// At least some turns should show Strong or Medium progress
			const strongOrMedium = [r1, r2, r3, r4]
				.flatMap((r) => r.progressEvents)
				.filter((e) => e.tier === ProgressTier.Strong || e.tier === ProgressTier.Medium)
			expect(strongOrMedium.length).toBeGreaterThanOrEqual(2)

			// Progress scores should be meaningful on progress turns
			const highProgressTurns = [r2, r3, r4].filter((r) => r.progressScore >= 0.3)
			expect(highProgressTurns.length).toBeGreaterThanOrEqual(1)

			// ── Confidence ──
			// Loop confidence should stay LOW (below 0.3) throughout
			expect(r1.loopConfidence.score).toBeLessThan(0.3)
			expect(r2.loopConfidence.score).toBeLessThan(0.3)
			expect(r3.loopConfidence.score).toBeLessThan(0.3)
			expect(r4.loopConfidence.score).toBeLessThan(0.3)

			// shouldCompress() should return false
			expect(detector.shouldCompress()).toBe(false)
		})
	})

	// ─── Scenario 2: Loop Detection (Read-Grep Loop) ──────────────────────

	describe("Scenario 2: Read-Grep Loop — loop detected and compression triggered", () => {
		it("should escalate confidence nonlinearly and trigger compression", () => {
			const r1 = detector.onTurn(loopTurn("t1"))
			const r2 = detector.onTurn(loopTurn("t2"))
			const r3 = detector.onTurn(loopTurn("t3"))
			const r4 = detector.onTurn(loopTurn("t4"))
			const r5 = detector.onTurn(loopTurn("t5"))

			// ── Similarity ──
			// Identical turns → very high similarity (≈0.90)
			expect(r2.similarityScore).toBeGreaterThanOrEqual(0.8)
			expect(r3.similarityScore).toBeGreaterThanOrEqual(0.8)
			expect(r4.similarityScore).toBeGreaterThanOrEqual(0.8)
			expect(r5.similarityScore).toBeGreaterThanOrEqual(0.8)

			// ── Progress ──
			// Looping turns show only Weak progress (repeated_inspection + minor_navigation)
			expect(r2.progressScore).toBeLessThan(0.3)
			expect(r3.progressScore).toBeLessThan(0.3)
			expect(r4.progressScore).toBeLessThan(0.3)
			expect(r5.progressScore).toBeLessThan(0.3)

			// No Strong or Medium progress events on looping turns
			const nonWeakEvents = [r2, r3, r4, r5]
				.flatMap((r) => r.progressEvents)
				.filter((e) => e.tier !== ProgressTier.Weak)
			expect(nonWeakEvents.length).toBe(0)

			// ── Confidence escalation ──
			// Expected: 0.00 → 0.10 → 0.25 → 0.45 → 0.70
			// Formula: increment = baseIncrement * (1 + consecutiveSimilarTurns * 0.5)
			expect(r1.loopConfidence.score).toBeCloseTo(0.0, 2)
			expect(r2.loopConfidence.score).toBeCloseTo(0.10, 2)
			expect(r3.loopConfidence.score).toBeCloseTo(0.25, 2)
			expect(r4.loopConfidence.score).toBeCloseTo(0.45, 2)
			expect(r5.loopConfidence.score).toBeCloseTo(0.70, 2)

			// ── Consecutive similar turns ──
			expect(r1.loopConfidence.consecutiveSimilarTurns).toBe(0)
			expect(r2.loopConfidence.consecutiveSimilarTurns).toBe(1)
			expect(r3.loopConfidence.consecutiveSimilarTurns).toBe(2)
			expect(r4.loopConfidence.consecutiveSimilarTurns).toBe(3)
			expect(r5.loopConfidence.consecutiveSimilarTurns).toBe(4)

			// ── Compression trigger ──
			expect(detector.shouldCompress()).toBe(true)

			const event = detector.onCompression("loop_detected")
			expect(event.reason).toBe("loop_detected")
			expect(event.turnsAtCompression).toBe(5)
			expect(detector.getLoopConfidenceState().cooldownActive).toBe(true)
			// Turn count is preserved after compression to support RelapseDetector
			expect(detector.getTurnCount()).toBe(5)
		})
	})

	// ─── Scenario 3: Compression → Cooldown → Recovery ───────────────────

	describe("Scenario 3: Compression cooldown and recovery", () => {
		it("should decay confidence during cooldown and detect recovery after cooldown ends", () => {
			// Build up a loop to trigger compression
			for (let i = 1; i <= 5; i++) {
				detector.onTurn(loopTurn(`loop-${i}`))
			}
			expect(detector.shouldCompress()).toBe(true)

			// Trigger compression — score reset to 0.0 per Requirement 5.4, cooldown active
			detector.onCompression("loop_detected")
			expect(detector.getLoopConfidenceState().score).toBeCloseTo(0.0, 2)
			expect(detector.getLoopConfidenceState().cooldownActive).toBe(true)

			// ── Cooldown phase (3 turns) ──
			// Score stays at 0.0 during cooldown (0.0 − 0.10 = −0.10, clamped to 0.0)
			const r6 = detector.onTurn(loopTurn("cooldown-1"))
			expect(r6.loopConfidence.score).toBeCloseTo(0.0, 2) // 0.0 − 0.10 clamped
			expect(r6.loopConfidence.consecutiveSimilarTurns).toBe(0) // reset during cooldown
			expect(detector.shouldCompress()).toBe(false) // cooldown blocks compression

			const r7 = detector.onTurn(loopTurn("cooldown-2"))
			expect(r7.loopConfidence.score).toBeCloseTo(0.0, 2) // 0.0 − 0.10 clamped
			expect(detector.shouldCompress()).toBe(false)

			// ── Turn 3 after compression: cooldown ends (turnsSinceLastCompression = 3 ≥ cooldownTurns = 3) ──
			// Now make a progress turn to trigger recovery detection
			const recoveryTurn = makeTurn("recovery-1", {
				toolPattern: ["edit_file"],
				filesTouched: ["auth.ts", "new_feature.ts"],
				hypotheses: ["bug in auth", "missing validation"],
				conclusions: ["fixed auth bug"],
				stateTransitions: ["error_resolved:auth"],
			})
			const r8 = detector.onTurn(recoveryTurn)

			// Cooldown should be over
			expect(r8.loopConfidence.cooldownActive).toBe(false)

			// Progress should be strong (new file, new hypothesis, major transition, etc.)
			expect(r8.progressScore).toBeGreaterThanOrEqual(0.3)

			// Recovery should be detected
			const recoveryState = detector.getCompressionRecoveryState()
			expect(recoveryState.isRecovered).toBe(true)
			expect(recoveryState.turnsSinceLastCompression).toBe(3)
		})
	})

	// ─── Scenario 4: Nonlinear Escalation Verification ───────────────────

	describe("Scenario 4: Nonlinear confidence escalation — exact values", () => {
		it("should follow the escalation formula increment = baseIncrement * (1 + consecutive * 0.5)", () => {
			const results = [
				detector.onTurn(loopTurn("t1")),
				detector.onTurn(loopTurn("t2")),
				detector.onTurn(loopTurn("t3")),
				detector.onTurn(loopTurn("t4")),
				detector.onTurn(loopTurn("t5")),
				detector.onTurn(loopTurn("t6")),
			]

			// Expected sequence:
			// t1: score=0.00, consecutive=0  (first turn, no comparison)
			// t2: score=0.10, consecutive=1  (increment = 0.1 * (1 + 0*0.5) = 0.10)
			// t3: score=0.25, consecutive=2  (increment = 0.1 * (1 + 1*0.5) = 0.15)
			// t4: score=0.45, consecutive=3  (increment = 0.1 * (1 + 2*0.5) = 0.20)
			// t5: score=0.70, consecutive=4  (increment = 0.1 * (1 + 3*0.5) = 0.25)
			// t6: score=1.00, consecutive=5  (increment = 0.1 * (1 + 4*0.5) = 0.30, clamped)

			const expectedScores = [0.0, 0.10, 0.25, 0.45, 0.70, 1.0]
			const expectedConsecutive = [0, 1, 2, 3, 4, 5]

			for (let i = 0; i < results.length; i++) {
				expect(results[i].loopConfidence.score).toBeCloseTo(expectedScores[i], 2)
				expect(results[i].loopConfidence.consecutiveSimilarTurns).toBe(expectedConsecutive[i])
			}

			// Verify that each increment is strictly larger than the previous (nonlinear growth)
			const increments: number[] = []
			for (let i = 1; i < results.length; i++) {
				increments.push(results[i].loopConfidence.score - results[i - 1].loopConfidence.score)
			}
			for (let i = 1; i < increments.length; i++) {
				expect(increments[i]).toBeGreaterThan(increments[i - 1])
			}
		})
	})

	// ─── Scenario 5: Recovery After Loop (Agent Breaks Free) ──────────────

	describe("Scenario 5: Agent breaks free from loop", () => {
		it("should decrease confidence and reset consecutive counter when agent makes progress", () => {
			// 3 looping turns to build some confidence
			detector.onTurn(loopTurn("t1"))
			detector.onTurn(loopTurn("t2"))
			const r3 = detector.onTurn(loopTurn("t3"))

			// Confidence should have built up: 0.00 → 0.10 → 0.25
			expect(r3.loopConfidence.score).toBeCloseTo(0.25, 2)
			expect(r3.loopConfidence.consecutiveSimilarTurns).toBe(2)

			// Turn 4: Agent makes strong progress — breaks free
			const progressTurn = makeTurn("t4", {
				toolPattern: ["edit_file"],
				filesTouched: ["new_feature.ts"],
				hypotheses: ["new hypothesis: feature works"],
				conclusions: ["fixed the issue"],
				stateTransitions: ["error_resolved:main"],
			})
			const r4 = detector.onTurn(progressTurn)

			// Confidence should decrease (dissimilar + high progress → large decrement)
			expect(r4.loopConfidence.score).toBeLessThan(r3.loopConfidence.score)

			// Consecutive similar turns should reset to 0
			expect(r4.loopConfidence.consecutiveSimilarTurns).toBe(0)

			// Similarity should be low (completely different turn)
			expect(r4.similarityScore).toBeLessThan(0.6)

			// Progress should be strong
			expect(r4.progressScore).toBeGreaterThanOrEqual(0.3)

			// shouldCompress should be false
			expect(detector.shouldCompress()).toBe(false)

			// Another progress turn should further decrease confidence toward 0
			const progressTurn2 = makeTurn("t5", {
				toolPattern: ["execute_command"],
				filesTouched: ["test_runner.ts"],
				hypotheses: ["new hypothesis: feature works"],
				conclusions: ["all tests pass"],
				stateTransitions: ["todo_completed:feature"],
			})
			const r5 = detector.onTurn(progressTurn2)
			expect(r5.loopConfidence.score).toBeLessThan(r4.loopConfidence.score)
			expect(r5.loopConfidence.consecutiveSimilarTurns).toBe(0)
		})
	})

	// ─── Scenario 6: Window Sliding — Old Turns Evicted ──────────────────

	describe("Scenario 6: Rolling window eviction affects progress detection", () => {
		it("should lose historical context when old turns are evicted from the window", () => {
			const smallWindow = new SemanticLoopDetector({ windowSize: 3 })

			// Turn 1: touches a unique file that no other turn touches
			const turn1 = makeTurn("t1", {
				toolPattern: ["read_file"],
				filesTouched: ["unique_file.ts"],
				hypotheses: ["unique hypothesis"],
				conclusions: [],
				stateTransitions: [],
			})

			// Turns 2-4: touch only common files (will evict Turn 1)
			const commonTurn = (id: string): ReasoningTurn =>
				makeTurn(id, {
					toolPattern: ["read_file"],
					filesTouched: ["common.ts"],
					hypotheses: ["common hypothesis"],
					conclusions: [],
					stateTransitions: [],
				})

			smallWindow.onTurn(turn1)
			smallWindow.onTurn(commonTurn("t2"))
			smallWindow.onTurn(commonTurn("t3"))
			smallWindow.onTurn(commonTurn("t4")) // evicts Turn 1
			// getTurnCount returns global count (4), not windowed count (3)
			expect(smallWindow.getTurnCount()).toBe(4)

			// Turn 5: touches unique_file.ts again with a modification tool
			// ProgressDetector will see this as a "new file" because Turn 1
			// (which had unique_file.ts) has been evicted from the window
			const turn5 = makeTurn("t5", {
				toolPattern: ["edit_file"],
				filesTouched: ["unique_file.ts"],
				hypotheses: ["new hypothesis after eviction"],
				conclusions: ["conclusion after eviction"],
				stateTransitions: [],
			})
			const r5Small = smallWindow.onTurn(turn5)

			// unique_file.ts should be detected as a "new file" (Strong progress)
			// even though it was seen in Turn 1, because Turn 1 was evicted
			const fileCreatedEventSmall = r5Small.progressEvents.find(
				(e) => e.type === "file_created" && e.tier === ProgressTier.Strong,
			)
			expect(fileCreatedEventSmall).toBeDefined()

			// ── Compare with a large window where Turn 1 is NOT evicted ──
			const largeWindow = new SemanticLoopDetector({ windowSize: 10 })

			largeWindow.onTurn(turn1)
			largeWindow.onTurn(commonTurn("t2"))
			largeWindow.onTurn(commonTurn("t3"))
			largeWindow.onTurn(commonTurn("t4"))
			const r5Large = largeWindow.onTurn(turn5)

			// With large window, unique_file.ts IS in seenFiles (from Turn 1)
			// so no "file_created" event should be generated
			const fileCreatedEventLarge = r5Large.progressEvents.find(
				(e) => e.type === "file_created",
			)
			expect(fileCreatedEventLarge).toBeUndefined()
		})
	})

	// ─── Scenario 7: Multiple Compression Events ─────────────────────────

	describe("Scenario 7: Multiple compression events", () => {
		it("should handle two full loop-detect-compress-recover cycles", () => {
			// ── First cycle: build loop → compress ──
			for (let i = 1; i <= 5; i++) {
				detector.onTurn(loopTurn(`cycle1-${i}`))
			}
			expect(detector.shouldCompress()).toBe(true)

			const compression1 = detector.onCompression("loop_detected")
			expect(compression1.id).toBe("mock-uuid-1")
			expect(detector.getLoopConfidenceState().cooldownActive).toBe(true)
			// Turn count is preserved after compression to support RelapseDetector
			expect(detector.getTurnCount()).toBe(5)

			// ── Cooldown: 3 turns of decay ──
			detector.onTurn(loopTurn("cooldown-1a"))
			detector.onTurn(loopTurn("cooldown-2a"))
			detector.onTurn(loopTurn("cooldown-3a"))

			// Cooldown ends — confidence has decayed from 0.70 → 0.50 → 0.40 → 0.30
			// (3 decay steps of 0.10 each, but the 3rd turn ends cooldown so normal calc applies)
			const scoreAfterCooldown = detector.getLoopConfidenceState().score
			expect(scoreAfterCooldown).toBeLessThan(0.7)
			expect(detector.getLoopConfidenceState().cooldownActive).toBe(false)

			// ── Second cycle: build loop again → compress again ──
			// Need enough similar turns to escalate confidence back above 0.7
			for (let i = 1; i <= 8; i++) {
				detector.onTurn(loopTurn(`cycle2-${i}`))
			}
			expect(detector.getLoopConfidenceState().score).toBeGreaterThanOrEqual(0.7)
			expect(detector.shouldCompress()).toBe(true)

			const compression2 = detector.onCompression("loop_detected")
			expect(compression2.id).toBe("mock-uuid-2") // different UUID from first compression
			expect(detector.getLoopConfidenceState().cooldownActive).toBe(true)
			// Turn count is preserved after compression to support RelapseDetector
			expect(detector.getTurnCount()).toBe(16)

			// Recovery state should track the SECOND compression
			const recovery = detector.getCompressionRecoveryState()
			expect(recovery.lastCompressionId).toBe("mock-uuid-2")
			expect(recovery.isRecovered).toBe(false)
			expect(recovery.turnsSinceLastCompression).toBe(0)
		})
	})

	// ─── Scenario 8: Telemetry Callbacks ──────────────────────────────────

	describe("Scenario 8: Telemetry callbacks fire correctly", () => {
		it("should invoke onLoopDetected when similarity ≥ threshold and progress < 0.3", () => {
			const loopDetectedEvents: Array<{
				confidenceScore: number
				similarityScore: number
				progressScore: number
				consecutiveSimilarTurns: number
			}> = []

			const detectorWithCallbacks = new SemanticLoopDetector({
				onLoopDetected: (event) => {
					loopDetectedEvents.push(event)
				},
			})

			// Turn 1: no previous turn → no loop callback
			detectorWithCallbacks.onTurn(loopTurn("t1"))
			expect(loopDetectedEvents.length).toBe(0)

			// Turn 2: high similarity (≈0.90 ≥ 0.6), low progress (<0.3) → callback fires
			detectorWithCallbacks.onTurn(loopTurn("t2"))
			expect(loopDetectedEvents.length).toBe(1)
			expect(loopDetectedEvents[0].similarityScore).toBeGreaterThanOrEqual(0.6)
			expect(loopDetectedEvents[0].progressScore).toBeLessThan(0.3)
			expect(loopDetectedEvents[0].consecutiveSimilarTurns).toBeGreaterThanOrEqual(1)

			// Turn 3: still looping → another callback
			detectorWithCallbacks.onTurn(loopTurn("t3"))
			expect(loopDetectedEvents.length).toBe(2)

			// Turn 4: progress turn → similarity < threshold → no loop callback
			const progressTurn = makeTurn("t4", {
				toolPattern: ["edit_file"],
				filesTouched: ["new_feature.ts"],
				hypotheses: ["new hypothesis"],
				conclusions: ["fixed"],
				stateTransitions: ["error_resolved:main"],
			})
			detectorWithCallbacks.onTurn(progressTurn)
			expect(loopDetectedEvents.length).toBe(2) // no new callback
		})

		it("should invoke onCompressionTriggered when compression is triggered", () => {
			const compressionEvents: Array<{
				compressionId: string
				confidenceScore: number
				reason: string
			}> = []

			const detectorWithCallbacks = new SemanticLoopDetector({
				onCompressionTriggered: (event) => {
					compressionEvents.push(event)
				},
			})

			for (let i = 1; i <= 5; i++) {
				detectorWithCallbacks.onTurn(loopTurn(`t${i}`))
			}

			detectorWithCallbacks.onCompression("loop_detected")

			expect(compressionEvents.length).toBe(1)
			expect(compressionEvents[0].compressionId).toBe("mock-uuid-1")
			expect(compressionEvents[0].reason).toBe("loop_detected")
			expect(compressionEvents[0].confidenceScore).toBeCloseTo(0.70, 2)
		})

		it("should invoke onRecoveryDetected when agent recovers after compression", () => {
			const recoveryEvents: Array<{
				compressionId: string
				turnsToRecover: number
			}> = []

			const detectorWithCallbacks = new SemanticLoopDetector({
				onRecoveryDetected: (event) => {
					recoveryEvents.push(event)
				},
			})

			// Build loop and compress
			for (let i = 1; i <= 5; i++) {
				detectorWithCallbacks.onTurn(loopTurn(`t${i}`))
			}
			detectorWithCallbacks.onCompression("loop_detected")

			// Cooldown turns (3 turns) — still looping, progress < 0.3
			detectorWithCallbacks.onTurn(loopTurn("cooldown-1"))
			detectorWithCallbacks.onTurn(loopTurn("cooldown-2"))
			detectorWithCallbacks.onTurn(loopTurn("cooldown-3"))

			// No recovery yet (progress < 0.3 during cooldown turns)
			expect(recoveryEvents.length).toBe(0)

			// Turn after cooldown: strong progress → recovery detected
			const progressTurn = makeTurn("recovery", {
				toolPattern: ["edit_file"],
				filesTouched: ["auth.ts", "new_feature.ts"],
				hypotheses: ["bug in auth", "missing validation"],
				conclusions: ["fixed auth bug"],
				stateTransitions: ["error_resolved:auth"],
			})
			detectorWithCallbacks.onTurn(progressTurn)

			expect(recoveryEvents.length).toBe(1)
			expect(recoveryEvents[0].compressionId).toBe("mock-uuid-1")
			expect(recoveryEvents[0].turnsToRecover).toBe(4)

			// Recovery should NOT fire again on subsequent progress turns
			const anotherProgressTurn = makeTurn("recovery-2", {
				toolPattern: ["execute_command"],
				filesTouched: ["test_runner.ts"],
				hypotheses: ["missing validation"],
				conclusions: ["all tests pass"],
				stateTransitions: ["todo_completed:fix"],
			})
			detectorWithCallbacks.onTurn(anotherProgressTurn)
			expect(recoveryEvents.length).toBe(1) // no additional callback
		})
	})

	// ─── Scenario 9: Full Lifecycle ───────────────────────────────────────

	describe("Scenario 9: Full lifecycle — loop → compress → cooldown → recover → reset", () => {
		it("should complete a full loop-detect-compress-recover-reset lifecycle", () => {
			const loopDetectedEvents: Array<Record<string, number>> = []
			const compressionEvents: Array<Record<string, string | number>> = []
			const recoveryEvents: Array<Record<string, string | number>> = []

			const detectorFull = new SemanticLoopDetector({
				onLoopDetected: (e) => loopDetectedEvents.push(e as unknown as Record<string, number>),
				onCompressionTriggered: (e) => compressionEvents.push(e as unknown as Record<string, string | number>),
				onRecoveryDetected: (e) => recoveryEvents.push(e as unknown as Record<string, string | number>),
			})

			// ── Phase 1: Loop detection ──
			for (let i = 1; i <= 5; i++) {
				detectorFull.onTurn(loopTurn(`loop-${i}`))
			}
			// Turns 2-5 trigger onLoopDetected (similarity ≥ 0.6, progress < 0.3)
			expect(loopDetectedEvents.length).toBe(4)
			expect(detectorFull.shouldCompress()).toBe(true)

			// ── Phase 2: Compression ──
			const event = detectorFull.onCompression("loop_detected")
			expect(compressionEvents.length).toBe(1)
			expect(event.turnsAtCompression).toBe(5)
			expect(detectorFull.getLoopConfidenceState().cooldownActive).toBe(true)
			// Turn count is preserved after compression to support RelapseDetector
			expect(detectorFull.getTurnCount()).toBe(5)

			// ── Phase 3: Cooldown ──
			detectorFull.onTurn(loopTurn("cooldown-1"))
			detectorFull.onTurn(loopTurn("cooldown-2"))
			expect(detectorFull.shouldCompress()).toBe(false) // cooldown blocks
			expect(recoveryEvents.length).toBe(0) // no recovery yet

			// ── Phase 4: Recovery ──
			detectorFull.onTurn(loopTurn("cooldown-3")) // last cooldown turn
			const progressTurn = makeTurn("recovery", {
				toolPattern: ["edit_file"],
				filesTouched: ["auth.ts", "new_feature.ts"],
				hypotheses: ["bug in auth", "missing validation"],
				conclusions: ["fixed auth bug"],
				stateTransitions: ["error_resolved:auth"],
			})
			detectorFull.onTurn(progressTurn)
			expect(recoveryEvents.length).toBe(1)
			expect(detectorFull.getCompressionRecoveryState().isRecovered).toBe(true)

			// ── Phase 5: Reset for new task ──
			detectorFull.reset()
			expect(detectorFull.getLoopConfidenceState().score).toBe(0)
			expect(detectorFull.getLoopConfidenceState().cooldownActive).toBe(false)
			expect(detectorFull.getLoopConfidenceState().consecutiveSimilarTurns).toBe(0)
			expect(detectorFull.getCompressionRecoveryState().lastCompressionId).toBeNull()
			expect(detectorFull.getCompressionRecoveryState().isRecovered).toBe(false)
			expect(detectorFull.getTurnCount()).toBe(0)
			expect(detectorFull.shouldCompress()).toBe(false)
		})
	})

	// ─── Scenario 10: Alternating Progress and Loop Turns ─────────────────

	describe("Scenario 10: Alternating progress and loop turns — confidence stays low", () => {
		it("should prevent confidence escalation when loop and progress turns alternate", () => {
			const progressTurn = (id: string): ReasoningTurn =>
				makeTurn(id, {
					toolPattern: ["edit_file"],
					filesTouched: [`feature_${id}.ts`],
					hypotheses: [`hypothesis_${id}`],
					conclusions: [`conclusion_${id}`],
					stateTransitions: [`error_resolved:${id}`],
				})

			// Alternate: loop, progress, loop, progress, loop, progress
			const results: Array<{
				loopConfidence: LoopConfidenceState
				similarityScore: number
				progressScore: number
			}> = []

			results.push(detector.onTurn(loopTurn("t1")))
			results.push(detector.onTurn(progressTurn("t2")))
			results.push(detector.onTurn(loopTurn("t3")))
			results.push(detector.onTurn(progressTurn("t4")))
			results.push(detector.onTurn(loopTurn("t5")))
			results.push(detector.onTurn(progressTurn("t6")))

			// Key insight: similarity is computed between CONSECUTIVE turns.
			// A loop turn after a progress turn is dissimilar because the tool
			// patterns, files, and hypotheses are completely different.
			// This prevents confidence from escalating despite repeated returns
			// to looping behaviour.

			// Confidence should never reach compression threshold
			const finalScore = results[results.length - 1].loopConfidence.score
			expect(finalScore).toBeLessThan(0.7)
			expect(detector.shouldCompress()).toBe(false)

			// Consecutive similar turns should reset on each progress turn
			// (and also on each loop turn that follows a progress turn, since
			// those are dissimilar to the preceding progress turn)
			expect(results[1].loopConfidence.consecutiveSimilarTurns).toBe(0)
			expect(results[3].loopConfidence.consecutiveSimilarTurns).toBe(0)
			expect(results[5].loopConfidence.consecutiveSimilarTurns).toBe(0)
		})
	})

	// ─── Scenario 11: Dissimilar Turn with Zero Progress ──────────────────

	describe("Scenario 11: Dissimilar turn with zero progress — confidence unchanged", () => {
		it("should not decrease confidence when a dissimilar turn has zero progress score", () => {
			// Build some confidence with similar turns
			detector.onTurn(loopTurn("t1"))
			detector.onTurn(loopTurn("t2"))
			const scoreBefore = detector.getLoopConfidenceState().score
			expect(scoreBefore).toBeCloseTo(0.10, 2)

			// A dissimilar turn with ZERO progress: decrement = baseDecrement * 0 = 0
			// This means confidence stays the same (no recovery without progress)
			const dissimilarNoProgress = makeTurn("t3", {
				toolPattern: ["list_directory"], // completely different tool
				filesTouched: [], // no files
				hypotheses: [], // no hypotheses
				conclusions: [], // no conclusions
				stateTransitions: [], // no transitions
			})
			const r3 = detector.onTurn(dissimilarNoProgress)

			// Similarity should be low (dissimilar)
			expect(r3.similarityScore).toBeLessThan(0.6)

			// Progress should be zero or near-zero
			expect(r3.progressScore).toBeLessThan(0.1)

			// Confidence should NOT decrease (decrement = baseDecrement * progressScore ≈ 0)
			expect(r3.loopConfidence.score).toBeCloseTo(scoreBefore, 2)

			// Consecutive similar turns should reset to 0
			expect(r3.loopConfidence.consecutiveSimilarTurns).toBe(0)
		})
	})

	// ─── Scenario 12: Custom Similarity Threshold ─────────────────────────

	describe("Scenario 12: Custom similarity threshold affects loop detection", () => {
		it("should use the custom threshold for similarity classification", () => {
			// Lower threshold (0.3): moderate similarity turns are now classified as "similar"
			const lowThresholdDetector = new SemanticLoopDetector({
				similarityThreshold: 0.3,
				calculatorConfig: { similarityThreshold: 0.3 },
			})

			// Turns with moderate similarity (~0.43): same tool prefix, some hypothesis overlap
			const turnA = makeTurn("a", {
				toolPattern: ["read_file"],
				filesTouched: ["auth.ts"],
				hypotheses: ["bug in auth"],
				conclusions: [],
				stateTransitions: [],
			})
			const turnB = makeTurn("b", {
				toolPattern: ["read_file", "grep"],
				filesTouched: ["validation.ts"],
				hypotheses: ["bug in auth", "missing validation"],
				conclusions: [],
				stateTransitions: [],
			})

			lowThresholdDetector.onTurn(turnA)
			const rB = lowThresholdDetector.onTurn(turnB)

			// With default threshold (0.6), this similarity (~0.43) would be dissimilar
			// With threshold 0.3, it's classified as similar → confidence increases
			expect(rB.similarityScore).toBeGreaterThan(0.3)
			expect(rB.loopConfidence.consecutiveSimilarTurns).toBeGreaterThanOrEqual(1)

			// ── Compare with default threshold ──
			const defaultDetector = new SemanticLoopDetector()
			defaultDetector.onTurn(turnA)
			const rBDefault = defaultDetector.onTurn(turnB)

			// With default threshold (0.6), same similarity is dissimilar
			expect(rBDefault.loopConfidence.consecutiveSimilarTurns).toBe(0)
		})
	})
})