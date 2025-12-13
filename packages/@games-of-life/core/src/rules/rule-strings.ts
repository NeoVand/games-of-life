import type { NeighborhoodId } from '../spec/mappings.js';
import type { RuleSpec } from './rule-spec.js';

export function maxNeighborsForNeighborhood(nh: NeighborhoodId): number {
	switch (nh) {
		case 'vonNeumann':
			return 4;
		case 'extendedMoore':
			return 24;
		case 'hexagonal':
			return 6;
		case 'extendedHexagonal':
			return 18;
		case 'moore':
		default:
			return 8;
	}
}

/**
 * Parse a neighbor specification into a u32 bitmask.
 *
 * Supports:
 * - "23" (single digits)
 * - "9-17" (range)
 * - "2-5,8" (mixed)
 * - "3,11,12" (explicit list)
 */
export function parseNeighborSpecToMask(spec: string, maxNeighbors: number): number {
	if (!spec) return 0;

	let mask = 0;

	const rangeMatch = spec.match(/^(\d+)-(\d+)$/);
	if (rangeMatch) {
		const start = Number.parseInt(rangeMatch[1]!, 10);
		const end = Number.parseInt(rangeMatch[2]!, 10);
		for (let i = start; i <= end && i <= maxNeighbors; i++) mask |= 1 << i;
		return mask;
	}

	if (spec.includes(',') || spec.includes('-')) {
		const parts = spec.split(',');
		for (const part of parts) {
			const subRange = part.match(/^(\d+)-(\d+)$/);
			if (subRange) {
				const start = Number.parseInt(subRange[1]!, 10);
				const end = Number.parseInt(subRange[2]!, 10);
				for (let i = start; i <= end && i <= maxNeighbors; i++) mask |= 1 << i;
			} else {
				const n = Number.parseInt(part, 10);
				if (Number.isFinite(n) && n >= 0 && n <= maxNeighbors) mask |= 1 << n;
			}
		}
		return mask;
	}

	// Simple digit concatenation.
	for (const digit of spec) {
		const n = Number.parseInt(digit, 10);
		if (Number.isFinite(n) && n >= 0 && n <= 9 && n <= maxNeighbors) mask |= 1 << n;
	}

	return mask;
}

/**
 * Parse a B/S rule string into masks and generations count.
 *
 * NOTE: The neighborhood is not encoded in the string. The caller must set it.
 */
export function parseRuleString(ruleString: string): Omit<RuleSpec, 'neighborhood'> | null {
	const normalized = ruleString.toUpperCase().replace(/\s+/g, '');
	const match = normalized.match(/^B([\d,-]*)\/S([\d,-]*)(?:\/C(\d+))?$/);
	if (!match) return null;

	const birthSpec = match[1] ?? '';
	const surviveSpec = match[2] ?? '';
	const numStates = match[3] ? Number.parseInt(match[3], 10) : 2;

	// We must assume up to 24 neighbors to parse; caller can validate/clip by neighborhood later.
	const maxNeighbors = 24;
	const birthMask = parseNeighborSpecToMask(birthSpec, maxNeighbors);
	const surviveMask = parseNeighborSpecToMask(surviveSpec, maxNeighbors);

	return { birthMask, surviveMask, numStates, ruleString: normalized };
}

/**
 * Format a mask to a neighbor spec string.
 *
 * Strategy:
 * - Prefer compact concatenation when all values are single digits.
 * - Otherwise use comma-separated integers.
 *
 * (We can add optional range compression later.)
 */
export function formatMaskToNeighborSpec(mask: number, maxNeighbors: number): string {
	const values: number[] = [];
	for (let i = 0; i <= maxNeighbors; i++) {
		// eslint-disable-next-line no-bitwise
		if ((mask & (1 << i)) !== 0) values.push(i);
	}
	if (values.length === 0) return '';
	if (values.every((n) => n < 10)) return values.join('');
	return values.join(',');
}

/**
 * Canonical formatter for a RuleSpec.
 *
 * Unlike the app's legacy `ruleToString`, this supports extended neighborhoods up to 24.
 */
export function formatRuleString(rule: RuleSpec): string {
	const maxNeighbors = maxNeighborsForNeighborhood(rule.neighborhood);
	const birth = formatMaskToNeighborSpec(rule.birthMask, maxNeighbors);
	const survive = formatMaskToNeighborSpec(rule.surviveMask, maxNeighbors);
	let result = `B${birth}/S${survive}`;
	if (rule.numStates > 2) result += `/C${rule.numStates}`;
	return result;
}


