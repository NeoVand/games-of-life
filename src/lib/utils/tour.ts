import { driver, type DriveStep, type Config } from 'driver.js';
import { stepBsGenerationsCpu, type CpuStepConfig, sampleVitalityCurve, spectrumModeToIndex } from '@games-of-life/core';
import { Simulation, createWebGPUContext, isWebGPUSupported, requestWebGPUDevice } from '@games-of-life/webgpu';

// Tour state management
const TOUR_COMPLETED_KEY = 'games-of-life-tour-completed';

// Track if tour is currently active
let tourActive = false;
let tourCompletedProperly = false; // True only when user finishes the entire tour

// Callbacks for tour completion notifications
let tourCompletionCallbacks: (() => void)[] = [];

export function isTourActive(): boolean {
	return tourActive;
}

// Subscribe to tour completion changes
export function onTourCompleted(callback: () => void): () => void {
	tourCompletionCallbacks.push(callback);
	return () => {
		tourCompletionCallbacks = tourCompletionCallbacks.filter(cb => cb !== callback);
	};
}

// Notify all subscribers
function notifyTourCompleted() {
	tourCompletionCallbacks.forEach(cb => cb());
}

// ============================================================================
// Mini Simulation Gallery - 2x3 grid of simultaneous simulations (6 total)
// ============================================================================

// Mini-sim density: keep canvas size constant while increasing the number of simulated cells.
// 112px canvas with 112x112 cells => 1px per cell (denser without changing spatial dimensions).
const MINI_SIM_SIZE = 112; // Grid size for each mini sim (112x112 cells)
const MINI_SIM_CELL_SIZE = 1; // Pixel size per cell (112px canvas)

// Initialization types for different visual effects
type InitType = 'random' | 'centeredDisk' | 'symmetricCross' | 'randomLow' | 'centeredRing' | 'text';

// Neighborhood types for simulation
type SimNeighborhood = 'moore' | 'hexagonal' | 'extendedMoore' | 'extendedHexagonal';

// Vitality mode for gallery simulations
type VitalityMode = 'none' | 'ghost' | 'curve';

// Gallery rule definition
interface GalleryRule {
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
	initText?: string; // For text init type
	diskRadius?: number; // Custom disk radius (default: MINI_SIM_SIZE * 0.18)
	// Vitality settings (how dying cells contribute to neighbor counts)
	vitalityMode?: VitalityMode;
	ghostFactor?: number; // For ghost mode: dying cell contribution multiplier
	curvePoints?: { x: number; y: number }[]; // For curve mode
}

// 9 showcase rules for the gallery (3 rows of 3)
// Names MUST match exactly with RULE_PRESETS in rules.ts for getRuleByName to work
const GALLERY_RULES: GalleryRule[] = [
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
		diskRadius: 7, // radius for hex grid
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
		diskRadius: 5, // smaller seed for better symmetry
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
		stimPeriod: 0,
		stimShape: 'disk',
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
		stimPeriod: 60,
		stimShape: 'disk',
		stimRevive: 'deadOrDying',
		diskRadius: 8,
		vitalityMode: 'none'
	}
];

// State for each mini simulation
interface MiniSimState {
	grid: Uint32Array;
	nextGrid: Uint32Array; // Pre-allocated buffer for double-buffering (avoids allocations per frame)
	canvas: HTMLCanvasElement | null;
	ctx: CanvasRenderingContext2D | null;
	imageData: ImageData | null; // Pre-allocated buffer for fast rendering
	rule: GalleryRule;
	frameCount: number; // For periodic stimulation
	cpuCfg: CpuStepConfig;
}

let gallerySimStates: MiniSimState[] = [];
let galleryInterval: number | null = null;
let selectedGalleryIndex: number | null = null;
let userActivelySelectedRule = false; // True only when user clicks to select a rule

// WebGPU gallery (preferred) -------------------------------------------------
type WebGPUGallerySim = {
	canvas: HTMLCanvasElement;
	sim: Simulation;
	rule: GalleryRule;
	ruleIndex: number;
	frameCount: number;
	lastFrameT: number;
	accMs: number;
};

let galleryGpuSims: WebGPUGallerySim[] = [];
let galleryGpuRaf: number | null = null;
let galleryGpuDevice: GPUDevice | null = null;

// Get neighbor offsets for different neighborhoods
// For hexagonal grids, offsets depend on whether the row is odd or even
function getNeighborOffsets(neighborhood: SimNeighborhood, y?: number): [number, number][] {
	const isOdd = y !== undefined && (y & 1) === 1;
	
	switch (neighborhood) {
		case 'moore':
			return [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
		case 'hexagonal':
			// 6-neighbor hexagonal - offsets depend on odd/even row
			if (isOdd) {
				return [[0,-1],[1,-1],[-1,0],[1,0],[0,1],[1,1]];
			} else {
				return [[-1,-1],[0,-1],[-1,0],[1,0],[-1,1],[0,1]];
			}
		case 'extendedMoore': {
			const ext: [number, number][] = [];
			for (let dy = -2; dy <= 2; dy++) {
				for (let dx = -2; dx <= 2; dx++) {
					if (dx !== 0 || dy !== 0) ext.push([dx, dy]);
				}
			}
			return ext;
		}
		case 'extendedHexagonal': {
			// 18-neighbor hexagonal - matches shader's complex per-row calculations
			const offsets: [number, number][] = [];
			
			// Ring 1: 6 immediate neighbors
			if (isOdd) {
				offsets.push([0,-1],[1,-1],[-1,0],[1,0],[0,1],[1,1]);
			} else {
				offsets.push([-1,-1],[0,-1],[-1,0],[1,0],[-1,1],[0,1]);
			}
			
			// Ring 2: 12 outer neighbors
			// Row y-2 (depends on whether row y-1 is odd)
			const isOddRowM1 = y !== undefined && ((y - 1) & 1) === 1;
			if (isOddRowM1) {
				offsets.push([0,-2],[1,-2]); // y-2 is even when y-1 is odd
			} else {
				offsets.push([-1,-2],[0,-2]); // y-2 is odd when y-1 is even
			}
			
			// Row y-1 outer (far corners)
			if (isOdd) {
				offsets.push([-1,-1],[2,-1]); // Note: [-1,-1] already in ring 1 for even, this is for odd row's outer
			} else {
				offsets.push([-2,-1],[1,-1]);
			}
			
			// Row y outer (distance 2 horizontally)
			offsets.push([-2,0],[2,0]);
			
			// Row y+1 outer (far corners)
			if (isOdd) {
				offsets.push([-1,1],[2,1]);
			} else {
				offsets.push([-2,1],[1,1]);
			}
			
			// Row y+2 (depends on whether row y+1 is odd)
			const isOddRowP1 = y !== undefined && ((y + 1) & 1) === 1;
			if (isOddRowP1) {
				offsets.push([0,2],[1,2]); // y+2 is even when y+1 is odd
			} else {
				offsets.push([-1,2],[0,2]); // y+2 is odd when y+1 is even
			}
			
			return offsets;
		}
		default:
			return [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
	}
}

function getCellCenterSquare(x: number, y: number): { x: number; y: number } {
	return { x: x + 0.5, y: y + 0.5 };
}

function getCellCenterHex(x: number, y: number): { x: number; y: number } {
	// Odd-r offset coordinates: odd rows are shifted right by +0.5
	const rowOffset = (y & 1) === 1 ? 0.5 : 0;
	return { x: x + 0.5 + rowOffset, y: y + 0.5 };
}

function getDiskCenter(isHex: boolean): { cx: number; cy: number } {
	// Use pixel-aligned center between cells for even-sized grids (e.g. 112x112).
	// This avoids the “off-by-one-cell” feeling when looking at perfectly symmetric seeds/stimuli.
	const cy = MINI_SIM_SIZE / 2;
	if (!isHex) return { cx: MINI_SIM_SIZE / 2, cy };

	// Choose the center row parity deterministically from the row just above the midline.
	const centerRow = Math.floor(cy - 0.5);
	const rowOffset = (centerRow & 1) === 1 ? 0.5 : 0;
	return { cx: MINI_SIM_SIZE / 2 + rowOffset, cy };
}

// Initialize a single mini simulation grid
function initMiniSimGrid(rule: GalleryRule): Uint32Array {
	const grid = new Uint32Array(MINI_SIM_SIZE * MINI_SIM_SIZE);
	const isHex = rule.neighborhood === 'hexagonal' || rule.neighborhood === 'extendedHexagonal';
	
	switch (rule.initType) {
		case 'centeredDisk': {
			// Solid disk at center
			// Use custom radius if provided, otherwise ~18% of grid
			const radius = rule.diskRadius ?? Math.round(MINI_SIM_SIZE * 0.18);
			const { cx, cy } = getDiskCenter(isHex);
			const r2 = radius * radius;
			
			if (isHex) {
				for (let y = 0; y < MINI_SIM_SIZE; y++) {
					for (let x = 0; x < MINI_SIM_SIZE; x++) {
						const p = getCellCenterHex(x, y);
						const dx = p.x - cx;
						const dy = p.y - cy;
						if (dx * dx + dy * dy <= r2) {
							grid[y * MINI_SIM_SIZE + x] = 1;
						}
					}
				}
			} else {
				// For square grids, use simple Euclidean distance
				for (let y = 0; y < MINI_SIM_SIZE; y++) {
					for (let x = 0; x < MINI_SIM_SIZE; x++) {
						const p = getCellCenterSquare(x, y);
						const dx = p.x - cx;
						const dy = p.y - cy;
						if (dx * dx + dy * dy <= r2) {
							grid[y * MINI_SIM_SIZE + x] = 1;
						}
					}
				}
			}
			break;
		}
		case 'centeredRing': {
			// Ring pattern
			const outerRadius = 7;
			const innerRadius = 3;
			const { cx, cy } = getDiskCenter(false);
			const outer2 = outerRadius * outerRadius;
			const inner2 = innerRadius * innerRadius;
			for (let y = 0; y < MINI_SIM_SIZE; y++) {
				for (let x = 0; x < MINI_SIM_SIZE; x++) {
					const p = getCellCenterSquare(x, y);
					const dx = p.x - cx;
					const dy = p.y - cy;
					const distSq = dx * dx + dy * dy;
					if (distSq >= inner2 && distSq <= outer2) {
						grid[y * MINI_SIM_SIZE + x] = 1;
					}
				}
			}
			break;
		}
		case 'symmetricCross': {
			const cx = Math.floor(MINI_SIM_SIZE / 2);
			const cy = Math.floor(MINI_SIM_SIZE / 2);
			for (let y = 0; y < MINI_SIM_SIZE; y++) {
				for (let x = 0; x < MINI_SIM_SIZE; x++) {
					const dx = Math.abs(x - cx);
					const dy = Math.abs(y - cy);
					if (dx < 3 || dy < 3) {
						grid[y * MINI_SIM_SIZE + x] = Math.random() < rule.density ? 1 : 0;
					}
				}
			}
			break;
		}
		case 'randomLow':
			for (let i = 0; i < grid.length; i++) {
				grid[i] = Math.random() < rule.density * 0.5 ? 1 : 0;
			}
			break;
		case 'text': {
			// Render text to grid using canvas
			const text = rule.initText || 'Hi';
			renderTextToGrid(grid, text);
			break;
		}
		case 'random':
		default:
			for (let i = 0; i < grid.length; i++) {
				grid[i] = Math.random() < rule.density ? 1 : 0;
			}
	}
	
	return grid;
}

// Render text to a mini-sim grid using canvas
function renderTextToGrid(grid: Uint32Array, text: string): void {
	// Create offscreen canvas
	const canvas = document.createElement('canvas');
	canvas.width = MINI_SIM_SIZE;
	canvas.height = MINI_SIM_SIZE;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	
	// Clear canvas
	ctx.fillStyle = 'black';
	ctx.fillRect(0, 0, MINI_SIM_SIZE, MINI_SIM_SIZE);
	
	// Calculate font size to fill about 60% of width
	// Start with a reasonable size and measure
	let fontSize = 14;
	ctx.font = `bold ${fontSize}px Arial, sans-serif`;
	const textWidth = ctx.measureText(text).width;
	
	// Adjust font size to fit ~60% of canvas width
	const targetWidth = MINI_SIM_SIZE * 0.60;
	fontSize = Math.floor(fontSize * (targetWidth / textWidth));
	fontSize = Math.max(8, Math.min(20, fontSize)); // Clamp between 8-20
	
	ctx.font = `bold ${fontSize}px Arial, sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = 'white';
	ctx.fillText(text, MINI_SIM_SIZE / 2, MINI_SIM_SIZE / 2);
	
	// Read pixels and convert to grid
	const imageData = ctx.getImageData(0, 0, MINI_SIM_SIZE, MINI_SIM_SIZE);
	for (let y = 0; y < MINI_SIM_SIZE; y++) {
		for (let x = 0; x < MINI_SIM_SIZE; x++) {
			const i = (y * MINI_SIM_SIZE + x) * 4;
			// If pixel is bright (text), set cell to alive
			if (imageData.data[i] > 128) {
				grid[y * MINI_SIM_SIZE + x] = 1;
			}
		}
	}
}

// Apply stimulation based on rule's init type (additive - only revives dead cells)
function applyStimulation(grid: Uint32Array, rule: GalleryRule): void {
	if (rule.initType === 'text' && rule.initText) {
		// Re-apply text pattern additively
		addTextToGrid(grid, rule.initText);
	} else {
		const stimShape = rule.stimShape ?? 'disk';
		const reviveMode = rule.stimRevive ?? 'deadOnly';

		const shouldRevive = (cellState: number): boolean => {
			if (reviveMode === 'deadOrDying') return cellState !== 1;
			return cellState === 0;
		};

		// Default: apply a solid disk at center additively
		// Use the same hex-aware coordinate system as initMiniSimGrid
		const radius = rule.diskRadius ?? Math.round(MINI_SIM_SIZE * 0.18);
		const isHex = rule.neighborhood === 'hexagonal' || rule.neighborhood === 'extendedHexagonal';
		const { cx, cy } = getDiskCenter(isHex);
		const r2 = radius * radius;

		if (stimShape === 'horizontalLine' || stimShape === 'verticalLine') {
			// Make line stim a bit stronger than disk radius so it’s visible in the tiny gallery.
			const halfLen = Math.max(2, Math.floor(radius * 1.4));
			if (stimShape === 'horizontalLine') {
				const y = Math.floor(cy);
				const xMid = Math.floor(cx);
				for (let x = xMid - halfLen; x <= xMid + halfLen; x++) {
					if (x < 0 || x >= MINI_SIM_SIZE) continue;
					const idx = y * MINI_SIM_SIZE + x;
					if (shouldRevive(grid[idx])) grid[idx] = 1;
				}
			} else {
				const x = Math.floor(cx);
				const yMid = Math.floor(cy);
				for (let y = yMid - halfLen; y <= yMid + halfLen; y++) {
					if (y < 0 || y >= MINI_SIM_SIZE) continue;
					const idx = y * MINI_SIM_SIZE + x;
					if (shouldRevive(grid[idx])) grid[idx] = 1;
				}
			}
			return;
		}
		
		if (isHex) {
			for (let y = 0; y < MINI_SIM_SIZE; y++) {
				for (let x = 0; x < MINI_SIM_SIZE; x++) {
					const p = getCellCenterHex(x, y);
					const dx = p.x - cx;
					const dy = p.y - cy;
					if (dx * dx + dy * dy <= r2) {
						const idx = y * MINI_SIM_SIZE + x;
						if (shouldRevive(grid[idx])) grid[idx] = 1;
					}
				}
			}
		} else {
			// For square grids, use simple Euclidean distance
			for (let y = 0; y < MINI_SIM_SIZE; y++) {
				for (let x = 0; x < MINI_SIM_SIZE; x++) {
					const p = getCellCenterSquare(x, y);
					const dx = p.x - cx;
					const dy = p.y - cy;
					if (dx * dx + dy * dy <= r2) {
						const idx = y * MINI_SIM_SIZE + x;
						if (shouldRevive(grid[idx])) grid[idx] = 1;
					}
				}
			}
		}
	}
}

// Add text to grid additively (only revives dead cells)
function addTextToGrid(grid: Uint32Array, text: string): void {
	// Create offscreen canvas
	const canvas = document.createElement('canvas');
	canvas.width = MINI_SIM_SIZE;
	canvas.height = MINI_SIM_SIZE;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	
	// Clear canvas
	ctx.fillStyle = 'black';
	ctx.fillRect(0, 0, MINI_SIM_SIZE, MINI_SIM_SIZE);
	
	// Calculate font size to fill about 60% of width
	let fontSize = 14;
	ctx.font = `bold ${fontSize}px Arial, sans-serif`;
	const textWidth = ctx.measureText(text).width;
	
	const targetWidth = MINI_SIM_SIZE * 0.60;
	fontSize = Math.floor(fontSize * (targetWidth / textWidth));
	fontSize = Math.max(8, Math.min(20, fontSize));
	
	ctx.font = `bold ${fontSize}px Arial, sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = 'white';
	ctx.fillText(text, MINI_SIM_SIZE / 2, MINI_SIM_SIZE / 2);
	
	// Read pixels and add to grid (only where cells are dead)
	const imageData = ctx.getImageData(0, 0, MINI_SIM_SIZE, MINI_SIM_SIZE);
	for (let y = 0; y < MINI_SIM_SIZE; y++) {
		for (let x = 0; x < MINI_SIM_SIZE; x++) {
			const i = (y * MINI_SIM_SIZE + x) * 4;
			const idx = y * MINI_SIM_SIZE + x;
			// If pixel is bright (text) AND cell is dead, revive it
			if (imageData.data[i] > 128 && grid[idx] === 0) {
				grid[idx] = 1;
			}
		}
	}
}

function stepGallerySim(state: MiniSimState): void {
	const { rule } = state;
	const { seedRate, stimPeriod } = rule;
	
	// Increment frame count
	state.frameCount++;
	
	// Periodic stimulation (disk or text based on init type)
	if (stimPeriod && stimPeriod > 0 && state.frameCount % stimPeriod === 0) {
		applyStimulation(state.grid, rule);
	}
	
	// Continuous random seeding
	if (seedRate > 0) {
		for (let i = 0; i < state.grid.length; i++) {
			if (state.grid[i] === 0 && Math.random() < seedRate) {
				state.grid[i] = 1;
			}
		}
	}
	
	// Step using the canonical CPU fallback kernel (matches GPU semantics).
	stepBsGenerationsCpu(state.grid, state.nextGrid, state.cpuCfg);

	// Swap buffers (no copy).
	const tmp = state.grid;
	state.grid = state.nextGrid;
	state.nextGrid = tmp;
}

// Parse accent color to RGB
function parseColor(color: string): [number, number, number] {
	// Handle rgb() format
	const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
	if (rgbMatch) {
		return [parseInt(rgbMatch[1]) / 255, parseInt(rgbMatch[2]) / 255, parseInt(rgbMatch[3]) / 255];
	}
	// Handle hex format
	const hex = color.replace('#', '');
	if (hex.length === 6) {
		return [
			parseInt(hex.slice(0, 2), 16) / 255,
			parseInt(hex.slice(2, 4), 16) / 255,
			parseInt(hex.slice(4, 6), 16) / 255
		];
	}
	return [0.2, 0.9, 0.95]; // Default cyan
}

// HSL conversion for color interpolation (matches main shader)
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h = 0;
	if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
	else if (max === g) h = (b - r) / d + 2;
	else h = (r - g) / d + 4;
	return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	if (s === 0) return [l, l, l];
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const hue2rgb = (t: number) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1/6) return p + (q - p) * 6 * t;
		if (t < 1/2) return q;
		if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
		return p;
	};
	return [hue2rgb(h + 1/3), hue2rgb(h), hue2rgb(h - 1/3)];
}

// Calculate neighbor vitality sum for shading (matches shader sum_neighbor_vitality_normalized)
function sumNeighborVitality(grid: Uint32Array, x: number, y: number, neighborhood: SimNeighborhood, numStates: number): number {
	const offsets = getNeighborOffsets(neighborhood, y);
	let total = 0;
	const maxNeighbors = offsets.length;
	
	for (const [dx, dy] of offsets) {
		const nx = (x + dx + MINI_SIM_SIZE) % MINI_SIM_SIZE;
		const ny = (y + dy + MINI_SIM_SIZE) % MINI_SIM_SIZE;
		const neighborState = grid[ny * MINI_SIM_SIZE + nx];
		
		if (neighborState > 0 && numStates > 1) {
			// Vitality = (numStates - state) / (numStates - 1), but state 0 = dead
			// State 1 = alive (vitality 1), State numStates-1 = almost dead (vitality ~0)
			const vitality = (numStates - neighborState) / (numStates - 1);
			total += vitality;
		}
	}
	
	return total / maxNeighbors;
}

// Helper to wrap hue to 0-1 range
function wrapHue(h: number): number {
	if (h < 0) return h + 1;
	if (h > 1) return h - 1;
	return h;
}

// Helper to mix two values
function mix(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

// Spectrum color that matches shader's state_to_color function
// Returns [r, g, b] as 0-255 integers for direct pixel writing
function getStateColorRgb(
	state: number, 
	numStates: number, 
	accentRgb: [number, number, number], 
	isLight: boolean, 
	bgRgb: [number, number, number],
	spectrumMode: number,
	neighborFactor: number = 1.0 // 0-1 based on neighbor vitality (for shading)
): [number, number, number] {
	if (state === 0) return bgRgb;
	
	const [h, s, l] = rgbToHsl(accentRgb[0], accentRgb[1], accentRgb[2]);
	
	// Very subtle shading: 90% to 100% brightness based on neighbors
	const shadingMix = 0.90 + neighborFactor * 0.10;
	
	if (state === 1) {
		// Alive state - use accent color, with subtle neighbor shading
		return [
			Math.round(accentRgb[0] * 255 * shadingMix), 
			Math.round(accentRgb[1] * 255 * shadingMix), 
			Math.round(accentRgb[2] * 255 * shadingMix)
		];
	}
	
	// Dying states - apply spectrum mode
	const dyingProgress = (state - 1) / (numStates - 1);
	const spectrumProgress = dyingProgress; // frequency = 1.0 for mini-sims
	
	let dyingHue: number;
	let dyingSat: number;
	let dyingLight: number;
	
	const mode = spectrumMode;
	
	// Mode 0: Hue Shift (subtle 25% rotation)
	if (mode === 0) {
		dyingHue = wrapHue(h + 0.25 * spectrumProgress);
		if (isLight) {
			dyingSat = Math.max(s, 0.6) * Math.max(1.0 - spectrumProgress * 0.25, 0.65);
			dyingLight = mix(Math.min(l, 0.55), 0.72, dyingProgress * dyingProgress);
		} else {
			const boostedSat = Math.max(s, 0.4);
			const satCurve = 1.0 - spectrumProgress * spectrumProgress;
			dyingSat = boostedSat * Math.max(satCurve, 0.25);
			dyingLight = mix(l, 0.12, dyingProgress * dyingProgress);
		}
	}
	// Mode 1: Rainbow (full spectrum rotation)
	else if (mode === 1) {
		dyingHue = wrapHue(h + spectrumProgress);
		if (isLight) {
			dyingSat = Math.max(0.75, s);
			dyingLight = mix(Math.min(l, 0.5), 0.68, dyingProgress * dyingProgress);
		} else {
			const boostedSat = Math.max(s, 0.5);
			dyingSat = boostedSat * Math.max(1.0 - spectrumProgress * 0.3, 0.45);
			dyingLight = mix(l, 0.15, dyingProgress * dyingProgress);
		}
	}
	// Mode 2: Warm (shift toward red/orange)
	else if (mode === 2) {
		const targetHue = 0.05;
		let hueDiff = targetHue - h;
		if (hueDiff > 0.5) hueDiff -= 1.0;
		if (hueDiff < -0.5) hueDiff += 1.0;
		dyingHue = wrapHue(h + hueDiff * spectrumProgress);
		if (isLight) {
			dyingSat = Math.max(s, 0.65) * Math.max(1.0 - spectrumProgress * 0.2, 0.6);
			dyingLight = mix(Math.min(l, 0.55), 0.7, dyingProgress * dyingProgress);
		} else {
			const boostedSat = Math.max(s, 0.45);
			dyingSat = boostedSat * Math.max(1.0 - spectrumProgress * 0.3, 0.4);
			dyingLight = mix(l, 0.1, dyingProgress * dyingProgress);
		}
	}
	// Mode 3: Cool (shift toward blue/purple)
	else if (mode === 3) {
		const targetHue = 0.7;
		let hueDiff = targetHue - h;
		if (hueDiff > 0.5) hueDiff -= 1.0;
		if (hueDiff < -0.5) hueDiff += 1.0;
		dyingHue = wrapHue(h + hueDiff * spectrumProgress);
		if (isLight) {
			dyingSat = Math.max(s, 0.65) * Math.max(1.0 - spectrumProgress * 0.2, 0.6);
			dyingLight = mix(Math.min(l, 0.55), 0.7, dyingProgress * dyingProgress);
		} else {
			const boostedSat = Math.max(s, 0.45);
			dyingSat = boostedSat * Math.max(1.0 - spectrumProgress * 0.3, 0.4);
			dyingLight = mix(l, 0.1, dyingProgress * dyingProgress);
		}
	}
	// Mode 4: Monochrome (fade without hue change)
	else if (mode === 4) {
		dyingHue = h;
		if (isLight) {
			dyingSat = Math.max(s, 0.5) * Math.max(1.0 - spectrumProgress * 0.35, 0.55);
			dyingLight = mix(Math.min(l, 0.5), 0.75, dyingProgress);
		} else {
			const boostedSat = Math.max(s, 0.35);
			dyingSat = boostedSat * (1.0 - spectrumProgress * 0.7);
			dyingLight = mix(l, 0.1, dyingProgress);
		}
	}
	// Mode 5: Fire (alive -> yellow -> orange -> red)
	else if (mode === 5) {
		if (spectrumProgress < 0.33) {
			dyingHue = mix(h, 0.12, spectrumProgress * 3.0);
		} else if (spectrumProgress < 0.66) {
			dyingHue = mix(0.12, 0.06, (spectrumProgress - 0.33) * 3.0);
		} else {
			dyingHue = mix(0.06, 0.0, (spectrumProgress - 0.66) * 3.0);
		}
		dyingHue = wrapHue(dyingHue);
		const fireProgress = spectrumProgress * spectrumProgress;
		if (isLight) {
			dyingSat = Math.max(0.9 - fireProgress * 0.15, 0.7);
			dyingLight = mix(0.5, 0.68, dyingProgress * dyingProgress);
		} else {
			dyingSat = Math.max(1.0 - fireProgress * 0.2, 0.75);
			dyingLight = mix(0.65, 0.04, dyingProgress * dyingProgress);
		}
	}
	// Mode 6: Complement (transition to opposite hue)
	else if (mode === 6) {
		const complementHue = (h + 0.5) % 1;
		dyingHue = mix(h, complementHue, spectrumProgress);
		const satCurve = 1.0 - Math.abs(spectrumProgress - 0.5) * 1.5;
		if (isLight) {
			dyingSat = Math.max(s, 0.7) * Math.max(satCurve, 0.6);
			dyingLight = mix(Math.min(l, 0.55), 0.68, dyingProgress * dyingProgress);
		} else {
			dyingSat = Math.max(s, 0.5) * Math.max(satCurve, 0.4);
			dyingLight = mix(l, 0.12, dyingProgress * dyingProgress);
		}
	}
	// Mode 7: Triadic (three-way color harmony)
	else if (mode === 7) {
		const triadic1 = (h + 0.333) % 1;
		const triadic2 = (h + 0.666) % 1;
		if (spectrumProgress < 0.5) {
			dyingHue = mix(h, triadic1, spectrumProgress * 2.0);
		} else {
			dyingHue = mix(triadic1, triadic2, (spectrumProgress - 0.5) * 2.0);
		}
		if (isLight) {
			dyingSat = Math.max(s, 0.7) * Math.max(1.0 - spectrumProgress * 0.2, 0.65);
			dyingLight = mix(Math.min(l, 0.5), 0.65, dyingProgress * dyingProgress);
		} else {
			dyingSat = Math.max(s, 0.55) * Math.max(1.0 - spectrumProgress * 0.25, 0.5);
			dyingLight = mix(l, 0.12, dyingProgress * dyingProgress);
		}
	}
	// Mode 8: Split (split-complementary)
	else if (mode === 8) {
		const split1 = (h + 0.417) % 1;
		const split2 = (h + 0.583) % 1;
		const phase = Math.sin(spectrumProgress * Math.PI * 2.0) * 0.5 + 0.5;
		dyingHue = mix(split1, split2, phase);
		if (isLight) {
			dyingSat = Math.max(s, 0.7) * Math.max(1.0 - spectrumProgress * 0.25, 0.6);
			dyingLight = mix(Math.min(l, 0.52), 0.68, dyingProgress * dyingProgress);
		} else {
			dyingSat = Math.max(s, 0.5) * Math.max(1.0 - spectrumProgress * 0.3, 0.45);
			dyingLight = mix(l, 0.12, dyingProgress * dyingProgress);
		}
	}
	// Mode 9: Analogous (neighboring hues)
	else if (mode === 9) {
		const wave = Math.sin(spectrumProgress * Math.PI * 3.0);
		dyingHue = wrapHue(h + wave * 0.083);
		if (isLight) {
			dyingSat = Math.max(s, 0.65) * Math.max(1.0 - spectrumProgress * 0.25, 0.6);
			dyingLight = mix(Math.min(l, 0.55), 0.7, dyingProgress * dyingProgress);
		} else {
			dyingSat = Math.max(s, 0.45) * Math.max(1.0 - spectrumProgress * 0.35, 0.4);
			dyingLight = mix(l, 0.12, dyingProgress * dyingProgress);
		}
	}
	// Mode 10: Pastel (soft desaturated tones)
	else if (mode === 10) {
		dyingHue = wrapHue(h + spectrumProgress * 0.15);
		if (isLight) {
			dyingSat = Math.max(s * 0.6, 0.35) * (1.0 - spectrumProgress * 0.3);
			dyingLight = mix(Math.min(l, 0.55), 0.72, dyingProgress);
		} else {
			dyingSat = Math.max(s * 0.6, 0.25) * (1.0 - spectrumProgress * 0.4);
			dyingLight = mix(Math.max(l, 0.5), 0.2, dyingProgress);
		}
	}
	// Mode 11: Vivid (high saturation punch)
	else if (mode === 11) {
		const numBands = 8.0;
		const band = Math.floor(spectrumProgress * numBands);
		dyingHue = wrapHue(h + (band / numBands) * 0.4);
		const bandVar = (band * 0.37) % 1;
		if (isLight) {
			dyingSat = Math.min(1.0, Math.max(s, 0.8) + 0.15 * bandVar);
			dyingLight = mix(0.45, 0.65, dyingProgress * dyingProgress);
		} else {
			dyingSat = Math.min(1.0, Math.max(s, 0.75) + 0.15 * bandVar);
			dyingLight = mix(0.55, 0.1, dyingProgress * dyingProgress);
		}
	}
	// Mode 12: Thermal
	else if (mode === 12) {
		const numBands = 12.0;
		const band = Math.floor(spectrumProgress * numBands);
		const bandT = band / (numBands - 1.0);
		const isWarmStart = h < 0.17 || h > 0.83;
		dyingHue = isWarmStart ? mix(h, 0.75, bandT) : mix(h, 0.0, bandT);
		dyingHue = wrapHue(dyingHue);
		dyingSat = (band % 2) < 1 ? 0.9 : 0.7;
		const fade = dyingProgress * dyingProgress;
		dyingLight = isLight ? mix(0.48, 0.7, fade) : mix(0.55, 0.12, fade);
	}
	// Mode 13: Bands
	else if (mode === 13) {
		const numBands = 10.0;
		const band = Math.floor(spectrumProgress * numBands);
		dyingHue = wrapHue(h + (band / numBands) * 0.6);
		dyingSat = (band % 2) < 1 ? Math.max(s, 0.75) : Math.max(s, 0.55);
		const stripe = (band % 2) < 1;
		if (isLight) {
			dyingLight = stripe ? 0.45 : 0.55;
			dyingLight = mix(dyingLight, 0.7, dyingProgress * dyingProgress);
		} else {
			dyingLight = stripe ? 0.52 : 0.4;
			dyingLight = mix(dyingLight, 0.1, dyingProgress * dyingProgress);
		}
	}
	// Mode 14: Neon
	else if (mode === 14) {
		const numBands = 9.0;
		const band = Math.floor(spectrumProgress * numBands);
		const colorIdx = band % 3;
		if (colorIdx < 1) dyingHue = h;
		else if (colorIdx < 2) dyingHue = (h + 0.333) % 1;
		else dyingHue = (h + 0.666) % 1;
		dyingSat = 1.0;
		if (isLight) {
			dyingLight = 0.42 + (band % 3) * 0.04;
			dyingLight = mix(dyingLight, 0.65, dyingProgress * dyingProgress);
		} else {
			dyingLight = 0.52 + (band % 3) * 0.05;
			dyingLight = mix(dyingLight, 0.08, dyingProgress * dyingProgress);
		}
	}
	// Mode 15: Sunset
	else if (mode === 15) {
		const numBands = 12.0;
		const band = Math.floor(spectrumProgress * numBands);
		const bandT = band / (numBands - 1.0);
		const warmHue = mix(h, 0.08, 0.5);
		dyingHue = mix(warmHue, 0.6, bandT);
		dyingHue = wrapHue(dyingHue);
		dyingSat = (band % 2) < 1 ? 0.85 : 0.65;
		dyingLight = isLight ? mix(0.48, 0.68, dyingProgress * dyingProgress) : mix(0.55, 0.1, dyingProgress * dyingProgress);
	}
	// Mode 16: Ocean
	else if (mode === 16) {
		const numBands = 10.0;
		const band = Math.floor(spectrumProgress * numBands);
		const bandT = band / (numBands - 1.0);
		const baseOcean = mix(0.5, 0.66, bandT);
		dyingHue = mix(h, baseOcean, 0.3 + spectrumProgress * 0.7);
		const wave = Math.sin(bandT * Math.PI * 2.0) * 0.15;
		if (isLight) {
			dyingSat = Math.max(0.65, s * 0.9) + wave;
			dyingLight = mix(0.45, 0.65, dyingProgress * dyingProgress);
		} else {
			dyingSat = Math.max(0.6, s * 0.9) + wave;
			dyingLight = mix(0.5, 0.08, dyingProgress * dyingProgress);
		}
	}
	// Mode 17: Forest
	else {
		const numBands = 10.0;
		const band = Math.floor(spectrumProgress * numBands);
		const bandT = band / (numBands - 1.0);
		const forestHue = mix(0.33, 0.08, bandT);
		dyingHue = mix(h, forestHue, 0.4 + spectrumProgress * 0.6);
		dyingHue = wrapHue(dyingHue);
		if (isLight) {
			dyingSat = mix(Math.max(s, 0.6), 0.45, bandT);
			dyingLight = mix(0.42, 0.62, dyingProgress * dyingProgress);
		} else {
			dyingSat = mix(Math.max(s, 0.6), 0.4, bandT);
			dyingLight = mix(0.45, 0.1, dyingProgress * dyingProgress);
		}
	}
	
	// Apply subtle neighbor shading via lightness adjustment
	const [r, g, b] = hslToRgb(dyingHue, dyingSat, dyingLight * shadingMix);
	
	// Blend with background at the very end (cubic for late blend)
	const bgBlend = dyingProgress * dyingProgress * dyingProgress * 0.6;
	return [
		Math.round((r * (1 - bgBlend) + bgRgb[0] / 255 * bgBlend) * 255),
		Math.round((g * (1 - bgBlend) + bgRgb[1] / 255 * bgBlend) * 255),
		Math.round((b * (1 - bgBlend) + bgRgb[2] / 255 * bgBlend) * 255)
	];
}

// Render a single gallery simulation using ImageData for performance
function renderGallerySim(state: MiniSimState, accentColor: string, isLight: boolean, spectrumMode: number): void {
	const { canvas, ctx, imageData, grid, rule } = state;
	if (!canvas || !ctx || !imageData) return;
	
	const cellSize = MINI_SIM_CELL_SIZE;
	const accentRgb = parseColor(accentColor);
	const bgRgb: [number, number, number] = isLight ? [232, 232, 236] : [10, 10, 15];
	const { numStates, neighborhood } = rule;
	const data = imageData.data;
	const canvasWidth = canvas.width;
	
	// Write pixels directly to ImageData buffer
	for (let y = 0; y < MINI_SIM_SIZE; y++) {
		for (let x = 0; x < MINI_SIM_SIZE; x++) {
			const cellState = grid[y * MINI_SIM_SIZE + x];
			
			// Calculate neighbor vitality for shading (only for non-dead cells)
			let neighborFactor = 1.0;
			if (cellState > 0) {
				neighborFactor = sumNeighborVitality(grid, x, y, neighborhood, numStates);
			}
			
			const [r, g, b] = getStateColorRgb(cellState, numStates, accentRgb, isLight, bgRgb, spectrumMode, neighborFactor);
			
			// Fill cellSize x cellSize block of pixels
			for (let py = 0; py < cellSize; py++) {
				for (let px = 0; px < cellSize; px++) {
					const pixelX = x * cellSize + px;
					const pixelY = y * cellSize + py;
					const idx = (pixelY * canvasWidth + pixelX) * 4;
					data[idx] = r;
					data[idx + 1] = g;
					data[idx + 2] = b;
					data[idx + 3] = 255;
				}
			}
		}
	}
	
	// Single putImageData call instead of thousands of fillRect calls
	ctx.putImageData(imageData, 0, 0);
}

// Getters for current theme state - these read fresh values each call
let getAccentColor: () => string = () => getCSSVariable('--ui-accent');
let getIsLightTheme: () => boolean = () => false;
let getSpectrumMode: () => number = () => 1; // Default to rainbow (mode 1)

function getSpectrumIndexFromId(id: string): number {
	try {
		// The app returns IDs like 'fire', 'neon', etc. which match the core mapping.
		return spectrumModeToIndex(id as Parameters<typeof spectrumModeToIndex>[0]);
	} catch {
		return 1; // rainbow
	}
}

function buildCpuCfg(rule: GalleryRule): CpuStepConfig {
	const curveSamples =
		rule.vitalityMode === 'curve' && rule.curvePoints
			? sampleVitalityCurve(rule.curvePoints)
			: new Array(128).fill(0);

	return {
		width: MINI_SIM_SIZE,
		height: MINI_SIM_SIZE,
		boundary: 'torus',
		rule: {
			birthMask: rule.birthMask,
			surviveMask: rule.surviveMask,
			numStates: rule.numStates,
			neighborhood: rule.neighborhood
		},
		vitality: {
			mode: rule.vitalityMode ?? 'none',
			threshold: 1.0,
			ghostFactor: rule.ghostFactor ?? 0.0,
			sigmoidSharpness: 10.0,
			decayPower: 1.0,
			curveSamples
		}
	};
}

function applyVitalityView(sim: Simulation, rule: GalleryRule): void {
	const curveSamples =
		rule.vitalityMode === 'curve' && rule.curvePoints
			? sampleVitalityCurve(rule.curvePoints)
			: new Array(128).fill(0);

	sim.setView({
		vitalityMode: rule.vitalityMode ?? 'none',
		vitalityThreshold: 1.0,
		vitalityGhostFactor: rule.ghostFactor ?? 0.0,
		vitalitySigmoidSharpness: 10.0,
		vitalityDecayPower: 1.0,
		vitalityCurveSamples: curveSamples,
		neighborShading: 2
	});
}

function seedWebGPUSim(sim: Simulation, rule: GalleryRule): void {
	const isHex = rule.neighborhood === 'hexagonal' || rule.neighborhood === 'extendedHexagonal';
	const { width, height } = sim.getSize();
	const cx = width / 2;
	const cy = height / 2;

	if (rule.initType === 'random') {
		sim.randomize(rule.density, true);
		return;
	}

	if (rule.initType === 'randomLow') {
		sim.randomize(rule.density * 0.5, true);
		return;
	}

	sim.clear();

	if (rule.initType === 'centeredDisk') {
		const radius = rule.diskRadius ?? Math.round(width * 0.18);
		const r2 = radius * radius;

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const p = isHex ? getCellCenterHex(x, y) : getCellCenterSquare(x, y);
				const dx = p.x - cx;
				const dy = p.y - cy;
				if (dx * dx + dy * dy <= r2) sim.setCell(x, y, 1);
			}
		}
		return;
	}

	if (rule.initType === 'centeredRing') {
		const outerRadius = 7;
		const innerRadius = 3;
		const outer2 = outerRadius * outerRadius;
		const inner2 = innerRadius * innerRadius;
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const p = getCellCenterSquare(x, y);
				const dx = p.x - cx;
				const dy = p.y - cy;
				const d2 = dx * dx + dy * dy;
				if (d2 >= inner2 && d2 <= outer2) sim.setCell(x, y, 1);
			}
		}
		return;
	}

	if (rule.initType === 'symmetricCross') {
		const centerX = Math.floor(cx);
		const centerY = Math.floor(cy);
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const dx = Math.abs(x - centerX);
				const dy = Math.abs(y - centerY);
				if (dx < 3 || dy < 3) {
					if (Math.random() < rule.density) sim.setCell(x, y, 1);
				}
			}
		}
		return;
	}
}

function applyStimulationWebGPU(sim: Simulation, rule: GalleryRule): void {
	const stimShape = rule.stimShape ?? 'disk';
	const { width, height } = sim.getSize();
	const cx = width / 2;
	const cy = height / 2;
	const radius = rule.diskRadius ?? Math.round(width * 0.18);

	if (stimShape === 'horizontalLine' || stimShape === 'verticalLine') {
		const halfLen = Math.max(2, Math.floor(radius * 1.4));
		if (stimShape === 'horizontalLine') {
			const y = Math.floor(cy);
			const xMid = Math.floor(cx);
			for (let x = xMid - halfLen; x <= xMid + halfLen; x++) {
				if (x < 0 || x >= width) continue;
				sim.setCell(x, y, 1);
			}
		} else {
			const x = Math.floor(cx);
			const yMid = Math.floor(cy);
			for (let y = yMid - halfLen; y <= yMid + halfLen; y++) {
				if (y < 0 || y >= height) continue;
				sim.setCell(x, y, 1);
			}
		}
		return;
	}

	// Disk
	const isHex = rule.neighborhood === 'hexagonal' || rule.neighborhood === 'extendedHexagonal';
	const r2 = radius * radius;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const p = isHex ? getCellCenterHex(x, y) : getCellCenterSquare(x, y);
			const dx = p.x - cx;
			const dy = p.y - cy;
			if (dx * dx + dy * dy <= r2) sim.setCell(x, y, 1);
		}
	}
}

async function startGalleryWebGPU(accentColor: string, isLight: boolean): Promise<boolean> {
	const dev = await requestWebGPUDevice();
	if (!dev.ok) return false;
	galleryGpuDevice = dev.value.device;

	const initialIsLight = isLight;
	const indices = GALLERY_RULES.map((_, i) => i);
	for (let i = indices.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[indices[i], indices[j]] = [indices[j], indices[i]];
	}

	const sims: WebGPUGallerySim[] = [];
	for (let i = 0; i < GALLERY_RULES.length; i++) {
		const rule = GALLERY_RULES[i];
		const canvas = document.getElementById(`tour-gallery-${i}`) as HTMLCanvasElement | null;
		if (!canvas) continue;

		const ctxRes = createWebGPUContext(canvas, dev.value.device, dev.value.format);
		if (!ctxRes.ok) continue;

		const sim = new Simulation(ctxRes.value, {
			width: MINI_SIM_SIZE,
			height: MINI_SIM_SIZE,
			rule: {
				birthMask: rule.birthMask,
				surviveMask: rule.surviveMask,
				numStates: rule.numStates,
				neighborhood: rule.neighborhood
			}
		});

		sim.setView({
			showGrid: false,
			isLightTheme: initialIsLight,
			aliveColor: parseColor(accentColor),
			spectrumMode: getSpectrumMode(),
			spectrumFrequency: 1.0,
			brushRadius: -1
		});

		applyVitalityView(sim, rule);
		seedWebGPUSim(sim, rule);
		sim.render(canvas.width, canvas.height);

		sims.push({ canvas, sim, rule, ruleIndex: i, frameCount: 0, lastFrameT: 0, accMs: 0 });
	}

	galleryGpuSims = sims;

	// Reveal effect (CSS class only; simulation already running).
	indices.forEach((stateIndex, revealOrder) => {
		const entry = galleryGpuSims.find((s) => s.canvas.id === `tour-gallery-${stateIndex}`);
		if (!entry) return;
		setTimeout(() => {
			entry.canvas.classList.add('loaded');
			if (stateIndex === selectedGalleryIndex) entry.canvas.classList.add('selected');
		}, revealOrder * 60 + 10);
	});

	// Click handlers
	galleryGpuSims.forEach((state) => {
		state.canvas.onclick = () => selectGalleryRule(state.ruleIndex);
	});

	const stepMs = 33; // ~30 sps
	const loop = (t: number) => {
		galleryGpuRaf = requestAnimationFrame(loop);
		const currentAccent = getAccentColor();
		const currentIsLight = getIsLightTheme();
		const currentSpectrum = getSpectrumMode();

		for (const state of galleryGpuSims) {
			if (!state.canvas.classList.contains('loaded')) continue;

			if (state.lastFrameT === 0) state.lastFrameT = t;
			const dt = Math.min(50, t - state.lastFrameT);
			state.lastFrameT = t;
			state.accMs += dt;

			// Update view colors live with theme.
			state.sim.setView({
				isLightTheme: currentIsLight,
				aliveColor: parseColor(currentAccent),
				spectrumMode: currentSpectrum
			});

			while (state.accMs >= stepMs) {
				state.frameCount++;
				if (state.rule.stimPeriod && state.rule.stimPeriod > 0 && state.frameCount % state.rule.stimPeriod === 0) {
					applyStimulationWebGPU(state.sim, state.rule);
				}

				// Convert old per-cell probability seedRate -> per-1000-cells rate expected by Simulation.continuousSeed
				if (state.rule.seedRate > 0) {
					state.sim.continuousSeed(state.rule.seedRate * 1000, 'pixel', true);
				}

				state.sim.step();
				state.accMs -= stepMs;
			}

			state.sim.render(state.canvas.width, state.canvas.height);
		}
	};

	galleryGpuRaf = requestAnimationFrame(loop);
	return galleryGpuSims.length > 0;
}

// Start the gallery of simulations with smooth loading
function startGallery(accentColor: string, isLight: boolean): void {
	stopGallery();
	// Default to Hex2 Neo Diagonal Growth (index 3)
	const defaultSelectedIndex = GALLERY_RULES.findIndex(r => r.name === 'Hex2 Neo Diagonal Growth');
	selectedGalleryIndex = defaultSelectedIndex >= 0 ? defaultSelectedIndex : 0;
	userActivelySelectedRule = false; // Reset - user hasn't clicked anything yet
	
	// Store initial values for later comparison and initial fill
	const initialIsLight = isLight;
	
	// Use requestAnimationFrame for smoother initialization after DOM is ready
	requestAnimationFrame(() => {
		const startCpuGallery = () => {
		const bgRgb: [number, number, number] = initialIsLight ? [232, 232, 236] : [10, 10, 15];
		
		gallerySimStates = GALLERY_RULES.map((rule, i) => {
			const canvas = document.getElementById(`tour-gallery-${i}`) as HTMLCanvasElement;
			const ctx = canvas?.getContext('2d') || null;
			// Pre-allocate ImageData buffer for fast rendering
			const imageData = ctx ? ctx.createImageData(canvas.width, canvas.height) : null;
			
			// Fill with background color immediately so canvas isn't blank
			if (imageData) {
				const data = imageData.data;
				for (let j = 0; j < data.length; j += 4) {
					data[j] = bgRgb[0];
					data[j + 1] = bgRgb[1];
					data[j + 2] = bgRgb[2];
					data[j + 3] = 255;
				}
				ctx?.putImageData(imageData, 0, 0);
			}
			
			return {
				grid: initMiniSimGrid(rule),
					nextGrid: new Uint32Array(MINI_SIM_SIZE * MINI_SIM_SIZE), // Pre-allocate second buffer
				canvas,
				ctx,
				imageData,
				rule,
					frameCount: 0,
					cpuCfg: buildCpuCfg(rule)
			};
		});
		
		// Create randomized reveal order for cute pop-in effect
		const indices = gallerySimStates.map((_, i) => i);
		for (let i = indices.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[indices[i], indices[j]] = [indices[j], indices[i]];
		}
		
		// Reveal canvases in random order - each starts animating immediately when revealed
		indices.forEach((stateIndex, revealOrder) => {
			const state = gallerySimStates[stateIndex];
			setTimeout(() => {
				// Read fresh color values for initial render
				const currentAccent = getAccentColor();
				const currentIsLight = getIsLightTheme();
				const currentSpectrum = getSpectrumMode();
				renderGallerySim(state, currentAccent, currentIsLight, currentSpectrum);
				state.canvas?.classList.add('loaded');
				// Apply default selection visual
				if (stateIndex === selectedGalleryIndex) {
					state.canvas?.classList.add('selected');
				}
			}, revealOrder * 60 + 10); // Quick start, 60ms between each
		});
		
		// Start simulation loop immediately - canvases animate as soon as they're revealed
		// Read fresh color values each frame so changes are reflected immediately
		galleryInterval = window.setInterval(() => {
			const currentAccent = getAccentColor();
			const currentIsLight = getIsLightTheme();
			const currentSpectrum = getSpectrumMode();
			gallerySimStates.forEach(state => {
				// Only animate canvases that have been revealed
				if (state.canvas?.classList.contains('loaded')) {
					stepGallerySim(state);
					renderGallerySim(state, currentAccent, currentIsLight, currentSpectrum);
				}
			});
		}, 33);
		
		// Set up click handlers for selection
		gallerySimStates.forEach((state, i) => {
			if (state.canvas) {
				state.canvas.onclick = () => selectGalleryRule(i);
			}
		});
		};

		// Prefer WebGPU multi-canvas gallery when available.
		if (isWebGPUSupported()) {
			void (async () => {
				const ok = await startGalleryWebGPU(accentColor, initialIsLight);
				if (ok) return;
				startCpuGallery();
			})();
			return;
		}

		startCpuGallery();
	});
}

function stopGallery(): void {
	if (galleryInterval !== null) {
		clearInterval(galleryInterval);
		galleryInterval = null;
	}
	if (galleryGpuRaf !== null) {
		cancelAnimationFrame(galleryGpuRaf);
		galleryGpuRaf = null;
	}
	galleryGpuSims.forEach((s) => s.sim.destroy());
	galleryGpuSims = [];
	galleryGpuDevice = null;
	gallerySimStates = [];
}

function selectGalleryRule(index: number): void {
	selectedGalleryIndex = index;
	userActivelySelectedRule = true; // User clicked to select
	// Update visual selection
	gallerySimStates.forEach((state, i) => {
		if (state.canvas) {
			state.canvas.classList.toggle('selected', i === index);
		}
	});
	galleryGpuSims.forEach((state) => {
		state.canvas.classList.toggle('selected', state.ruleIndex === index);
	});
}

// Get the selected rule name (for applying to main canvas)
export function getSelectedGalleryRule(): string | null {
	if (selectedGalleryIndex !== null && selectedGalleryIndex < GALLERY_RULES.length) {
		return GALLERY_RULES[selectedGalleryIndex].name;
	}
	return null;
}

// Wrapper functions for backward compatibility
function startMiniSim(accentColor: string, isLight: boolean): void {
	startGallery(accentColor, isLight);
}

function stopMiniSim(): void {
	stopGallery();
}

export function hasTourBeenCompleted(): boolean {
	// Always show tour on page load - users may need a refresher
	return false;
}

export function markTourCompleted(): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
	notifyTourCompleted();
}

export function resetTourStatus(): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.removeItem(TOUR_COMPLETED_KEY);
}

// Get CSS color from CSS variable
function getCSSVariable(name: string): string {
	if (typeof document === 'undefined') return '#2dd4bf';
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#2dd4bf';
}

// Detect if on mobile
function isMobile(): boolean {
	if (typeof window === 'undefined') return false;
	return window.innerWidth <= 768 || ('ontouchstart' in window);
}

// SVG Icons matching the app's iconography
const icons = {
	// Classic pixelated heart - outline + animated filled interior (matches HeartIcon.svelte)
	heart: `<svg viewBox="0 0 16 16" class="tour-icon tour-icon-heart">
		<style>
			.heart-layer-1 { animation: heart-wave 1.8s ease-in-out infinite 0s; }
			.heart-layer-2 { animation: heart-wave 1.8s ease-in-out infinite 0.15s; }
			.heart-layer-3 { animation: heart-wave 1.8s ease-in-out infinite 0.3s; }
			.heart-layer-4 { animation: heart-wave 1.8s ease-in-out infinite 0.45s; }
			@keyframes heart-wave {
				0%, 100% { opacity: 0.2; }
				40%, 60% { opacity: 0.55; }
			}
		</style>
		<!-- Outline -->
		<rect class="heart-bright" x="3" y="2" width="3" height="1"/>
		<rect class="heart-bright" x="10" y="2" width="3" height="1"/>
		<rect class="heart-bright" x="2" y="3" width="1" height="1"/>
		<rect class="heart-bright" x="6" y="3" width="1" height="1"/>
		<rect class="heart-bright" x="9" y="3" width="1" height="1"/>
		<rect class="heart-bright" x="13" y="3" width="1" height="1"/>
		<rect class="heart-bright" x="2" y="4" width="1" height="1"/>
		<rect class="heart-bright" x="7" y="4" width="2" height="1"/>
		<rect class="heart-bright" x="13" y="4" width="1" height="1"/>
		<rect class="heart-bright" x="2" y="5" width="1" height="2"/>
		<rect class="heart-bright" x="13" y="5" width="1" height="2"/>
		<rect class="heart-bright" x="3" y="7" width="1" height="1"/>
		<rect class="heart-bright" x="12" y="7" width="1" height="1"/>
		<rect class="heart-bright" x="4" y="8" width="1" height="1"/>
		<rect class="heart-bright" x="11" y="8" width="1" height="1"/>
		<rect class="heart-bright" x="5" y="9" width="1" height="1"/>
		<rect class="heart-bright" x="10" y="9" width="1" height="1"/>
		<rect class="heart-bright" x="6" y="10" width="1" height="1"/>
		<rect class="heart-bright" x="9" y="10" width="1" height="1"/>
		<rect class="heart-bright" x="7" y="11" width="2" height="1"/>
		<!-- Inner fill with animation layers -->
		<rect class="heart-dim heart-layer-1" x="3" y="3" width="3" height="1"/>
		<rect class="heart-dim heart-layer-1" x="10" y="3" width="3" height="1"/>
		<rect class="heart-dim heart-layer-1" x="3" y="4" width="4" height="1"/>
		<rect class="heart-dim heart-layer-1" x="9" y="4" width="4" height="1"/>
		<rect class="heart-dim heart-layer-2" x="3" y="5" width="10" height="1"/>
		<rect class="heart-dim heart-layer-2" x="3" y="6" width="10" height="1"/>
		<rect class="heart-dim heart-layer-3" x="4" y="7" width="8" height="1"/>
		<rect class="heart-dim heart-layer-3" x="5" y="8" width="6" height="1"/>
		<rect class="heart-dim heart-layer-4" x="6" y="9" width="4" height="1"/>
		<rect class="heart-dim heart-layer-4" x="7" y="10" width="2" height="1"/>
	</svg>`,
	// Play icon
	play: `<svg viewBox="0 0 24 24" fill="currentColor" class="tour-icon">
		<path d="M8 5.14v14l11-7-11-7z"/>
	</svg>`,
	// Pause icon
	pause: `<svg viewBox="0 0 24 24" fill="currentColor" class="tour-icon">
		<rect x="6" y="4" width="4" height="16" rx="1"/>
		<rect x="14" y="4" width="4" height="16" rx="1"/>
	</svg>`,
	// Step icon
	step: `<svg viewBox="0 0 24 24" fill="currentColor" class="tour-icon">
		<path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2V6z"/>
	</svg>`,
	// Lightning/speed icon
	lightning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tour-icon">
		<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
	</svg>`,
	// Brush icon
	brush: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<path d="M18.37 2.63L14 7l-1.59-1.59a2 2 0 00-2.82 0L8 7l9 9 1.59-1.59a2 2 0 000-2.82L17 10l4.37-4.37a2.12 2.12 0 10-3-3z"/>
		<path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-10"/>
	</svg>`,
	// Initialize/dice icon
	seed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<rect x="4" y="4" width="16" height="16" rx="2"/>
		<circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>
		<circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none"/>
		<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
		<circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none"/>
		<circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none"/>
	</svg>`,
	// Rules/function icon (bold italic f)
	rules: `<svg viewBox="0 0 24 24" fill="currentColor" class="tour-icon">
		<path d="M16.5 3C14 3 12.5 4.5 11.8 7L10.5 11H7.5C7 11 6.5 11.4 6.5 12s.5 1 1 1h2.3l-1.6 5.5C7.7 20 6.8 21 5.5 21c-.5 0-.9-.1-1.2-.3-.4-.2-.9-.1-1.1.3-.2.4-.1.9.3 1.1.6.3 1.3.5 2 .5 2.5 0 4-1.5 4.8-4.2L12 13h3.5c.5 0 1-.4 1-1s-.5-1-1-1h-2.8l1.1-3.5C14.3 5.8 15.2 5 16.5 5c.4 0 .8.1 1.1.2.4.2.9 0 1.1-.4.2-.4 0-.9-.4-1.1-.6-.4-1.4-.7-2.3-.7z"/>
	</svg>`,
	// Theme/droplet icon
	theme: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
	</svg>`,
	// Help icon
	help: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<circle cx="12" cy="12" r="10"/>
		<path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
		<circle cx="12" cy="17" r="0.5" fill="currentColor"/>
	</svg>`,
	// Canvas/grid icon
	canvas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<rect x="3" y="3" width="18" height="18" rx="2"/>
		<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
	</svg>`,
	// Checkmark/done icon
	check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<path d="M20 6L9 17l-5-5"/>
	</svg>`,
	// Trash/clear icon
	trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
	</svg>`,
	// Timeline/branches icon (branching)
	timeline: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon" stroke-linecap="round" stroke-linejoin="round">
		<circle cx="6" cy="6" r="2"/>
		<circle cx="18" cy="10" r="2"/>
		<circle cx="12" cy="18" r="2"/>
		<path d="M6 8v2a4 4 0 004 4h2"/>
		<path d="M16 10h-2a4 4 0 00-4 4v2"/>
	</svg>`,
	// Undo icon (matching toolbar)
	undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon" stroke-linecap="round" stroke-linejoin="round">
		<path d="M9 9l-4 4 4 4"/>
		<path d="M5 13h7a4 4 0 1 0-1.17-7.8"/>
	</svg>`,
	// Redo icon (matching toolbar)
	redo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon" stroke-linecap="round" stroke-linejoin="round">
		<path d="M15 9l4 4-4 4"/>
		<path d="M19 13h-7a4 4 0 1 1 1.17-7.8"/>
	</svg>`,
	// Video camera/record icon
	record: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<rect x="2" y="6" width="14" height="12" rx="2"/>
		<path d="M22 8l-6 4 6 4V8z" fill="currentColor"/>
	</svg>`,
	// Fit to screen icon
	fit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<path d="M4 14v4a2 2 0 002 2h4"/>
		<path d="M20 14v4a2 2 0 01-2 2h-4"/>
		<path d="M4 10V6a2 2 0 012-2h4"/>
		<path d="M20 10V6a2 2 0 00-2-2h-4"/>
	</svg>`,
	// Pan/move icon
	pan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<path d="M12 2v20M2 12h20"/>
		<path d="M12 2l-3 3M12 2l3 3"/>
		<path d="M12 22l-3-3M12 22l3-3"/>
		<path d="M2 12l3-3M2 12l3 3"/>
		<path d="M22 12l-3-3M22 12l-3 3"/>
	</svg>`,
	// Camera/view icon
	camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon" stroke-linecap="round" stroke-linejoin="round">
		<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
		<circle cx="12" cy="13" r="4"/>
	</svg>`
};

// Create inline icon for tour descriptions (smaller, inline)
function inlineIcon(iconSvg: string, label: string): string {
	const smallIcon = iconSvg.replace('class="tour-icon"', 'class="tour-icon-inline"');
	return `<span class="tour-inline-item">${smallIcon}<span>${label}</span></span>`;
}

// Helper to create title with icon
function titleWithIcon(icon: string, text: string): string {
	return `<span class="tour-title-wrapper">${icon}<span>${text}</span></span>`;
}

// Create welcome content with 3x3 gallery of simulations
function getWelcomeContent(): string {
	const canvasSize = MINI_SIM_SIZE * MINI_SIM_CELL_SIZE;
	
	// Generate 9 canvases in a 3x3 grid
	const canvasesHtml = GALLERY_RULES.map((rule, i) => `
		<div class="gallery-item" data-index="${i}">
			<canvas id="tour-gallery-${i}" width="${canvasSize}" height="${canvasSize}" class="gallery-canvas"></canvas>
			<span class="gallery-label">${rule.name}</span>
		</div>
	`).join('');
	
	return `
		<div class="tour-welcome-content">
			<div class="tour-gallery">
				${canvasesHtml}
			</div>
			<p class="gallery-hint">Click a pattern to start with it, or continue the tour.</p>
		</div>
	`;
}

// Create description with icon list for groups
function createGroupDescription(items: Array<{ icon: string; label: string; shortcut?: string }>, intro?: string, mobile?: boolean): string {
	const itemsHtml = items.map(item => {
		const shortcutText = !mobile && item.shortcut ? ` (${item.shortcut})` : '';
		return inlineIcon(item.icon, `${item.label}${shortcutText}`);
	}).join('');
	
	const introHtml = intro ? `<p class="tour-group-intro">${intro}</p>` : '';
	return `${introHtml}<div class="tour-icon-list">${itemsHtml}</div>`;
}

// Tour step definitions - now grouped by function
function getTourSteps(): DriveStep[] {
	const mobile = isMobile();
	const popoverSide = mobile ? 'left' : 'bottom';
	
	const steps: DriveStep[] = [
		// 1. Welcome step (no element)
		{
			popover: {
				title: titleWithIcon(icons.heart, 'Welcome to Games of Life'),
				description: getWelcomeContent(),
				side: 'over',
				align: 'center'
			}
		},
		// 2. Canvas interaction - no rounded corners for full canvas highlight
		{
			element: 'canvas',
			popover: {
				title: titleWithIcon(icons.canvas, 'The Canvas'),
				description: mobile 
					? 'This is where cells live and evolve. Use the pan/brush toggle to switch between drawing and navigating. Pinch to zoom.'
					: 'This is where cells live and evolve. Click to draw, right-click to erase, scroll to zoom, and hold Space to pan.',
				side: 'over',
				align: 'center'
			},
			// Override stageRadius for canvas to have sharp corners
			onHighlightStarted: (element, step, { driver }) => {
				driver.setConfig({ ...driver.getConfig(), stageRadius: 0 });
			},
			onDeselected: (element, step, { driver }) => {
				driver.setConfig({ ...driver.getConfig(), stageRadius: 9999 });
			}
		},
		// 3. Playback group
		{
			element: '#tour-playback-group',
			popover: {
				title: titleWithIcon(icons.play, 'Playback Controls'),
				description: createGroupDescription([
					{ icon: icons.play, label: 'Play/Pause', shortcut: 'Enter' },
					{ icon: icons.step, label: 'Step forward', shortcut: 'S' },
					{ icon: icons.lightning, label: 'Adjust speed', shortcut: '< >' }
				], 'Control the simulation timing.', mobile),
				side: popoverSide,
				align: 'center'
			}
		},
		// 4. Editing group
		{
			element: '#tour-editing-group',
			popover: {
				title: titleWithIcon(icons.rules, 'Editing Tools'),
				description: createGroupDescription([
					{ icon: icons.rules, label: 'Edit rules', shortcut: 'E' },
					{ icon: icons.seed, label: 'Initialize grid', shortcut: 'I' },
					{ icon: icons.brush, label: 'Brush tool', shortcut: '[ ]' },
					{ icon: icons.trash, label: 'Clear grid', shortcut: 'D' }
				], 'Modify rules, patterns, and draw cells.', mobile),
				side: popoverSide,
				align: 'center'
			}
		},
		// 5. History group
		{
			element: '#tour-history-group',
			popover: {
				title: titleWithIcon(icons.timeline, 'History & Branches'),
				description: createGroupDescription([
					{ icon: icons.undo, label: 'Undo strokes' },
					{ icon: icons.timeline, label: 'Timeline & branches' },
					{ icon: icons.redo, label: 'Redo / branch from past' }
				], 'Manage stroke history and branching states.', mobile),
				side: popoverSide,
				align: 'center'
			}
		},
		// 6. Camera group
		{
			element: '#tour-camera-group',
			popover: {
				title: titleWithIcon(icons.camera, 'View Controls'),
				description: createGroupDescription([
					{ icon: icons.pan, label: 'Pan/Brush toggle', shortcut: 'B' },
					{ icon: icons.fit, label: 'Fit to screen', shortcut: 'F' },
					{ icon: icons.record, label: 'Record video' }
				], 'Navigate and capture the view.', mobile),
				side: popoverSide,
				align: 'center'
			}
		},
		// 7. Info group
		{
			element: '#tour-info-group',
			popover: {
				title: titleWithIcon(icons.theme, 'Theme & Help'),
				description: createGroupDescription([
					{ icon: icons.help, label: 'Help & shortcuts', shortcut: '?' },
					{ icon: icons.theme, label: 'Theme & colors', shortcut: 'T for theme' },
					{ icon: icons.heart, label: 'About' }
				], 'Customize appearance and get help.', mobile),
				side: popoverSide,
				align: 'center'
			}
		},
		// 8. Final step
		{
			popover: {
				title: titleWithIcon(icons.check, 'Ready to Explore!'),
				description: mobile
					? 'You\'re all set! Use the pan tool to navigate and brush tool to draw. Try different rules for amazing patterns!'
					: `<div class="tour-shortcuts">
						<div class="tour-shortcut-row"><kbd>Enter</kbd> <span>Play/Pause</span> <kbd>Space</kbd> <span>Hold to pan</span></div>
						<div class="tour-shortcut-row"><kbd>B</kbd> <span>Toggle brush/pan</span> <kbd>C</kbd> <span>Cycle colors</span></div>
						<div class="tour-shortcut-row"><kbd>T</kbd> <span>Toggle theme</span> <kbd>R</kbd> <span>Reinitialize</span></div>
						<div class="tour-shortcut-row"><kbd>E</kbd> <span>Edit rules</span> <kbd>?</kbd> <span>All shortcuts</span></div>
					</div>`,
				side: 'over',
				align: 'center'
			}
		}
	];
	
	return steps;
}

// Create and configure the driver instance
export function createTour(options?: { 
	onComplete?: () => void;
	onSkip?: () => void;
	onLeaveFirstStep?: () => void; // Called when user leaves the first step (via Next or Close)
	accentColor?: string;
	isLightTheme?: boolean;
	// Getter functions for live updates during the tour
	getAccentColor?: () => string;
	getIsLightTheme?: () => boolean;
	getSpectrumMode?: () => string;
}): ReturnType<typeof driver> {
	const accentColor = options?.accentColor || getCSSVariable('--ui-accent');
	const isLight = options?.isLightTheme ?? false;
	
	// Track if we've left the first step (to avoid calling callback multiple times)
	let hasLeftFirstStep = false;
	
	// Set up getter functions for live color updates in the gallery
	if (options?.getAccentColor) {
		getAccentColor = options.getAccentColor;
	} else {
		getAccentColor = () => getCSSVariable('--ui-accent');
	}
	if (options?.getIsLightTheme) {
		getIsLightTheme = options.getIsLightTheme;
	} else {
		getIsLightTheme = () => isLight;
	}
	if (options?.getSpectrumMode) {
		getSpectrumMode = () => getSpectrumIndexFromId(options.getSpectrumMode!());
	} else {
		getSpectrumMode = () => 1; // Default to rainbow
	}
	
	// Create driver instance first so we can reference it in callbacks
	// eslint-disable-next-line prefer-const
	let driverObj: ReturnType<typeof driver>;
	
	const config: Config = {
		showProgress: true,
		animate: true,
		smoothScroll: true,
		allowClose: true,
		stagePadding: 0,
		stageRadius: 9999,
		popoverClass: `gol-tour-popover ${isLight ? 'light-theme' : 'dark-theme'}`,
		overlayColor: isLight ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.7)',
		steps: getTourSteps(),
		nextBtnText: 'Next',
		prevBtnText: 'Back',
		doneBtnText: 'Done',
		onPopoverRender: (popover, opts) => {
			// Start mini sim on welcome step (step 0)
			if (opts.state.activeIndex === 0) {
				startMiniSim(accentColor, isLight);
			} else {
				stopMiniSim();
			}
		},
		onNextClick: (element, step, opts) => {
			// Notify when leaving the first step
			if (opts.state.activeIndex === 0 && !hasLeftFirstStep) {
				hasLeftFirstStep = true;
				options?.onLeaveFirstStep?.();
			}
			// Check if this is the last step - user clicked "Done"
			const steps = opts.config.steps || [];
			if (opts.state.activeIndex === steps.length - 1) {
				tourCompletedProperly = true;
			}
			// Continue to next step (or finish)
			driverObj.moveNext();
		},
		onDestroyed: () => {
			tourActive = false;
			stopMiniSim();
			markTourCompleted();
			// Notify if leaving from first step via close
			if (!hasLeftFirstStep) {
				hasLeftFirstStep = true;
				options?.onLeaveFirstStep?.();
			}
			// Apply selected rule if user actively clicked one OR completed the tour
			if (tourCompletedProperly || userActivelySelectedRule) {
				options?.onComplete?.();
			} else {
				options?.onSkip?.();
			}
		},
		onCloseClick: () => {
			// Close the tour when X is clicked
			tourActive = false;
			stopMiniSim();
			markTourCompleted();
			driverObj.destroy();
		}
	};
	
	driverObj = driver(config);
	return driverObj;
}

// Start the tour
export function startTour(options?: Parameters<typeof createTour>[0]): void {
	tourActive = true;
	tourCompletedProperly = false; // Reset - only set true when user clicks Done on last step
	const driverObj = createTour(options);
	driverObj.drive();
}

// Generate CSS for the tour (to be injected)
export function getTourStyles(accentColor: string, isLightTheme: boolean): string {
	const bgColor = isLightTheme ? 'rgba(255, 255, 255, 0.95)' : 'rgba(16, 16, 24, 0.95)';
	const textColor = isLightTheme ? '#1a1a1a' : '#e0e0e0';
	const mutedColor = isLightTheme ? '#666' : '#999';
	const borderColor = isLightTheme ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';
	
	return `
		.driver-popover.gol-tour-popover {
			background: ${bgColor} !important;
			backdrop-filter: blur(12px) !important;
			border: 1px solid ${borderColor} !important;
			border-radius: 12px !important;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
			max-width: 380px !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-title {
			color: ${textColor} !important;
			font-size: 1rem !important;
			font-weight: 600 !important;
			margin-bottom: 0.5rem !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-description {
			color: ${mutedColor} !important;
			font-size: 0.85rem !important;
			line-height: 1.5 !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-progress-text {
			color: ${mutedColor} !important;
			font-size: 0.7rem !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-navigation-btns {
			gap: 0.5rem !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-prev-btn,
		.driver-popover.gol-tour-popover .driver-popover-next-btn {
			background: transparent !important;
			color: ${mutedColor} !important;
			border: 1px solid ${borderColor} !important;
			border-radius: 6px !important;
			padding: 0.5rem 1rem !important;
			font-size: 0.8rem !important;
			font-weight: 500 !important;
			cursor: pointer !important;
			transition: all 0.15s !important;
			box-shadow: none !important;
			text-shadow: none !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-prev-btn:hover,
		.driver-popover.gol-tour-popover .driver-popover-next-btn:hover {
			color: ${textColor} !important;
			border-color: ${accentColor} !important;
			box-shadow: none !important;
		}
		
		/* Next/Done button - outlined accent style */
		.driver-popover.gol-tour-popover .driver-popover-next-btn {
			background: ${isLightTheme ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.03)'} !important;
			color: ${accentColor} !important;
			border: 1px solid ${accentColor}40 !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-next-btn:hover {
			background: ${accentColor}15 !important;
			border-color: ${accentColor} !important;
		}
		
		.driver-popover.gol-tour-popover button {
			box-shadow: none !important;
			text-shadow: none !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-close-btn {
			color: ${mutedColor} !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-close-btn:hover {
			color: ${textColor} !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-arrow-side-left {
			border-left-color: ${bgColor} !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-arrow-side-right {
			border-right-color: ${bgColor} !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-arrow-side-top {
			border-top-color: ${bgColor} !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-arrow-side-bottom {
			border-bottom-color: ${bgColor} !important;
		}
		
		/* Tour icon styling */
		.tour-title-wrapper {
			display: flex !important;
			align-items: center !important;
			gap: 0.5rem !important;
		}
		
		.tour-icon {
			width: 20px !important;
			height: 20px !important;
			flex-shrink: 0 !important;
			color: ${accentColor} !important;
		}
		
		.tour-icon-heart {
			width: 22px !important;
			height: 22px !important;
		}
		
		.tour-icon-heart .heart-bright {
			fill: ${accentColor} !important;
		}
		
		.tour-icon-heart .heart-dim {
			fill: ${accentColor} !important;
		}
		
		/* Inline icons for group descriptions */
		.tour-icon-inline {
			width: 16px !important;
			height: 16px !important;
			flex-shrink: 0 !important;
			color: ${accentColor} !important;
		}
		
		.tour-group-intro {
			margin: 0 0 0.6rem 0 !important;
			color: ${mutedColor} !important;
			font-size: 0.85rem !important;
			line-height: 1.4 !important;
		}
		
		.tour-icon-list {
			display: flex !important;
			flex-direction: column !important;
			gap: 0.4rem !important;
		}
		
		.tour-inline-item {
			display: flex !important;
			align-items: center !important;
			gap: 0.5rem !important;
			color: ${textColor} !important;
			font-size: 0.8rem !important;
		}
		
		.tour-inline-item span {
			color: ${mutedColor} !important;
		}
		
		/* Welcome gallery */
		.tour-welcome-content {
			display: flex !important;
			flex-direction: column !important;
			align-items: center !important;
			gap: 0.6rem !important;
		}
		
		.tour-welcome-content {
			width: 100% !important;
			box-sizing: border-box !important;
		}
		
		.tour-gallery {
			display: grid !important;
			grid-template-columns: repeat(3, 1fr) !important;
			gap: 8px !important;
			width: 100% !important;
			box-sizing: border-box !important;
		}
		
		.gallery-item {
			display: flex !important;
			flex-direction: column !important;
			align-items: center !important;
			gap: 3px !important;
			cursor: pointer !important;
			padding: 2px !important;
			min-width: 0 !important; /* Allow shrinking */
		}
		
		.gallery-item:hover .gallery-canvas {
			opacity: 0.9 !important;
		}
		
		.gallery-canvas {
			width: 100% !important;
			height: auto !important;
			aspect-ratio: 1 / 1 !important;
			max-width: 112px !important; /* Original size cap */
			border-radius: 4px !important;
			image-rendering: pixelated !important;
			image-rendering: crisp-edges !important;
			border: 1px solid rgba(128, 128, 128, 0.25) !important;
			transition: border-color 0.15s ease, border-width 0.15s ease, opacity 0.15s ease !important;
			opacity: 0 !important;
			transform: scale(0.5) !important;
			box-sizing: border-box !important;
		}
		
		.gallery-canvas.loaded {
			opacity: 1 !important;
			transform: scale(1) !important;
			animation: gallery-bubble-up 0.4s cubic-bezier(0.34, 1.2, 0.64, 1) !important;
		}
		
		@keyframes gallery-bubble-up {
			from {
				opacity: 0;
				transform: scale(0.5);
			}
			to {
				opacity: 1;
				transform: scale(1);
			}
		}
		
		.gallery-canvas.selected {
			border: 2px solid ${accentColor} !important;
		}
		
		.gallery-label {
			font-size: 0.6rem !important;
			color: ${mutedColor} !important;
			text-align: center !important;
			max-width: 100% !important;
			overflow: hidden !important;
			text-overflow: ellipsis !important;
			white-space: nowrap !important;
		}
		
		.gallery-hint {
			margin: 0 !important;
			text-align: center !important;
			color: ${mutedColor} !important;
			font-size: 0.75rem !important;
			line-height: 1.4 !important;
			opacity: 0.8 !important;
		}
		
		/* Final tour shortcuts */
		.tour-shortcuts {
			display: flex !important;
			flex-direction: column !important;
			gap: 0.4rem !important;
			margin-top: 0.3rem !important;
		}
		
		.tour-shortcut-row {
			display: flex !important;
			align-items: center !important;
			gap: 0.35rem !important;
			flex-wrap: wrap !important;
			font-size: 0.75rem !important;
		}
		
		.tour-shortcuts kbd {
			display: inline-block !important;
			padding: 0.15rem 0.35rem !important;
			background: ${isLightTheme ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.1)'} !important;
			border: 1px solid ${borderColor} !important;
			border-radius: 3px !important;
			font-family: 'SF Mono', Monaco, Consolas, monospace !important;
			font-size: 0.65rem !important;
			color: ${textColor} !important;
			min-width: 1.1rem !important;
			text-align: center !important;
		}
		
		.tour-shortcuts span {
			color: ${mutedColor} !important;
			font-size: 0.7rem !important;
			margin-right: 0.5rem !important;
		}
		
		/* Mobile adjustments */
		@media (max-width: 768px) {
			.driver-popover.gol-tour-popover {
				max-width: calc(100vw - 32px) !important;
				/* Don't set margin - let driver.js handle centering */
			}
			
			.driver-popover.gol-tour-popover .driver-popover-title {
				font-size: 0.95rem !important;
			}
			
			.driver-popover.gol-tour-popover .driver-popover-description {
				font-size: 0.8rem !important;
			}
			
			.tour-gallery {
				gap: 6px !important;
			}
			
			.gallery-canvas {
				max-width: none !important; /* Remove cap on mobile - let grid control size */
			}
			
			.gallery-label {
				font-size: 0.5rem !important;
			}
			
			.gallery-hint {
				font-size: 0.7rem !important;
			}
			
			.tour-icon {
				width: 18px !important;
				height: 18px !important;
			}
			
			.tour-icon-heart {
				width: 20px !important;
				height: 20px !important;
			}
			
			.tour-icon-inline {
				width: 14px !important;
				height: 14px !important;
			}
			
			.tour-inline-item {
				font-size: 0.75rem !important;
			}
			
			.tour-group-intro {
				font-size: 0.8rem !important;
			}
		}
		
		/* Extra small phones */
		@media (max-width: 380px) {
			.driver-popover.gol-tour-popover {
				max-width: calc(100vw - 24px) !important;
				/* Don't set margin - let driver.js handle centering */
			}
			
			.tour-gallery {
				gap: 4px !important;
			}
			
			.gallery-label {
				font-size: 0.45rem !important;
			}
		}
	`;
}

