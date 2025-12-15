// Shared showcase rules used by both the Tour gallery and GoL docs demos.
// Keeping this in one place prevents drift between "marketing demos" and "tutorial demos".

export type InitType = 'random' | 'centeredDisk' | 'symmetricCross' | 'randomLow' | 'centeredRing' | 'text';
export type SimNeighborhood = 'moore' | 'hexagonal' | 'extendedMoore' | 'extendedHexagonal';
export type VitalityMode = 'none' | 'ghost' | 'curve';

export interface GalleryRule {
	name: string;
	birthMask: number;
	surviveMask: number;
	numStates: number;
	neighborhood: SimNeighborhood;
	initType: InitType;
	density: number;
	seedRate: number; // Continuous seeding rate
	stimPeriod?: number; // Frames between stimulation pulses (0 = never)
	stimShape?: 'disk' | 'horizontalLine' | 'verticalLine';
	stimRevive?: 'deadOnly' | 'deadOrDying';
	stimRadius?: number; // Optional override for stimulation disk/line size (defaults to diskRadius)
	initText?: string; // For text init type
	diskRadius?: number; // Custom disk radius
	// Vitality settings (how dying cells contribute to neighbor counts)
	vitalityMode?: VitalityMode;
	ghostFactor?: number; // For ghost mode: dying cell contribution multiplier
	curvePoints?: { x: number; y: number }[]; // For curve mode
}

// 9 showcase rules for the gallery (3 rows of 3)
// Names MUST match exactly with RULE_PRESETS in rules.ts for getRuleByName to work.
export const GALLERY_RULES: GalleryRule[] = [
	// Row 1: Classics
	{
		name: "Conway's Life",
		birthMask: 0b000001000, // B3
		surviveMask: 0b000001100, // S23
		numStates: 2,
		neighborhood: 'moore',
		initType: 'random',
		density: 0.25,
		seedRate: 0.001,
		vitalityMode: 'none'
	},
	{
		name: 'Star Wars',
		birthMask: 0b000000100, // B2
		surviveMask: 0b000111000, // S345
		numStates: 4,
		neighborhood: 'moore',
		initType: 'random',
		density: 0.35,
		seedRate: 0.002,
		vitalityMode: 'none'
	},
	{
		name: "Brian's Brain",
		birthMask: 0b000000100, // B2
		surviveMask: 0b000000000, // S (none)
		numStates: 3,
		neighborhood: 'moore',
		initType: 'random',
		density: 0.15,
		seedRate: 0.003,
		vitalityMode: 'none'
	},

	// Row 2: NEO discoveries with vitality
	{
		name: 'Hex2 Neo Diagonal Growth',
		birthMask: 2148, // B2,5,6,11
		surviveMask: 2592, // S5,9,11
		numStates: 48,
		neighborhood: 'extendedHexagonal',
		initType: 'centeredDisk',
		density: 0.5,
		seedRate: 0,
		stimPeriod: 80,
		diskRadius: 9, // slightly larger seed
		vitalityMode: 'curve',
		curvePoints: [
			{ x: 0, y: 0 },
			{ x: 0.372, y: -0.746 },
			{ x: 0.531, y: 0.321 },
			{ x: 0.695, y: -0.669 },
			{ x: 1, y: -1 }
		]
	},
	{
		name: 'Hex Neo Mandala 1',
		birthMask: 4, // B2
		surviveMask: 56, // S345
		numStates: 88,
		neighborhood: 'hexagonal',
		initType: 'centeredDisk',
		density: 1.0,
		seedRate: 0,
		stimPeriod: 100,
		diskRadius: 9, // larger seed (still symmetric)
		stimRadius: 18, // 2x larger periodic disk stim
		vitalityMode: 'curve',
		curvePoints: [
			{ x: 0, y: 0 },
			{ x: 0.148, y: 1.01 },
			{ x: 1, y: 0.19 }
		]
	},
	{
		name: 'Hex Neo Slime Mold',
		birthMask: 0b0000100, // B2
		surviveMask: 0b0001100, // S23
		numStates: 32,
		neighborhood: 'hexagonal',
		initType: 'random',
		density: 0.2,
		seedRate: 0.001,
		vitalityMode: 'none'
	},

	// Row 3: More NEO (calmer, less frantic)
	{
		name: 'Ext24 Neo Waves',
		birthMask: 0b1111111111111111100100000, // 5, 8-24
		surviveMask: 0b1111111110000001111100000, // 8-12, 16-24
		numStates: 64,
		neighborhood: 'extendedMoore',
		initType: 'random',
		density: 0.2,
		seedRate: 0.0009,
		vitalityMode: 'none'
	},
	{
		name: 'Ext24 Neo Coral',
		// Imported from neo coral.json (Custom Rule)
		birthMask: 992, // B56789
		surviveMask: 8128, // S6-12
		numStates: 256,
		neighborhood: 'extendedMoore',
		// Symmetric disk seed
		initType: 'centeredDisk',
		density: 1.0,
		seedRate: 0.0,
		stimPeriod: 120,
		stimShape: 'disk',
		stimRevive: 'deadOrDying',
		diskRadius: 8,
		vitalityMode: 'curve',
		ghostFactor: 0,
		curvePoints: [
			{ x: 0, y: 0 },
			{ x: 0.04336907932808316, y: -1.902238176074881 },
			{ x: 0.19299944518769985, y: 0.6060420562784863 },
			{ x: 0.4857545088260803, y: -0.15734757965514712 },
			{ x: 0.7199585597367847, y: -0.15734757965514712 },
			{ x: 0.8175435809495781, y: 0.8786812119690697 },
			{ x: 1, y: -0.920737215588781 }
		]
	},
	{
		name: 'Hex2 Neo Brain 2',
		birthMask: 0b0001101000, // 3, 5, 6
		surviveMask: 0b0111100000, // 5, 6, 7, 8
		numStates: 128,
		neighborhood: 'extendedHexagonal',
		initType: 'centeredDisk',
		density: 1.0,
		seedRate: 0.0,
		stimPeriod: 100,
		stimShape: 'disk',
		stimRevive: 'deadOrDying',
		diskRadius: 10,
		stimRadius: 24, // larger, but less frequent
		vitalityMode: 'none'
	}
];


