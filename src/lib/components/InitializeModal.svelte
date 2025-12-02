<script lang="ts">
	import { getSimulationState, SEED_PATTERNS, SEED_PATTERNS_HEX, GRID_SCALES, type SeedPatternId, type GridScale } from '../stores/simulation.svelte.js';
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		onclose: () => void;
		oninitialize: (type: string, options?: { density?: number; tiled?: boolean; spacing?: number }) => void;
		onscalechange: (scale: GridScale) => void;
	}

	let { onclose, oninitialize, onscalechange }: Props = $props();

	const simState = getSimulationState();
	
	// Grid scale
	const currentDimensions = $derived(`${simState.gridWidth}×${simState.gridHeight}`);
	
	function changeScale(scale: GridScale) {
		if (scale === simState.gridScale) return;
		
		// Pause if playing
		if (simState.isPlaying) {
			simState.pause();
		}
		
		// Apply immediately
		onscalechange(scale);
	}
	
	// Seed pattern dropdown state
	let seedPatternDropdownOpen = $state(false);
	
	// Select appropriate seed patterns based on grid type
	const neighborhood = $derived(simState.currentRule.neighborhood ?? 'moore');
	const isHexGrid = $derived(neighborhood === 'hexagonal' || neighborhood === 'extendedHexagonal');
	const currentSeedPatterns = $derived(isHexGrid ? SEED_PATTERNS_HEX : SEED_PATTERNS);

	const PREVIEW_SIZE_X = 40;
	// For hexagonal grids, rows are visually compressed by sqrt(3)/2
	// So we need more rows to fill the same visual space
	const HEX_HEIGHT_RATIO = 0.866025404; // sqrt(3)/2
	const PREVIEW_SIZE_Y_SQUARE = 40;
	const PREVIEW_SIZE_Y_HEX = Math.round(40 / HEX_HEIGHT_RATIO); // ~46 rows for hex
	
	// Derived preview height based on current rule's neighborhood
	const previewSizeY = $derived(
		isHexGrid 
			? PREVIEW_SIZE_Y_HEX 
			: PREVIEW_SIZE_Y_SQUARE
	);
	
	let previewCanvas: HTMLCanvasElement;
	let previewCtx: CanvasRenderingContext2D | null = null;
	let previewGrid: number[] = [];
	let previewPlaying = $state(false);
	let previewAnimationId: number | null = null;
	let lastPreviewStep = 0;

	// Tiling options - spacing is actual cell distance on main grid
	let tilingEnabled = $state(simState.lastInitTiling);
	let tilingSpacing = $state(simState.lastInitSpacing); // 30-200 cells apart on main grid

	// Seeding rate as percentage (1-100) for UI, maps to 0.01-1.0 for simState
	let seedingRatePercent = $state(Math.round(simState.seedingRate * 100));
	
	// Sync seeding rate to simState when slider changes
	$effect(() => {
		simState.seedingRate = seedingRatePercent / 100;
	});
	
	// Reset seed pattern to first of current type when switching between hex/square grids
	let lastIsHex: boolean | null = null;
	$effect(() => {
		const currentIsHex = isHexGrid;
		if (lastIsHex !== null && lastIsHex !== currentIsHex) {
			// Grid type changed, reset to first pattern of new type
			simState.seedPattern = currentIsHex ? SEED_PATTERNS_HEX[0].id : SEED_PATTERNS[0].id;
		}
		lastIsHex = currentIsHex;
	});

	// Get rule's recommended density (or default)
	const ruleDensity = $derived(simState.currentRule.density ?? 0.25);
	const hasRuleDensity = $derived(simState.currentRule.density !== undefined);

	// Universal patterns - available for all rules (results may vary)
	const UNIVERSAL_PATTERNS = {
		random: [
			{ id: 'blank', name: 'Blank', density: 0, desc: 'Empty grid - draw your own' },
			{ id: 'random-sparse', name: 'Sparse', density: 0.15, desc: 'Low density random' },
			{ id: 'random-medium', name: 'Medium', density: 0.3, desc: 'Balanced random' },
			{ id: 'random-dense', name: 'Dense', density: 0.5, desc: 'High density random' }
		],
		structures: [
			{ id: 'glider', name: 'Glider', desc: 'Classic diagonal spaceship', origin: "Conway's Life" },
			{ id: 'lwss', name: 'LWSS', desc: 'Lightweight spaceship', origin: "Conway's Life" },
			{ id: 'glider-gun', name: 'Glider Gun', desc: 'Gosper glider gun', origin: "Conway's Life" },
			{ id: 'r-pentomino', name: 'R-Pentomino', desc: 'Long-lived methuselah', origin: "Conway's Life" },
			{ id: 'acorn', name: 'Acorn', desc: 'Grows for 5206 gens in Life', origin: "Conway's Life" },
			{ id: 'diehard', name: 'Diehard', desc: 'Vanishes after 130 gens in Life', origin: "Conway's Life" },
			{ id: 'replicator', name: 'Replicator', desc: 'Self-replicating pattern', origin: 'HighLife' },
			{ id: 'dn-glider', name: 'D&N Glider', desc: 'Diagonal spaceship', origin: 'Day & Night' },
			{ id: 'bb-glider', name: 'BB Glider', desc: 'Orthogonal spaceship', origin: "Brian's Brain" }
		],
		oscillators: [
			{ id: 'blinker', name: 'Blinker', desc: 'Period 2 in Life', origin: "Conway's Life" },
			{ id: 'toad', name: 'Toad', desc: 'Period 2 in Life', origin: "Conway's Life" },
			{ id: 'beacon', name: 'Beacon', desc: 'Period 2 in Life', origin: "Conway's Life" },
			{ id: 'pulsar', name: 'Pulsar', desc: 'Period 3, symmetric', origin: "Conway's Life" },
			{ id: 'pentadecathlon', name: 'Pentadecathlon', desc: 'Period 15 in Life', origin: "Conway's Life" },
			{ id: 'dn-blinker', name: 'D&N Blinker', desc: 'Period 2', origin: 'Day & Night' }
		],
		still: [
			{ id: 'block', name: 'Block', desc: '2x2 still life', origin: "Conway's Life" },
			{ id: 'beehive', name: 'Beehive', desc: '6-cell still life', origin: "Conway's Life" },
			{ id: 'loaf', name: 'Loaf', desc: '7-cell still life', origin: "Conway's Life" },
			{ id: 'boat', name: 'Boat', desc: '5-cell still life', origin: "Conway's Life" },
			{ id: 'dn-ship', name: 'D&N Ship', desc: '6-cell still life', origin: 'Day & Night' }
		]
	};

	// Check if current rule is the pattern's origin rule
	function isNativePattern(patternOrigin: string | undefined): boolean {
		if (!patternOrigin) return true;
		return simState.currentRule.name === patternOrigin;
	}

	// Pattern cell definitions (relative to center)
	const PATTERN_CELLS: Record<string, [number, number][]> = {
		// Conway's Life patterns
		'glider': [[0, -1], [1, 0], [-1, 1], [0, 1], [1, 1]],
		'lwss': [[-2, -1], [-2, 1], [-1, -2], [0, -2], [1, -2], [2, -2], [2, -1], [2, 0], [1, 1]],
		'r-pentomino': [[0, -1], [1, -1], [-1, 0], [0, 0], [0, 1]],
		'acorn': [[-3, 0], [-2, 0], [-2, -2], [0, -1], [1, 0], [2, 0], [3, 0]],
		'diehard': [[-3, 0], [-2, 0], [-2, 1], [2, 1], [3, -1], [3, 1], [4, 1]],
		'blinker': [[-1, 0], [0, 0], [1, 0]],
		'toad': [[-1, 0], [0, 0], [1, 0], [0, 1], [1, 1], [2, 1]],
		'beacon': [[-1, -1], [0, -1], [-1, 0], [1, 1], [2, 0], [2, 1]],
		'block': [[0, 0], [1, 0], [0, 1], [1, 1]],
		'beehive': [[-1, 0], [0, -1], [1, -1], [2, 0], [1, 1], [0, 1]],
		'loaf': [[0, -1], [1, -1], [-1, 0], [2, 0], [0, 1], [2, 1], [1, 2]],
		'boat': [[0, 0], [1, 0], [0, 1], [2, 1], [1, 2]],
		'pulsar': [
			[-6, -4], [-6, -3], [-6, -2], [-4, -6], [-3, -6], [-2, -6],
			[-6, 2], [-6, 3], [-6, 4], [-4, 6], [-3, 6], [-2, 6],
			[6, -4], [6, -3], [6, -2], [4, -6], [3, -6], [2, -6],
			[6, 2], [6, 3], [6, 4], [4, 6], [3, 6], [2, 6],
			[-1, -4], [-1, -3], [-1, -2], [1, -4], [1, -3], [1, -2],
			[-1, 2], [-1, 3], [-1, 4], [1, 2], [1, 3], [1, 4],
			[-4, -1], [-3, -1], [-2, -1], [-4, 1], [-3, 1], [-2, 1],
			[4, -1], [3, -1], [2, -1], [4, 1], [3, 1], [2, 1]
		],
		'pentadecathlon': [
			[-4, 0], [-3, -1], [-3, 1], [-2, 0], [-1, 0], [0, 0], [1, 0],
			[2, 0], [3, -1], [3, 1], [4, 0]
		],
		'glider-gun': [
			[-18, 0], [-18, 1], [-17, 0], [-17, 1],
			[-8, 0], [-8, 1], [-8, 2], [-7, -1], [-7, 3], [-6, -2], [-6, 4],
			[-5, -2], [-5, 4], [-4, 1], [-3, -1], [-3, 3], [-2, 0], [-2, 1], [-2, 2],
			[-1, 1],
			[2, -2], [2, -1], [2, 0], [3, -2], [3, -1], [3, 0], [4, -3], [4, 1],
			[6, -4], [6, -3], [6, 1], [6, 2],
			[16, -2], [16, -1], [17, -2], [17, -1]
		],
		// HighLife patterns
		'replicator': [[0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]],
		// Day & Night patterns
		'dn-glider': [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [1, 2]],
		'dn-blinker': [[-1, 0], [0, 0], [1, 0]],
		'dn-ship': [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
		// Brian's Brain patterns
		'bb-glider': [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]]
	};

	// Use universal patterns for all rules
	const currentPatterns = UNIVERSAL_PATTERNS;

	const hasStructuredPatterns = true; // Always true now with universal patterns

	// Restore last selections
	let selectedCategory = $state(simState.lastInitCategory);
	let selectedPattern = $state(simState.lastInitPattern);
	let customDensity = $state(30);

	// Scale factor for preview (main grid vs preview grid)
	const previewScale = $derived(PREVIEW_SIZE_X / simState.gridWidth);

	// Calculate pattern bounding box size
	function getPatternSize(patternId: string): { width: number; height: number } {
		const cells = PATTERN_CELLS[patternId];
		if (!cells || cells.length === 0) return { width: 3, height: 3 };
		
		let minX = Infinity, maxX = -Infinity;
		let minY = Infinity, maxY = -Infinity;
		
		for (const [dx, dy] of cells) {
			minX = Math.min(minX, dx);
			maxX = Math.max(maxX, dx);
			minY = Math.min(minY, dy);
			maxY = Math.max(maxY, dy);
		}
		
		return {
			width: maxX - minX + 1,
			height: maxY - minY + 1
		};
	}

	// Minimum spacing is pattern size + some padding
	const minSpacing = $derived.by(() => {
		if (selectedPattern.startsWith('random')) return 10;
		const size = getPatternSize(selectedPattern);
		// Add padding (at least 2 cells between patterns)
		return Math.max(size.width, size.height) + 4;
	});

	// Check if current pattern supports tiling (not random, not glider-gun which is too big)
	const canTile = $derived(
		!selectedPattern.startsWith('random') && 
		selectedPattern !== 'glider-gun' &&
		selectedPattern !== 'pulsar' &&
		selectedPattern !== 'pentadecathlon'
	);

	onMount(() => {
		if (previewCanvas) {
			previewCtx = previewCanvas.getContext('2d');
			initPreviewGrid();
			renderPreview();
		}
	});

	onDestroy(() => {
		if (previewAnimationId) cancelAnimationFrame(previewAnimationId);
	});

	// Clamp spacing when pattern changes (minSpacing may have changed)
	$effect(() => {
		selectedPattern; // track
		if (tilingSpacing < minSpacing) {
			tilingSpacing = minSpacing;
		}
	});

	// Re-render preview when pattern or settings change
	$effect(() => {
		selectedPattern;
		customDensity;
		tilingEnabled;
		tilingSpacing;
		initPreviewGrid();
		renderPreview();
	});

	function initPreviewGrid() {
		const sizeX = PREVIEW_SIZE_X;
		const sizeY = previewSizeY;
		const numStates = simState.currentRule.numStates;
		previewGrid = new Array(sizeX * sizeY).fill(0);
		
		if (selectedPattern.startsWith('random')) {
			let density: number;
			if (selectedPattern === 'random-optimal') {
				density = ruleDensity;
			} else if (selectedPattern === 'random-custom') {
				density = customDensity / 100;
			} else {
				density = currentPatterns.random.find(p => p.id === selectedPattern)?.density ?? 0.3;
			}
			
			let seed = 12345;
			const seededRandom = () => {
				seed = (seed * 1103515245 + 12345) & 0x7fffffff;
				return seed / 0x7fffffff;
			};

			for (let i = 0; i < previewGrid.length; i++) {
				if (seededRandom() < density) {
					if (numStates > 2) {
						// For multi-state rules, distribute across spectrum
						const rand = seededRandom();
						if (rand < 0.5) {
							// 50% chance of being fully alive
							previewGrid[i] = 1;
						} else {
							// 50% chance of being in a dying state
							const dyingStates = numStates - 2;
							const weightedRand = Math.pow(seededRandom(), 1.5);
							previewGrid[i] = 2 + Math.floor(weightedRand * dyingStates);
						}
					} else {
						previewGrid[i] = 1;
					}
				}
			}
		} else {
			const cells = PATTERN_CELLS[selectedPattern];
			if (!cells) return;

			const cx = Math.floor(sizeX / 2);
			const cy = Math.floor(sizeY / 2);

			if (canTile && tilingEnabled) {
				// Show tiling at 1:1 scale - the preview shows a sizeX x sizeY
				// section of the grid with the actual spacing
				// This gives an accurate representation of how the tiles will look
				const spacing = tilingSpacing;
				const startOffset = Math.floor(spacing / 2) % spacing;
				
				// Place tiles at the actual spacing intervals
				for (let ty = startOffset; ty < sizeY; ty += spacing) {
					for (let tx = startOffset; tx < sizeX; tx += spacing) {
						// Draw the actual pattern at this tile position
						for (const [dx, dy] of cells) {
							const x = tx + dx;
							const y = ty + dy;
							if (x >= 0 && x < sizeX && y >= 0 && y < sizeY) {
								previewGrid[y * sizeX + x] = 1;
							}
						}
					}
				}
			} else {
				// Single pattern in center
				for (const [dx, dy] of cells) {
					const x = cx + dx;
					const y = cy + dy;
					if (x >= 0 && x < sizeX && y >= 0 && y < sizeY) {
						previewGrid[y * sizeX + x] = 1;
					}
				}
			}
		}
	}

	// RGB to HSL conversion (matches shader)
	function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
		const maxC = Math.max(r, g, b);
		const minC = Math.min(r, g, b);
		const l = (maxC + minC) / 2;
		
		if (maxC === minC) return [0, 0, l];
		
		const d = maxC - minC;
		const s = l > 0.5 ? d / (2 - maxC - minC) : d / (maxC + minC);
		
		let h: number;
		if (maxC === r) {
			h = (g - b) / d + (g < b ? 6 : 0);
		} else if (maxC === g) {
			h = (b - r) / d + 2;
		} else {
			h = (r - g) / d + 4;
		}
		h /= 6;
		
		return [h, s, l];
	}
	
	// HSL to RGB conversion (matches shader)
	function hslToRgb(h: number, s: number, l: number): [number, number, number] {
		if (s === 0) return [l, l, l];
		
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		
		const hueToRgb = (t: number): number => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1/6) return p + (q - p) * 6 * t;
			if (t < 1/2) return q;
			if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
			return p;
		};
		
		return [hueToRgb(h + 1/3), hueToRgb(h), hueToRgb(h - 1/3)];
	}

	function getStateColor(state: number): string {
		const [r, g, b] = simState.aliveColor;
		const isLight = simState.isLightTheme;
		const numStates = simState.currentRule.numStates;
		const bg = isLight ? [0.95, 0.95, 0.97] : [0.05, 0.05, 0.08];
		
		if (state === 0) {
			return `rgb(${Math.round(bg[0] * 255)}, ${Math.round(bg[1] * 255)}, ${Math.round(bg[2] * 255)})`;
		}
		
		if (state === 1 || numStates === 2) {
			return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
		}
		
		// Dying states - match shader's HSL-based color progression
		const dyingProgress = (state - 1) / (numStates - 1);
		const aliveHsl = rgbToHsl(r, g, b);
		
		// Shift hue by 25% through color wheel
		let dyingHue = aliveHsl[0] + 0.25 * dyingProgress;
		if (dyingHue > 1) dyingHue -= 1;
		
		// Saturation: stay high initially, then drop
		const satCurve = 1 - dyingProgress * dyingProgress;
		const dyingSat = aliveHsl[1] * Math.max(satCurve, 0.2);
		
		// Lightness: different for light/dark themes
		let dyingLight: number;
		if (isLight) {
			const lightFactor = aliveHsl[2] + (0.35 - aliveHsl[2]) * dyingProgress * 0.8;
			dyingLight = lightFactor;
		} else {
			dyingLight = aliveHsl[2] + (0.15 - aliveHsl[2]) * dyingProgress * dyingProgress;
		}
		
		const dyingRgb = hslToRgb(dyingHue, dyingSat, dyingLight);
		
		// Blend with background at the very end (cubic curve)
		const bgBlend = dyingProgress * dyingProgress * dyingProgress * 0.6;
		const finalR = Math.round((dyingRgb[0] * (1 - bgBlend) + bg[0] * bgBlend) * 255);
		const finalG = Math.round((dyingRgb[1] * (1 - bgBlend) + bg[1] * bgBlend) * 255);
		const finalB = Math.round((dyingRgb[2] * (1 - bgBlend) + bg[2] * bgBlend) * 255);
		
		return `rgb(${finalR}, ${finalG}, ${finalB})`;
	}

	function renderPreview() {
		if (!previewCtx) return;
		
		previewCtx.fillStyle = simState.isLightTheme ? '#f0f0f3' : '#0a0a0f';
		previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

		if (isHexGrid) {
			renderHexPreview();
		} else {
			renderSquarePreview();
		}
	}

	function renderSquarePreview() {
		if (!previewCtx) return;
		const sizeX = PREVIEW_SIZE_X;
		const sizeY = previewSizeY;
		const cellSizeX = previewCanvas.width / sizeX;
		const cellSizeY = previewCanvas.height / sizeY;

		for (let y = 0; y < sizeY; y++) {
			for (let x = 0; x < sizeX; x++) {
				const state = previewGrid[y * sizeX + x];
				if (state > 0) {
					previewCtx.fillStyle = getStateColor(state);
					previewCtx.fillRect(x * cellSizeX, y * cellSizeY, cellSizeX - 0.5, cellSizeY - 0.5);
				}
			}
		}
	}

	function renderHexPreview() {
		if (!previewCtx) return;
		
		const sizeX = PREVIEW_SIZE_X;
		const sizeY = previewSizeY;
		
		// Calculate hex size to fit in canvas
		const hexWidth = previewCanvas.width / (sizeX + 0.5);
		const hexHeight = hexWidth * HEX_HEIGHT_RATIO;
		const hexRadius = hexWidth / 2;

		for (let y = 0; y < sizeY; y++) {
			for (let x = 0; x < sizeX; x++) {
				const state = previewGrid[y * sizeX + x];
				
				const isOddRow = (y & 1) === 1;
				const centerX = (x + 0.5) * hexWidth + (isOddRow ? hexWidth / 2 : 0);
				const centerY = (y + 0.5) * hexHeight;
				
				previewCtx.fillStyle = state > 0 ? getStateColor(state) : (simState.isLightTheme ? '#f0f0f3' : '#0a0a0f');
				drawHexagon(previewCtx, centerX, centerY, hexRadius * 0.95);
			}
		}
	}

	function drawHexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
		ctx.beginPath();
		for (let i = 0; i < 6; i++) {
			const angle = (Math.PI / 3) * i - Math.PI / 6;
			const px = cx + radius * Math.cos(angle);
			const py = cy + radius * Math.sin(angle);
			if (i === 0) {
				ctx.moveTo(px, py);
			} else {
				ctx.lineTo(px, py);
			}
		}
		ctx.closePath();
		ctx.fill();
	}

	function countNeighborsAt(x: number, y: number): number {
		const neighborhood = simState.currentRule.neighborhood ?? 'moore';
		const sizeX = PREVIEW_SIZE_X;
		const sizeY = previewSizeY;
		let count = 0;
		
		if (neighborhood === 'vonNeumann') {
			const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
			for (const [dx, dy] of dirs) {
				const nx = (x + dx + sizeX) % sizeX;
				const ny = (y + dy + sizeY) % sizeY;
				if (previewGrid[ny * sizeX + nx] === 1) count++;
			}
		} else if (neighborhood === 'extendedMoore') {
			for (let dy = -2; dy <= 2; dy++) {
				for (let dx = -2; dx <= 2; dx++) {
					if (dx === 0 && dy === 0) continue;
					const nx = (x + dx + sizeX) % sizeX;
					const ny = (y + dy + sizeY) % sizeY;
					if (previewGrid[ny * sizeX + nx] === 1) count++;
				}
			}
		} else if (neighborhood === 'hexagonal' || neighborhood === 'extendedHexagonal') {
			const isOddRow = (y & 1) === 1;
			// Inner ring (6 neighbors)
			const innerNeighbors = isOddRow
				? [[0, -1], [1, -1], [-1, 0], [1, 0], [0, 1], [1, 1]]
				: [[-1, -1], [0, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]];
			
			for (const [dx, dy] of innerNeighbors) {
				const nx = (x + dx + sizeX) % sizeX;
				const ny = (y + dy + sizeY) % sizeY;
				if (previewGrid[ny * sizeX + nx] === 1) count++;
			}
			
			// Outer ring (12 more neighbors) for extended hexagonal
			if (neighborhood === 'extendedHexagonal') {
				const outerNeighbors = isOddRow
					? [[-1, -2], [0, -2], [1, -2], [-2, -1], [2, 0], [-2, 1], [-1, 2], [0, 2], [1, 2], [2, -1], [2, 1], [-1, -1]]
					: [[-1, -2], [0, -2], [1, -2], [-2, -1], [-2, 0], [-2, 1], [-1, 2], [0, 2], [1, 2], [2, -1], [2, 1], [1, -1]];
				
				for (const [dx, dy] of outerNeighbors) {
					const nx = (x + dx + sizeX) % sizeX;
					const ny = (y + dy + sizeY) % sizeY;
					if (previewGrid[ny * sizeX + nx] === 1) count++;
				}
			}
		} else {
			// Moore
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (dx === 0 && dy === 0) continue;
					const nx = (x + dx + sizeX) % sizeX;
					const ny = (y + dy + sizeY) % sizeY;
					if (previewGrid[ny * sizeX + nx] === 1) count++;
				}
			}
		}
		
		return count;
	}

	function stepPreview() {
		const birthMask = simState.currentRule.birthMask;
		const surviveMask = simState.currentRule.surviveMask;
		const numStates = simState.currentRule.numStates;
		const sizeX = PREVIEW_SIZE_X;
		const sizeY = previewSizeY;
		const nextGrid = new Array(sizeX * sizeY).fill(0);

		for (let y = 0; y < sizeY; y++) {
			for (let x = 0; x < sizeX; x++) {
				const idx = y * sizeX + x;
				const state = previewGrid[idx];
				const neighbors = countNeighborsAt(x, y);

				if (state === 0) {
					nextGrid[idx] = (birthMask & (1 << neighbors)) !== 0 ? 1 : 0;
				} else if (state === 1) {
					if ((surviveMask & (1 << neighbors)) !== 0) {
						nextGrid[idx] = 1;
					} else {
						nextGrid[idx] = numStates > 2 ? 2 : 0;
					}
				} else {
					nextGrid[idx] = state + 1 >= numStates ? 0 : state + 1;
				}
			}
		}

		previewGrid = nextGrid;
		renderPreview();
	}

	function togglePreviewPlay() {
		previewPlaying = !previewPlaying;
		if (previewPlaying) runPreviewLoop();
	}

	function runPreviewLoop() {
		if (!previewPlaying) return;
		const now = performance.now();
		if (now - lastPreviewStep > 100) {
			stepPreview();
			lastPreviewStep = now;
		}
		previewAnimationId = requestAnimationFrame(runPreviewLoop);
	}

	function resetPreview() {
		previewPlaying = false;
		if (previewAnimationId) cancelAnimationFrame(previewAnimationId);
		initPreviewGrid();
		renderPreview();
	}

	function handleInitialize() {
		const pattern = [...currentPatterns.random, ...currentPatterns.structures, 
			...currentPatterns.oscillators, ...currentPatterns.still].find(p => p.id === selectedPattern);
		
		const options: { density?: number; tiled?: boolean; spacing?: number } = {};
		
		if (selectedPattern === 'random-optimal') {
			options.density = ruleDensity;
		} else if (pattern && 'density' in pattern) {
			options.density = pattern.density;
		} else if (selectedPattern === 'random-custom') {
			options.density = customDensity / 100;
		}
		
		if (canTile && tilingEnabled) {
			options.tiled = true;
			options.spacing = tilingSpacing;
		}
		
		// Save settings for next time
		simState.lastInitPattern = selectedPattern;
		simState.lastInitCategory = selectedCategory;
		simState.lastInitTiling = tilingEnabled;
		simState.lastInitSpacing = tilingSpacing;
		
		oninitialize(selectedPattern, options);
		onclose();
	}

	function selectCategory(cat: string) {
		selectedCategory = cat;
		// Select first pattern in category
		if (cat === 'random') {
			selectedPattern = currentPatterns.random[0]?.id ?? 'random-medium';
		} else if (cat === 'structures') {
			selectedPattern = currentPatterns.structures[0]?.id ?? 'glider';
		} else if (cat === 'oscillators') {
			selectedPattern = currentPatterns.oscillators[0]?.id ?? 'blinker';
		} else if (cat === 'still') {
			selectedPattern = currentPatterns.still[0]?.id ?? 'block';
		}
	}

	// Params for seed pattern preview action (pattern + theme/color version)
	type SeedPreviewParams = { patternId: SeedPatternId; version: number };
	
	// Version that changes when theme or color changes, to trigger re-render
	const seedPreviewVersion = $derived(
		(simState.isLightTheme ? 1 : 0) + 
		simState.aliveColor[0] * 1000 + 
		simState.aliveColor[1] * 100 + 
		simState.aliveColor[2] * 10
	);

	// Svelte action to draw seed pattern preview on a canvas
	function drawSeedPatternPreview(canvas: HTMLCanvasElement, params: SeedPreviewParams) {
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		
		let currentPatternId = params.patternId;

		function draw() {
			// Look up pattern in both arrays
			const pattern = SEED_PATTERNS.find(p => p.id === currentPatternId) 
				|| SEED_PATTERNS_HEX.find(p => p.id === currentPatternId);
			if (!pattern) return;

			const w = canvas.width;
			const h = canvas.height;
			const cellSize = 4;
			const centerX = Math.floor(w / 2);
			const centerY = Math.floor(h / 2);

			// Clear with background
			ctx.fillStyle = simState.isLightTheme ? '#e8e8eb' : '#1a1a24';
			ctx.fillRect(0, 0, w, h);

			// Draw grid dots (subtle)
			ctx.fillStyle = simState.isLightTheme ? '#d0d0d5' : '#2a2a38';
			for (let y = 2; y < h; y += cellSize) {
				for (let x = 2; x < w; x += cellSize) {
					ctx.fillRect(x, y, 1, 1);
				}
			}

			// Draw pattern cells
			const [r, g, b] = simState.aliveColor;
			ctx.fillStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
			
			if (pattern.hex) {
				// Draw hexagonal pattern with proper offset coordinates
				const hexCellSize = cellSize * 0.9;
				for (const [dx, dy] of pattern.cells) {
					// Odd-r offset: odd rows shift right by half a cell
					const isOddRow = (dy & 1) !== 0;
					const px = centerX + dx * cellSize + (isOddRow ? cellSize / 2 : 0);
					const py = centerY + dy * cellSize * HEX_HEIGHT_RATIO;
					drawSmallHexagon(ctx, px, py, hexCellSize / 2);
				}
			} else {
				// Draw square pattern
				for (const [dx, dy] of pattern.cells) {
					const px = centerX + dx * cellSize - cellSize / 2;
					const py = centerY + dy * cellSize - cellSize / 2;
					ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
				}
			}
		}

		draw();

		return {
			update(newParams: SeedPreviewParams) {
				currentPatternId = newParams.patternId;
				draw();
			}
		};
	}
	
	// Draw a small hexagon for seed pattern preview
	function drawSmallHexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
		ctx.beginPath();
		for (let i = 0; i < 6; i++) {
			const angle = (Math.PI / 3) * i - Math.PI / 6;
			const px = cx + radius * Math.cos(angle);
			const py = cy + radius * Math.sin(angle);
			if (i === 0) {
				ctx.moveTo(px, py);
			} else {
				ctx.lineTo(px, py);
			}
		}
		ctx.closePath();
		ctx.fill();
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div class="modal-backdrop" onclick={(e) => e.target === e.currentTarget && onclose()} onwheel={(e) => {
	// Only forward wheel events if scrolling on the backdrop itself (not inside modal content)
	if (e.target !== e.currentTarget) return;
	
	// Forward wheel events to the canvas for zooming while modal is open
	const canvas = document.querySelector('canvas');
	if (canvas) {
		canvas.dispatchEvent(new WheelEvent('wheel', {
			deltaY: e.deltaY,
			deltaX: e.deltaX,
			clientX: e.clientX,
			clientY: e.clientY,
			bubbles: true
		}));
	}
}}>
	<div class="modal">
		<div class="header">
			<span class="title">
				<svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<!-- Dice/random scatter icon -->
					<rect x="4" y="4" width="16" height="16" rx="2" />
					<circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
					<circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none" />
					<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
					<circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none" />
					<circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" />
				</svg>
				Initialize Grid
			</span>
			<span class="rule-badge">{simState.currentRule.name}</span>
			<button class="init-btn" onclick={handleInitialize} title="Apply initialization">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M5 12l5 5L20 7" />
				</svg>
			</button>
			<button class="close-btn" onclick={onclose} aria-label="Close">✕</button>
		</div>

		<div class="content">
			<div class="main-row">
				<!-- Left side: tabs + patterns -->
				<div class="patterns-col">
					<!-- Category tabs -->
					<div class="tabs">
						<button 
							class="tab" 
							class:active={selectedCategory === 'random'}
							onclick={() => selectCategory('random')}
						>
							Random
						</button>
						{#if currentPatterns.structures.length > 0}
							<button 
								class="tab" 
								class:active={selectedCategory === 'structures'}
								onclick={() => selectCategory('structures')}
							>
								Structures
							</button>
						{/if}
						{#if currentPatterns.oscillators.length > 0}
							<button 
								class="tab" 
								class:active={selectedCategory === 'oscillators'}
								onclick={() => selectCategory('oscillators')}
							>
								Oscillators
							</button>
						{/if}
						{#if currentPatterns.still.length > 0}
							<button 
								class="tab" 
								class:active={selectedCategory === 'still'}
								onclick={() => selectCategory('still')}
							>
								Still Life
							</button>
						{/if}
					</div>

					<!-- Pattern grid -->
					<div class="patterns">
						{#if selectedCategory === 'random'}
							{#if hasRuleDensity}
								<button 
									class="pattern-btn optimal"
									class:selected={selectedPattern === 'random-optimal'}
									onclick={() => selectedPattern = 'random-optimal'}
								>
									<span class="pattern-name">✨ Optimal</span>
									<span class="pattern-desc">{Math.round(ruleDensity * 100)}% - best for {simState.currentRule.name}</span>
								</button>
							{/if}
							{#each currentPatterns.random as pattern}
								<button 
									class="pattern-btn"
									class:selected={selectedPattern === pattern.id}
									onclick={() => selectedPattern = pattern.id}
								>
									<span class="pattern-name">{pattern.name}</span>
									<span class="pattern-desc">{pattern.desc}</span>
								</button>
							{/each}
							<button 
								class="pattern-btn"
								class:selected={selectedPattern === 'random-custom'}
								onclick={() => selectedPattern = 'random-custom'}
							>
								<span class="pattern-name">Custom</span>
								<span class="pattern-desc">{customDensity}% density</span>
							</button>
							{#if selectedPattern === 'random-custom'}
								<input 
									type="range" 
									min="5" 
									max="80" 
									bind:value={customDensity}
									class="density-slider"
								/>
							{/if}
						{:else if selectedCategory === 'structures'}
							{#each currentPatterns.structures as pattern}
								<button 
									class="pattern-btn"
									class:selected={selectedPattern === pattern.id}
									class:foreign={!isNativePattern(pattern.origin)}
									onclick={() => selectedPattern = pattern.id}
								>
									<span class="pattern-name">{pattern.name}</span>
									{#if pattern.origin && !isNativePattern(pattern.origin)}
										<span class="origin-badge">{pattern.origin}</span>
									{/if}
									<span class="pattern-desc">{pattern.desc}</span>
								</button>
							{/each}
						{:else if selectedCategory === 'oscillators'}
							{#each currentPatterns.oscillators as pattern}
								<button 
									class="pattern-btn"
									class:selected={selectedPattern === pattern.id}
									class:foreign={!isNativePattern(pattern.origin)}
									onclick={() => selectedPattern = pattern.id}
								>
									<span class="pattern-name">{pattern.name}</span>
									{#if pattern.origin && !isNativePattern(pattern.origin)}
										<span class="origin-badge">{pattern.origin}</span>
									{/if}
									<span class="pattern-desc">{pattern.desc}</span>
								</button>
							{/each}
						{:else if selectedCategory === 'still'}
							{#each currentPatterns.still as pattern}
								<button 
									class="pattern-btn"
									class:selected={selectedPattern === pattern.id}
									class:foreign={!isNativePattern(pattern.origin)}
									onclick={() => selectedPattern = pattern.id}
								>
									<span class="pattern-name">{pattern.name}</span>
									{#if pattern.origin && !isNativePattern(pattern.origin)}
										<span class="origin-badge">{pattern.origin}</span>
									{/if}
									<span class="pattern-desc">{pattern.desc}</span>
								</button>
							{/each}
						{/if}
					</div>

					<!-- Tiling option -->
					{#if canTile}
						<div class="tiling-row">
							<label class="tile-checkbox">
								<input type="checkbox" bind:checked={tilingEnabled} />
								<span>Tile</span>
							</label>
							{#if tilingEnabled}
								<input 
									type="range" 
									min={minSpacing} 
									max={Math.max(minSpacing + 100, 150)} 
									step="1" 
									bind:value={tilingSpacing} 
									class="spacing-slider" 
								/>
								<span class="spacing-val">{tilingSpacing}</span>
							{/if}
						</div>
					{/if}

				</div>

				<!-- Right side: preview -->
				<div class="preview-col">
					<span class="preview-label">Preview</span>
					<div class="preview-area">
						<canvas bind:this={previewCanvas} width={120} height={120} class="preview-canvas"></canvas>
						<div class="preview-btns">
							<button class="pbtn" class:active={previewPlaying} onclick={togglePreviewPlay} title="Play/Pause">
								{#if previewPlaying}
									<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
								{:else}
									<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7-11-7z" /></svg>
								{/if}
							</button>
							<button class="pbtn" onclick={stepPreview} title="Step">
								<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z" /></svg>
							</button>
							<button class="pbtn" onclick={resetPreview} title="Reset">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v5h.6m14.8 2A8 8 0 004.6 9m0 0H9m11 11v-5h-.6m0 0a8 8 0 01-15.2-2M19.4 15H15" /></svg>
							</button>
						</div>
					</div>
				</div>
			</div>

			<!-- Continuous seeding option - full width row -->
			<div class="seeding-row">
				<label class="seed-checkbox">
					<input type="checkbox" bind:checked={simState.seedingEnabled} />
					<span>Auto-seed</span>
				</label>
				{#if simState.seedingEnabled}
					<!-- Mode toggle with label -->
					<div class="seed-control-group">
						<span class="seed-control-label">Mode</span>
						<button 
							class="seed-mode-toggle" 
							class:alive={simState.seedAlive}
							onclick={() => simState.seedAlive = !simState.seedAlive}
						>
							<span class="mode-option" class:active={!simState.seedAlive}>−</span>
							<span class="mode-option" class:active={simState.seedAlive}>+</span>
						</button>
					</div>
					<!-- Shape dropdown with label -->
					<div class="seed-control-group">
						<span class="seed-control-label">Shape</span>
						<div class="seed-pattern-wrapper">
							<button 
								class="seed-pattern-btn" 
								onclick={() => seedPatternDropdownOpen = !seedPatternDropdownOpen}
								aria-label="Select seed pattern shape"
							>
							<canvas 
								class="seed-pattern-preview"
								width="18" 
								height="18"
								use:drawSeedPatternPreview={{ patternId: simState.seedPattern, version: seedPreviewVersion }}
							></canvas>
								<svg class="chevron" class:open={seedPatternDropdownOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg>
							</button>
							{#if seedPatternDropdownOpen}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div class="dropdown-backdrop" onclick={() => seedPatternDropdownOpen = false} onkeydown={() => {}}></div>
								<div class="seed-pattern-dropdown">
									{#each currentSeedPatterns as pattern}
										<button 
											class="seed-pattern-item"
											class:selected={simState.seedPattern === pattern.id}
											onclick={() => { simState.seedPattern = pattern.id; seedPatternDropdownOpen = false; }}
										>
								<canvas 
									class="seed-pattern-preview-item"
									width="24" 
									height="24"
									use:drawSeedPatternPreview={{ patternId: pattern.id, version: seedPreviewVersion }}
								></canvas>
											<span class="seed-pattern-name">{pattern.name}</span>
										</button>
									{/each}
								</div>
							{/if}
						</div>
					</div>
					<!-- Rate slider with label -->
					<div class="seed-control-group seed-rate-group">
						<span class="seed-control-label">Rate</span>
						<input 
							type="range" 
							min="1" 
							max="100" 
							step="1" 
							bind:value={seedingRatePercent}
							class="seeding-slider" 
						/>
						<span class="seeding-val">{seedingRatePercent}%</span>
					</div>
				{/if}
			</div>
			
			<!-- Grid Scale -->
			<div class="scale-row">
				<div class="scale-header">
					<span class="scale-label">Grid Scale</span>
					<span class="scale-dims">{currentDimensions}</span>
				</div>
				<div class="scale-btns">
					{#each GRID_SCALES as scale}
						<button
							class="scale-btn"
							class:selected={simState.gridScale === scale.name}
							onclick={() => changeScale(scale.name)}
						>
							{scale.label}
						</button>
					{/each}
				</div>
			</div>

			{#if selectedCategory !== 'random' && !selectedPattern.startsWith('random')}
				{@const selectedPatternData = [...currentPatterns.structures, ...currentPatterns.oscillators, ...currentPatterns.still].find(p => p.id === selectedPattern)}
				{#if selectedPatternData?.origin && !isNativePattern(selectedPatternData.origin)}
					<div class="note warning">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span>This pattern was designed for {selectedPatternData.origin}. Results may vary with {simState.currentRule.name}.</span>
					</div>
				{/if}
			{/if}
		</div>

	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: var(--ui-bg, rgba(12, 12, 18, 0.85));
		backdrop-filter: blur(16px);
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 12px;
		padding: 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
		min-width: 480px;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.title {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--ui-text-hover, #e0e0e0);
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.header-icon {
		width: 16px;
		height: 16px;
		color: var(--ui-accent, #33e6f2);
		flex-shrink: 0;
	}

	.rule-badge {
		font-size: 0.6rem;
		padding: 0.2rem 0.4rem;
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		color: var(--ui-accent, #2dd4bf);
		border-radius: 4px;
		margin-left: auto;
		margin-right: 0.5rem;
	}

	.init-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		border: 1px solid var(--ui-accent-border, rgba(45, 212, 191, 0.4));
		color: var(--ui-accent, #2dd4bf);
		cursor: pointer;
		border-radius: 6px;
		margin-left: auto;
		transition: all 0.15s;
	}

	.init-btn:hover {
		background: var(--ui-accent-bg-hover, rgba(45, 212, 191, 0.25));
		border-color: var(--ui-accent, #2dd4bf);
		transform: scale(1.05);
	}

	.init-btn svg {
		width: 16px;
		height: 16px;
	}

	.close-btn {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: var(--ui-text, #666);
		font-size: 0.9rem;
		cursor: pointer;
		border-radius: 4px;
		margin-left: 0.3rem;
	}

	.close-btn:hover {
		background: var(--ui-border, rgba(255, 255, 255, 0.1));
		color: var(--ui-text-hover, #fff);
	}

	.content {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.main-row {
		display: flex;
		gap: 1rem;
	}

	.patterns-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.preview-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
	}

	.preview-label {
		font-size: 0.65rem;
		color: var(--ui-text, #888);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.preview-area {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}

	.preview-canvas {
		border-radius: 6px;
		background: var(--ui-canvas-bg, #0a0a0f);
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
	}

	.preview-btns {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.pbtn {
		width: 28px;
		height: 28px;
		border: none;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.2));
		color: var(--ui-text, #666);
		border-radius: 5px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}

	.pbtn:hover { background: var(--ui-border-hover, rgba(255, 255, 255, 0.12)); color: var(--ui-text-hover, #fff); }
	.pbtn.active { background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2)); color: var(--ui-accent, #2dd4bf); }
	.pbtn svg { width: 12px; height: 12px; }

	.tabs {
		display: flex;
		gap: 0.2rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.2));
		padding: 0.15rem;
		border-radius: 5px;
	}

	.tab {
		flex: 1;
		padding: 0.35rem 0.4rem;
		background: transparent;
		border: none;
		color: var(--ui-text, #888);
		font-size: 0.65rem;
		font-weight: 500;
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s;
	}

	.tab:hover {
		color: var(--ui-text-hover, #fff);
	}

	.tab.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2));
		color: var(--ui-accent, #2dd4bf);
	}

	.patterns {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.3rem;
	}

	.pattern-btn {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding: 0.4rem 0.5rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.2));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
		border-radius: 5px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.pattern-btn:hover {
		border-color: var(--ui-border-hover, rgba(255, 255, 255, 0.15));
		background: var(--ui-bg-hover, rgba(20, 20, 30, 0.5));
	}

	.pattern-btn.selected {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2));
		border-color: var(--ui-accent, rgba(45, 212, 191, 0.6));
		box-shadow: 0 0 0 1px var(--ui-accent-border, rgba(45, 212, 191, 0.3));
	}

	.pattern-name {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--ui-text-hover, #e0e0e0);
	}

	.pattern-btn.selected .pattern-name {
		color: var(--ui-accent, #2dd4bf);
	}

	.pattern-btn.foreign {
		opacity: 0.8;
	}

	.pattern-btn.foreign .pattern-name {
		color: var(--ui-text, #aaa);
	}

	/* Optimal has subtle highlight when NOT selected */
	.pattern-btn.optimal:not(.selected) {
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.15));
	}

	.pattern-btn.optimal:not(.selected) .pattern-name {
		color: var(--ui-accent, #2dd4bf);
		opacity: 0.8;
	}

	.origin-badge {
		font-size: 0.5rem;
		padding: 0.1rem 0.3rem;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 3px;
		color: var(--ui-text, #888);
		margin-left: auto;
		align-self: flex-start;
	}

	.pattern-btn.selected .origin-badge {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2));
		color: var(--ui-accent, #2dd4bf);
	}

	.pattern-desc {
		font-size: 0.55rem;
		color: var(--ui-text, #666);
		margin-top: 0.1rem;
		width: 100%;
	}

	.density-slider {
		grid-column: span 2;
		width: 100%;
		height: 6px;
		-webkit-appearance: none;
		appearance: none;
		background: transparent;
		cursor: pointer;
		outline: none;
		margin: 0.3rem 0;
		padding: 0;
	}

	.density-slider::-webkit-slider-runnable-track {
		width: 100%;
		height: 6px;
		background: var(--slider-track-bg, rgba(255, 255, 255, 0.25));
		border-radius: 3px;
		border: 1px solid var(--slider-track-border, rgba(255, 255, 255, 0.1));
	}

	.density-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		background: var(--ui-accent, #2dd4bf);
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid rgba(255, 255, 255, 0.9);
		margin-top: -5px;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}

	.density-slider::-moz-range-track {
		width: 100%;
		height: 6px;
		background: var(--slider-track-bg, rgba(255, 255, 255, 0.25));
		border-radius: 3px;
		border: 1px solid var(--slider-track-border, rgba(255, 255, 255, 0.1));
	}

	.density-slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
		background: var(--ui-accent, #2dd4bf);
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid rgba(255, 255, 255, 0.9);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}

	/* Tiling row - compact inline layout */
	.tiling-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.5rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.2));
		border-radius: 5px;
	}

	.tile-checkbox {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.65rem;
		color: var(--ui-text-hover, #e0e0e0);
		cursor: pointer;
		white-space: nowrap;
	}

	.tile-checkbox input {
		accent-color: var(--ui-accent, #2dd4bf);
		width: 12px;
		height: 12px;
	}

	.spacing-slider {
		flex: 1;
		height: 6px;
		min-width: 60px;
		-webkit-appearance: none;
		appearance: none;
		background: transparent;
		cursor: pointer;
		outline: none;
		margin: 0;
		padding: 0;
	}

	.spacing-slider::-webkit-slider-runnable-track {
		width: 100%;
		height: 6px;
		background: var(--slider-track-bg, rgba(255, 255, 255, 0.25));
		border-radius: 3px;
		border: 1px solid var(--slider-track-border, rgba(255, 255, 255, 0.1));
	}

	.spacing-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		background: var(--ui-accent, #2dd4bf);
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid rgba(255, 255, 255, 0.9);
		margin-top: -5px;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}

	.spacing-slider::-moz-range-track {
		width: 100%;
		height: 6px;
		background: var(--slider-track-bg, rgba(255, 255, 255, 0.25));
		border-radius: 3px;
		border: 1px solid var(--slider-track-border, rgba(255, 255, 255, 0.1));
	}

	.spacing-slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
		background: var(--ui-accent, #2dd4bf);
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid rgba(255, 255, 255, 0.9);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}

	.spacing-val {
		font-size: 0.6rem;
		color: var(--ui-accent, #2dd4bf);
		min-width: 24px;
		text-align: right;
		font-family: 'SF Mono', Monaco, monospace;
	}

	/* Seeding row - flexible spacing */
	.seeding-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.4rem 0.5rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.2));
		border-radius: 5px;
	}
	
	/* Grid Scale row */
	.scale-row {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.4rem 0.5rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.2));
		border-radius: 5px;
	}
	
	.scale-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	
	.scale-label {
		font-size: 0.65rem;
		color: var(--ui-text-hover, #e0e0e0);
	}
	
	.scale-dims {
		font-size: 0.6rem;
		color: var(--ui-text, #888);
		font-family: 'SF Mono', Monaco, monospace;
	}
	
	.scale-btns {
		display: flex;
		gap: 0.25rem;
	}
	
	.scale-btn {
		flex: 1;
		padding: 0.3rem 0.4rem;
		background: var(--ui-border, rgba(255, 255, 255, 0.05));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
		border-radius: 4px;
		color: var(--ui-text, #888);
		font-size: 0.6rem;
		cursor: pointer;
		transition: all 0.1s;
	}
	
	.scale-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		color: var(--ui-text-hover, #fff);
	}
	
	.scale-btn.selected {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.3));
		color: var(--ui-accent, #2dd4bf);
	}

	.seed-checkbox {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.65rem;
		color: var(--ui-text-hover, #e0e0e0);
		cursor: pointer;
		white-space: nowrap;
	}

	.seed-checkbox input {
		accent-color: var(--ui-accent, #2dd4bf);
		width: 12px;
		height: 12px;
	}

	/* Control groups with labels */
	.seed-control-group {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.seed-control-label {
		font-size: 0.55rem;
		color: var(--ui-text, #666);
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	/* Alive/Dead toggle - compact +/- style */
	.seed-mode-toggle {
		display: flex;
		align-items: center;
		gap: 0;
		padding: 0;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s;
		overflow: hidden;
		flex-shrink: 0;
	}

	.seed-mode-toggle:hover {
		border-color: var(--ui-border-hover, rgba(255, 255, 255, 0.2));
	}

	.mode-option {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0.2rem 0.35rem;
		color: var(--ui-text, #666);
		transition: all 0.15s;
		user-select: none;
		background: transparent;
		line-height: 1;
	}

	.mode-option.active {
		color: var(--ui-accent, #2dd4bf);
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2));
	}

	.seeding-slider {
		width: 60px;
		height: 6px;
		-webkit-appearance: none;
		appearance: none;
		background: transparent;
		cursor: pointer;
		outline: none;
		margin: 0;
		padding: 0;
		flex-shrink: 0;
	}

	.seeding-slider::-webkit-slider-runnable-track {
		width: 100%;
		height: 6px;
		background: var(--slider-track-bg, rgba(255, 255, 255, 0.25));
		border-radius: 3px;
		border: 1px solid var(--slider-track-border, rgba(255, 255, 255, 0.1));
	}

	.seeding-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		background: var(--ui-accent, #2dd4bf);
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid rgba(255, 255, 255, 0.9);
		margin-top: -5px;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}

	.seeding-slider::-moz-range-track {
		width: 100%;
		height: 6px;
		background: var(--slider-track-bg, rgba(255, 255, 255, 0.25));
		border-radius: 3px;
		border: 1px solid var(--slider-track-border, rgba(255, 255, 255, 0.1));
	}

	.seeding-slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
		background: var(--ui-accent, #2dd4bf);
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid rgba(255, 255, 255, 0.9);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}

	.seeding-val {
		font-size: 0.6rem;
		color: var(--ui-accent, #2dd4bf);
		min-width: 28px;
		text-align: right;
		font-family: 'SF Mono', Monaco, monospace;
	}

	/* Seed pattern dropdown */
	.seed-pattern-wrapper {
		position: relative;
	}

	.seed-pattern-btn {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.15rem 0.25rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.seed-pattern-btn:hover {
		border-color: var(--ui-border-hover, rgba(255, 255, 255, 0.2));
	}

	.seed-pattern-preview {
		width: 18px;
		height: 18px;
		border-radius: 2px;
	}

	.seed-pattern-btn .chevron {
		width: 10px;
		height: 10px;
		color: var(--ui-text, #666);
		transition: transform 0.15s;
	}

	.seed-pattern-btn .chevron.open {
		transform: rotate(180deg);
	}

	.dropdown-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10;
	}

	.seed-pattern-dropdown {
		position: absolute;
		bottom: calc(100% + 4px);
		left: 0;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 2px;
		padding: 4px;
		background: var(--ui-bg, rgba(16, 16, 24, 0.98));
		backdrop-filter: blur(12px);
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.15));
		border-radius: 6px;
		z-index: 20;
		box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.3);
	}

	.seed-pattern-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 6px 4px 4px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.1s;
	}

	.seed-pattern-item:hover {
		background: var(--ui-bg-hover, rgba(255, 255, 255, 0.08));
		border-color: var(--ui-border, rgba(255, 255, 255, 0.1));
	}

	.seed-pattern-item.selected {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.4));
	}

	.seed-pattern-preview-item {
		width: 24px;
		height: 24px;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.seed-pattern-name {
		font-size: 0.5rem;
		color: var(--ui-text, #888);
		white-space: nowrap;
	}

	.seed-pattern-item.selected .seed-pattern-name {
		color: var(--ui-accent, #2dd4bf);
	}

	.note {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.2));
		border-radius: 6px;
		font-size: 0.6rem;
		color: var(--ui-text, #888);
	}

	.note.warning {
		background: rgba(251, 191, 36, 0.1);
		border: 1px solid rgba(251, 191, 36, 0.3);
		color: #fbbf24;
	}

	.note.warning svg {
		color: #fbbf24;
	}

	.note svg {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}

	/* Mobile adjustments */
	@media (max-width: 768px) {
		.modal {
			max-width: 95vw;
			min-width: unset;
			padding: 0.8rem;
		}

		.tabs {
			flex-wrap: wrap;
		}

		.tab {
			padding: 0.35rem 0.6rem;
			font-size: 0.6rem;
		}
	}

</style>
