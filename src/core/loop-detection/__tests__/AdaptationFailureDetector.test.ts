import { AdaptationFailureDetector } from "../AdaptationFailureDetector"

describe("AdaptationFailureDetector", () => {
  it("classifies fallback based on consecutive failures", () => {
    const detector = new AdaptationFailureDetector({ thresholds: { soft: 2, hard: 4, abort: 5 } })
    expect(detector.recordFailure("s")).toBe("SOFT") // 1 failure -> default soft
    expect(detector.recordFailure("s")).toBe("SOFT") // 2 failures -> soft
    expect(detector.recordFailure("s")).toBe("SOFT") // 3 failures -> still soft
    expect(detector.recordFailure("s")).toBe("HARD") // 4 failures -> hard
    expect(detector.recordFailure("s")).toBe("ABORT") // 5 failures -> abort
  })

  it("resets after success", () => {
    const detector = new AdaptationFailureDetector()
    detector.recordFailure("s")
    detector.reset("s")
    // after reset, first failure should be soft again
    expect(detector.recordFailure("s")).toBe("SOFT")
  })
})
