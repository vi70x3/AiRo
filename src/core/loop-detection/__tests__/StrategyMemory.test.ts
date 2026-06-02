import { describe, it, expect } from "vitest"

import { ToolCategory } from "@roo-code/types"
import StrategyMemory from "../StrategyMemory"

describe("StrategyMemory", () => {
	const makeRecord = (id: string, seq: ToolCategory[]) => ({
		id,
		categorySequence: seq,
		filesTouched: [`${id}.ts`],
		turnRange: { start: 1, end: 1 },
		endedInCompression: false,
		producedProgress: false,
		timestamp: Date.now(),
	})

	it("adds strategies", () => {
		const mem = new StrategyMemory(20)
		mem.addStrategy(makeRecord("s1", [ToolCategory.Read, ToolCategory.Read]))
		expect(mem.getSize()).toBe(1)
	})

	it("returns latest strategy", () => {
		const mem = new StrategyMemory(20)
		mem.addStrategy(makeRecord("s1", [ToolCategory.Read]))
		mem.addStrategy(makeRecord("s2", [ToolCategory.Write]))
		expect(mem.getLatest()?.id).toBe("s2")
	})

	it("returns null for latest when empty", () => {
		const mem = new StrategyMemory(20)
		expect(mem.getLatest()).toBeNull()
	})

	it("detects exact sequence cycle", () => {
		const mem = new StrategyMemory(20)
		mem.addStrategy(makeRecord("s1", [ToolCategory.Read, ToolCategory.Write]))
		mem.addStrategy(makeRecord("s2", [ToolCategory.Read, ToolCategory.Write]))
		const result = mem.detectCycle([ToolCategory.Read, ToolCategory.Write])
		expect(result.isCycle).toBe(true)
		expect(result.cycleLength).toBe(1)
	})

	it("detects A-B-A-B alternating cycle", () => {
		const mem = new StrategyMemory(20)
		mem.addStrategy(makeRecord("s1", [ToolCategory.Read]))
		mem.addStrategy(makeRecord("s2", [ToolCategory.Write]))
		mem.addStrategy(makeRecord("s3", [ToolCategory.Read]))
		mem.addStrategy(makeRecord("s4", [ToolCategory.Write]))
		const result = mem.detectCycle([ToolCategory.Read])
		expect(result.isCycle).toBe(true)
		expect(result.cycleLength).toBe(2)
	})

	it("returns no cycle for unique sequence", () => {
		const mem = new StrategyMemory(20)
		mem.addStrategy(makeRecord("s1", [ToolCategory.Read]))
		const result = mem.detectCycle([ToolCategory.Write, ToolCategory.Execute])
		expect(result.isCycle).toBe(false)
	})

	it("evicts oldest strategy when over capacity", () => {
		const mem = new StrategyMemory(2)
		mem.addStrategy(makeRecord("s1", [ToolCategory.Read]))
		mem.addStrategy(makeRecord("s2", [ToolCategory.Write]))
		mem.addStrategy(makeRecord("s3", [ToolCategory.Execute]))
		expect(mem.getSize()).toBe(2)
		expect(mem.getLatest()?.id).toBe("s3")
	})

	it("tracks sequence frequency", () => {
		const mem = new StrategyMemory(20)
		mem.addStrategy(makeRecord("s1", [ToolCategory.Read]))
		mem.addStrategy(makeRecord("s2", [ToolCategory.Read]))
		expect(mem.getSequenceFrequency([ToolCategory.Read])).toBe(2)
	})

	it("resets all state", () => {
		const mem = new StrategyMemory(20)
		mem.addStrategy(makeRecord("s1", [ToolCategory.Read]))
		mem.reset()
		expect(mem.getSize()).toBe(0)
		expect(mem.getLatest()).toBeNull()
	})

	it("generates unique IDs", () => {
		const id1 = StrategyMemory.generateId()
		const id2 = StrategyMemory.generateId()
		expect(id1).not.toBe(id2)
	})
})
