import { describe, it, expect } from "vitest"

import { ToolCategory } from "@roo-code/types"
import StrategyClassifier from "../StrategyClassifier"

describe("StrategyClassifier", () => {
	const makeTurn = (id: string, tools: string[], files: string[] = []) => ({
		id,
		toolPattern: tools,
		filesTouched: files,
		hypotheses: [] as string[],
		conclusions: [] as string[],
		stateTransitions: [] as string[],
		timestamp: Date.now(),
	})

	describe("tool categorization", () => {
		it("classifies read_file as Read", () => {
			const c = new StrategyClassifier(3)
			const s = c.processTurn(makeTurn("1", ["read_file"], ["a.ts"]))
			expect(s.categorySequence).toContain(ToolCategory.Read)
		})

		it("classifies write_to_file as Write", () => {
			const c = new StrategyClassifier(3)
			const s = c.processTurn(makeTurn("1", ["write_to_file"], ["a.ts"]))
			expect(s.categorySequence).toContain(ToolCategory.Write)
		})

		it("classifies execute_command as Execute", () => {
			const c = new StrategyClassifier(3)
			const s = c.processTurn(makeTurn("1", ["execute_command"]))
			expect(s.categorySequence).toContain(ToolCategory.Execute)
		})

		it("classifies attempt_completion as Complete", () => {
			const c = new StrategyClassifier(3)
			const s = c.processTurn(makeTurn("1", ["attempt_completion"]))
			expect(s.categorySequence).toContain(ToolCategory.Complete)
		})

		it("classifies unknown tools as Other", () => {
			const c = new StrategyClassifier(3)
			const s = c.processTurn(makeTurn("1", ["unknown_tool"]))
			expect(s.categorySequence).toContain(ToolCategory.Other)
		})
	})

	describe("strategy boundaries", () => {
		it("starts a new strategy on first turn", () => {
			const c = new StrategyClassifier(3)
			const s = c.processTurn(makeTurn("1", ["read_file"], ["a.ts"]))
			expect(s.categorySequence.length).toBe(1)
		})

		it("extends strategy when category stays same", () => {
			const c = new StrategyClassifier(3)
			c.processTurn(makeTurn("1", ["read_file"], ["a.ts"]))
			const s = c.processTurn(makeTurn("2", ["read_file"], ["b.ts"]))
			expect(s.categorySequence.length).toBe(2)
		})

		it("creates new strategy on compression", () => {
			const c = new StrategyClassifier(3)
			c.processTurn(makeTurn("1", ["read_file"], ["a.ts"]))
			c.processTurn(makeTurn("2", ["read_file"], ["b.ts"]), true)
			const s = c.processTurn(makeTurn("3", ["write_to_file"], ["c.ts"]))
			expect(s.categorySequence).toEqual([ToolCategory.Write])
		})

		it("marks strategy as endedInCompression when compression occurs", () => {
			const c = new StrategyClassifier(3)
			c.processTurn(makeTurn("1", ["read_file"], ["a.ts"]))
			const s = c.processTurn(makeTurn("2", ["read_file"], ["b.ts"]), true)
			expect(s.endedInCompression).toBe(true)
		})

		it("tracks files touched across turns in same strategy", () => {
			const c = new StrategyClassifier(3)
			c.processTurn(makeTurn("1", ["read_file"], ["a.ts"]))
			const s = c.processTurn(makeTurn("2", ["read_file"], ["b.ts"]))
			expect(s.filesTouched).toContain("a.ts")
			expect(s.filesTouched).toContain("b.ts")
		})

		it("updates turnRange correctly", () => {
			const c = new StrategyClassifier(3)
			const s1 = c.processTurn(makeTurn("1", ["read_file"], ["a.ts"]))
			expect(s1.turnRange.start).toBe(1)
			expect(s1.turnRange.end).toBe(1)
			const s2 = c.processTurn(makeTurn("2", ["read_file"], ["b.ts"]))
			expect(s2.turnRange.start).toBe(1)
			expect(s2.turnRange.end).toBe(2)
		})
	})
})
