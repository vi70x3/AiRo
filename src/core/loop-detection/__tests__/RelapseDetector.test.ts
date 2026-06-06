import { describe, it, expect, vi, beforeEach } from "vitest"
import { RelapseDetector } from "../RelapseDetector"
import type { RelapseSeverity } from "../RelapseDetector"

describe("RelapseDetector", () => {
	describe("constructor", () => {
		it("should use default relapseWindow of 10 when no config provided", () => {
			const detector = new RelapseDetector()
			// Record success at turn 0, check at turn 11 (elapsed=11, window=10)
			// elapsed > window => not relapsed
			detector.recordSuccess("strategy-a", 0)
			const result = detector.check("strategy-a", 11, true)
			expect(result.relapsed).toBe(false)
		})

		it("should accept a custom relapseWindow", () => {
			const detector = new RelapseDetector({ relapseWindow: 5 })
			detector.recordSuccess("strategy-a", 0)
			// elapsed=5, window=5 => elapsed > window is false, so still in window
			const result = detector.check("strategy-a", 5, true)
			expect(result.relapsed).toBe(true)
		})

		it("should accept partial config without onRelapse callback", () => {
			const detector = new RelapseDetector({ relapseWindow: 8 })
			detector.recordSuccess("s", 0)
			const result = detector.check("s", 4, true)
			expect(result.relapsed).toBe(true)
		})
	})

	describe("recordSuccess + check flow", () => {
		it("should return { relapsed: false } when no prior success is recorded", () => {
			const detector = new RelapseDetector({ relapseWindow: 10 })
			const result = detector.check("unknown-strategy", 5, true)
			expect(result).toEqual({ relapsed: false })
		})

		it("should return { relapsed: true, severity } when check is within window and pattern detected", () => {
			const detector = new RelapseDetector({ relapseWindow: 10 })
			detector.recordSuccess("strategy-a", 5)
			const result = detector.check("strategy-a", 8, true)
			expect(result.relapsed).toBe(true)
			expect(result.severity).toBeDefined()
		})

		it("should return { relapsed: false } when patternDetected is false", () => {
			const detector = new RelapseDetector({ relapseWindow: 10 })
			detector.recordSuccess("strategy-a", 2)
			const result = detector.check("strategy-a", 5, false)
			expect(result).toEqual({ relapsed: false })
		})

		it("should return { relapsed: false } when check is beyond the relapse window", () => {
			const detector = new RelapseDetector({ relapseWindow: 5 })
			detector.recordSuccess("strategy-a", 0)
			// elapsed=6, window=5 => beyond window
			const result = detector.check("strategy-a", 6, true)
			expect(result).toEqual({ relapsed: false })
		})

		it("should return { relapsed: false } when check is at the same turn as success (elapsed=0)", () => {
			const detector = new RelapseDetector({ relapseWindow: 10 })
			detector.recordSuccess("strategy-a", 5)
			const result = detector.check("strategy-a", 5, true)
			// elapsed = 0 => not > 0, so no relapse
			expect(result).toEqual({ relapsed: false })
		})

		it("should return { relapsed: true } when elapsed equals relapseWindow exactly", () => {
			const detector = new RelapseDetector({ relapseWindow: 10 })
			detector.recordSuccess("strategy-a", 0)
			// elapsed = 10, window = 10 => elapsed > window is false, so still in window
			const result = detector.check("strategy-a", 10, true)
			expect(result.relapsed).toBe(true)
		})
	})

	describe("severity calculation", () => {
		it("should return 'high' severity when elapsed/window < 0.33", () => {
			const detector = new RelapseDetector({ relapseWindow: 10 })
			detector.recordSuccess("strategy-a", 0)
			// elapsed=3, ratio=0.3 < 0.33 => high
			const result = detector.check("strategy-a", 3, true)
			expect(result.relapsed).toBe(true)
			expect(result.severity).toBe("high")
		})

		it("should return 'high' severity at the boundary just below 0.33", () => {
			const detector = new RelapseDetector({ relapseWindow: 100 })
			detector.recordSuccess("strategy-a", 0)
			// elapsed=32, ratio=0.32 < 0.33 => high
			const result = detector.check("strategy-a", 32, true)
			expect(result.severity).toBe("high")
		})

		it("should return 'medium' severity when 0.33 <= elapsed/window < 0.66", () => {
			const detector = new RelapseDetector({ relapseWindow: 10 })
			detector.recordSuccess("strategy-a", 0)
			// elapsed=5, ratio=0.5 => medium
			const result = detector.check("strategy-a", 5, true)
			expect(result.relapsed).toBe(true)
			expect(result.severity).toBe("medium")
		})

		it("should return 'medium' severity at the 0.33 boundary", () => {
			const detector = new RelapseDetector({ relapseWindow: 100 })
			detector.recordSuccess("strategy-a", 0)
			// elapsed=33, ratio=0.33 => not < 0.33, so medium
			const result = detector.check("strategy-a", 33, true)
			expect(result.severity).toBe("medium")
		})

		it("should return 'low' severity when elapsed/window >= 0.66", () => {
			const detector = new RelapseDetector({ relapseWindow: 10 })
			detector.recordSuccess("strategy-a", 0)
			// elapsed=7, ratio=0.7 >= 0.66 => low
			const result = detector.check("strategy-a", 7, true)
			expect(result.relapsed).toBe(true)
			expect(result.severity).toBe("low")
		})

		it("should return 'low' severity at the 0.66 boundary", () => {
			const detector = new RelapseDetector({ relapseWindow: 100 })
			detector.recordSuccess("strategy-a", 0)
			// elapsed=66, ratio=0.66 => not < 0.66, so low
			const result = detector.check("strategy-a", 66, true)
			expect(result.severity).toBe("low")
		})

		it("should return 'low' severity near the end of the window", () => {
			const detector = new RelapseDetector({ relapseWindow: 10 })
			detector.recordSuccess("strategy-a", 0)
			// elapsed=9, ratio=0.9 => low
			const result = detector.check("strategy-a", 9, true)
			expect(result.severity).toBe("low")
		})
	})

	describe("onRelapse callback", () => {
		it("should call onRelapse with correct arguments when relapse occurs", () => {
			const onRelapse = vi.fn()
			const detector = new RelapseDetector({ relapseWindow: 10, onRelapse })
			detector.recordSuccess("strategy-a", 0)
			detector.check("strategy-a", 3, true)
			expect(onRelapse).toHaveBeenCalledTimes(1)
			expect(onRelapse).toHaveBeenCalledWith("strategy-a", "high", 3)
		})

		it("should not call onRelapse when no relapse occurs", () => {
			const onRelapse = vi.fn()
			const detector = new RelapseDetector({ relapseWindow: 10, onRelapse })
			detector.recordSuccess("strategy-a", 0)
			detector.check("strategy-a", 3, false) // patternDetected = false
			expect(onRelapse).not.toHaveBeenCalled()
		})

		it("should call onRelapse with 'medium' severity", () => {
			const onRelapse = vi.fn()
			const detector = new RelapseDetector({ relapseWindow: 10, onRelapse })
			detector.recordSuccess("strategy-a", 0)
			detector.check("strategy-a", 5, true)
			expect(onRelapse).toHaveBeenCalledWith("strategy-a", "medium", 5)
		})

		it("should call onRelapse with 'low' severity", () => {
			const onRelapse = vi.fn()
			const detector = new RelapseDetector({ relapseWindow: 10, onRelapse })
			detector.recordSuccess("strategy-a", 0)
			detector.check("strategy-a", 7, true)
			expect(onRelapse).toHaveBeenCalledWith("strategy-a", "low", 7)
		})

		it("should not call onRelapse when beyond the window", () => {
			const onRelapse = vi.fn()
			const detector = new RelapseDetector({ relapseWindow: 5, onRelapse })
			detector.recordSuccess("strategy-a", 0)
			detector.check("strategy-a", 6, true)
			expect(onRelapse).not.toHaveBeenCalled()
		})
	})

	describe("multiple strategies", () => {
		it("should track each strategy independently", () => {
			const detector = new RelapseDetector({ relapseWindow: 10 })
			detector.recordSuccess("strategy-a", 0)
			detector.recordSuccess("strategy-b", 0)

			// strategy-a: elapsed=3, in window, pattern detected => relapse
			const resultA = detector.check("strategy-a", 3, true)
			expect(resultA.relapsed).toBe(true)

			// strategy-b: elapsed=8, in window, pattern detected => relapse
			const resultB = detector.check("strategy-b", 8, true)
			expect(resultB.relapsed).toBe(true)
			// Different elapsed => different severities
			expect(resultA.severity).toBe("high")
			expect(resultB.severity).toBe("low")
		})

		it("should not relapse for a strategy that has no recorded success", () => {
			const detector = new RelapseDetector({ relapseWindow: 10 })
			detector.recordSuccess("strategy-a", 0)

			const resultA = detector.check("strategy-a", 3, true)
			expect(resultA.relapsed).toBe(true)

			const resultB = detector.check("strategy-b", 3, true)
			expect(resultB).toEqual({ relapsed: false })
		})

		it("should allow recording success for a strategy after another strategy relapses", () => {
			const detector = new RelapseDetector({ relapseWindow: 10 })
			detector.recordSuccess("strategy-a", 0)
			detector.check("strategy-a", 3, true) // relapse for a

			detector.recordSuccess("strategy-b", 5)
			const resultB = detector.check("strategy-b", 8, true)
			expect(resultB.relapsed).toBe(true)
			expect(resultB.severity).toBe("high") // elapsed=3, ratio=0.3
		})

		it("should overwrite previous success when recordSuccess is called again for same strategy", () => {
			const detector = new RelapseDetector({ relapseWindow: 10 })
			detector.recordSuccess("strategy-a", 0)
			detector.recordSuccess("strategy-a", 7) // overwrite

			// Now last success is at turn 7, check at turn 10 => elapsed=3
			const result = detector.check("strategy-a", 10, true)
			expect(result.relapsed).toBe(true)
			expect(result.severity).toBe("high") // ratio=0.3
		})
	})

	describe("edge cases", () => {
		it("should handle negative turn values gracefully", () => {
			const detector = new RelapseDetector({ relapseWindow: 10 })
			detector.recordSuccess("strategy-a", -5)
			// elapsed = 0 - (-5) = 5, in window
			const result = detector.check("strategy-a", 0, true)
			expect(result.relapsed).toBe(true)
			expect(result.severity).toBe("medium")
		})

		it("should handle very large relapseWindow", () => {
			const detector = new RelapseDetector({ relapseWindow: 1000 })
			detector.recordSuccess("strategy-a", 0)
			const result = detector.check("strategy-a", 500, true)
			expect(result.relapsed).toBe(true)
			// ratio=500/1000=0.5 => medium
			expect(result.severity).toBe("medium")
		})

		it("should handle relapseWindow of 1", () => {
			const detector = new RelapseDetector({ relapseWindow: 1 })
			detector.recordSuccess("strategy-a", 0)
			// elapsed=1, window=1 => elapsed > window is false => in window
			const result = detector.check("strategy-a", 1, true)
			expect(result.relapsed).toBe(true)
			// ratio=1/1=1.0 >= 0.66 => low
			expect(result.severity).toBe("low")
		})

		it("should return severity as a valid RelapseSeverity type", () => {
			const detector = new RelapseDetector({ relapseWindow: 10 })
			detector.recordSuccess("strategy-a", 0)
			const result = detector.check("strategy-a", 2, true)
			const validSeverities: RelapseSeverity[] = ["low", "medium", "high"]
			expect(validSeverities).toContain(result.severity)
		})
	})
})
