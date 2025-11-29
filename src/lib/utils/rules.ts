/**
 * Cellular Automaton Rules
 * Handles B/S notation parsing and rule presets
 */

export interface CARule {
	name: string;
	birthMask: number; // Bit mask: bit i = 1 means birth with i neighbors
	surviveMask: number; // Bit mask: bit i = 1 means survive with i neighbors
	numStates: number; // 2 for Life-like, 3+ for Generations
	ruleString: string; // Original rule string (e.g., "B3/S23" or "B2/S345/C4")
}

/**
 * Parse a B/S notation rule string
 * Formats supported:
 *   - "B3/S23" - Standard Life-like
 *   - "B36/S23" - HighLife
 *   - "B2/S/C3" - Generations with 3 states
 *   - "B2/S345/C4" - Generations with 4 states
 */
export function parseRule(ruleString: string): CARule | null {
	const normalized = ruleString.toUpperCase().replace(/\s+/g, '');

	// Match B[digits]/S[digits] or B[digits]/S[digits]/C[digits]
	const match = normalized.match(/^B(\d*)\/S(\d*)(?:\/C(\d+))?$/);
	if (!match) {
		return null;
	}

	const birthDigits = match[1] || '';
	const surviveDigits = match[2] || '';
	const generations = match[3] ? parseInt(match[3], 10) : 2;

	// Convert digit strings to bit masks
	let birthMask = 0;
	for (const digit of birthDigits) {
		const n = parseInt(digit, 10);
		if (n >= 0 && n <= 8) {
			birthMask |= 1 << n;
		}
	}

	let surviveMask = 0;
	for (const digit of surviveDigits) {
		const n = parseInt(digit, 10);
		if (n >= 0 && n <= 8) {
			surviveMask |= 1 << n;
		}
	}

	return {
		name: 'Custom',
		birthMask,
		surviveMask,
		numStates: generations,
		ruleString: normalized
	};
}

/**
 * Convert a rule back to B/S notation string
 */
export function ruleToString(rule: CARule): string {
	let birthStr = 'B';
	let surviveStr = 'S';

	for (let i = 0; i <= 8; i++) {
		if (rule.birthMask & (1 << i)) {
			birthStr += i;
		}
		if (rule.surviveMask & (1 << i)) {
			surviveStr += i;
		}
	}

	let result = `${birthStr}/${surviveStr}`;
	if (rule.numStates > 2) {
		result += `/C${rule.numStates}`;
	}

	return result;
}

/**
 * Preset rules
 */
export const RULE_PRESETS: CARule[] = [
	{
		name: "Conway's Life",
		birthMask: 0b000001000, // 3
		surviveMask: 0b000001100, // 2, 3
		numStates: 2,
		ruleString: 'B3/S23'
	},
	{
		name: 'HighLife',
		birthMask: 0b001001000, // 3, 6
		surviveMask: 0b000001100, // 2, 3
		numStates: 2,
		ruleString: 'B36/S23'
	},
	{
		name: 'Day & Night',
		birthMask: 0b111001000, // 3, 6, 7, 8
		surviveMask: 0b111011100, // 3, 4, 6, 7, 8
		numStates: 2,
		ruleString: 'B3678/S34678'
	},
	{
		name: 'Seeds',
		birthMask: 0b000000100, // 2
		surviveMask: 0b000000000, // none
		numStates: 2,
		ruleString: 'B2/S'
	},
	{
		name: 'Life without Death',
		birthMask: 0b000001000, // 3
		surviveMask: 0b111111111, // 0-8
		numStates: 2,
		ruleString: 'B3/S012345678'
	},
	{
		name: 'Diamoeba',
		birthMask: 0b101101000, // 3, 5, 6, 7, 8
		surviveMask: 0b101100100, // 5, 6, 7, 8
		numStates: 2,
		ruleString: 'B35678/S5678'
	},
	{
		name: '2x2',
		birthMask: 0b001001000, // 3, 6
		surviveMask: 0b000010110, // 1, 2, 5
		numStates: 2,
		ruleString: 'B36/S125'
	},
	{
		name: 'Replicator',
		birthMask: 0b010101010, // 1, 3, 5, 7
		surviveMask: 0b010101010, // 1, 3, 5, 7
		numStates: 2,
		ruleString: 'B1357/S1357'
	},
	{
		name: "Brian's Brain",
		birthMask: 0b000000100, // 2
		surviveMask: 0b000000000, // none (alive cells always die)
		numStates: 3,
		ruleString: 'B2/S/C3'
	},
	{
		name: 'Star Wars',
		birthMask: 0b000000100, // 2
		surviveMask: 0b000111000, // 3, 4, 5
		numStates: 4,
		ruleString: 'B2/S345/C4'
	},
	{
		name: 'Lava',
		birthMask: 0b001001100, // 2, 3, 5, 6
		surviveMask: 0b000011000, // 4, 5
		numStates: 8,
		ruleString: 'B2356/S45/C8'
	},
	{
		name: 'Frogs',
		birthMask: 0b000000100, // 2
		surviveMask: 0b000000100, // 2
		numStates: 3,
		ruleString: 'B2/S2/C3'
	}
];

/**
 * Get a rule by name
 */
export function getRuleByName(name: string): CARule | undefined {
	return RULE_PRESETS.find((r) => r.name.toLowerCase() === name.toLowerCase());
}

/**
 * Get the default rule (Conway's Life)
 */
export function getDefaultRule(): CARule {
	return RULE_PRESETS[0];
}

/**
 * Validate a rule string
 */
export function isValidRuleString(ruleString: string): boolean {
	return parseRule(ruleString) !== null;
}

