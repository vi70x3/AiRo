import { randomUUID } from "node:crypto";

import { SemanticStateTracker } from "./SemanticStateTracker";
import SimilarityScorer from "./SimilarityScorer";
import ProgressDetector from "./ProgressDetector";
import LoopConfidenceCalculator, { LoopCalculatorConfig } from "./LoopConfidenceCalculator";
import { InterventionEffectivenessTracker } from "./InterventionEffectivenessTracker";
import { RelapseDetector } from "./RelapseDetector";
import { AdaptationFailureDetector } from "./AdaptationFailureDetector";

import type {
  ReasoningTurn,
  LoopConfidenceState,
  CompressionRecoveryState,
  CompressionEvent,
  ProgressEvent,
} from "../../../packages/types/src/loop-detection";

export interface SemanticLoopDetectorConfig {
  windowSize?: number;
  similarityThreshold?: number;
  calculatorConfig?: Partial<LoopCalculatorConfig>;
  onLoopDetected?: (event: {
    confidenceScore: number;
    similarityScore: number;
    progressScore: number;
    consecutiveSimilarTurns: number;
  }) => void;
  onCompressionTriggered?: (event: { compressionId: string; confidenceScore: number; reason: string }) => void;
  onRecoveryDetected?: (event: { compressionId: string; turnsToRecover: number }) => void;
}

export default class SemanticLoopDetector {
  private readonly stateTracker: SemanticStateTracker;
  private globalTurnCount: number = 0;
  private readonly similarityScorer: SimilarityScorer;
  private readonly progressDetector: ProgressDetector;
  private readonly confidenceCalculator: LoopConfidenceCalculator;
  private readonly similarityThreshold: number;
  private readonly onLoopDetected?: SemanticLoopDetectorConfig["onLoopDetected"];
  private readonly onCompressionTriggered?: SemanticLoopDetectorConfig["onCompressionTriggered"];
  private readonly onRecoveryDetected?: SemanticLoopDetectorConfig["onRecoveryDetected"];

  // Phase 4C components (optional, instantiated with defaults)
  private readonly interventionTracker: InterventionEffectivenessTracker;
  private readonly relapseDetector: RelapseDetector;
  private readonly adaptationFailureDetector: AdaptationFailureDetector;

  private loopConfidenceState: LoopConfidenceState;
  private compressionRecoveryState: CompressionRecoveryState;

  constructor(config?: SemanticLoopDetectorConfig) {
    this.stateTracker = new SemanticStateTracker(config?.windowSize ?? 10);
    this.similarityScorer = new SimilarityScorer();
    this.progressDetector = new ProgressDetector();
    this.confidenceCalculator = new LoopConfidenceCalculator(config?.calculatorConfig);
    this.similarityThreshold = config?.similarityThreshold ?? 0.6;
    this.onLoopDetected = config?.onLoopDetected;
    this.onCompressionTriggered = config?.onCompressionTriggered;
    this.onRecoveryDetected = config?.onRecoveryDetected;

    // Initialise Phase 4C detectors with default configuration.
    this.interventionTracker = new InterventionEffectivenessTracker();
    this.relapseDetector = new RelapseDetector();
    this.adaptationFailureDetector = new AdaptationFailureDetector();

    this.loopConfidenceState = {
      score: 0,
      consecutiveSimilarTurns: 0,
      lastCompressionAt: 0,
      cooldownActive: false,
      lastSeenCompressionId: null,
    };

    this.compressionRecoveryState = {
      lastCompressionId: null,
      isRecovered: false,
      turnsSinceLastCompression: 0,
    };
  }

  onTurn(turn: ReasoningTurn): {
    loopConfidence: LoopConfidenceState;
    similarityScore: number;
    progressEvents: ProgressEvent[];
    progressScore: number;
  } {
    // Store turn
    this.stateTracker.addTurn(turn);
    // Increment global turn counter
    this.globalTurnCount++;

    const allTurns = this.stateTracker.getTurns();
    let similarityScore = 0;
    if (allTurns.length >= 2) {
      const current = allTurns[allTurns.length - 1];
      const previous = allTurns[allTurns.length - 2];
      similarityScore = this.similarityScorer.computeSimilarity(current, previous);
    }

    const previousTurns = allTurns.slice(0, -1);
    const { events: progressEvents, score: progressScore } = this.progressDetector.detectProgress(
      turn,
      previousTurns,
    );

    // Update recovery counter if a compression has occurred.
    if (this.compressionRecoveryState.lastCompressionId !== null) {
      this.compressionRecoveryState = {
        ...this.compressionRecoveryState,
        turnsSinceLastCompression: this.compressionRecoveryState.turnsSinceLastCompression + 1,
      };
    }

    // Calculate new confidence state.
    this.loopConfidenceState = this.confidenceCalculator.calculate(
      this.loopConfidenceState,
      similarityScore,
      progressScore,
      this.compressionRecoveryState,
    );

    // Record intervention effectiveness with actual turn context
    this.interventionTracker.record("loop_check", "success");
    this.relapseDetector.recordSuccess("loop_check", this.globalTurnCount);
    // Adaptation failures are recorded on compression (see onCompression).

    // Emit loop‑detected telemetry.
    if (similarityScore >= this.similarityThreshold && progressScore < 0.3) {
      this.onLoopDetected?.({
        confidenceScore: this.loopConfidenceState.score,
        similarityScore,
        progressScore,
        consecutiveSimilarTurns: this.loopConfidenceState.consecutiveSimilarTurns,
      });
    }

    // Emit recovery telemetry.
    if (
      this.compressionRecoveryState.lastCompressionId !== null &&
      !this.compressionRecoveryState.isRecovered &&
      progressScore >= 0.3
    ) {
      const turnsToRecover = this.compressionRecoveryState.turnsSinceLastCompression;
      this.onRecoveryDetected?.({
        compressionId: this.compressionRecoveryState.lastCompressionId!,
        turnsToRecover,
      });
      this.compressionRecoveryState = { ...this.compressionRecoveryState, isRecovered: true };
    }

    return {
      loopConfidence: this.loopConfidenceState,
      similarityScore,
      progressEvents,
      progressScore,
    };
  }

  shouldCompress(threshold: number = 0.7): boolean {
    return this.loopConfidenceState.score >= threshold && !this.loopConfidenceState.cooldownActive;
  }

  onCompression(reason: string = "loop_detected"): CompressionEvent {
    const id = randomUUID();
    const timestamp = Date.now();
    const turnsAtCompression = this.stateTracker.getTurns().length;

    // Record adaptation failure as part of Phase 4C.
    this.adaptationFailureDetector.recordFailure("default");

    const event: CompressionEvent = { id, reason, timestamp, turnsAtCompression };

    this.onCompressionTriggered?.({ compressionId: id, confidenceScore: this.loopConfidenceState.score, reason });

    this.loopConfidenceState = {
      ...this.loopConfidenceState,
      score: 0.0,
      lastCompressionAt: timestamp,
      cooldownActive: true,
      lastSeenCompressionId: id,
    };

    this.compressionRecoveryState = { lastCompressionId: id, isRecovered: false, turnsSinceLastCompression: 0 };

    this.stateTracker.clear();
    // NOTE: Do NOT reset globalTurnCount here — RelapseDetector depends on monotonic turn counts
    return event;
  }

  getLoopConfidenceState(): LoopConfidenceState {
    return this.loopConfidenceState;
  }

  getCompressionRecoveryState(): CompressionRecoveryState {
    return this.compressionRecoveryState;
  }

  reset(): void {
    this.loopConfidenceState = {
      score: 0,
      consecutiveSimilarTurns: 0,
      lastCompressionAt: 0,
      cooldownActive: false,
      lastSeenCompressionId: null,
    };
    this.compressionRecoveryState = { lastCompressionId: null, isRecovered: false, turnsSinceLastCompression: 0 };
    this.stateTracker.clear();
    this.globalTurnCount = 0;
  }

  getTurnCount(): number {
    return this.globalTurnCount;
  }
}
