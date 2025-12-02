/**
 * Simulation State Store
 * Manages reactive state for the cellular automaton
 */

import type { CARule } from '../utils/rules.js';
import { getDefaultRule } from '../utils/rules.js';

// Simulation state
let isPlaying = $state(false);
let speed = $state(30); // Steps per second (default 30 fps)
let brushSize = $state(3);
let brushState = $state(1); // 1 = draw alive, 0 = erase
let currentRule = $state<CARule>(getDefaultRule());
let generation = $state(0);
let showGrid = $state(true);

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
// Default to 'tiny' on mobile, 'small' on desktop
let gridScale = $state<GridScale>(isMobileDevice() ? 'tiny' : 'small');
let gridWidth = $state(256);
let gridHeight = $state(256);

// Visual settings
let isLightTheme = $state(false);
let aliveColor = $state<[number, number, number]>([0.2, 0.9, 0.95]); // Cyan default

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

let spectrumMode = $state<SpectrumMode>('hueShift');

// Color palettes for dark and light themes
export const DARK_THEME_COLORS: { name: string; color: [number, number, number]; hex: string }[] = [
	{ name: 'White', color: [1.0, 1.0, 1.0], hex: '#ffffff' },
	{ name: 'Cyan', color: [0.2, 0.9, 0.95], hex: '#33e6f2' },
	{ name: 'Green', color: [0.3, 0.95, 0.5], hex: '#4df280' },
	{ name: 'Purple', color: [0.7, 0.5, 1.0], hex: '#b380ff' },
	{ name: 'Orange', color: [1.0, 0.65, 0.2], hex: '#ffa633' },
	{ name: 'Pink', color: [1.0, 0.45, 0.65], hex: '#ff73a6' }
];

export const LIGHT_THEME_COLORS: { name: string; color: [number, number, number]; hex: string }[] = [
	{ name: 'Black', color: [0.1, 0.1, 0.12], hex: '#1a1a1f' },
	{ name: 'Teal', color: [0.0, 0.5, 0.55], hex: '#00808c' },
	{ name: 'Green', color: [0.1, 0.55, 0.25], hex: '#1a8c40' },
	{ name: 'Purple', color: [0.45, 0.2, 0.7], hex: '#7333b3' },
	{ name: 'Orange', color: [0.85, 0.4, 0.1], hex: '#d9661a' },
	{ name: 'Rose', color: [0.75, 0.2, 0.4], hex: '#bf3366' }
];

// Last initialization settings
let lastInitPattern = $state('random-medium');
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
let seedingEnabled = $state(true); // Whether continuous seeding is active
let seedingRate = $state(0.1); // Seeds per 1000 cells per frame (0.01 - 1.0)
let seedPattern = $state<SeedPatternId>('pixel'); // Current seed pattern
let seedAlive = $state(true); // true = add alive cells, false = add dead cells (erase)

// Boundary mode
let wrapBoundary = $state(true); // true = toroidal wrap, false = fixed edges

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

		get wrapBoundary() {
			return wrapBoundary;
		},
		set wrapBoundary(value: boolean) {
			wrapBoundary = value;
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

