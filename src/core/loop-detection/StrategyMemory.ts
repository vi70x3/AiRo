import { randomUUID } from "node:crypto"

import type {
	StrategyRecord,
	StrategyMemory as StrategyMemoryInterface,
	StrategyCycleResult,
	ToolCategory,
} from "@roo-code/types"

/**
 * StrategyMemory maintains a bounded history of strategies tried during a task.
 * It detects when the agent is cycling through previously‑tried strategies.
 * Memory is bounded by `maxSize` (default 20). When the limit is reached, the
 * oldest strategy is evicted.
 */
export default class StrategyMemory implements StrategyMemoryInterface {
	strategies: StrategyRecord[] = []
	sequenceFrequency: Map<string, number> = new Map()
	private readonly maxSize: number

	constructor(maxSize: number = 20) {
		this.maxSize = maxSize
	}

	/** Add a strategy record to memory, evicting the oldest if over capacity. */
	addStrategy(record: StrategyRecord): void {
		this.strategies.push(record)
		const key = record.categorySequence.join("->")
		this.sequenceFrequency.set(key, (this.sequenceFrequency.get(key) ?? 0) + 1)

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
	 * Detect whether the current strategy sequence represents a cycle.
	 * Checks for exact sequence match or A‑B‑A‑B alternating pattern.
	 */
	detectCycle(currentSequence: ToolCategory[]): StrategyCycleResult {
		const key = currentSequence.join("->")

		// Check for exact sequence match.
		for (let i = this.strategies.length - 1; i >= 0; i--) {
			const seq = this.strategies[i].categorySequence.join("->")
			if (seq === key) {
				return {
					isCycle: true,
					previousOccurrence: this.strategies[i],
					cycleLength: this.strategies.length - i,
				}
			}
		}

		// Check for A-B-A-B alternating pattern.
		if (this.strategies.length >= 4) {
			const last4 = this.strategies.slice(-4)
			const seq0 = last4[0].categorySequence.join("->")
			const seq1 = last4[1].categorySequence.join("->")
			const seq2 = last4[2].categorySequence.join("->")
			const seq3 = last4[3].categorySequence.join("->")

			if (seq0 === seq2 && seq1 === seq3) {
				return {
					isCycle: true,
					previousOccurrence: last4[0],
					cycleLength: 2,
				}
			}
		}

		return { isCycle: false, previousOccurrence: null, cycleLength: 0 }
	}

	/** Get all strategy records (ordered oldest to latest). */
	getStrategies(): StrategyRecord[] {
		return [...this.strategies]
	}

	/** Get the most recent strategy record, or null if empty. */
	getLatest(): StrategyRecord | null {
		return this.strategies.length > 0 ? this.strategies[this.strategies.length - 1] : null
	}

	/** Get the number of strategies in memory. */
	getSize(): number {
		return this.strategies.length
	}

	/** Get the frequency of a specific category sequence. */
	getSequenceFrequency(sequence: ToolCategory[]): number {
		const key = sequence.join("->")
		return this.sequenceFrequency.get(key) ?? 0
	}

	/** Reset all memory. */
	reset(): void {
		this.strategies = []
		this.sequenceFrequency = new Map()
	}

	/** Generate a unique strategy ID. */
	static generateId(): string {
		return randomUUID()
	}
}
