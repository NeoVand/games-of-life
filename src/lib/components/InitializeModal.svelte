<script lang="ts">
	import { getSimulationState } from '../stores/simulation.svelte.js';
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		onclose: () => void;
		oninitialize: (type: string, options?: { density?: number; tiled?: boolean; spacing?: number }) => void;
	}

	let { onclose, oninitialize }: Props = $props();

	const simState = getSimulationState();

	const PREVIEW_SIZE = 40;
	let previewCanvas: HTMLCanvasElement;
	let previewCtx: CanvasRenderingContext2D | null = null;
	let previewGrid: number[] = [];
	let previewPlaying = $state(false);
	let previewAnimationId: number | null = null;
	let lastPreviewStep = 0;

	// Tiling options - spacing is actual cell distance on main grid
	let tilingEnabled = $state(simState.lastInitTiling);
	let tilingSpacing = $state(simState.lastInitSpacing); // 30-200 cells apart on main grid

	// Get rule's recommended density (or default)
	const ruleDensity = $derived(simState.currentRule.density ?? 0.25);
	const hasRuleDensity = $derived(simState.currentRule.density !== undefined);

	// Universal patterns - available for all rules (results may vary)
	const UNIVERSAL_PATTERNS = {
		random: [
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
	const previewScale = $derived(PREVIEW_SIZE / simState.gridWidth);

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
		previewGrid = new Array(PREVIEW_SIZE * PREVIEW_SIZE).fill(0);
		
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
				previewGrid[i] = seededRandom() < density ? 1 : 0;
			}
		} else {
			const cells = PATTERN_CELLS[selectedPattern];
			if (!cells) return;

			const cx = Math.floor(PREVIEW_SIZE / 2);
			const cy = Math.floor(PREVIEW_SIZE / 2);

			if (canTile && tilingEnabled) {
				// Show tiling at 1:1 scale - the preview shows a PREVIEW_SIZE x PREVIEW_SIZE
				// section of the grid with the actual spacing
				// This gives an accurate representation of how the tiles will look
				const spacing = tilingSpacing;
				const startOffset = Math.floor(spacing / 2) % spacing;
				
				// Place tiles at the actual spacing intervals
				for (let ty = startOffset; ty < PREVIEW_SIZE; ty += spacing) {
					for (let tx = startOffset; tx < PREVIEW_SIZE; tx += spacing) {
						// Draw the actual pattern at this tile position
						for (const [dx, dy] of cells) {
							const x = tx + dx;
							const y = ty + dy;
							if (x >= 0 && x < PREVIEW_SIZE && y >= 0 && y < PREVIEW_SIZE) {
								previewGrid[y * PREVIEW_SIZE + x] = 1;
							}
						}
					}
				}
			} else {
				// Single pattern in center
				for (const [dx, dy] of cells) {
					const x = cx + dx;
					const y = cy + dy;
					if (x >= 0 && x < PREVIEW_SIZE && y >= 0 && y < PREVIEW_SIZE) {
						previewGrid[y * PREVIEW_SIZE + x] = 1;
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
		
		const cellSize = previewCanvas.width / PREVIEW_SIZE;
		
		previewCtx.fillStyle = simState.isLightTheme ? '#f0f0f3' : '#0a0a0f';
		previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

		for (let y = 0; y < PREVIEW_SIZE; y++) {
			for (let x = 0; x < PREVIEW_SIZE; x++) {
				const state = previewGrid[y * PREVIEW_SIZE + x];
				if (state > 0) {
					previewCtx.fillStyle = getStateColor(state);
					previewCtx.fillRect(x * cellSize, y * cellSize, cellSize - 0.5, cellSize - 0.5);
				}
			}
		}
	}

	function stepPreview() {
		const birthMask = simState.currentRule.birthMask;
		const surviveMask = simState.currentRule.surviveMask;
		const numStates = simState.currentRule.numStates;
		const nextGrid = new Array(PREVIEW_SIZE * PREVIEW_SIZE).fill(0);

		for (let y = 0; y < PREVIEW_SIZE; y++) {
			for (let x = 0; x < PREVIEW_SIZE; x++) {
				const idx = y * PREVIEW_SIZE + x;
				const state = previewGrid[idx];
				let neighbors = 0;
				
				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						if (dx === 0 && dy === 0) continue;
						const nx = (x + dx + PREVIEW_SIZE) % PREVIEW_SIZE;
						const ny = (y + dy + PREVIEW_SIZE) % PREVIEW_SIZE;
						if (previewGrid[ny * PREVIEW_SIZE + nx] === 1) neighbors++;
					}
				}

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
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="modal">
		<div class="header">
			<span class="title">
				<svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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
		background: var(--ui-accent, #2dd4bf);
		border: none;
		color: #0a0a0f;
		cursor: pointer;
		border-radius: 6px;
		margin-left: auto;
		transition: all 0.15s;
	}

	.init-btn:hover {
		filter: brightness(1.1);
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
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.4));
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

	.pattern-btn.optimal {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.1));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.25));
	}

	.pattern-btn.optimal .pattern-name {
		color: var(--ui-accent, #2dd4bf);
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
		accent-color: var(--ui-accent, #2dd4bf);
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
		height: 3px;
		accent-color: var(--ui-accent, #2dd4bf);
		min-width: 60px;
	}

	.spacing-val {
		font-size: 0.6rem;
		color: var(--ui-accent, #2dd4bf);
		min-width: 24px;
		text-align: right;
		font-family: 'SF Mono', Monaco, monospace;
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

		.main-content {
			flex-direction: column;
		}

		.patterns-section {
			min-width: unset;
		}

		.preview-section {
			flex-direction: row;
			align-items: center;
			gap: 0.5rem;
		}

		.preview-canvas {
			width: 80px;
			height: 80px;
		}

		.preview-controls {
			flex-direction: column;
		}

		.tabs {
			flex-wrap: wrap;
		}

		.tab {
			padding: 0.35rem 0.6rem;
			font-size: 0.6rem;
		}

		.header h2 {
			font-size: 0.9rem;
		}
	}

</style>
