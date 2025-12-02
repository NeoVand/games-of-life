/**
 * Simulation State Store
 * Manages reactive state for the cellular automaton
 */

import type { CARule } from '../utils/rules.js';
import { getDefaultRule } from '../utils/rules.js';

// Simulation state
let isPlaying = $state(true); // Start playing by default
let speed = $state(60); // Steps per second (default 60 fps)
let brushSize = $state(25);
let brushState = $state(1); // 1 = draw alive, 0 = erase
let currentRule = $state<CARule>(getDefaultRule());
let generation = $state(0);
let showGrid = $state(true);
let hasInteracted = $state(false); // Track if user has clicked/touched the canvas

// Grid scale presets - base cell count for the shorter dimension
export type GridScale = 'tiny' | 'small' | 'medium' | 'large' | 'huge';
export const GRID_SCALES: { name: GridScale; label: string; baseCells: number }[] = [
	{ name: 'tiny', label: 'Tiny', baseCells: 128 },
	{ name: 'small', label: 'Small', baseCells: 256 },
	{ name: 'medium', label: 'Medium', baseCells: 512 },
	{ name: 'large', label: 'Large', baseCells: 1024 },
	{ name: 'huge', label: 'Huge', baseCells: 2048 }
];

// Detect if we're on mobile (will be checked at runtime)
function isMobileDevice(): boolean {
	if (typeof window === 'undefined') return false;
	return window.innerWidth <= 768;
}

// Grid configuration - now calculated from scale
// Default to 'medium' on all devices
let gridScale = $state<GridScale>('medium');
let gridWidth = $state(256);
let gridHeight = $state(256);

// Visual settings
let isLightTheme = $state(false);
let aliveColor = $state<[number, number, number]>([1.0, 0.95, 0.8]); // Cream default

// Spectrum modes for multi-state color transitions
export type SpectrumMode = 'hueShift' | 'rainbow' | 'warm' | 'cool' | 'monochrome' | 'fire';

export const SPECTRUM_MODES: { id: SpectrumMode; name: string; description: string }[] = [
	{ id: 'hueShift', name: 'Shift', description: 'Subtle hue rotation' },
	{ id: 'rainbow', name: 'Rainbow', description: 'Full spectrum rotation' },
	{ id: 'warm', name: 'Warm', description: 'Toward red/orange' },
	{ id: 'cool', name: 'Cool', description: 'Toward blue/purple' },
	{ id: 'monochrome', name: 'Mono', description: 'Fade without hue change' },
	{ id: 'fire', name: 'Fire', description: 'Orange to red to black' }
];

// Boundary modes - 9 topological possibilities based on edge identification
// Each mode defines how edges wrap: none, same direction, or flipped
export type BoundaryMode = 
	| 'plane'           // No wrapping - edges are dead
	| 'cylinderX'       // Horizontal wrap only (left-right connected)
	| 'cylinderY'       // Vertical wrap only (top-bottom connected)
	| 'torus'           // Both wrap (donut shape)
	| 'mobiusX'         // Horizontal wrap with vertical flip
	| 'mobiusY'         // Vertical wrap with horizontal flip
	| 'kleinX'          // Horizontal Möbius + vertical cylinder (Klein bottle, X-oriented)
	| 'kleinY'          // Vertical Möbius + horizontal cylinder (Klein bottle, Y-oriented)
	| 'projectivePlane'; // Both edges flip (real projective plane)

export const BOUNDARY_MODES: { id: BoundaryMode; name: string; description: string }[] = [
	{ id: 'plane', name: 'Plane', description: 'No wrapping - edges are dead' },
	{ id: 'cylinderX', name: 'X-Cylinder', description: 'Wraps horizontally' },
	{ id: 'cylinderY', name: 'Y-Cylinder', description: 'Wraps vertically' },
	{ id: 'torus', name: 'Torus', description: 'Wraps both ways' },
	{ id: 'mobiusX', name: 'X-Möbius', description: 'Horizontal wrap with flip' },
	{ id: 'mobiusY', name: 'Y-Möbius', description: 'Vertical wrap with flip' },
	{ id: 'kleinX', name: 'X-Klein', description: 'Klein bottle (X-oriented)' },
	{ id: 'kleinY', name: 'Y-Klein', description: 'Klein bottle (Y-oriented)' },
	{ id: 'projectivePlane', name: 'Projective Plane', description: 'Both edges flip' }
];

// Convert boundary mode to shader index
export function boundaryModeToIndex(mode: BoundaryMode): number {
	const modes: BoundaryMode[] = [
		'plane', 'cylinderX', 'cylinderY', 'torus',
		'mobiusX', 'mobiusY', 'kleinX', 'kleinY', 'projectivePlane'
	];
	return modes.indexOf(mode);
}

let spectrumMode = $state<SpectrumMode>('fire');

// Neighbor shading mode - modulate color based on neighbors
// 'off' = no shading, 'alive' = count alive neighbors, 'vitality' = sum neighbor states
export type NeighborShadingMode = 'off' | 'alive' | 'vitality';
let neighborShading = $state<NeighborShadingMode>('vitality');

// Color palettes for dark and light themes
export const DARK_THEME_COLORS: { name: string; color: [number, number, number]; hex: string }[] = [
	// Row 1: Vibrant saturated colors
	{ name: 'White', color: [1.0, 1.0, 1.0], hex: '#ffffff' },
	{ name: 'Cyan', color: [0.2, 0.9, 0.95], hex: '#33e6f2' },
	{ name: 'Green', color: [0.3, 0.95, 0.5], hex: '#4df280' },
	{ name: 'Lime', color: [0.7, 1.0, 0.3], hex: '#b3ff4d' },
	{ name: 'Yellow', color: [1.0, 0.95, 0.4], hex: '#fff266' },
	{ name: 'Orange', color: [1.0, 0.65, 0.2], hex: '#ffa633' },
	{ name: 'Red', color: [1.0, 0.35, 0.35], hex: '#ff5959' },
	{ name: 'Pink', color: [1.0, 0.45, 0.65], hex: '#ff73a6' },
	{ name: 'Purple', color: [0.7, 0.5, 1.0], hex: '#b380ff' },
	{ name: 'Blue', color: [0.4, 0.6, 1.0], hex: '#6699ff' },
	// Row 2: Soft pastels and muted tones
	{ name: 'Soft Pink', color: [1.0, 0.75, 0.85], hex: '#ffbfd9' },
	{ name: 'Blush', color: [0.95, 0.7, 0.75], hex: '#f2b3bf' },
	{ name: 'Peach', color: [1.0, 0.8, 0.65], hex: '#ffcca6' },
	{ name: 'Cream', color: [1.0, 0.95, 0.8], hex: '#fff2cc' },
	{ name: 'Mint', color: [0.7, 0.95, 0.8], hex: '#b3f2cc' },
	{ name: 'Sky', color: [0.7, 0.85, 1.0], hex: '#b3d9ff' },
	{ name: 'Lavender', color: [0.8, 0.7, 1.0], hex: '#ccb3ff' },
	{ name: 'Mauve', color: [0.75, 0.6, 0.7], hex: '#bf99b3' },
	{ name: 'Sage', color: [0.65, 0.75, 0.6], hex: '#a6bf99' },
	{ name: 'Sand', color: [0.85, 0.8, 0.7], hex: '#d9ccb3' }
];

export const LIGHT_THEME_COLORS: { name: string; color: [number, number, number]; hex: string }[] = [
	// Row 1: Deep saturated colors
	{ name: 'Black', color: [0.1, 0.1, 0.12], hex: '#1a1a1f' },
	{ name: 'Teal', color: [0.0, 0.5, 0.55], hex: '#00808c' },
	{ name: 'Green', color: [0.1, 0.55, 0.25], hex: '#1a8c40' },
	{ name: 'Olive', color: [0.4, 0.5, 0.1], hex: '#66801a' },
	{ name: 'Brown', color: [0.55, 0.35, 0.15], hex: '#8c5926' },
	{ name: 'Orange', color: [0.85, 0.4, 0.1], hex: '#d9661a' },
	{ name: 'Red', color: [0.7, 0.15, 0.15], hex: '#b32626' },
	{ name: 'Rose', color: [0.75, 0.2, 0.4], hex: '#bf3366' },
	{ name: 'Purple', color: [0.45, 0.2, 0.7], hex: '#7333b3' },
	{ name: 'Navy', color: [0.15, 0.25, 0.55], hex: '#26408c' },
	// Row 2: Muted earthy and dusty tones
	{ name: 'Dusty Rose', color: [0.6, 0.4, 0.45], hex: '#996673' },
	{ name: 'Terracotta', color: [0.65, 0.4, 0.3], hex: '#a6664d' },
	{ name: 'Rust', color: [0.6, 0.3, 0.2], hex: '#994d33' },
	{ name: 'Ochre', color: [0.6, 0.5, 0.25], hex: '#998040' },
	{ name: 'Moss', color: [0.35, 0.45, 0.3], hex: '#59734d' },
	{ name: 'Slate', color: [0.35, 0.4, 0.5], hex: '#596680' },
	{ name: 'Storm', color: [0.4, 0.45, 0.55], hex: '#66738c' },
	{ name: 'Plum', color: [0.45, 0.3, 0.45], hex: '#734d73' },
	{ name: 'Clay', color: [0.5, 0.4, 0.35], hex: '#806659' },
	{ name: 'Charcoal', color: [0.25, 0.25, 0.28], hex: '#404047' }
];

// Last initialization settings
let lastInitPattern = $state('blank');
let lastInitCategory = $state('random');
let lastInitTiling = $state(true);
let lastInitSpacing = $state(50); // Actual cell spacing on main grid

// Seed pattern definitions - relative coordinates from center (0,0)
export type SeedPatternId = string; // Allow any pattern ID

export interface SeedPattern {
	id: string;
	name: string;
	cells: [number, number][]; // [dx, dy] offsets from center
	description: string;
	hex?: boolean; // If true, this pattern is designed for hexagonal grids
}

export const SEED_PATTERNS: SeedPattern[] = [
	{
		id: 'pixel',
		name: 'Pixel',
		cells: [[0, 0]],
		description: 'Single cell'
	},
	{
		id: 'dot-pair',
		name: 'Pair',
		cells: [[0, 0], [1, 0]],
		description: 'Two adjacent cells'
	},
	{
		id: 'line-h',
		name: 'Line H',
		cells: [[-1, 0], [0, 0], [1, 0]],
		description: 'Horizontal line'
	},
	{
		id: 'line-v',
		name: 'Line V',
		cells: [[0, -1], [0, 0], [0, 1]],
		description: 'Vertical line'
	},
	{
		id: 'cross',
		name: 'Cross',
		cells: [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]],
		description: 'Plus shape'
	},
	{
		id: 'diamond',
		name: 'Diamond',
		cells: [[0, -1], [-1, 0], [1, 0], [0, 1]],
		description: 'Diamond outline'
	},
	{
		id: 'square',
		name: 'Block',
		cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
		description: '2x2 block'
	},
	{
		id: 'corner',
		name: 'Corner',
		cells: [[0, 0], [1, 0], [0, 1]],
		description: 'L-shape'
	},
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
	{
		id: 'x-shape',
		name: 'X',
		cells: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
		description: 'X shape'
	},
	{
		id: 'checker-3x3',
		name: 'Checker',
		cells: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
		description: 'Checkerboard 3x3'
	},
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
	{
		id: 'corners-4x4',
		name: 'Corners',
		cells: [[-1, -1], [2, -1], [-1, 2], [2, 2]],
		description: '4x4 corner dots'
	},
	{
		id: 'diagonal',
		name: 'Diagonal',
		cells: [[-1, -1], [0, 0], [1, 1], [2, 2]],
		description: 'Diagonal line'
	},
	// More interesting shapes
	{
		id: 'h-shape',
		name: 'H',
		cells: [[-1, -1], [-1, 0], [-1, 1], [0, 0], [1, -1], [1, 0], [1, 1]],
		description: 'H letter shape'
	},
	{
		id: 't-shape',
		name: 'T',
		cells: [[-1, -1], [0, -1], [1, -1], [0, 0], [0, 1]],
		description: 'T letter shape'
	},
	{
		id: 'arrow',
		name: 'Arrow',
		cells: [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1], [0, 2]],
		description: 'Arrow pointing down'
	},
	{
		id: 'glider',
		name: 'Glider',
		cells: [[0, -1], [1, 0], [-1, 1], [0, 1], [1, 1]],
		description: 'Classic glider pattern'
	}
];

// Hexagonal seed patterns - using odd-r offset coordinates
// In hex grids, odd rows are shifted right by 0.5
// Neighbors for even row (y=0): NW(-1,-1), NE(0,-1), W(-1,0), E(1,0), SW(-1,1), SE(0,1)
// Neighbors for odd row (y=1): NW(0,-1), NE(1,-1), W(-1,0), E(1,0), SW(0,1), SE(1,1)
export const SEED_PATTERNS_HEX: SeedPattern[] = [
	{
		id: 'hex-pixel',
		name: 'Pixel',
		cells: [[0, 0]],
		description: 'Single cell',
		hex: true
	},
	{
		id: 'hex-pair',
		name: 'Pair',
		cells: [[0, 0], [1, 0]],
		description: 'Two adjacent cells',
		hex: true
	},
	{
		id: 'hex-trio-h',
		name: 'Trio H',
		cells: [[-1, 0], [0, 0], [1, 0]],
		description: 'Horizontal trio',
		hex: true
	},
	{
		id: 'hex-trio-v',
		name: 'Trio V',
		cells: [[0, -1], [0, 0], [0, 1]],
		description: 'Vertical trio',
		hex: true
	},
	{
		id: 'hex-ring',
		name: 'Ring',
		cells: [[-1, -1], [0, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]],
		description: 'Hexagonal ring (6 neighbors)',
		hex: true
	},
	{
		id: 'hex-full',
		name: 'Full Hex',
		cells: [[0, 0], [-1, -1], [0, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]],
		description: 'Center + all 6 neighbors',
		hex: true
	},
	{
		id: 'hex-triangle-up',
		name: 'Tri Up',
		cells: [[0, 0], [-1, 1], [0, 1]],
		description: 'Upward triangle',
		hex: true
	},
	{
		id: 'hex-triangle-down',
		name: 'Tri Down',
		cells: [[-1, -1], [0, -1], [0, 0]],
		description: 'Downward triangle',
		hex: true
	},
	{
		id: 'hex-diamond',
		name: 'Diamond',
		cells: [[0, -1], [-1, 0], [1, 0], [0, 1]],
		description: 'Diamond shape',
		hex: true
	},
	{
		id: 'hex-line-diag',
		name: 'Diagonal',
		cells: [[-1, -1], [0, 0], [0, 1]],
		description: 'Diagonal line',
		hex: true
	},
	{
		id: 'hex-flower',
		name: 'Flower',
		cells: [[0, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [0, -2], [-1, 2], [1, 1]],
		description: 'Flower pattern',
		hex: true
	},
	{
		id: 'hex-arrow',
		name: 'Arrow',
		cells: [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]],
		description: 'Arrow/cross shape',
		hex: true
	},
	{
		id: 'hex-wave',
		name: 'Wave',
		cells: [[-1, -1], [0, 0], [1, 0], [0, 1], [1, 1]],
		description: 'Wave pattern',
		hex: true
	},
	{
		id: 'hex-cluster',
		name: 'Cluster',
		cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
		description: '4-cell cluster',
		hex: true
	},
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

// Continuous seeding settings
let seedingEnabled = $state(false); // Whether continuous seeding is active
let seedingRate = $state(0.1); // Seeds per 1000 cells per frame (0.01 - 1.0)
let seedPattern = $state<SeedPatternId>('pixel'); // Current seed pattern
let seedAlive = $state(true); // true = add alive cells, false = add dead cells (erase)

// Boundary mode - topological boundary condition
let boundaryMode = $state<BoundaryMode>('torus'); // Default to torus

// Stats
let aliveCells = $state(0);

export function getSimulationState() {
	return {
		get isPlaying() {
			return isPlaying;
		},
		set isPlaying(value: boolean) {
			isPlaying = value;
		},

		get speed() {
			return speed;
		},
		set speed(value: number) {
			speed = Math.max(1, Math.min(120, value));
		},

		get brushSize() {
			return brushSize;
		},
		set brushSize(value: number) {
			brushSize = Math.max(1, Math.min(50, value));
		},

		get brushState() {
			return brushState;
		},
		set brushState(value: number) {
			brushState = value;
		},

		get currentRule() {
			return currentRule;
		},
		set currentRule(value: CARule) {
			currentRule = value;
		},

		get generation() {
			return generation;
		},
		set generation(value: number) {
			generation = value;
		},

		get showGrid() {
			return showGrid;
		},
		set showGrid(value: boolean) {
			showGrid = value;
		},

		get hasInteracted() {
			return hasInteracted;
		},
		set hasInteracted(value: boolean) {
			hasInteracted = value;
		},

		get gridWidth() {
			return gridWidth;
		},
		set gridWidth(value: number) {
			gridWidth = value;
		},

		get gridHeight() {
			return gridHeight;
		},
		set gridHeight(value: number) {
			gridHeight = value;
		},

		get gridScale() {
			return gridScale;
		},
		set gridScale(value: GridScale) {
			gridScale = value;
		},

		get isLightTheme() {
			return isLightTheme;
		},
		set isLightTheme(value: boolean) {
			isLightTheme = value;
		},

		get aliveColor() {
			return aliveColor;
		},
		set aliveColor(value: [number, number, number]) {
			aliveColor = value;
		},

		get spectrumMode() {
			return spectrumMode;
		},
		set spectrumMode(value: SpectrumMode) {
			spectrumMode = value;
		},

		get neighborShading() {
			return neighborShading;
		},
		set neighborShading(value: NeighborShadingMode) {
			neighborShading = value;
		},

		get lastInitPattern() {
			return lastInitPattern;
		},
		set lastInitPattern(value: string) {
			lastInitPattern = value;
		},

		get lastInitCategory() {
			return lastInitCategory;
		},
		set lastInitCategory(value: string) {
			lastInitCategory = value;
		},

		get lastInitTiling() {
			return lastInitTiling;
		},
		set lastInitTiling(value: boolean) {
			lastInitTiling = value;
		},

		get lastInitSpacing() {
			return lastInitSpacing;
		},
		set lastInitSpacing(value: number) {
			lastInitSpacing = value;
		},

		get boundaryMode() {
			return boundaryMode;
		},
		set boundaryMode(value: BoundaryMode) {
			boundaryMode = value;
		},
		
		// Legacy getter for backwards compatibility
		get wrapBoundary() {
			return boundaryMode !== 'plane';
		},

		get seedingEnabled() {
			return seedingEnabled;
		},
		set seedingEnabled(value: boolean) {
			seedingEnabled = value;
		},

		get seedingRate() {
			return seedingRate;
		},
		set seedingRate(value: number) {
			seedingRate = Math.max(0.01, Math.min(1.0, value));
		},

		get seedPattern() {
			return seedPattern;
		},
		set seedPattern(value: SeedPatternId) {
			seedPattern = value;
		},

		get seedAlive() {
			return seedAlive;
		},
		set seedAlive(value: boolean) {
			seedAlive = value;
		},

		get aliveCells() {
			return aliveCells;
		},
		set aliveCells(value: number) {
			aliveCells = value;
		},

		// Actions
		togglePlay() {
			isPlaying = !isPlaying;
		},

		play() {
			isPlaying = true;
		},

		pause() {
			isPlaying = false;
		},

		resetGeneration() {
			generation = 0;
		},

		incrementGeneration() {
			generation++;
		}
	};
}

// UI state
let showRuleEditor = $state(false);
let showSettings = $state(false);
let showHelp = $state(false);

export function getUIState() {
	return {
		get showRuleEditor() {
			return showRuleEditor;
		},
		set showRuleEditor(value: boolean) {
			showRuleEditor = value;
			if (value) {
				showSettings = false;
				showHelp = false;
			}
		},

		get showSettings() {
			return showSettings;
		},
		set showSettings(value: boolean) {
			showSettings = value;
			if (value) {
				showRuleEditor = false;
				showHelp = false;
			}
		},

		get showHelp() {
			return showHelp;
		},
		set showHelp(value: boolean) {
			showHelp = value;
			if (value) {
				showRuleEditor = false;
				showSettings = false;
			}
		},

		closeAll() {
			showRuleEditor = false;
			showSettings = false;
			showHelp = false;
		}
	};
}

