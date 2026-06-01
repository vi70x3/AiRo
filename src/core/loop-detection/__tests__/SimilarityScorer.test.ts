import { describe, it, expect } from "vitest"
import SimilarityScorer from "../SimilarityScorer"
import { ReasoningTurn } from "../../../../packages/types/src/loop-detection"

describe("SimilarityScorer", () => {
	const scorer = new SimilarityScorer()

	const createTurn = (overrides: Partial<ReasoningTurn> = {}): ReasoningTurn => ({
		id: "turn-1",
		toolPattern: [],
		filesTouched: [],
		hypotheses: [],
		conclusions: [],
		stateTransitions: [],
		timestamp: 1000,
		...overrides,
	})

	describe("Identical Turns", () => {
		it("should return 1.0 when all fields are identical", () => {
			const turnA = createTurn({
				toolPattern: ["read_file", "grep", "write_file"],
				filesTouched: ["src/app.ts", "src/utils.ts"],
				hypotheses: ["null pointer in auth"],
				conclusions: ["bug is in login handler"],
				stateTransitions: ["todo_completed:fix-auth"],
			})
			const turnB = { ...turnA, id: "turn-2" }
			expect(scorer.computeSimilarity(turnA, turnB)).toBe(1.0)
		})

		it("should return 1.0 for identical turns with single-element arrays", () => {
			const turnA = createTurn({
				toolPattern: ["read_file"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			const turnB = { ...turnA, id: "turn-2" }
			expect(scorer.computeSimilarity(turnA, turnB)).toBe(1.0)
		})

		it("should return 0.5 for two completely empty turns (all neutral)", () => {
			const turnA = createTurn()
			const turnB = createTurn({ id: "turn-2" })
			// All five signals return 0.5 (neutral for empty-empty)
			// 0.5 * (0.35 + 0.25 + 0.20 + 0.10 + 0.10) = 0.5
			expect(scorer.computeSimilarity(turnA, turnB)).toBe(0.5)
		})
	})

	describe("Completely Different Turns", () => {
		it("should return approximately 0.0 when no fields overlap", () => {
			const turnA = createTurn({
				toolPattern: ["read_file"],
				filesTouched: ["src/a.ts"],
				hypotheses: ["hypothesis A"],
				conclusions: ["conclusion A"],
				stateTransitions: ["state_A"],
			})
			const turnB = createTurn({
				id: "turn-2",
				toolPattern: ["write_file"],
				filesTouched: ["src/b.ts"],
				hypotheses: ["hypothesis B"],
				conclusions: ["conclusion B"],
				stateTransitions: ["state_B"],
			})
			const score = scorer.computeSimilarity(turnA, turnB)
			expect(score).toBe(0.0)
		})

		it("should return 0.0 when one turn is empty and the other has data", () => {
			const turnA = createTurn()
			const turnB = createTurn({
				id: "turn-2",
				toolPattern: ["read_file", "grep"],
				filesTouched: ["src/app.ts"],
				hypotheses: ["bug found"],
				conclusions: ["fix applied"],
				stateTransitions: ["error_resolved:crash"],
			})
			const score = scorer.computeSimilarity(turnA, turnB)
			// tool: 0 (one empty), files: 0 (one empty), hypotheses: 0, conclusions: 0, state: 0
			expect(score).toBe(0.0)
		})
	})

	describe("Partial Overlap", () => {
		it("should return a score between 0 and 1 when only tools overlap", () => {
			const turnA = createTurn({
				toolPattern: ["read_file", "grep", "write_file"],
				filesTouched: ["src/a.ts"],
				hypotheses: ["hyp A"],
				conclusions: ["concl A"],
				stateTransitions: ["state_A"],
			})
			const turnB = createTurn({
				id: "turn-2",
				toolPattern: ["read_file", "grep", "write_file"],
				filesTouched: ["src/b.ts"],
				hypotheses: ["hyp B"],
				conclusions: ["concl B"],
				stateTransitions: ["state_B"],
			})
			const score = scorer.computeSimilarity(turnA, turnB)
			// tool: 1.0 * 0.35 = 0.35, rest are 0
			expect(score).toBeCloseTo(0.35, 5)
		})

		it("should return a score between 0 and 1 when only files overlap", () => {
			const turnA = createTurn({
				toolPattern: ["read_file"],
				filesTouched: ["src/a.ts", "src/b.ts"],
				hypotheses: ["hyp A"],
				conclusions: ["concl A"],
				stateTransitions: ["state_A"],
			})
			const turnB = createTurn({
				id: "turn-2",
				toolPattern: ["write_file"],
				filesTouched: ["src/a.ts", "src/b.ts"],
				hypotheses: ["hyp B"],
				conclusions: ["concl B"],
				stateTransitions: ["state_B"],
			})
			const score = scorer.computeSimilarity(turnA, turnB)
			// files: 1.0 * 0.25 = 0.25, rest are 0
			expect(score).toBeCloseTo(0.25, 5)
		})

		it("should return a score between 0 and 1 when only hypotheses overlap", () => {
			const turnA = createTurn({
				toolPattern: ["read_file"],
				filesTouched: ["src/a.ts"],
				hypotheses: ["same hypothesis"],
				conclusions: ["concl A"],
				stateTransitions: ["state_A"],
			})
			const turnB = createTurn({
				id: "turn-2",
				toolPattern: ["write_file"],
				filesTouched: ["src/b.ts"],
				hypotheses: ["same hypothesis"],
				conclusions: ["concl B"],
				stateTransitions: ["state_B"],
			})
			const score = scorer.computeSimilarity(turnA, turnB)
			// hypotheses: 1.0 * 0.20 = 0.20, rest are 0
			expect(score).toBeCloseTo(0.20, 5)
		})

		it("should return a score between 0 and 1 when only conclusions overlap", () => {
			const turnA = createTurn({
				toolPattern: ["read_file"],
				filesTouched: ["src/a.ts"],
				hypotheses: ["hyp A"],
				conclusions: ["same conclusion"],
				stateTransitions: ["state_A"],
			})
			const turnB = createTurn({
				id: "turn-2",
				toolPattern: ["write_file"],
				filesTouched: ["src/b.ts"],
				hypotheses: ["hyp B"],
				conclusions: ["same conclusion"],
				stateTransitions: ["state_B"],
			})
			const score = scorer.computeSimilarity(turnA, turnB)
			// conclusions: 1.0 * 0.10 = 0.10, rest are 0
			expect(score).toBeCloseTo(0.10, 5)
		})

		it("should return a score between 0 and 1 when only state transitions overlap", () => {
			const turnA = createTurn({
				toolPattern: ["read_file"],
				filesTouched: ["src/a.ts"],
				hypotheses: ["hyp A"],
				conclusions: ["concl A"],
				stateTransitions: ["todo_completed:X"],
			})
			const turnB = createTurn({
				id: "turn-2",
				toolPattern: ["write_file"],
				filesTouched: ["src/b.ts"],
				hypotheses: ["hyp B"],
				conclusions: ["concl B"],
				stateTransitions: ["todo_completed:X"],
			})
			const score = scorer.computeSimilarity(turnA, turnB)
			// state: 1.0 * 0.10 = 0.10, rest are 0
			expect(score).toBeCloseTo(0.10, 5)
		})

		it("should combine multiple partial overlaps correctly", () => {
			const turnA = createTurn({
				toolPattern: ["read_file", "grep"],
				filesTouched: ["src/a.ts"],
				hypotheses: ["hyp A", "shared hyp"],
				conclusions: ["concl A"],
				stateTransitions: ["state_A"],
			})
			const turnB = createTurn({
				id: "turn-2",
				toolPattern: ["read_file", "write_file"],
				filesTouched: ["src/b.ts"],
				hypotheses: ["hyp B", "shared hyp"],
				conclusions: ["concl B"],
				stateTransitions: ["state_B"],
			})
			const score = scorer.computeSimilarity(turnA, turnB)
			// tool: LCS=["read_file"] => 2*1/(2+2) = 0.5 => 0.5 * 0.35 = 0.175
			// files: no overlap => 0 * 0.25 = 0
			// hypotheses: intersection=1, union=3 => 1/3 * 0.20 ≈ 0.06667
			// conclusions: no overlap => 0 * 0.10 = 0
			// state: no overlap => 0 * 0.10 = 0
			const expected = 0.5 * 0.35 + (1 / 3) * 0.2
			expect(score).toBeCloseTo(expected, 5)
		})
	})

	describe("Tool Pattern Similarity", () => {
		it("should give high tool contribution for identical patterns", () => {
			const turnA = createTurn({ toolPattern: ["read_file", "grep", "write_file"] })
			const turnB = createTurn({ id: "turn-2", toolPattern: ["read_file", "grep", "write_file"] })
			const score = scorer.computeSimilarity(turnA, turnB)
			// tool: 1.0 * 0.35 = 0.35, rest neutral (0.5 each for empty-empty)
			// files: 0.5 * 0.25 = 0.125
			// hypotheses: 0.5 * 0.20 = 0.10
			// conclusions: 0.5 * 0.10 = 0.05
			// state: 0.5 * 0.10 = 0.05
			// total = 0.35 + 0.125 + 0.10 + 0.05 + 0.05 = 0.675
			expect(score).toBeCloseTo(0.675, 5)
		})

		it("should give low tool contribution for completely different patterns", () => {
			const turnA = createTurn({ toolPattern: ["read_file", "grep"] })
			const turnB = createTurn({ id: "turn-2", toolPattern: ["write_file", "run_test"] })
			const score = scorer.computeSimilarity(turnA, turnB)
			// tool: LCS=0 => 0 * 0.35 = 0
			// rest neutral: 0.5 * (0.25 + 0.20 + 0.10 + 0.10) = 0.325
			expect(score).toBeCloseTo(0.325, 5)
		})

		it("should handle partial overlap via LCS", () => {
			const turnA = createTurn({ toolPattern: ["read_file", "grep", "write_file"] })
			const turnB = createTurn({ id: "turn-2", toolPattern: ["read_file", "write_file"] })
			const score = scorer.computeSimilarity(turnA, turnB)
			// LCS = ["read_file", "write_file"] => length 2
			// tool similarity = 2*2 / (3+2) = 4/5 = 0.8
			// tool contribution = 0.8 * 0.35 = 0.28
			// rest neutral: 0.5 * 0.65 = 0.325
			// total = 0.28 + 0.325 = 0.605
			expect(score).toBeCloseTo(0.605, 5)
		})

		it("should return neutral (0.5) when both tool patterns are empty", () => {
			const turnA = createTurn()
			const turnB = createTurn({ id: "turn-2" })
			// All signals are neutral 0.5, weighted sum = 0.5
			const score = scorer.computeSimilarity(turnA, turnB)
			expect(score).toBe(0.5)
		})

		it("should return 0 for tool similarity when one pattern is empty and the other is not", () => {
			const turnA = createTurn({ toolPattern: ["read_file"] })
			const turnB = createTurn({ id: "turn-2" })
			const score = scorer.computeSimilarity(turnA, turnB)
			// tool: 0 * 0.35 = 0
			// rest neutral: 0.5 * 0.65 = 0.325
			expect(score).toBeCloseTo(0.325, 5)
		})

		it("should handle LCS with interleaved elements", () => {
			const turnA = createTurn({ toolPattern: ["a", "b", "c", "d"] })
			const turnB = createTurn({ id: "turn-2", toolPattern: ["a", "c", "d"] })
			const score = scorer.computeSimilarity(turnA, turnB)
			// LCS = ["a", "c", "d"] => length 3
			// tool similarity = 2*3 / (4+3) = 6/7 ≈ 0.85714
			// tool contribution = 6/7 * 0.35 = 0.30
			// rest neutral: 0.5 * 0.65 = 0.325
			const expected = (6 / 7) * 0.35 + 0.325
			expect(score).toBeCloseTo(expected, 5)
		})

		it("should handle LCS where order matters (not substring)", () => {
			const turnA = createTurn({ toolPattern: ["a", "b", "c"] })
			const turnB = createTurn({ id: "turn-2", toolPattern: ["c", "b", "a"] })
			const score = scorer.computeSimilarity(turnA, turnB)
			// LCS = ["b"] or ["a"] or ["c"] => length 1
			// tool similarity = 2*1 / (3+3) = 2/6 = 1/3
			// tool contribution = 1/3 * 0.35 ≈ 0.11667
			// rest neutral: 0.5 * 0.65 = 0.325
			const expected = (1 / 3) * 0.35 + 0.325
			expect(score).toBeCloseTo(expected, 5)
		})
	})

	describe("File Similarity", () => {
		it("should give high file contribution for identical file sets", () => {
			const turnA = createTurn({ filesTouched: ["src/a.ts", "src/b.ts"] })
			const turnB = createTurn({ id: "turn-2", filesTouched: ["src/a.ts", "src/b.ts"] })
			const score = scorer.computeSimilarity(turnA, turnB)
			// files: 1.0 * 0.25 = 0.25
			// rest neutral: 0.5 * 0.75 = 0.375
			expect(score).toBeCloseTo(0.625, 5)
		})

		it("should give 0 file contribution for no overlap", () => {
			const turnA = createTurn({ filesTouched: ["src/a.ts"] })
			const turnB = createTurn({ id: "turn-2", filesTouched: ["src/b.ts"] })
			const score = scorer.computeSimilarity(turnA, turnB)
			// files: 0 * 0.25 = 0
			// rest neutral: 0.5 * 0.75 = 0.375
			expect(score).toBeCloseTo(0.375, 5)
		})

		it("should give proportional score for partial overlap", () => {
			const turnA = createTurn({ filesTouched: ["a.ts", "b.ts", "c.ts"] })
			const turnB = createTurn({ id: "turn-2", filesTouched: ["b.ts", "c.ts", "d.ts"] })
			const score = scorer.computeSimilarity(turnA, turnB)
			// intersection = {b.ts, c.ts} => size 2
			// union = {a.ts, b.ts, c.ts, d.ts} => size 4
			// files: 2/4 = 0.5 * 0.25 = 0.125
			// rest neutral: 0.5 * 0.75 = 0.375
			expect(score).toBeCloseTo(0.5, 5)
		})

		it("should return neutral (0.5) when both file sets are empty", () => {
			const turnA = createTurn()
			const turnB = createTurn({ id: "turn-2" })
			const score = scorer.computeSimilarity(turnA, turnB)
			expect(score).toBe(0.5)
		})

		it("should handle duplicate file paths by treating them as a set", () => {
			const turnA = createTurn({ filesTouched: ["a.ts", "a.ts", "b.ts"] })
			const turnB = createTurn({ id: "turn-2", filesTouched: ["a.ts", "b.ts"] })
			const score = scorer.computeSimilarity(turnA, turnB)
			// After dedup: both are {a.ts, b.ts}
			// files: 1.0 * 0.25 = 0.25
			// rest neutral: 0.5 * 0.75 = 0.375
			expect(score).toBeCloseTo(0.625, 5)
		})

		it("should return 0 for file similarity when one is empty and the other is not", () => {
			const turnA = createTurn({ filesTouched: ["a.ts"] })
			const turnB = createTurn({ id: "turn-2" })
			const score = scorer.computeSimilarity(turnA, turnB)
			// files: 0 * 0.25 = 0
			// rest neutral: 0.5 * 0.75 = 0.375
			expect(score).toBeCloseTo(0.375, 5)
		})
	})

	describe("Hypothesis Similarity", () => {
		it("should give high score for identical hypotheses", () => {
			const turnA = createTurn({ hypotheses: ["null pointer in auth"] })
			const turnB = createTurn({ id: "turn-2", hypotheses: ["null pointer in auth"] })
			const score = scorer.computeSimilarity(turnA, turnB)
			// hypotheses: 1.0 * 0.20 = 0.20
			// rest neutral: 0.5 * 0.80 = 0.40
			expect(score).toBeCloseTo(0.60, 5)
		})

		it("should match case-insensitively", () => {
			const turnA = createTurn({ hypotheses: ["Bug in Auth"] })
			const turnB = createTurn({ id: "turn-2", hypotheses: ["bug in auth"] })
			const score = scorer.computeSimilarity(turnA, turnB)
			// After normalization, both are "bug in auth"
			// hypotheses: 1.0 * 0.20 = 0.20
			// rest neutral: 0.5 * 0.80 = 0.40
			expect(score).toBeCloseTo(0.60, 5)
		})

		it("should normalize whitespace", () => {
			const turnA = createTurn({ hypotheses: ["  bug in auth  "] })
			const turnB = createTurn({ id: "turn-2", hypotheses: ["bug in auth"] })
			const score = scorer.computeSimilarity(turnA, turnB)
			// After trim, both are "bug in auth"
			expect(score).toBeCloseTo(0.60, 5)
		})

		it("should handle mixed case and whitespace", () => {
			const turnA = createTurn({ hypotheses: ["  BUG in AUTH  "] })
			const turnB = createTurn({ id: "turn-2", hypotheses: ["bug in auth"] })
			const score = scorer.computeSimilarity(turnA, turnB)
			expect(score).toBeCloseTo(0.60, 5)
		})

		it("should give low score for no overlap", () => {
			const turnA = createTurn({ hypotheses: ["hypothesis A"] })
			const turnB = createTurn({ id: "turn-2", hypotheses: ["hypothesis B"] })
			const score = scorer.computeSimilarity(turnA, turnB)
			// hypotheses: 0 * 0.20 = 0
			// rest neutral: 0.5 * 0.80 = 0.40
			expect(score).toBeCloseTo(0.40, 5)
		})

		it("should handle partial overlap with normalization", () => {
			const turnA = createTurn({ hypotheses: ["Bug Found", "Error in DB"] })
			const turnB = createTurn({ id: "turn-2", hypotheses: ["bug found", "Issue in API"] })
			const score = scorer.computeSimilarity(turnA, turnB)
			// normalized A: ["bug found", "error in db"]
			// normalized B: ["bug found", "issue in api"]
			// intersection = 1, union = 3 => 1/3
			// hypotheses: 1/3 * 0.20 ≈ 0.06667
			// rest neutral: 0.5 * 0.80 = 0.40
			const expected = (1 / 3) * 0.2 + 0.4
			expect(score).toBeCloseTo(expected, 5)
		})

		it("should return neutral (0.5) when both hypothesis arrays are empty", () => {
			const turnA = createTurn()
			const turnB = createTurn({ id: "turn-2" })
			const score = scorer.computeSimilarity(turnA, turnB)
			expect(score).toBe(0.5)
		})
	})

	describe("Edge Cases", () => {
		it("should handle both turns completely empty", () => {
			const turnA = createTurn()
			const turnB = createTurn({ id: "turn-2" })
			const score = scorer.computeSimilarity(turnA, turnB)
			// All five signals return 0.5 (neutral)
			// 0.5 * 1.0 = 0.5
			expect(score).toBe(0.5)
		})

		it("should handle one turn empty and one with data", () => {
			const turnA = createTurn()
			const turnB = createTurn({
				id: "turn-2",
				toolPattern: ["read_file"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			const score = scorer.computeSimilarity(turnA, turnB)
			// All signals: one empty, one non-empty => 0 for each
			expect(score).toBe(0.0)
		})

		it("should handle single-element arrays", () => {
			const turnA = createTurn({
				toolPattern: ["read_file"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			const turnB = createTurn({
				id: "turn-2",
				toolPattern: ["read_file"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			expect(scorer.computeSimilarity(turnA, turnB)).toBe(1.0)
		})

		it("should handle single-element arrays with no overlap", () => {
			const turnA = createTurn({
				toolPattern: ["read_file"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			const turnB = createTurn({
				id: "turn-2",
				toolPattern: ["write_file"],
				filesTouched: ["b.ts"],
				hypotheses: ["h2"],
				conclusions: ["c2"],
				stateTransitions: ["s2"],
			})
			expect(scorer.computeSimilarity(turnA, turnB)).toBe(0.0)
		})

		it("should handle very long arrays without performance issues", () => {
			const longToolsA = Array.from({ length: 500 }, (_, i) => `tool_${i}`)
			const longToolsB = Array.from({ length: 500 }, (_, i) => `tool_${i}`)
			const turnA = createTurn({ toolPattern: longToolsA })
			const turnB = createTurn({ id: "turn-2", toolPattern: longToolsB })
			const start = performance.now()
			const score = scorer.computeSimilarity(turnA, turnB)
			const elapsed = performance.now() - start
			expect(score).toBeCloseTo(0.675, 5) // identical tools + neutral others
			expect(elapsed).toBeLessThan(5000) // Should complete well within 5 seconds
		})

		it("should handle arrays with duplicate entries", () => {
			const turnA = createTurn({
				toolPattern: ["read_file", "read_file", "grep"],
				filesTouched: ["a.ts", "a.ts"],
				hypotheses: ["h1", "h1"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			const turnB = createTurn({
				id: "turn-2",
				toolPattern: ["read_file", "grep"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			// tool: LCS of [read_file, read_file, grep] and [read_file, grep] = 2
			// tool sim = 2*2/(3+2) = 0.8 => 0.8 * 0.35 = 0.28
			// files: {a.ts} vs {a.ts} = 1.0 * 0.25 = 0.25
			// hypotheses: {h1} vs {h1} = 1.0 * 0.20 = 0.20
			// conclusions: {c1} vs {c1} = 1.0 * 0.10 = 0.10
			// state: {s1} vs {s1} = 1.0 * 0.10 = 0.10
			const expected = 0.8 * 0.35 + 0.25 + 0.2 + 0.1 + 0.1
			expect(scorer.computeSimilarity(turnA, turnB)).toBeCloseTo(expected, 5)
		})

		it("should be symmetric (A to B equals B to A)", () => {
			const turnA = createTurn({
				toolPattern: ["read_file", "grep", "write_file"],
				filesTouched: ["src/a.ts", "src/b.ts"],
				hypotheses: ["null pointer"],
				conclusions: ["bug found"],
				stateTransitions: ["todo_completed:X"],
			})
			const turnB = createTurn({
				id: "turn-2",
				toolPattern: ["read_file", "write_file"],
				filesTouched: ["src/a.ts", "src/c.ts"],
				hypotheses: ["null pointer", "race condition"],
				conclusions: ["bug found", "needs refactor"],
				stateTransitions: ["todo_completed:X", "error_resolved:Y"],
			})
			const scoreAB = scorer.computeSimilarity(turnA, turnB)
			const scoreBA = scorer.computeSimilarity(turnB, turnA)
			expect(scoreAB).toBeCloseTo(scoreBA, 10)
		})
	})

	describe("Weighting Validation", () => {
		it("should have the highest impact from tool pattern similarity", () => {
			const base = createTurn({
				toolPattern: ["read_file", "grep"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			// Identical tool pattern
			const identical = createTurn({
				id: "turn-2",
				toolPattern: ["read_file", "grep"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			// Completely different tool pattern
			const different = createTurn({
				id: "turn-3",
				toolPattern: ["write_file", "run_test"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			const scoreIdentical = scorer.computeSimilarity(base, identical)
			const scoreDifferent = scorer.computeSimilarity(base, different)
			// Tool pattern change should cause a difference of 0.35 (1.0 * 0.35)
			const toolImpact = scoreIdentical - scoreDifferent
			expect(toolImpact).toBeGreaterThan(0.3)
			expect(toolImpact).toBeLessThan(0.4)
		})

		it("should have a higher impact from files than from conclusions", () => {
			const base = createTurn({
				toolPattern: ["read_file"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				stateTransitions: ["s1"],
			})
			// Vary only files: one matches base files, one differs
			const filesMatch = createTurn({
				id: "turn-2",
				toolPattern: ["read_file"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["cx"],
				stateTransitions: ["s1"],
			})
			const filesDiffer = createTurn({
				id: "turn-3",
				toolPattern: ["read_file"],
				filesTouched: ["b.ts"],
				hypotheses: ["h1"],
				conclusions: ["cx"],
				stateTransitions: ["s1"],
			})
			// Vary only conclusions: one matches, one differs
			const conclusionsMatch = createTurn({
				id: "turn-4",
				toolPattern: ["read_file"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			const conclusionsDiffer = createTurn({
				id: "turn-5",
				toolPattern: ["read_file"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["c2"],
				stateTransitions: ["s1"],
			})
			// Compare the delta caused by files vs conclusions
			const filesDelta = Math.abs(
				scorer.computeSimilarity(base, filesMatch) - scorer.computeSimilarity(base, filesDiffer),
			)
			const conclusionsDelta = Math.abs(
				scorer.computeSimilarity(base, conclusionsMatch) - scorer.computeSimilarity(base, conclusionsDiffer),
			)
			// Files weight (0.25) > conclusions weight (0.10)
			expect(filesDelta).toBeGreaterThan(conclusionsDelta)
		})

		it("should have the lowest impact from conclusions and state transitions", () => {
			const base = createTurn({
				toolPattern: ["read_file"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			// Change only conclusions
			const conclusionsDiffer = createTurn({
				id: "turn-3",
				toolPattern: ["read_file"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["c2"],
				stateTransitions: ["s1"],
			})
			// Change only state transitions
			const stateDiffer = createTurn({
				id: "turn-5",
				toolPattern: ["read_file"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["c1"],
				stateTransitions: ["s2"],
			})
			const conclusionsDelta = Math.abs(
				scorer.computeSimilarity(base, base) - scorer.computeSimilarity(base, conclusionsDiffer),
			)
			const stateDelta = Math.abs(
				scorer.computeSimilarity(base, base) - scorer.computeSimilarity(base, stateDiffer),
			)
			// Both should have the same low impact (0.10 weight each)
			expect(conclusionsDelta).toBeGreaterThan(0.05)
			expect(conclusionsDelta).toBeLessThan(0.15)
			expect(stateDelta).toBeGreaterThan(0.05)
			expect(stateDelta).toBeLessThan(0.15)
		})

		it("should have hypotheses impact between tools/files and conclusions/state", () => {
			const base = createTurn({
				toolPattern: ["read_file"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			const hypothesesDiffer = createTurn({
				id: "turn-3",
				toolPattern: ["read_file"],
				filesTouched: ["a.ts"],
				hypotheses: ["h2"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			const hypothesesDelta = Math.abs(
				scorer.computeSimilarity(base, base) - scorer.computeSimilarity(base, hypothesesDiffer),
			)
			// Hypotheses weight is 0.20, between tools/files (0.35/0.25) and conclusions/state (0.10/0.10)
			expect(hypothesesDelta).toBeGreaterThan(0.15)
			expect(hypothesesDelta).toBeLessThan(0.25)
		})

		it("should produce maximum score of 1.0 when all signals are identical", () => {
			const turnA = createTurn({
				toolPattern: ["a", "b", "c"],
				filesTouched: ["f1", "f2"],
				hypotheses: ["h1", "h2"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			const turnB = createTurn({
				id: "turn-2",
				toolPattern: ["a", "b", "c"],
				filesTouched: ["f1", "f2"],
				hypotheses: ["h1", "h2"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			expect(scorer.computeSimilarity(turnA, turnB)).toBe(1.0)
		})

		it("should produce minimum score of 0.0 when all signals have no overlap", () => {
			const turnA = createTurn({
				toolPattern: ["a"],
				filesTouched: ["f1"],
				hypotheses: ["h1"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			const turnB = createTurn({
				id: "turn-2",
				toolPattern: ["b"],
				filesTouched: ["f2"],
				hypotheses: ["h2"],
				conclusions: ["c2"],
				stateTransitions: ["s2"],
			})
			expect(scorer.computeSimilarity(turnA, turnB)).toBe(0.0)
		})

		it("should verify weights sum to 1.0 across all components", () => {
			// When all similarities are 1.0, the weighted sum should be 1.0
			const turnA = createTurn({
				toolPattern: ["read_file"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			const turnB = createTurn({
				id: "turn-2",
				toolPattern: ["read_file"],
				filesTouched: ["a.ts"],
				hypotheses: ["h1"],
				conclusions: ["c1"],
				stateTransitions: ["s1"],
			})
			const score = scorer.computeSimilarity(turnA, turnB)
			// 0.35 + 0.25 + 0.20 + 0.10 + 0.10 = 1.0
			expect(score).toBe(1.0)
		})
	})
})
