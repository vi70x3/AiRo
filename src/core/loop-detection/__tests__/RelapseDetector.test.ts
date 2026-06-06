import { RelapseDetector } from "../RelapseDetector"

describe("RelapseDetector", () => {
  it("detects relapse within window and reports severity", () => {
    const detector = new RelapseDetector({ relapseWindow: 10 })
    detector.recordSuccess("s", 5)
    const { relapsed, severity } = detector.check("s", 8, true)
    expect(relapsed).toBe(true)
    // elapsed 3/10 => high severity
    expect(severity).toBe("high")
  })

  it("does not report relapse after window expires", () => {
    const detector = new RelapseDetector({ relapseWindow: 5 })
    detector.recordSuccess("s", 0)
    const res = detector.check("s", 6, true)
    expect(res.relapsed).toBe(false)
  })

  it("returns false when pattern not detected", () => {
    const detector = new RelapseDetector({ relapseWindow: 10 })
    detector.recordSuccess("s", 2)
    const res = detector.check("s", 5, false)
    expect(res.relapsed).toBe(false)
  })
})
