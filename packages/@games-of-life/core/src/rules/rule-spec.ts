import type { NeighborhoodId } from '../spec/mappings.js';

export interface RuleSpec {
	name?: string;
	/**
	 * Bitmask where bit i indicates birth with i neighbors.
	 * Note: mask encoding assumes i <= 31 (single u32).
	 */
	birthMask: number;
	/**
	 * Bitmask where bit i indicates survival with i neighbors.
	 */
	surviveMask: number;
	/** 2 for binary rules, 3+ for Generations-style decay. */
	numStates: number;
	/** Neighborhood determines max neighbor count and (for now) tiling compatibility. */
	neighborhood: NeighborhoodId;
	/** Canonical string if available (optional). */
	ruleString?: string;
}


