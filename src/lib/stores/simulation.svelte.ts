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

// Last initialization settings
let lastInitPattern = $state('random-medium');
let lastInitCategory = $state('random');
let lastInitTiling = $state(true);
let lastInitSpacing = $state(50); // Actual cell spacing on main grid

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

