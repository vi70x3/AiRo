export interface ModelUsageRecord {
	provider: string
	modelId: string
	turnIndex: number
}

export class ModelUsageTracker {
	private readonly records: ModelUsageRecord[] = []

	constructor(private readonly maxRecords: number) {
		if (maxRecords < 1) {
			throw new Error("maxRecords must be at least 1")
		}
	}

	/**
	 * Records a model usage entry. Evicts the oldest record if the
	 * number of stored records would exceed `maxRecords`.
	 */
	recordCurrentModel(provider: string, modelId: string, turnIndex: number): void {
		this.records.push({ provider, modelId, turnIndex })

		while (this.records.length > this.maxRecords) {
			this.records.shift()
		}
	}

	/**
	 * Returns the most recent model usage record, or `undefined` if
	 * no records have been stored yet.
	 */
	getMostRecent(): ModelUsageRecord | undefined {
		return this.records.length > 0 ? this.records[this.records.length - 1] : undefined
	}

	/**
	 * Returns a read-only view of all records currently in the lookback window.
	 */
	getRecentRecords(): readonly ModelUsageRecord[] {
		return [...this.records]
	}

	/**
	 * Checks whether a model with the given provider and modelId appears
	 * in the recent records lookback window.
	 */
	wasModelRecentlyUsed(provider: string, modelId: string): boolean {
		return this.records.some((r) => r.provider === provider && r.modelId === modelId)
	}
}
