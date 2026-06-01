import { describe, it, expect } from "vitest"
import ProgressDetector from "../ProgressDetector"
import { ReasoningTurn, ProgressTier } from "../../../../packages/types/src/loop-detection"

describe("ProgressDetector", () => {
	const detector = new ProgressDetector()

	const createMockTurn = (id: string, overrides: Partial<ReasoningTurn> = {}): ReasoningTurn => ({
		id,
		toolPattern: [],
		filesTouched: [],
		hypotheses: [],
		conclusions: [],
		stateTransitions: [],
		timestamp: 1000,
		...overrides,
	})

	// ---------------------------------------------------------------------------
	// 1. Strong Progress Tests
	// ---------------------------------------------------------------------------
	describe("Strong Progress", () => {
		it("should detect file_created when new file appears with previous turns", () => {
			const previousTurns = [createMockTurn("1", { filesTouched: ["a.ts"] })]
			const currentTurn = createMockTurn("2", { filesTouched: ["a.ts", "b.ts"] })
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "file_created",
					tier: ProgressTier.Strong,
					details: "New file(s) touched that were not seen in previous turns",
				}),
			)
		})

		it("should NOT detect file_created when there are no previous turns", () => {
			const currentTurn = createMockTurn("1", { filesTouched: ["a.ts"] })
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events.find((e) => e.type === "file_created")).toBeUndefined()
		})

		it("should NOT detect file_created when all files were previously seen", () => {
			const previousTurns = [createMockTurn("1", { filesTouched: ["a.ts", "b.ts"] })]
			const currentTurn = createMockTurn("2", { filesTouched: ["a.ts", "b.ts"] })
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.events.find((e) => e.type === "file_created")).toBeUndefined()
		})

		it("should detect hypothesis_introduced when new hypothesis appears with previous turns", () => {
			const previousTurns = [createMockTurn("1", { hypotheses: ["the bug is in auth"] })]
			const currentTurn = createMockTurn("2", {
				hypotheses: ["the bug is in auth", "the bug is in db"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "hypothesis_introduced",
					tier: ProgressTier.Strong,
					details: "New hypothesis introduced that was not seen in previous turns",
				}),
			)
		})

		it("should NOT detect hypothesis_introduced when there are no previous turns", () => {
			const currentTurn = createMockTurn("1", { hypotheses: ["new hypothesis"] })
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events.find((e) => e.type === "hypothesis_introduced")).toBeUndefined()
		})

		it("should NOT detect hypothesis_introduced when all hypotheses were previously seen", () => {
			const previousTurns = [createMockTurn("1", { hypotheses: ["h1", "h2"] })]
			const currentTurn = createMockTurn("2", { hypotheses: ["h1", "h2"] })
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.events.find((e) => e.type === "hypothesis_introduced")).toBeUndefined()
		})

		it("should detect state_transition with 'completed'", () => {
			const currentTurn = createMockTurn("1", {
				stateTransitions: ["todo_completed:X"],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "state_transition",
					tier: ProgressTier.Strong,
					details: "Major state transition (completed or resolved) detected",
				}),
			)
		})

		it("should detect state_transition with 'resolved'", () => {
			const currentTurn = createMockTurn("1", {
				stateTransitions: ["error_resolved:Y"],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "state_transition",
					tier: ProgressTier.Strong,
					details: "Major state transition (completed or resolved) detected",
				}),
			)
		})

		it("should NOT detect state_transition without 'completed' or 'resolved'", () => {
			const currentTurn = createMockTurn("1", {
				stateTransitions: ["in_progress", "started"],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events.find((e) => e.type === "state_transition")).toBeUndefined()
		})

		it("should detect multiple strong events in a single turn", () => {
			const previousTurns = [
				createMockTurn("1", {
					filesTouched: ["a.ts"],
					hypotheses: ["h1"],
				}),
			]
			const currentTurn = createMockTurn("2", {
				filesTouched: ["a.ts", "b.ts"],
				hypotheses: ["h1", "h2"],
				stateTransitions: ["task_completed:implement-feature"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			const strongEvents = result.events.filter((e) => e.tier === ProgressTier.Strong)
			expect(strongEvents.length).toBe(3)
			expect(strongEvents.map((e) => e.type).sort()).toEqual([
				"file_created",
				"hypothesis_introduced",
				"state_transition",
			])
		})
	})

	// ---------------------------------------------------------------------------
	// 2. Medium Progress Tests
	// ---------------------------------------------------------------------------
	describe("Medium Progress", () => {
		it("should detect file_modified when existing file touched with modification tool", () => {
			const previousTurns = [createMockTurn("1", { filesTouched: ["a.ts"] })]
			const currentTurn = createMockTurn("2", {
				filesTouched: ["a.ts"],
				toolPattern: ["write_file"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "file_modified",
					tier: ProgressTier.Medium,
					details: "Previously seen file(s) touched with additional activity",
				}),
			)
		})

		it("should NOT detect file_modified when no previous turns exist", () => {
			const currentTurn = createMockTurn("1", {
				filesTouched: ["a.ts"],
				toolPattern: ["write_file"],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events.find((e) => e.type === "file_modified")).toBeUndefined()
		})

		it("should NOT detect file_modified when tool pattern contains only read/grep", () => {
			const previousTurns = [createMockTurn("1", { filesTouched: ["a.ts"] })]
			const currentTurn = createMockTurn("2", {
				filesTouched: ["a.ts"],
				toolPattern: ["read_file", "grep"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.events.find((e) => e.type === "file_modified")).toBeUndefined()
		})

		it("should NOT detect file_modified when no previously seen files are touched", () => {
			const previousTurns = [createMockTurn("1", { filesTouched: ["a.ts"] })]
			const currentTurn = createMockTurn("2", {
				filesTouched: ["b.ts"],
				toolPattern: ["write_file"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.events.find((e) => e.type === "file_modified")).toBeUndefined()
		})

		it("should detect evidence_collected when new conclusion appears with previous turns", () => {
			const previousTurns = [
				createMockTurn("1", { conclusions: ["error is null pointer"] }),
			]
			const currentTurn = createMockTurn("2", {
				conclusions: ["error is null pointer", "root cause found"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "evidence_collected",
					tier: ProgressTier.Medium,
					details: "New conclusion(s) not seen in previous turns",
				}),
			)
		})

		it("should NOT detect evidence_collected when there are no previous turns", () => {
			const currentTurn = createMockTurn("1", { conclusions: ["new conclusion"] })
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events.find((e) => e.type === "evidence_collected")).toBeUndefined()
		})

		it("should NOT detect evidence_collected when all conclusions were previously seen", () => {
			const previousTurns = [createMockTurn("1", { conclusions: ["c1", "c2"] })]
			const currentTurn = createMockTurn("2", { conclusions: ["c1", "c2"] })
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.events.find((e) => e.type === "evidence_collected")).toBeUndefined()
		})

		it("should detect test_activity when test tool used with different files", () => {
			const previousTurns = [createMockTurn("1", { filesTouched: ["src/app.ts"] })]
			const currentTurn = createMockTurn("2", {
				toolPattern: ["run_test"],
				filesTouched: ["src/app.test.ts"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "test_activity",
					tier: ProgressTier.Medium,
					details: "Test tool used with different files than previous turn",
				}),
			)
		})

		it("should NOT detect test_activity when files are same as previous turn", () => {
			const previousTurns = [
				createMockTurn("1", { filesTouched: ["src/app.test.ts"] }),
			]
			const currentTurn = createMockTurn("2", {
				toolPattern: ["run_test"],
				filesTouched: ["src/app.test.ts"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.events.find((e) => e.type === "test_activity")).toBeUndefined()
		})

		it("should NOT detect test_activity when there are no previous turns", () => {
			const currentTurn = createMockTurn("1", {
				toolPattern: ["run_test"],
				filesTouched: ["src/app.test.ts"],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events.find((e) => e.type === "test_activity")).toBeUndefined()
		})

		it("should detect multiple medium events in a single turn", () => {
			const previousTurns = [
				createMockTurn("1", {
					filesTouched: ["a.ts"],
					conclusions: ["c1"],
				}),
			]
			const currentTurn = createMockTurn("2", {
				filesTouched: ["a.ts"],
				conclusions: ["c1", "c2"],
				toolPattern: ["run_test"],
			})
			// test_activity needs different files from last previous turn
			const previousForTest = [
				createMockTurn("1", {
					filesTouched: ["a.ts"],
					conclusions: ["c1"],
				}),
			]
			const currentForActivity = createMockTurn("2", {
				filesTouched: ["a.ts", "b.test.ts"],
				conclusions: ["c1", "c2"],
				toolPattern: ["run_test"],
			})
			const result = detector.detectProgress(currentForActivity, previousForTest)
			const mediumEvents = result.events.filter((e) => e.tier === ProgressTier.Medium)
			expect(mediumEvents.length).toBe(3)
			expect(mediumEvents.map((e) => e.type).sort()).toEqual([
				"evidence_collected",
				"file_modified",
				"test_activity",
			])
		})
	})

	// ---------------------------------------------------------------------------
	// 3. Weak Progress Tests
	// ---------------------------------------------------------------------------
	describe("Weak Progress", () => {
		it("should detect repeated_inspection when tool pattern has only read/grep", () => {
			const currentTurn = createMockTurn("1", {
				toolPattern: ["read_file", "grep"],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "repeated_inspection",
					tier: ProgressTier.Weak,
					details: "Only read/grep operations in tool pattern",
				}),
			)
		})

		it("should detect repeated_inspection with a single read tool", () => {
			const currentTurn = createMockTurn("1", {
				toolPattern: ["read_file"],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "repeated_inspection",
					tier: ProgressTier.Weak,
				}),
			)
		})

		it("should detect repeated_inspection with a single grep tool", () => {
			const currentTurn = createMockTurn("1", {
				toolPattern: ["grep"],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "repeated_inspection",
					tier: ProgressTier.Weak,
				}),
			)
		})

		it("should NOT detect repeated_inspection when tool pattern is empty", () => {
			const currentTurn = createMockTurn("1", { toolPattern: [] })
			const result = detector.detectProgress(currentTurn, [])
			expect(
				result.events.find((e) => e.type === "repeated_inspection"),
			).toBeUndefined()
		})

		it("should NOT detect repeated_inspection when tool pattern has non-read/grep tools", () => {
			const currentTurn = createMockTurn("1", {
				toolPattern: ["read_file", "write_file"],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(
				result.events.find((e) => e.type === "repeated_inspection"),
			).toBeUndefined()
		})

		it("should detect minor_navigation when files are subset with no new content", () => {
			const previousTurns = [
				createMockTurn("1", { filesTouched: ["a.ts", "b.ts"] }),
			]
			const currentTurn = createMockTurn("2", {
				filesTouched: ["a.ts"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "minor_navigation",
					tier: ProgressTier.Weak,
					details:
						"Files touched are subset of previous files with no new hypotheses or conclusions",
				}),
			)
		})

		it("should NOT detect minor_navigation when filesTouched is empty", () => {
			const previousTurns = [
				createMockTurn("1", { filesTouched: ["a.ts", "b.ts"] }),
			]
			const currentTurn = createMockTurn("2", { filesTouched: [] })
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(
				result.events.find((e) => e.type === "minor_navigation"),
			).toBeUndefined()
		})

		it("should NOT detect minor_navigation when there is a new hypothesis", () => {
			const previousTurns = [
				createMockTurn("1", {
					filesTouched: ["a.ts", "b.ts"],
					hypotheses: ["h1"],
				}),
			]
			const currentTurn = createMockTurn("2", {
				filesTouched: ["a.ts"],
				hypotheses: ["h1", "h2"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(
				result.events.find((e) => e.type === "minor_navigation"),
			).toBeUndefined()
		})

		it("should NOT detect minor_navigation when there is a new conclusion", () => {
			const previousTurns = [
				createMockTurn("1", {
					filesTouched: ["a.ts", "b.ts"],
					conclusions: ["c1"],
				}),
			]
			const currentTurn = createMockTurn("2", {
				filesTouched: ["a.ts"],
				conclusions: ["c1", "c2"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(
				result.events.find((e) => e.type === "minor_navigation"),
			).toBeUndefined()
		})

		it("should NOT detect minor_navigation when files are not a subset", () => {
			const previousTurns = [createMockTurn("1", { filesTouched: ["a.ts"] })]
			const currentTurn = createMockTurn("2", { filesTouched: ["b.ts"] })
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(
				result.events.find((e) => e.type === "minor_navigation"),
			).toBeUndefined()
		})
	})

	// ---------------------------------------------------------------------------
	// 4. No Progress Tests
	// ---------------------------------------------------------------------------
	describe("No Progress", () => {
		it("should return no events and 0.0 score for empty previous turns with no strong signals", () => {
			const currentTurn = createMockTurn("1", {
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events).toHaveLength(0)
			expect(result.score).toBe(0.0)
		})

		it("should return no events and 0.0 score for a completely empty turn", () => {
			const currentTurn = createMockTurn("1")
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events).toHaveLength(0)
			expect(result.score).toBe(0.0)
		})

		it("should return no events and 0.0 score when turn has no detectable progress indicators", () => {
			// A turn that touches only new files (no baseline), has no state transitions
			// with completed/resolved, no tool pattern, and no hypotheses/conclusions
			const currentTurn = createMockTurn("1", {
				filesTouched: ["x.ts"],
				stateTransitions: ["in_progress"],
			})
			const result = detector.detectProgress(currentTurn, [])
			// No previous turns → no file_created, no hypothesis_introduced, no evidence_collected
			// No completed/resolved in state transitions
			// No tool pattern → no repeated_inspection, no file_modified
			// Files present but no previous → no minor_navigation
			expect(result.events).toHaveLength(0)
			expect(result.score).toBe(0.0)
		})

		it("should return only file_created when current turn has new files but no other progress indicators", () => {
			// When current turn has all new files (no overlap with previous), no new
			// hypotheses/conclusions, no completed/resolved state, and no tool pattern
			const previousTurns = [
				createMockTurn("1", {
					filesTouched: ["a.ts"],
					hypotheses: ["h1"],
					conclusions: ["c1"],
				}),
			]
			const currentTurn = createMockTurn("2", {
				filesTouched: ["b.ts"],
				hypotheses: ["h1"],
				conclusions: ["c1"],
				stateTransitions: ["in_progress"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			// file_created: b.ts is new → strong (this will fire)
			// No tool pattern → no repeated_inspection, no file_modified, no test_activity
			// No new hypotheses/conclusions → no hypothesis_introduced, no evidence_collected
			// No completed/resolved → no state_transition
			// b.ts not in seen files → no minor_navigation
			expect(result.events).toHaveLength(1)
			expect(result.events[0].type).toBe("file_created")
		})

		it("should return no events when only state transitions without completed/resolved", () => {
			const currentTurn = createMockTurn("1", {
				stateTransitions: ["started", "in_progress", "pending"],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events).toHaveLength(0)
			expect(result.score).toBe(0.0)
		})
	})

	// ---------------------------------------------------------------------------
	// 5. Scoring Tests
	// ---------------------------------------------------------------------------
	describe("Scoring", () => {
		it("should return 0.0 when no progress detected", () => {
			const currentTurn = createMockTurn("1", { filesTouched: ["a.ts"] })
			const result = detector.detectProgress(currentTurn, [])
			expect(result.score).toBe(0.0)
		})

		it("should return ~0.33 for a single strong event (1.0 / 3.0)", () => {
			const currentTurn = createMockTurn("1", {
				stateTransitions: ["task_completed:X"],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(result.score).toBeCloseTo(0.33, 2)
		})

		it("should return 1.0 when 3 strong events detected (capped)", () => {
			const previousTurns = [
				createMockTurn("1", {
					filesTouched: ["a.ts"],
					hypotheses: ["h1"],
				}),
			]
			const currentTurn = createMockTurn("2", {
				filesTouched: ["a.ts", "b.ts"],
				hypotheses: ["h1", "h2"],
				stateTransitions: ["todo_completed:X"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.score).toBe(1.0)
		})

		it("should cap score at 1.0 when raw score exceeds 3.0", () => {
			const previousTurns = [
				createMockTurn("1", {
					filesTouched: ["a.ts"],
					hypotheses: ["h1"],
				}),
			]
			const currentTurn = createMockTurn("2", {
				filesTouched: ["a.ts", "b.ts", "c.ts"],
				hypotheses: ["h1", "h2", "h3"],
				stateTransitions: ["task_completed:X", "bug_resolved:Y"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			// 3 strong events = raw 3.0, score = min(3.0/3.0, 1.0) = 1.0
			expect(result.score).toBe(1.0)
		})

		it("should return 0.5 for 1 strong + 1 medium event ((1.0 + 0.5) / 3.0)", () => {
			const previousTurns = [
				createMockTurn("1", {
					filesTouched: ["a.ts"],
					conclusions: ["c1"],
				}),
			]
			const currentTurn = createMockTurn("2", {
				filesTouched: ["a.ts", "b.ts"],
				conclusions: ["c1", "c2"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			// file_created (strong=1.0) + evidence_collected (medium=0.5) = 1.5 / 3.0 = 0.5
			expect(result.score).toBe(0.5)
		})

		it("should return ~0.17 for a single medium event (0.5 / 3.0)", () => {
			const currentTurn = createMockTurn("1", {
				stateTransitions: ["task_completed:X"],
			})
			// state_transition is strong, so use a medium-only scenario
			const previousTurns = [
				createMockTurn("1", { conclusions: ["c1"] }),
			]
			const mediumTurn = createMockTurn("2", {
				conclusions: ["c1", "c2"],
			})
			const result = detector.detectProgress(mediumTurn, previousTurns)
			// evidence_collected (medium=0.5) = 0.5 / 3.0 ≈ 0.1667
			expect(result.score).toBeCloseTo(0.17, 2)
		})

		it("should return ~0.07 for a single weak event (0.2 / 3.0)", () => {
			const currentTurn = createMockTurn("1", {
				toolPattern: ["read_file", "grep"],
			})
			const result = detector.detectProgress(currentTurn, [])
			// repeated_inspection (weak=0.2) = 0.2 / 3.0 ≈ 0.0667
			expect(result.score).toBeCloseTo(0.07, 2)
		})

		it("should return ~0.13 for 2 weak events (0.4 / 3.0)", () => {
			const previousTurns = [createMockTurn("1", { filesTouched: ["a.ts"] })]
			const currentTurn = createMockTurn("2", {
				toolPattern: ["read_file", "grep"],
				filesTouched: ["a.ts"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			// repeated_inspection (0.2) + minor_navigation (0.2) = 0.4 / 3.0 ≈ 0.1333
			expect(result.score).toBeCloseTo(0.13, 2)
		})

		it("should correctly score mixed strong + medium + weak events", () => {
			const previousTurns = [
				createMockTurn("1", {
					filesTouched: ["a.ts"],
					conclusions: ["c1"],
				}),
			]
			const currentTurn = createMockTurn("2", {
				filesTouched: ["a.ts"],
				conclusions: ["c1", "c2"],
				toolPattern: ["read_file", "grep"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			// file_modified: a.ts is seen but tools are only read/grep => no file_modified
			// evidence_collected: c2 is new => medium 0.5
			// repeated_inspection: all read/grep => weak 0.2
			// minor_navigation: a.ts is subset, no new hypotheses, c2 is new => no minor_navigation
			// raw = 0.5 + 0.2 = 0.7 / 3.0 ≈ 0.2333
			expect(result.score).toBeCloseTo(0.23, 2)
		})

		it("should correctly score 3 medium events plus a strong file_created event", () => {
		// b.test.ts is new → file_created (strong=1.0)
		// a.ts seen + run_test (not read/grep) → file_modified (medium=0.5)
		// c2 is new → evidence_collected (medium=0.5)
		// run_test + files differ from last previous → test_activity (medium=0.5)
		// raw = 1.0 + 0.5 + 0.5 + 0.5 = 2.5 / 3.0 ≈ 0.8333
		const previousTurns = [
			createMockTurn("1", {
				filesTouched: ["a.ts"],
				conclusions: ["c1"],
			}),
		]
		const currentTurn = createMockTurn("2", {
			filesTouched: ["a.ts", "b.test.ts"],
			conclusions: ["c1", "c2"],
			toolPattern: ["run_test"],
		})
		const result = detector.detectProgress(currentTurn, previousTurns)
		expect(result.score).toBeCloseTo(0.83, 2)
	})
})

	// ---------------------------------------------------------------------------
	// 6. Edge Cases
	// ---------------------------------------------------------------------------
	describe("Edge Cases", () => {
		it("should handle empty previousTurns array", () => {
			const currentTurn = createMockTurn("1", {
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(result.score).toBe(0.0)
			expect(result.events).toHaveLength(0)
		})

		it("should handle empty arrays in both current and previous turns", () => {
			const previousTurns = [
				createMockTurn("1", {
					filesTouched: [],
					hypotheses: [],
					conclusions: [],
				}),
			]
			const currentTurn = createMockTurn("2", {
				filesTouched: [],
				hypotheses: [],
				conclusions: [],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.score).toBe(0.0)
			expect(result.events).toHaveLength(0)
		})

		it("should handle turn with all empty fields", () => {
			const currentTurn = createMockTurn("1")
			const result = detector.detectProgress(currentTurn, [])
			expect(result.score).toBe(0.0)
			expect(result.events).toHaveLength(0)
		})

		it("should deduplicate events — each event type appears at most once per detection", () => {
			const previousTurns = [
				createMockTurn("1", {
					filesTouched: ["a.ts"],
					hypotheses: ["h1"],
				}),
			]
			const currentTurn = createMockTurn("2", {
				filesTouched: ["a.ts", "b.ts", "c.ts", "d.ts"],
				hypotheses: ["h1", "h2", "h3", "h4"],
				stateTransitions: ["t_completed:1", "t_resolved:2"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			const eventTypes = result.events.map((e) => e.type)
			const uniqueTypes = [...new Set(eventTypes)]
			// Each type should appear exactly once
			expect(eventTypes.length).toBe(uniqueTypes.length)
		})

		it("should match hypotheses case-insensitively", () => {
			const previousTurns = [
				createMockTurn("1", { hypotheses: ["The Bug Is In Auth"] }),
			]
			const currentTurn = createMockTurn("2", {
				hypotheses: ["the bug is in auth", "NEW hypothesis"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			// "the bug is in auth" matches "The Bug Is In Auth" after normalization
			// Only "NEW hypothesis" is truly new
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "hypothesis_introduced",
					tier: ProgressTier.Strong,
				}),
			)
		})

		it("should match conclusions case-insensitively", () => {
			const previousTurns = [
				createMockTurn("1", { conclusions: ["Error Is Null Pointer"] }),
			]
			const currentTurn = createMockTurn("2", {
				conclusions: ["error is null pointer", "Root Cause Found"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "evidence_collected",
					tier: ProgressTier.Medium,
				}),
			)
		})

		it("should match hypotheses with extra whitespace", () => {
			const previousTurns = [
				createMockTurn("1", { hypotheses: ["  bug in auth  "] }),
			]
			const currentTurn = createMockTurn("2", {
				hypotheses: ["bug in auth", "new hyp"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			const hypEvents = result.events.filter(
				(e) => e.type === "hypothesis_introduced",
			)
			expect(hypEvents.length).toBe(1)
		})

		it("should match conclusions with extra whitespace", () => {
			const previousTurns = [
				createMockTurn("1", { conclusions: ["  error found  "] }),
			]
			const currentTurn = createMockTurn("2", {
				conclusions: ["error found", "new conclusion"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			const evEvents = result.events.filter(
				(e) => e.type === "evidence_collected",
			)
			expect(evEvents.length).toBe(1)
		})

		it("should accumulate seen data across multiple previous turns", () => {
			const previousTurns = [
				createMockTurn("1", {
					filesTouched: ["a.ts"],
					hypotheses: ["h1"],
					conclusions: ["c1"],
				}),
				createMockTurn("2", {
					filesTouched: ["b.ts"],
					hypotheses: ["h2"],
					conclusions: ["c2"],
				}),
			]
			const currentTurn = createMockTurn("3", {
				filesTouched: ["a.ts", "b.ts"],
				hypotheses: ["h1", "h2"],
				conclusions: ["c1", "c2"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			// No new files, hypotheses, or conclusions — only minor_navigation possible
			expect(result.events.find((e) => e.type === "file_created")).toBeUndefined()
			expect(
				result.events.find((e) => e.type === "hypothesis_introduced"),
			).toBeUndefined()
			expect(
				result.events.find((e) => e.type === "evidence_collected"),
			).toBeUndefined()
		})

		it("should detect progress against the union of all previous turns", () => {
			const previousTurns = [
				createMockTurn("1", { filesTouched: ["a.ts"] }),
				createMockTurn("2", { filesTouched: ["b.ts"] }),
			]
			const currentTurn = createMockTurn("3", {
				filesTouched: ["a.ts", "b.ts", "c.ts"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "file_created",
					tier: ProgressTier.Strong,
				}),
			)
		})

		it("should handle state transitions with mixed completed/resolved and other states", () => {
			const currentTurn = createMockTurn("1", {
				stateTransitions: [
					"started",
					"todo_completed:fix-bug",
					"in_progress",
				],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "state_transition",
					tier: ProgressTier.Strong,
				}),
			)
		})

		it("should use current turn timestamp in all events", () => {
			const currentTurn = createMockTurn("1", {
				timestamp: 42000,
				stateTransitions: ["task_completed:X"],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events.length).toBeGreaterThan(0)
			for (const event of result.events) {
				expect(event.timestamp).toBe(42000)
			}
		})

		it("should handle file_modified with mixed read and write tools on seen file", () => {
			const previousTurns = [createMockTurn("1", { filesTouched: ["a.ts"] })]
			const currentTurn = createMockTurn("2", {
				filesTouched: ["a.ts"],
				toolPattern: ["read_file", "write_file"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			// write_file is not read/grep, so hasModificationTool = true
			// a.ts was seen, so hasSeenFile = true
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "file_modified",
					tier: ProgressTier.Medium,
				}),
			)
		})

		it("should NOT detect file_modified when tool pattern is empty", () => {
			const previousTurns = [createMockTurn("1", { filesTouched: ["a.ts"] })]
			const currentTurn = createMockTurn("2", {
				filesTouched: ["a.ts"],
				toolPattern: [],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.events.find((e) => e.type === "file_modified")).toBeUndefined()
		})

		it("should handle test_activity detection with case-insensitive 'test' match", () => {
			const previousTurns = [
				createMockTurn("1", { filesTouched: ["src/app.ts"] }),
			]
			const currentTurn = createMockTurn("2", {
				toolPattern: ["run_TEST"],
				filesTouched: ["src/app.test.ts"],
			})
			const result = detector.detectProgress(currentTurn, previousTurns)
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "test_activity",
					tier: ProgressTier.Medium,
				}),
			)
		})

		it("should detect repeated_inspection with case-insensitive read/grep match", () => {
			const currentTurn = createMockTurn("1", {
				toolPattern: ["READ_FILE", "GREP"],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events).toContainEqual(
				expect.objectContaining({
					type: "repeated_inspection",
					tier: ProgressTier.Weak,
				}),
			)
		})
	})

	// ---------------------------------------------------------------------------
	// 7. Return Structure Tests
	// ---------------------------------------------------------------------------
	describe("Return Structure", () => {
		it("should return both events and score", () => {
			const currentTurn = createMockTurn("1", {
				stateTransitions: ["task_completed:X"],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(result).toHaveProperty("events")
			expect(result).toHaveProperty("score")
			expect(Array.isArray(result.events)).toBe(true)
			expect(typeof result.score).toBe("number")
		})

		it("should always return score between 0.0 and 1.0", () => {
			const scenarios = [
				{ current: createMockTurn("1"), previous: [] },
				{
					current: createMockTurn("1", {
						stateTransitions: ["completed:X"],
					}),
					previous: [],
				},
				{
					current: createMockTurn("1", {
						filesTouched: ["a.ts", "b.ts", "c.ts"],
						hypotheses: ["h1", "h2", "h3"],
						stateTransitions: ["c:X", "r:Y"],
						toolPattern: ["read_file"],
					}),
					previous: [
						createMockTurn("0", {
							filesTouched: ["x.ts"],
							hypotheses: ["old"],
						}),
					],
				},
			]
			for (const { current, previous } of scenarios) {
				const result = detector.detectProgress(current, previous)
				expect(result.score).toBeGreaterThanOrEqual(0.0)
				expect(result.score).toBeLessThanOrEqual(1.0)
			}
		})

		it("should return events with correct shape", () => {
			const currentTurn = createMockTurn("1", {
				timestamp: 9999,
				stateTransitions: ["task_completed:X"],
			})
			const result = detector.detectProgress(currentTurn, [])
			expect(result.events.length).toBeGreaterThan(0)
			for (const event of result.events) {
				expect(event).toHaveProperty("type")
				expect(event).toHaveProperty("tier")
				expect(event).toHaveProperty("details")
				expect(event).toHaveProperty("timestamp")
				expect(typeof event.type).toBe("string")
				expect(Object.values(ProgressTier)).toContain(event.tier)
				expect(typeof event.details).toBe("string")
				expect(event.timestamp).toBe(9999)
			}
		})
	})
})
