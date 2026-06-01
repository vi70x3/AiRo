import { ReasoningTurn } from "../../../packages/types/src/loop-detection"

/**
 * Computes deterministic similarity scores between two ReasoningTurn objects
 * for use in semantic loop detection.
 *
 * The scoring algorithm combines five weighted signals:
 *
 * - **Tool pattern (0.35):** Highest weight because repeated tool sequences
 *   are the strongest loop indicator. Uses LCS-based similarity to capture
 *   ordered sequence overlap (e.g., `read → grep → read` vs itself = 1.0).
 *
 * - **Files touched (0.25):** High weight because revisiting the same files
 *   suggests circular work. Uses Jaccard similarity on file path sets.
 *
 * - **Hypotheses (0.20):** Medium weight because repeating the same hypotheses
 *   without progress indicates looping. Uses Jaccard similarity on normalized
 *   (lowercased, trimmed) string sets.
 *
 * - **Conclusions (0.10):** Lower weight because conclusions may vary even in
 *   productive turns. Uses Jaccard similarity on normalized string sets.
 *
 * - **State transitions (0.10):** Lower weight because state changes may be
 *   incidental. Uses Jaccard similarity on string sets.
 *
 * All computation is deterministic and synchronous — no embeddings or LLM calls.
 */
export default class SimilarityScorer {
	/**
	 * Computes a similarity score between two reasoning turns.
	 * Returns a value from 0.0 (completely different) to 1.0 (identical).
	 */
	computeSimilarity(turnA: ReasoningTurn, turnB: ReasoningTurn): number {
		const toolSim = this.computeToolSimilarity(turnA.toolPattern, turnB.toolPattern)
		const fileSim = this.computeJaccardSimilarity(turnA.filesTouched, turnB.filesTouched)
		const hypothesisSim = this.computeNormalizedJaccardSimilarity(turnA.hypotheses, turnB.hypotheses)
		const conclusionSim = this.computeNormalizedJaccardSimilarity(turnA.conclusions, turnB.conclusions)
		const stateSim = this.computeJaccardSimilarity(turnA.stateTransitions, turnB.stateTransitions)

		return toolSim * 0.35 + fileSim * 0.25 + hypothesisSim * 0.2 + conclusionSim * 0.1 + stateSim * 0.1
	}

	/**
	 * Computes LCS-based similarity for ordered tool sequences.
	 * Formula: 2 * LCS_length / (lenA + lenB)
	 * Returns 0.5 when both sequences are empty (neutral).
	 */
	private computeToolSimilarity(patternA: string[], patternB: string[]): number {
		const lenA = patternA.length
		const lenB = patternB.length

		if (lenA === 0 && lenB === 0) {
			return 0.5
		}
		if (lenA === 0 || lenB === 0) {
			return 0
		}

		const lcsLength = this.longestCommonSubsequence(patternA, patternB)
		return (2 * lcsLength) / (lenA + lenB)
	}

	/**
	 * Computes the length of the longest common subsequence (LCS) of two arrays.
	 * Uses dynamic programming with O(n*m) time and O(min(n,m)) space.
	 */
	private longestCommonSubsequence(a: string[], b: string[]): number {
		// Ensure b is the shorter array for space optimization
		const shorter = a.length < b.length ? a : b
		const longer = a.length < b.length ? b : a

		let prev = new Array(shorter.length + 1).fill(0)
		let curr = new Array(shorter.length + 1).fill(0)

		for (let i = 1; i <= longer.length; i++) {
			for (let j = 1; j <= shorter.length; j++) {
				if (longer[i - 1] === shorter[j - 1]) {
					curr[j] = prev[j - 1] + 1
				} else {
					curr[j] = Math.max(prev[j], curr[j - 1])
				}
			}
			;[prev, curr] = [curr, prev]
			curr.fill(0)
		}

		return prev[shorter.length]
	}

	/**
	 * Computes Jaccard similarity between two string arrays treated as sets.
	 * Formula: |intersection| / |union|
	 * Returns 0.5 when both sets are empty (neutral).
	 */
	private computeJaccardSimilarity(setA: string[], setB: string[]): number {
		if (setA.length === 0 && setB.length === 0) {
			return 0.5
		}

		const a = new Set(setA)
		const b = new Set(setB)

		let intersectionSize = 0
		for (const item of a) {
			if (b.has(item)) {
				intersectionSize++
			}
		}

		const unionSize = a.size + b.size - intersectionSize

		return unionSize === 0 ? 0.5 : intersectionSize / unionSize
	}

	/**
	 * Computes Jaccard similarity on normalized (lowercased, trimmed) string sets.
	 * Returns 0.5 when both sets are empty (neutral).
	 */
	private computeNormalizedJaccardSimilarity(arrA: string[], arrB: string[]): number {
		const normalizedA = arrA.map((s) => s.toLowerCase().trim())
		const normalizedB = arrB.map((s) => s.toLowerCase().trim())
		return this.computeJaccardSimilarity(normalizedA, normalizedB)
	}
}
