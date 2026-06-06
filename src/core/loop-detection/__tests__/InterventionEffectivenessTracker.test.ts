import { InterventionEffectivenessTracker } from "../InterventionEffectivenessTracker"

describe("InterventionEffectivenessTracker", () => {
  it("records outcomes and computes weighted score", () => {
    const tracker = new InterventionEffectivenessTracker({ windowSize: 4 })
    const r1 = tracker.record("strat", "success")
    expect(r1.score).toBeCloseTo(1 / 4)
    const r2 = tracker.record("strat", "partial")
    expect(r2.score).toBeCloseTo((1 + 0.5) / 4)
    const r3 = tracker.record("strat", "failure")
    expect(r3.score).toBeCloseTo((1 + 0.5 + 0) / 4)
    const r4 = tracker.record("strat", "relapsed")
    expect(r4.score).toBeCloseTo((1 + 0.5 + 0 + 0) / 4)
  })

  it("maintains rolling window", () => {
    const tracker = new InterventionEffectivenessTracker({ windowSize: 3 })
    tracker.record("s", "success")
    tracker.record("s", "success")
    const r = tracker.record("s", "failure")
    expect(r.score).toBeCloseTo((1 + 1 + 0) / 3)
    // next pushes out oldest success
    const r2 = tracker.record("s", "partial")
    expect(r2.score).toBeCloseTo((1 + 0 + 0.5) / 3)
  })

  it("produces confidence based on sample size", () => {
    const tracker = new InterventionEffectivenessTracker({ windowSize: 5 })
    const r = tracker.record("a", "success")
    expect(r.confidence).toBeCloseTo(0.2)
    tracker.record("a", "success")
    const r2 = tracker.record("a", "success")
    expect(r2.confidence).toBeCloseTo(0.6)
  })

  it("serializes and deserializes correctly", () => {
    const tracker = new InterventionEffectivenessTracker({ windowSize: 2 })
    tracker.record("x", "success")
    const data = tracker.serialize()
    const restored = InterventionEffectivenessTracker.deserialize(data, { windowSize: 2 })
    const r = restored.record("x", "partial")
    expect(r.score).toBeCloseTo((1 + 0.5) / 2)
  })
})
