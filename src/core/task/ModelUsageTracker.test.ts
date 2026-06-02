import { describe, it, expect } from "vitest"
import { ModelUsageTracker, type ModelUsageRecord } from "./ModelUsageTracker"

describe("ModelUsageTracker", () => {
	describe("record and retrieve", () => {
		it("should record and retrieve a single model record", () => {
			const tracker = new ModelUsageTracker(5)
			tracker.recordCurrentModel("anthropic", "claude-sonnet-4-20250514", 0)
			const recent = tracker.getMostRecent()
			expect(recent).toEqual<ModelUsageRecord>({
				provider: "anthropic",
				modelId: "claude-sonnet-4-20250514",
				turnIndex: 0,
			})
		})

		it("should return records in insertion order via getRecentRecords", () => {
			const tracker = new ModelUsageTracker(5)
			tracker.recordCurrentModel("anthropic", "claude-sonnet-4-20250514", 0)
			tracker.recordCurrentModel("openai-native", "gpt-4o", 1)
			tracker.recordCurrentModel("openrouter", "llama-3.1-70b", 2)
			const records = tracker.getRecentRecords()
			expect(records).toHaveLength(3)
			expect(records[0].modelId).toBe("claude-sonnet-4-20250514")
			expect(records[1].modelId).toBe("gpt-4o")
			expect(records[2].modelId).toBe("llama-3.1-70b")
		})

		it("should return the most recent record after multiple insertions", () => {
			const tracker = new ModelUsageTracker(5)
			tracker.recordCurrentModel("anthropic", "claude-sonnet-4-20250514", 0)
			tracker.recordCurrentModel("openai-native", "gpt-4o", 1)
			const recent = tracker.getMostRecent()
			expect(recent?.provider).toBe("openai-native")
			expect(recent?.modelId).toBe("gpt-4o")
			expect(recent?.turnIndex).toBe(1)
		})
	})

	describe("bounded eviction", () => {
		it("should evict the oldest record when maxRecords is exceeded", () => {
			const tracker = new ModelUsageTracker(2)
			tracker.recordCurrentModel("anthropic", "claude-sonnet-4-20250514", 0)
			tracker.recordCurrentModel("openai-native", "gpt-4o", 1)
			tracker.recordCurrentModel("openrouter", "llama-3.1-70b", 2)
			const records = tracker.getRecentRecords()
			expect(records).toHaveLength(2)
			expect(records[0].modelId).toBe("gpt-4o")
			expect(records[1].modelId).toBe("llama-3.1-70b")
		})

		it("should keep only the last record when maxRecords is 1", () => {
			const tracker = new ModelUsageTracker(1)
			tracker.recordCurrentModel("anthropic", "claude-sonnet-4-20250514", 0)
			tracker.recordCurrentModel("openai-native", "gpt-4o", 1)
			const records = tracker.getRecentRecords()
			expect(records).toHaveLength(1)
			expect(records[0].modelId).toBe("gpt-4o")
			expect(tracker.getMostRecent()?.modelId).toBe("gpt-4o")
		})

		it("should handle eviction with large number of records", () => {
			const tracker = new ModelUsageTracker(3)
			for (let i = 0; i < 10; i++) {
				tracker.recordCurrentModel("provider", `model-${i}`, i)
			}
			const records = tracker.getRecentRecords()
			expect(records).toHaveLength(3)
			expect(records[0].modelId).toBe("model-7")
			expect(records[1].modelId).toBe("model-8")
			expect(records[2].modelId).toBe("model-9")
		})

		it("should throw when maxRecords is less than 1", () => {
			expect(() => new ModelUsageTracker(0)).toThrow("maxRecords must be at least 1")
			expect(() => new ModelUsageTracker(-1)).toThrow("maxRecords must be at least 1")
		})
	})

	describe("wasModelRecentlyUsed", () => {
		it("should return true when the exact provider and modelId match", () => {
			const tracker = new ModelUsageTracker(5)
			tracker.recordCurrentModel("anthropic", "claude-sonnet-4-20250514", 0)
			expect(tracker.wasModelRecentlyUsed("anthropic", "claude-sonnet-4-20250514")).toBe(true)
		})

		it("should return false when the provider matches but modelId differs", () => {
			const tracker = new ModelUsageTracker(5)
			tracker.recordCurrentModel("anthropic", "claude-sonnet-4-20250514", 0)
			expect(tracker.wasModelRecentlyUsed("anthropic", "claude-opus-4-20250514")).toBe(false)
		})

		it("should return false when the modelId matches but provider differs", () => {
			const tracker = new ModelUsageTracker(5)
			tracker.recordCurrentModel("anthropic", "claude-sonnet-4-20250514", 0)
			expect(tracker.wasModelRecentlyUsed("openrouter", "claude-sonnet-4-20250514")).toBe(false)
		})

		it("should return false when neither provider nor modelId match", () => {
			const tracker = new ModelUsageTracker(5)
			tracker.recordCurrentModel("anthropic", "claude-sonnet-4-20250514", 0)
			expect(tracker.wasModelRecentlyUsed("openai-native", "gpt-4o")).toBe(false)
		})

		it("should find a match in older records within the lookback window", () => {
			const tracker = new ModelUsageTracker(5)
			tracker.recordCurrentModel("anthropic", "claude-sonnet-4-20250514", 0)
			tracker.recordCurrentModel("openai-native", "gpt-4o", 1)
			tracker.recordCurrentModel("openrouter", "llama-3.1-70b", 2)
			expect(tracker.wasModelRecentlyUsed("anthropic", "claude-sonnet-4-20250514")).toBe(true)
		})

		it("should return false for a model that was evicted from the lookback window", () => {
			const tracker = new ModelUsageTracker(2)
			tracker.recordCurrentModel("anthropic", "claude-sonnet-4-20250514", 0)
			tracker.recordCurrentModel("openai-native", "gpt-4o", 1)
			tracker.recordCurrentModel("openrouter", "llama-3.1-70b", 2)
			expect(tracker.wasModelRecentlyUsed("anthropic", "claude-sonnet-4-20250514")).toBe(false)
		})
	})

	describe("empty tracker behavior", () => {
		it("should return undefined from getMostRecent when no records exist", () => {
			const tracker = new ModelUsageTracker(5)
			expect(tracker.getMostRecent()).toBeUndefined()
		})

		it("should return an empty array from getRecentRecords when no records exist", () => {
			const tracker = new ModelUsageTracker(5)
			expect(tracker.getRecentRecords()).toHaveLength(0)
		})

		it("should return false from wasModelRecentlyUsed when no records exist", () => {
			const tracker = new ModelUsageTracker(5)
			expect(tracker.wasModelRecentlyUsed("anthropic", "claude-sonnet-4-20250514")).toBe(false)
		})
	})
})