export type SeedPatternId = string;

export interface SeedPattern {
	id: SeedPatternId;
	name: string;
	/** [dx, dy] offsets from center. */
	cells: [number, number][];
	description: string;
	/** If true, this pattern is designed for hexagonal grids (odd-r offset coordinates). */
	hex?: boolean;
}

export const SEED_PATTERNS: SeedPattern[] = [
	{ id: 'pixel', name: 'Pixel', cells: [[0, 0]], description: 'Single cell' },
	{ id: 'dot-pair', name: 'Pair', cells: [[0, 0], [1, 0]], description: 'Two adjacent cells' },
	{ id: 'line-h', name: 'Line H', cells: [[-1, 0], [0, 0], [1, 0]], description: 'Horizontal line' },
	{ id: 'line-v', name: 'Line V', cells: [[0, -1], [0, 0], [0, 1]], description: 'Vertical line' },
	{ id: 'cross', name: 'Cross', cells: [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]], description: 'Plus shape' },
	{ id: 'diamond', name: 'Diamond', cells: [[0, -1], [-1, 0], [1, 0], [0, 1]], description: 'Diamond outline' },
	{ id: 'square', name: 'Block', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], description: '2x2 block' },
	{ id: 'corner', name: 'Corner', cells: [[0, 0], [1, 0], [0, 1]], description: 'L-shape' },

	// 3x3 patterns
	{
		id: 'ring',
		name: 'Ring',
		cells: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
		description: '3x3 ring (hollow)'
	},
	{
		id: 'full-3x3',
		name: 'Full 3×3',
		cells: [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
		description: 'Solid 3x3 block'
	},
	{ id: 'x-shape', name: 'X', cells: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], description: 'X shape' },
	{ id: 'checker-3x3', name: 'Checker', cells: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], description: 'Checkerboard 3x3' },

	// 4x4 patterns
	{
		id: 'full-4x4',
		name: 'Full 4×4',
		cells: [
			[-1, -1], [0, -1], [1, -1], [2, -1],
			[-1, 0], [0, 0], [1, 0], [2, 0],
			[-1, 1], [0, 1], [1, 1], [2, 1],
			[-1, 2], [0, 2], [1, 2], [2, 2]
		],
		description: 'Solid 4x4 block'
	},
	{
		id: 'ring-4x4',
		name: 'Ring 4×4',
		cells: [
			[-1, -1], [0, -1], [1, -1], [2, -1],
			[-1, 0], [2, 0],
			[-1, 1], [2, 1],
			[-1, 2], [0, 2], [1, 2], [2, 2]
		],
		description: '4x4 ring (hollow)'
	},
	{ id: 'corners-4x4', name: 'Corners', cells: [[-1, -1], [2, -1], [-1, 2], [2, 2]], description: '4x4 corner dots' },
	{ id: 'diagonal', name: 'Diagonal', cells: [[-1, -1], [0, 0], [1, 1], [2, 2]], description: 'Diagonal line' },

	// More interesting shapes
	{
		id: 'h-shape',
		name: 'H',
		cells: [[-1, -1], [-1, 0], [-1, 1], [0, 0], [1, -1], [1, 0], [1, 1]],
		description: 'H letter shape'
	},
	{ id: 't-shape', name: 'T', cells: [[-1, -1], [0, -1], [1, -1], [0, 0], [0, 1]], description: 'T letter shape' },
	{ id: 'arrow', name: 'Arrow', cells: [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1], [0, 2]], description: 'Arrow pointing down' },
	{ id: 'glider', name: 'Glider', cells: [[0, -1], [1, 0], [-1, 1], [0, 1], [1, 1]], description: 'Classic glider pattern' }
];

export const SEED_PATTERNS_HEX: SeedPattern[] = [
	{ id: 'hex-pixel', name: 'Pixel', cells: [[0, 0]], description: 'Single cell', hex: true },
	{ id: 'hex-pair', name: 'Pair', cells: [[0, 0], [1, 0]], description: 'Two adjacent cells', hex: true },
	{ id: 'hex-trio-h', name: 'Trio H', cells: [[-1, 0], [0, 0], [1, 0]], description: 'Horizontal trio', hex: true },
	{ id: 'hex-trio-v', name: 'Trio V', cells: [[0, -1], [0, 0], [0, 1]], description: 'Vertical trio', hex: true },
	{ id: 'hex-ring', name: 'Ring', cells: [[-1, -1], [0, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]], description: 'Hexagonal ring (6 neighbors)', hex: true },
	{ id: 'hex-full', name: 'Full Hex', cells: [[0, 0], [-1, -1], [0, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]], description: 'Center + all 6 neighbors', hex: true },
	{ id: 'hex-triangle-up', name: 'Tri Up', cells: [[0, 0], [-1, 1], [0, 1]], description: 'Upward triangle', hex: true },
	{ id: 'hex-triangle-down', name: 'Tri Down', cells: [[-1, -1], [0, -1], [0, 0]], description: 'Downward triangle', hex: true },
	{ id: 'hex-diamond', name: 'Diamond', cells: [[0, -1], [-1, 0], [1, 0], [0, 1]], description: 'Diamond shape', hex: true },
	{ id: 'hex-line-diag', name: 'Diagonal', cells: [[-1, -1], [0, 0], [0, 1]], description: 'Diagonal line', hex: true },
	{ id: 'hex-flower', name: 'Flower', cells: [[0, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [0, -2], [-1, 2], [1, 1]], description: 'Flower pattern', hex: true },
	{ id: 'hex-arrow', name: 'Arrow', cells: [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]], description: 'Arrow/cross shape', hex: true },
	{ id: 'hex-wave', name: 'Wave', cells: [[-1, -1], [0, 0], [1, 0], [0, 1], [1, 1]], description: 'Wave pattern', hex: true },
	{ id: 'hex-cluster', name: 'Cluster', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], description: '4-cell cluster', hex: true },
	{
		id: 'hex-big-ring',
		name: 'Big Ring',
		cells: [
			[-1, -2], [0, -2],
			[-2, -1], [1, -1],
			[-2, 0], [2, 0],
			[-2, 1], [1, 1],
			[-1, 2], [0, 2]
		],
		description: 'Large hexagonal ring',
		hex: true
	},
	{
		id: 'hex-star',
		name: 'Star',
		cells: [
			[0, -2],
			[-1, -1], [1, -1],
			[-2, 0], [0, 0], [2, 0],
			[-1, 1], [1, 1],
			[0, 2]
		],
		description: 'Star pattern',
		hex: true
	}
];


