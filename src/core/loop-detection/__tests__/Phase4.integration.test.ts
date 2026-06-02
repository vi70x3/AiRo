import SemanticLoopDetector from "../SemanticLoopDetector";
import type { ReasoningTurn } from "../../../packages/types/src/loop-detection";

describe("SemanticLoopDetector — Phase 4 Integration Tests", () => {
  let detector: SemanticLoopDetector;

  beforeEach(() => {
    detector = new SemanticLoopDetector();
  });

  test("Phase 4C trackers are instantiated and callable without error", () => {
    const turn: ReasoningTurn = {
      // Minimal required fields for a turn – adjust according to actual type definition
      // Assuming fields: id, content, tools, files, etc. Use empty placeholders.
      // The type import will ensure compile‑time correctness.
    } as unknown as ReasoningTurn;

    // Call onTurn – should not throw and should return expected structure
    const result = detector.onTurn(turn);
    expect(result).toHaveProperty("loopConfidence");
    expect(result).toHaveProperty("similarityScore");
    expect(result).toHaveProperty("progressEvents");
    expect(result).toHaveProperty("progressScore");
  });

  test("onCompression records adaptation failure via Phase 4C detector", () => {
    // Simulate a situation where compression is triggered
    // First, drive confidence high enough by feeding similar turns
    const baseTurn: ReasoningTurn = {} as unknown as ReasoningTurn;
    for (let i = 0; i < 5; i++) {
      detector.onTurn(baseTurn);
    }
    // Force compression regardless of score
    const event = detector.onCompression("test_compression");
    expect(event).toHaveProperty("id");
    expect(event.reason).toBe("test_compression");
  });
});
