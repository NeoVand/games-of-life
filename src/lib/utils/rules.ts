/**
 * Cellular Automaton Rules
 * Handles B/S notation parsing and rule presets
 */

// Neighborhood types
export type NeighborhoodType = 'moore' | 'vonNeumann' | 'extendedMoore' | 'hexagonal' | 'extendedHexagonal';

export interface NeighborhoodInfo {
	type: NeighborhoodType;
	name: string;
	maxNeighbors: number;
	description: string;
}

export const NEIGHBORHOODS: Record<NeighborhoodType, NeighborhoodInfo> = {
	moore: {
		type: 'moore',
		name: 'Moore',
		maxNeighbors: 8,
		description: 'All 8 surrounding cells (orthogonal + diagonal)'
	},
	vonNeumann: {
		type: 'vonNeumann',
		name: 'Von Neumann',
		maxNeighbors: 4,
		description: 'Only 4 orthogonal neighbors (N, S, E, W)'
	},
	extendedMoore: {
		type: 'extendedMoore',
		name: 'Extended Moore',
		maxNeighbors: 24,
		description: 'All cells within 2-cell radius (5x5 minus center)'
	},
	hexagonal: {
		type: 'hexagonal',
		name: 'Hexagonal',
		maxNeighbors: 6,
		description: 'Hexagonal grid with 6 neighbors'
	},
	extendedHexagonal: {
		type: 'extendedHexagonal',
		name: 'Extended Hex',
		maxNeighbors: 18,
		description: 'Hexagonal grid with 2-ring radius (18 neighbors)'
	}
};

// Rule categories for organization
export type RuleCategory = 'classic' | 'chaotic' | 'expanding' | 'artistic' | 'generations';

export interface RuleCategoryInfo {
	id: RuleCategory;
	name: string;
	description: string;
}

export const RULE_CATEGORIES: RuleCategoryInfo[] = [
	{ id: 'classic', name: 'Classic', description: 'Well-known stable patterns' },
	{ id: 'chaotic', name: 'Chaotic', description: 'Unpredictable, explosive behavior' },
	{ id: 'expanding', name: 'Expanding', description: 'Patterns that grow endlessly' },
	{ id: 'artistic', name: 'Artistic', description: 'Creates beautiful visual patterns' },
	{ id: 'generations', name: 'Generations', description: 'Multi-state with decay trails' }
];

export interface CARule {
	name: string;
	birthMask: number; // Bit mask: bit i = 1 means birth with i neighbors
	surviveMask: number; // Bit mask: bit i = 1 means survive with i neighbors
	numStates: number; // 2 for Life-like, 3+ for Generations
	ruleString: string; // Original rule string (e.g., "B3/S23" or "B2/S345/C4")
	neighborhood?: NeighborhoodType; // Default: 'moore'
	category?: RuleCategory;
	description?: string; // Brief description of behavior
	density?: number; // Recommended initial density (0-1), default 0.25
}

/**
 * Parse a neighbor specification string into a bitmask
 * Supports: "23" (individual digits), "9-17" (range), "2-5,8" (mixed)
 */
function parseNeighborSpec(spec: string, maxNeighbors: number = 24): number {
	if (!spec) return 0;
	
	let mask = 0;
	
	// Check for range notation (e.g., "9-17")
	const rangeMatch = spec.match(/^(\d+)-(\d+)$/);
	if (rangeMatch) {
		const start = parseInt(rangeMatch[1], 10);
		const end = parseInt(rangeMatch[2], 10);
		for (let i = start; i <= end && i <= maxNeighbors; i++) {
			mask |= 1 << i;
		}
		return mask;
	}
	
	// Otherwise, treat each character as a digit (for single digits 0-9)
	// or handle multi-digit numbers separated by commas
	if (spec.includes(',') || spec.includes('-')) {
		// Complex format: "1,3,5" or "1-3,7"
		const parts = spec.split(',');
		for (const part of parts) {
			const subRange = part.match(/^(\d+)-(\d+)$/);
			if (subRange) {
				const start = parseInt(subRange[1], 10);
				const end = parseInt(subRange[2], 10);
				for (let i = start; i <= end && i <= maxNeighbors; i++) {
					mask |= 1 << i;
				}
			} else {
				const n = parseInt(part, 10);
				if (n >= 0 && n <= maxNeighbors) {
					mask |= 1 << n;
				}
			}
		}
	} else {
		// Simple format: "236" means 2, 3, 6
		for (const digit of spec) {
			const n = parseInt(digit, 10);
			if (n >= 0 && n <= 9) {
				mask |= 1 << n;
			}
		}
	}
	
	return mask;
}

/**
 * Parse a B/S notation rule string
 * Formats supported:
 *   - "B3/S23" - Standard Life-like
 *   - "B36/S23" - HighLife
 *   - "B2/S/C3" - Generations with 3 states
 *   - "B2/S345/C4" - Generations with 4 states
 *   - "B9-17/S9-18" - Range notation for extended neighborhoods
 */
export function parseRule(ruleString: string): CARule | null {
	const normalized = ruleString.toUpperCase().replace(/\s+/g, '');

	// Match B[spec]/S[spec] or B[spec]/S[spec]/C[digits]
	// spec can be digits, ranges like "9-17", or comma-separated
	const match = normalized.match(/^B([\d,\-]*)\/S([\d,\-]*)(?:\/C(\d+))?$/);
	if (!match) {
		return null;
	}

	const birthSpec = match[1] || '';
	const surviveSpec = match[2] || '';
	const generations = match[3] ? parseInt(match[3], 10) : 2;

	const birthMask = parseNeighborSpec(birthSpec);
	const surviveMask = parseNeighborSpec(surviveSpec);

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
 * Preset rules organized by category
 */
export const RULE_PRESETS: CARule[] = [
	// === CLASSIC ===
	{
		name: "Conway's Life",
		birthMask: 0b000001000, // 3
		surviveMask: 0b000001100, // 2, 3
		numStates: 2,
		ruleString: 'B3/S23',
		category: 'classic',
		description: 'The original - gliders, oscillators, and complex emergent behavior'
	},
	{
		name: 'HighLife',
		birthMask: 0b001001000, // 3, 6
		surviveMask: 0b000001100, // 2, 3
		numStates: 2,
		ruleString: 'B36/S23',
		category: 'classic',
		description: 'Like Life, but with a natural replicator pattern'
	},
	{
		name: 'Day & Night',
		birthMask: 0b111001000, // 3, 6, 7, 8
		surviveMask: 0b111011100, // 3, 4, 6, 7, 8
		numStates: 2,
		ruleString: 'B3678/S34678',
		category: 'classic',
		description: 'Symmetric rule - patterns work inverted too'
	},
	{
		name: 'Morley',
		birthMask: 0b101001000, // 3, 6, 8
		surviveMask: 0b001001100, // 2, 3, 5
		numStates: 2,
		ruleString: 'B368/S245',
		category: 'classic',
		description: 'Creates diagonal gliders and complex structures'
	},
	{
		name: '2x2',
		birthMask: 0b001001000, // 3, 6
		surviveMask: 0b000010110, // 1, 2, 5
		numStates: 2,
		ruleString: 'B36/S125',
		category: 'classic',
		description: 'Creates 2x2 block-based structures'
	},

	// === CHAOTIC ===
	{
		name: 'Seeds',
		birthMask: 0b000000100, // 2
		surviveMask: 0b000000000, // none
		numStates: 2,
		ruleString: 'B2/S',
		category: 'chaotic',
		description: 'Explosive! Every cell dies, but births spread like fire'
	},
	{
		name: 'Replicator',
		birthMask: 0b010101010, // 1, 3, 5, 7
		surviveMask: 0b010101010, // 1, 3, 5, 7
		numStates: 2,
		ruleString: 'B1357/S1357',
		category: 'chaotic',
		description: 'Every pattern replicates - chaotic fractals'
	},
	{
		name: 'Gnarl',
		birthMask: 0b000000010, // 1
		surviveMask: 0b000000010, // 1
		numStates: 2,
		ruleString: 'B1/S1',
		category: 'chaotic',
		description: 'Explosive growth from single cells'
	},
	{
		name: 'Maze',
		birthMask: 0b000001000, // 3
		surviveMask: 0b000011110, // 1, 2, 3, 4
		numStates: 2,
		ruleString: 'B3/S12345',
		category: 'chaotic',
		description: 'Creates maze-like corridors that fill space'
	},
	{
		name: 'Mazectric',
		birthMask: 0b000001000, // 3
		surviveMask: 0b000001110, // 1, 2, 3
		numStates: 2,
		ruleString: 'B3/S1234',
		category: 'chaotic',
		description: 'Like Maze but with more diagonal passages'
	},

	// === EXPANDING ===
	{
		name: 'Life without Death',
		birthMask: 0b000001000, // 3
		surviveMask: 0b111111111, // 0-8
		numStates: 2,
		ruleString: 'B3/S012345678',
		category: 'expanding',
		description: 'Cells never die - grows into intricate lace patterns'
	},
	{
		name: 'Diamoeba',
		birthMask: 0b101101000, // 3, 5, 6, 7, 8
		surviveMask: 0b101100100, // 5, 6, 7, 8
		numStates: 2,
		ruleString: 'B35678/S5678',
		category: 'expanding',
		description: 'Creates amoeba-like blobs that grow and merge'
	},
	{
		name: 'Coral',
		birthMask: 0b000001000, // 3
		surviveMask: 0b001111100, // 4, 5, 6, 7, 8
		numStates: 2,
		ruleString: 'B3/S45678',
		category: 'expanding',
		description: 'Grows coral-like branching structures'
	},
	{
		name: 'Anneal',
		birthMask: 0b101101000, // 3, 5, 6, 7, 8
		surviveMask: 0b101101000, // 3, 5, 6, 7, 8
		numStates: 2,
		ruleString: 'B35678/S35678',
		category: 'expanding',
		description: 'Fills in gaps, creates solid regions'
	},

	// === ARTISTIC ===
	{
		name: 'Coagulations',
		birthMask: 0b101111000, // 3, 7, 8
		surviveMask: 0b001111100, // 2, 3, 5, 6, 7
		numStates: 2,
		ruleString: 'B378/S235678',
		category: 'artistic',
		description: 'Creates organic, coagulating patterns'
	},
	{
		name: 'Assimilation',
		birthMask: 0b101111000, // 3, 4, 5
		surviveMask: 0b001111100, // 4, 5, 6, 7
		numStates: 2,
		ruleString: 'B345/S4567',
		category: 'artistic',
		description: 'Smooth, flowing growth patterns'
	},
	{
		name: 'Stains',
		birthMask: 0b101101000, // 3, 6, 7, 8
		surviveMask: 0b001101100, // 2, 3, 5, 6, 7, 8
		numStates: 2,
		ruleString: 'B3678/S235678',
		category: 'artistic',
		description: 'Creates ink-stain-like spreading patterns'
	},
	{
		name: 'Walled Cities',
		birthMask: 0b001011000, // 4, 5, 6, 7, 8
		surviveMask: 0b001111100, // 2, 3, 4, 5
		numStates: 2,
		ruleString: 'B45678/S2345',
		category: 'artistic',
		description: 'Creates walled regions with internal activity'
	},

	// === GENERATIONS (Multi-state with trails) ===
	{
		name: "Brian's Brain",
		birthMask: 0b000000100, // 2
		surviveMask: 0b000000000, // none (alive cells always die)
		numStates: 3,
		ruleString: 'B2/S/C3',
		category: 'generations',
		description: 'Classic 3-state - creates moving waves and gliders'
	},
	{
		name: 'Star Wars',
		birthMask: 0b000000100, // 2
		surviveMask: 0b000111000, // 3, 4, 5
		numStates: 4,
		ruleString: 'B2/S345/C4',
		category: 'generations',
		description: 'Beautiful 4-state with persistent structures and trails'
	},
	{
		name: 'Lava',
		birthMask: 0b001001100, // 2, 3, 6
		surviveMask: 0b000011000, // 4, 5
		numStates: 8,
		ruleString: 'B236/S45/C8',
		category: 'generations',
		description: 'Long trails create flowing lava-like patterns'
	},
	{
		name: 'Frogs',
		birthMask: 0b000000100, // 2
		surviveMask: 0b000000100, // 2
		numStates: 3,
		ruleString: 'B2/S2/C3',
		category: 'generations',
		description: 'Creates hopping, frog-like moving patterns'
	},
	{
		name: 'Caterpillars',
		birthMask: 0b101111000, // 3, 4, 5, 7, 8
		surviveMask: 0b001101100, // 2, 3, 5, 6, 7
		numStates: 4,
		ruleString: 'B34578/S23567/C4',
		category: 'generations',
		description: 'Creates crawling, caterpillar-like patterns'
	},
	{
		name: 'Fireworks',
		birthMask: 0b000000100, // 2
		surviveMask: 0b000000000, // none
		numStates: 8,
		ruleString: 'B2/S/C8',
		category: 'generations',
		description: 'Seeds with long trails - explosive firework effects'
	},
	{
		name: 'Transers',
		birthMask: 0b001101000, // 3, 5, 6
		surviveMask: 0b000011100, // 2, 3, 4, 5
		numStates: 5,
		ruleString: 'B356/S2345/C5',
		category: 'generations',
		description: 'Creates transferring, flowing wave patterns'
	},
	{
		name: 'SoftFreeze',
		birthMask: 0b001011000, // 3, 4, 6, 7, 8
		surviveMask: 0b001001100, // 2, 3, 6
		numStates: 6,
		ruleString: 'B34678/S236/C6',
		category: 'generations',
		description: 'Crystalline patterns that slowly freeze'
	},

	// === BEAUTIFUL / AESTHETIC RULES ===
	// These are well-tested rules known for creating visually appealing patterns
	
	// Star Wars variant with longer trails - very reliable
	{
		name: 'Star Wars Long',
		birthMask: 0b000000100, // 2
		surviveMask: 0b000111000, // 3, 4, 5
		numStates: 8,
		ruleString: 'B2/S345/C8',
		category: 'artistic',
		description: 'Star Wars with longer colorful trails',
		density: 0.35
	},
	// Seeds variant with trails - explosive patterns
	{
		name: 'Seeds Trail',
		birthMask: 0b000000100, // 2
		surviveMask: 0b000000000, // none
		numStates: 4,
		ruleString: 'B2/S/C4',
		category: 'artistic',
		description: 'Seeds with short colorful trails - explosive growth',
		density: 0.03
	},
	// Seeds with long trails - explosive but beautiful
	{
		name: 'Faders',
		birthMask: 0b000000100, // 2
		surviveMask: 0b000000000, // none
		numStates: 25,
		ruleString: 'B2/S/C25',
		category: 'artistic',
		description: 'Explosive seeds with very long rainbow trails',
		density: 0.02
	},
	// Smooth gliding HighLife patterns
	{
		name: 'Glissade',
		birthMask: 0b001001000, // 3, 6
		surviveMask: 0b000001100, // 2, 3
		numStates: 8,
		ruleString: 'B36/S23/C8',
		category: 'artistic',
		description: 'Smooth gliding HighLife with trails',
		density: 0.20
	},
	// Life-like with trails - very stable
	{
		name: 'Life Trail',
		birthMask: 0b000001000, // 3
		surviveMask: 0b000001100, // 2, 3
		numStates: 8,
		ruleString: 'B3/S23/C8',
		category: 'artistic',
		description: 'Conway Life with beautiful fading trails',
		density: 0.25
	},
	// Caterpillar-like crawlers
	{
		name: 'Crawlers',
		birthMask: 0b000111000, // 3, 4, 5
		surviveMask: 0b001111000, // 3, 4, 5, 6
		numStates: 5,
		ruleString: 'B345/S3456/C5',
		category: 'artistic',
		description: 'Crawling worm-like patterns',
		density: 0.40
	},
	// Smooth blob-like growth
	{
		name: 'Blobs',
		birthMask: 0b001111000, // 3, 4, 5, 6
		surviveMask: 0b001111100, // 2, 3, 4, 5, 6
		numStates: 4,
		ruleString: 'B3456/S23456/C4',
		category: 'artistic',
		description: 'Smooth organic blob growth',
		density: 0.45
	},
	// Day and Night with trails
	{
		name: 'Day Night Trail',
		birthMask: 0b111101000, // 3, 6, 7, 8
		surviveMask: 0b111111000, // 3, 4, 5, 6, 7, 8
		numStates: 5,
		ruleString: 'B3678/S345678/C5',
		category: 'artistic',
		description: 'Day & Night variant with fading trails',
		density: 0.50
	},
	// Coagulating patterns
	{
		name: 'Coagulate',
		birthMask: 0b101111000, // 3, 4, 5, 7, 8
		surviveMask: 0b001111100, // 2, 3, 4, 5, 6
		numStates: 6,
		ruleString: 'B34578/S23456/C6',
		category: 'artistic',
		description: 'Coagulating, merging patterns',
		density: 0.35
	},
	// Slow-moving waves
	{
		name: 'Slow Burn',
		birthMask: 0b001001000, // 3, 6
		surviveMask: 0b000111100, // 2, 3, 4, 5
		numStates: 10,
		ruleString: 'B36/S2345/C10',
		category: 'artistic',
		description: 'Slow burning waves with long trails',
		density: 0.25
	},
	// Maze-like with trails
	{
		name: 'Maze Trail',
		birthMask: 0b000001000, // 3
		surviveMask: 0b000011110, // 1, 2, 3, 4
		numStates: 6,
		ruleString: 'B3/S1234/C6',
		category: 'artistic',
		description: 'Maze-like growth with trails',
		density: 0.20
	},
	// Diamoeba variant with trails
	{
		name: 'Amoeba Trail',
		birthMask: 0b101111000, // 3, 5, 6, 7, 8
		surviveMask: 0b111111100, // 2, 3, 4, 5, 6, 7, 8
		numStates: 5,
		ruleString: 'B35678/S2345678/C5',
		category: 'artistic',
		description: 'Amoeba-like organic growth with trails',
		density: 0.50
	},

	// === VON NEUMANN NEIGHBORHOOD (4 neighbors) ===
	{
		name: 'VN Diamonds',
		birthMask: 0b000000100, // 2
		surviveMask: 0b000000110, // 1, 2
		numStates: 2,
		ruleString: 'B2/S12',
		neighborhood: 'vonNeumann',
		category: 'expanding',
		description: 'Creates expanding diamond shapes'
	},
	{
		name: 'VN Fredkin',
		birthMask: 0b000001010, // 1, 3
		surviveMask: 0b000001010, // 1, 3
		numStates: 2,
		ruleString: 'B13/S13',
		neighborhood: 'vonNeumann',
		category: 'chaotic',
		description: 'Self-replicating XOR patterns - every shape copies itself'
	},
	{
		name: 'VN Pulse',
		birthMask: 0b000000100, // 2
		surviveMask: 0b000001100, // 2, 3
		numStates: 2,
		ruleString: 'B2/S23',
		neighborhood: 'vonNeumann',
		category: 'classic',
		description: 'Pulsing orthogonal patterns'
	},
	{
		name: 'VN Trails',
		birthMask: 0b000000110, // 1, 2
		surviveMask: 0b000000010, // 1
		numStates: 4,
		ruleString: 'B12/S1/C4',
		neighborhood: 'vonNeumann',
		category: 'generations',
		description: 'Creates trailing orthogonal waves'
	},

	// === EXTENDED MOORE NEIGHBORHOOD (24 neighbors) ===
	{
		name: 'Larger than Life',
		birthMask: 0b1111111100000000000, // 9-17
		surviveMask: 0b1111111111100000000, // 9-18
		numStates: 2,
		ruleString: 'B9-17/S9-18',
		neighborhood: 'extendedMoore',
		category: 'artistic',
		description: 'Smooth, organic blobs with extended range'
	},
	{
		name: 'LtL Trails',
		birthMask: 0b11100000000000, // 11-13 (narrow birth range prevents flashing)
		surviveMask: 0b1111111111100000000, // 9-18 (broad survival)
		numStates: 6,
		ruleString: 'B11-13/S9-18/C6',
		neighborhood: 'extendedMoore',
		category: 'artistic',
		description: 'Larger than Life with colorful decay trails',
		density: 0.45
	},
	{
		name: 'Blob Waves',
		birthMask: 0b111100000000000, // 11-14 (narrow birth)
		surviveMask: 0b11111111111100000000, // 10-20 (broad survival)
		numStates: 8,
		ruleString: 'B11-14/S10-20/C8',
		neighborhood: 'extendedMoore',
		category: 'artistic',
		description: 'Smooth blobs with rainbow wave trails',
		density: 0.5
	},
	{
		name: 'Organic Flow',
		birthMask: 0b1110000000000, // 10-12 (very narrow birth)
		surviveMask: 0b111111111110000000, // 9-17
		numStates: 10,
		ruleString: 'B10-12/S9-17/C10',
		neighborhood: 'extendedMoore',
		category: 'artistic',
		description: 'Flowing organic shapes with long rainbow trails',
		density: 0.5
	},
	{
		name: 'Bugs',
		birthMask: 0b111111111111000000000000, // 11-23
		surviveMask: 0b111111111111000000000000, // 11-23
		numStates: 2,
		ruleString: 'B11-23/S11-23',
		neighborhood: 'extendedMoore',
		category: 'expanding',
		description: 'Creates bug-like crawling organisms'
	},
	{
		name: 'Globe',
		birthMask: 0b111111110000000000, // 10-17
		surviveMask: 0b1111111111110000000000, // 13-21
		numStates: 2,
		ruleString: 'B10-17/S13-21',
		neighborhood: 'extendedMoore',
		category: 'artistic',
		description: 'Forms globe-like circular structures'
	},
	{
		name: 'Majority',
		birthMask: 0b1111111111111000000000000, // 13-24
		surviveMask: 0b1111111111111000000000000, // 13-24
		numStates: 2,
		ruleString: 'B13-24/S13-24',
		neighborhood: 'extendedMoore',
		category: 'expanding',
		description: 'Cells follow the majority - creates smooth regions'
	},
	{
		name: 'Primordia',
		birthMask: 0b111111100000000000, // 9-15
		surviveMask: 0b11111111111100000000, // 10-19
		numStates: 2,
		ruleString: 'B9-15/S10-19',
		neighborhood: 'extendedMoore',
		category: 'artistic',
		description: 'Primordial soup - organic blob evolution'
	},
	{
		name: 'Waffle',
		birthMask: 0b111111000000000, // 7-12
		surviveMask: 0b1111111111000000000, // 9-18
		numStates: 2,
		ruleString: 'B7-12/S9-18',
		neighborhood: 'extendedMoore',
		category: 'artistic',
		description: 'Creates waffle-like grid patterns'
	},
	{
		name: 'Gnarl Extended',
		birthMask: 0b000000010, // 1
		surviveMask: 0b111111110, // 1-7
		numStates: 2,
		ruleString: 'B1/S1-7',
		neighborhood: 'extendedMoore',
		category: 'chaotic',
		description: 'Gnarl with extended reach - fractal growth'
	},
	{
		name: 'Bosco',
		birthMask: 0b111111111111000000000000, // 11-23
		surviveMask: 0b1111111111100000000, // 9-18
		numStates: 2,
		ruleString: 'B11-23/S9-18',
		neighborhood: 'extendedMoore',
		category: 'expanding',
		description: 'Creates forest-like growth patterns'
	},

	// === HEXAGONAL ===
	// Classic hexagonal rules - 6 neighbors create beautiful symmetric patterns
	{
		name: 'Hex Life',
		birthMask: 0b0000100, // 2
		surviveMask: 0b0111000, // 3, 4, 5
		numStates: 2,
		ruleString: 'B2/S345',
		neighborhood: 'hexagonal',
		category: 'classic',
		description: 'Classic hexagonal Game of Life - stable and oscillating patterns',
		density: 0.2
	},
	{
		name: 'Hex Seeds',
		birthMask: 0b0000100, // 2
		surviveMask: 0b0000000, // none
		numStates: 2,
		ruleString: 'B2/S',
		neighborhood: 'hexagonal',
		category: 'chaotic',
		description: 'Explosive hexagonal growth from any seed',
		density: 0.05
	},
	{
		name: 'Hex Trails',
		birthMask: 0b0000100, // 2
		surviveMask: 0b0001000, // 3
		numStates: 4,
		ruleString: 'B2/S3/C4',
		neighborhood: 'hexagonal',
		category: 'generations',
		description: 'Hexagonal patterns with colorful decay trails',
		density: 0.15
	},
	{
		name: 'Hex Snowflake',
		birthMask: 0b0000010, // 1
		surviveMask: 0b0111110, // 1, 2, 3, 4, 5
		numStates: 2,
		ruleString: 'B1/S12345',
		neighborhood: 'hexagonal',
		category: 'expanding',
		description: 'Creates beautiful 6-fold symmetric snowflake patterns',
		density: 0.01
	},
	{
		name: 'Hex Coral',
		birthMask: 0b0111000, // 3, 4, 5
		surviveMask: 0b0111000, // 3, 4, 5
		numStates: 2,
		ruleString: 'B345/S345',
		neighborhood: 'hexagonal',
		category: 'artistic',
		description: 'Creates coral-like branching hexagonal structures',
		density: 0.25
	},
	{
		name: 'Hex Waves',
		birthMask: 0b0111100, // 2, 3, 4, 5
		surviveMask: 0b0000110, // 1, 2
		numStates: 6,
		ruleString: 'B2345/S12/C6',
		neighborhood: 'hexagonal',
		category: 'generations',
		description: 'Creates flowing wave patterns on hexagonal grid',
		density: 0.3
	},
	{
		name: 'Hex Neo Brain',
		birthMask: 0b0001100, // 2, 3
		surviveMask: 0b0101100, // 2, 3, 5
		numStates: 22,
		ruleString: 'B23/S235/C22',
		neighborhood: 'hexagonal',
		category: 'artistic',
		description: 'Beautiful long-trail patterns with mesmerizing flow',
		density: 0.25
	},
	{
		name: 'Hex Neo Slime Mold',
		birthMask: 0b0000100, // 2
		surviveMask: 0b0001100, // 2, 3
		numStates: 32,
		ruleString: 'B2/S23/C32',
		neighborhood: 'hexagonal',
		category: 'artistic',
		description: 'Organic slime mold-like growth with long colorful trails',
		density: 0.2
	},
	// Extended Hexagonal rules (18 neighbors)
	{
		name: 'Hex2 Life',
		birthMask: 0b0000001100000, // 5, 6
		surviveMask: 0b0000011110000, // 4, 5, 6, 7
		numStates: 2,
		ruleString: 'B56/S4567',
		neighborhood: 'extendedHexagonal',
		category: 'classic',
		description: 'Life-like rule for extended hexagonal grid',
		density: 0.25
	},
	{
		name: 'Hex2 Coral',
		birthMask: 0b0000011100000, // 5, 6, 7
		surviveMask: 0b0001111100000, // 5, 6, 7, 8, 9
		numStates: 2,
		ruleString: 'B567/S56789',
		neighborhood: 'extendedHexagonal',
		category: 'expanding',
		description: 'Coral-like growth patterns in extended hex grid',
		density: 0.2
	},
	{
		name: 'Hex2 Neo Brain 2',
		birthMask: 0b0001101000, // 3, 5, 6
		surviveMask: 0b0111100000, // 5, 6, 7, 8
		numStates: 128,
		ruleString: 'B356/S5678/C128',
		neighborhood: 'extendedHexagonal',
		category: 'artistic',
		description: 'Complex neural patterns with long trails',
		density: 0.2
	},
	{
		name: 'Hex2 Neo Fungus',
		birthMask: 0b0001101000, // 3, 5, 6
		surviveMask: 0b1111111110111100100, // 2, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18
		numStates: 128,
		ruleString: 'B356/S2,5,6,7,8,10,11,12,13,14,15,16,17,18/C128',
		neighborhood: 'extendedHexagonal',
		category: 'artistic',
		description: 'Fungal growth patterns with high survival tolerance',
		density: 0.2
	},
	{
		name: 'Hex2 Aurora',
		birthMask: 0b0000011000000, // 5, 6
		surviveMask: 0b0000111100000, // 4, 5, 6, 7
		numStates: 24,
		ruleString: 'B56/S4567/C24',
		neighborhood: 'extendedHexagonal',
		category: 'artistic',
		description: 'Aurora-like flowing patterns with long trails',
		density: 0.25
	},
	{
		name: 'Hex2 Crystals',
		birthMask: 0b0000010000000, // 7
		surviveMask: 0b0001110000000, // 7, 8, 9
		numStates: 16,
		ruleString: 'B7/S789/C16',
		neighborhood: 'extendedHexagonal',
		category: 'artistic',
		description: 'Crystal-like formations with geometric patterns',
		density: 0.35
	},
	{
		name: 'Hex2 Nebula',
		birthMask: 0b0000001100000, // 5, 6
		surviveMask: 0b0000011110000, // 4, 5, 6, 7
		numStates: 32,
		ruleString: 'B56/S4567/C32',
		neighborhood: 'extendedHexagonal',
		category: 'artistic',
		description: 'Nebula-like clouds with very long colorful trails',
		density: 0.22
	},
	{
		name: 'Hex2 Neo Brain',
		birthMask: 0b0000101000, // 3, 5
		surviveMask: 0b0001110000, // 4, 5, 6
		numStates: 128,
		ruleString: 'B35/S456/C128',
		neighborhood: 'extendedHexagonal',
		category: 'artistic',
		description: 'Organic slime mold growth in extended hexagonal grid',
		density: 0.2
	}
];

/**
 * Get a rule by name
 */
export function getRuleByName(name: string): CARule | undefined {
	return RULE_PRESETS.find((r) => r.name.toLowerCase() === name.toLowerCase());
}

/**
 * Get the default rule (Hex2 Neo Brain 2)
 */
export function getDefaultRule(): CARule {
	return getRuleByName('Hex2 Neo Brain 2') || RULE_PRESETS[0];
}

/**
 * Validate a rule string
 */
export function isValidRuleString(ruleString: string): boolean {
	return parseRule(ruleString) !== null;
}

/**
 * Get rules by category
 */
export function getRulesByCategory(category: RuleCategory): CARule[] {
	return RULE_PRESETS.filter((r) => r.category === category);
}

/**
 * Get description for a neighbor count in Birth/Survive context
 */
export function getNeighborDescription(count: number, isBirth: boolean): string {
	const action = isBirth ? 'is born' : 'survives';
	const context = isBirth ? 'dead' : 'living';
	
	if (count === 0) {
		return `A ${context} cell ${action} when completely isolated (no neighbors)`;
	} else if (count === 1) {
		return `A ${context} cell ${action} with exactly 1 neighbor`;
	} else if (count === 8) {
		return `A ${context} cell ${action} when completely surrounded (8 neighbors)`;
	} else {
		return `A ${context} cell ${action} with exactly ${count} neighbors`;
	}
}

/**
 * Get a human-readable behavior hint for a rule
 */
export function getRuleBehaviorHint(rule: CARule): string {
	const birthCount = countBits(rule.birthMask);
	const surviveCount = countBits(rule.surviveMask);
	const hints: string[] = [];
	
	// Birth analysis
	if (rule.birthMask & 0b11) hints.push('Explosive growth (low birth)');
	if (rule.birthMask & 0b11100000) hints.push('Dense patterns form');
	
	// Survival analysis  
	if (surviveCount === 0) hints.push('All cells die immediately');
	if (surviveCount >= 6) hints.push('Patterns tend to persist');
	if (rule.surviveMask & 1) hints.push('Isolated cells survive');
	
	// Generations
	if (rule.numStates > 2) hints.push(`${rule.numStates - 2} decay states create trails`);
	
	return hints.length > 0 ? hints.join(' • ') : 'Standard behavior';
}

function countBits(n: number): number {
	let count = 0;
	while (n) {
		count += n & 1;
		n >>= 1;
	}
	return count;
}

