import { randomUUID } from "node:crypto"

import type { StrategyRecord, ToolCategory, CompressionEvent } from "../../../packages/types/src/loop-detection"

/**
 * StrategyMemory maintains a bounded history of strategies tried and detects
 * cyclic patterns.
 *
 * Bug fixes applied:
 * - Task 3.4: Added duplicate guard at top of addStrategy()
 * - Task 3.5: Fixed detectCycle() loop start from length-1 to length-2
 */
export default class StrategyMemory {
	private strategies: StrategyRecord[] = []
	private sequenceFrequency: Map<string, number> = new Map()
	private maxSize: number
	private currentStrategy: Partial<StrategyRecord> | null = null

	constructor(maxSize: number = 20) {
		this.maxSize = maxSize
	}

	/**
	 * Adds a strategy record to memory, with duplicate guard.
	 */
	addStrategy(record: StrategyRecord): void {
		// Task 3.4: Duplicate guard — skip if the last strategy has the same fingerprint
		if (this.strategies.length > 0) {
			const last = this.strategies[this.strategies.length - 1]
			if (last.id === record.id) {
				return
			}
		}

		this.strategies.push(record)

		// Update sequence frequency
		const key = record.categorySequence.join("->")
		this.sequenceFrequency.set(key, (this.sequenceFrequency.get(key) ?? 0) + 1)

		// Evict oldest if over capacity
		if (this.strategies.length > this.maxSize) {
			const evicted = this.strategies.shift()!
			const evictedKey = evicted.categorySequence.join("->")
			const count = this.sequenceFrequency.get(evictedKey) ?? 0
			if (count <= 1) {
				this.sequenceFrequency.delete(evictedKey)
			} else {
				this.sequenceFrequency.set(evictedKey, count - 1)
			}
		}
	}

	/**
	 * Finalizes the current strategy and starts a new one.
	 */
	finalizeCurrentStrategy(endTurnIndex: number): void {
		if (this.currentStrategy) {
			this.currentStrategy.turnRange = {
				...this.currentStrategy.turnRange!,
				end: endTurnIndex,
			}
			this.addStrategy(this.currentStrategy as StrategyRecord)
			this.currentStrategy = null
		}
	}

	/**
	 * Starts a new strategy.
	 */
	startNewStrategy(
		turn: { toolPattern: string[]; filesTouched: string[] },
		turnIndex: number,
		classifier: { classifyTool: (tool: string) => ToolCategory },
	): void {
		this.currentStrategy = {
			id: randomUUID(),
			categorySequence: turn.toolPattern.map((t) => classifier.classifyTool(t)),
			filesTouched: [...turn.filesTouched],
			turnRange: { start: turnIndex, end: turnIndex },
			endedInCompression: false,
			producedProgress: false,
			timestamp: Date.now(),
		}
	}

	/**
	 * Detects if the current strategy sequence contains a cycle.
	 */
	detectCycle(currentSequence: ToolCategory[]): {
		isCycle: boolean
		previousOccurrence: StrategyRecord | null
		cycleLength: number
	} {
		const key = currentSequence.join("->")

		// Check for exact sequence match
		// Task 3.5: Start from length-2 (not length-1) to skip the last entry,
		// which is the current strategy itself
		for (let i = this.strategies.length - 2; i >= 0; i--) {
			const seq = this.strategies[i].categorySequence.join("->")
			if (seq === key) {
				return {
					isCycle: true,
					previousOccurrence: this.strategies[i],
					cycleLength: this.strategies.length - i,
				}
			}
		}

		// Check for A-B-A-B pattern (alternating between two strategies)
		if (this.strategies.length >= 4) {
			const last4 = this.strategies.slice(-4)
			if (
				last4[0].categorySequence.join("->") === last4[2].categorySequence.join("->") &&
				last4[1].categorySequence.join("->") === last4[3].categorySequence.join("->")
			) {
				return {
					isCycle: true,
					previousOccurrence: last4[0],
					cycleLength: 2,
				}
			}
		}

		return { isCycle: false, previousOccurrence: null, cycleLength: 0 }
	}

	/**
	 * Returns all recorded strategies.
	 */
	getStrategies(): StrategyRecord[] {
		return [...this.strategies]
	}

	/**
	 * Returns the sequence frequency map.
	 */
	getSequenceFrequency(): Map<string, number> {
		return new Map(this.sequenceFrequency)
	}

	/**
	 * Clears all strategy memory.
	 */
	clear(): void {
		this.strategies = []
		this.sequenceFrequency.clear()
		this.currentStrategy = null
	}
}
