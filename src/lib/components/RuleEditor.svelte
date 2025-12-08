<script lang="ts" module>
	// Module-level state persists across component mounts
	let persistedFilter = 'all';
</script>

<script lang="ts">
import { getSimulationState, BOUNDARY_MODES, type BoundaryMode, getSimulationRef, resetRuleEditorSession, markRuleEditorSnapshotTaken, wasRuleEditorSnapshotTaken, markRuleEditorEdited, wasRuleEditorEdited, setRuleEditorPreSnapshot, getRuleEditorPreSnapshot } from '../stores/simulation.svelte.js';
	import { 
		RULE_PRESETS, 
		RULE_CATEGORIES, 
		NEIGHBORHOODS,
		VITALITY_MODES,
		parseRule, 
		getNeighborDescription,
		type CARule, 
		type RuleCategory,
		type NeighborhoodType,
		type VitalityMode
	} from '../utils/rules.js';
	import { draggable } from '../utils/draggable.js';
	import { bringToFront, setModalPosition, getModalState } from '../stores/modalManager.svelte.js';
	import BoundaryIcon from './BoundaryIcon.svelte';
	import { onMount, onDestroy } from 'svelte';
import { addSnapshotWithBefore, getHeadId } from '../stores/history.js';

	interface Props {
		onclose: () => void;
		onrulechange: () => void;
		onreinitialize: () => void;
	}

	let { onclose, onrulechange, onreinitialize }: Props = $props();

	const simState = getSimulationState();
	
	// Modal dragging state
	const modalState = $derived(getModalState('ruleEditor'));
	
	function handleDragEnd(position: { x: number; y: number }) {
		setModalPosition('ruleEditor', position);
	}
	
	function handleModalClick() {
		bringToFront('ruleEditor');
	}
	
	// Store the original rule when editor opens, for reverting on cancel
	const originalRule: CARule = { ...simState.currentRule };
	const originalNeighborhood: NeighborhoodType = originalRule.neighborhood ?? 'moore';
	const originalBoundaryMode: BoundaryMode = simState.boundaryMode;
	
	// Get current boundary mode name
	const currentBoundaryName = $derived(
		BOUNDARY_MODES.find(m => m.id === simState.boundaryMode)?.name ?? 'Torus'
	);
	
	function selectBoundaryMode(mode: BoundaryMode) {
		ensureRuleSnapshot();
		markRuleEditorEdited();
		simState.boundaryMode = mode;
	}

	const PREVIEW_SIZE_X = 20;
	// For hexagonal grids, rows are visually compressed by sqrt(3)/2
	// So we need more rows to fill the same visual space
	const HEX_HEIGHT_RATIO = 0.866025404; // sqrt(3)/2
	const PREVIEW_SIZE_Y_SQUARE = 20;
	const PREVIEW_SIZE_Y_HEX = Math.round(20 / HEX_HEIGHT_RATIO); // ~23 rows for hex
	
	// Derived preview height based on neighborhood
	const isHexNeighborhood = $derived(neighborhood === 'hexagonal' || neighborhood === 'extendedHexagonal');
	let previewSizeY = $derived(isHexNeighborhood ? PREVIEW_SIZE_Y_HEX : PREVIEW_SIZE_Y_SQUARE);
	
	let previewCanvas: HTMLCanvasElement;
	let previewCtx: CanvasRenderingContext2D | null = null;
	let previewGrid: number[] = [];
	let previewNextGrid: number[] = [];
	let previewPlaying = $state(false);
	let previewAnimationId: number | null = null;
	let lastPreviewStep = 0;

	let dropdownOpen = $state(false);
	let categoryDropdownOpen = $state(false);
	let neighborhoodDropdownOpen = $state(false);
	let ruleSearchQuery = $state('');
	let ruleSearchMode = $state(false);
	let ruleSearchInput = $state<HTMLInputElement | null>(null);
	let presetListRef = $state<HTMLDivElement | null>(null);
	const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
	let ruleString = $state(simState.currentRule.ruleString);
	let numStates = $state(simState.currentRule.numStates);
	let neighborhood = $state<NeighborhoodType>(simState.currentRule.neighborhood ?? 'moore');
	
	// Grid type toggle - determines which neighborhoods/rules are shown
	type GridType = 'square' | 'hexagonal';
	const currentNeighborhood = simState.currentRule.neighborhood ?? 'moore';
	const initialGridType: GridType = (currentNeighborhood === 'hexagonal' || currentNeighborhood === 'extendedHexagonal') ? 'hexagonal' : 'square';
	let gridType = $state<GridType>(initialGridType);
	
	// Filter neighborhoods by grid type
	const squareNeighborhoods: NeighborhoodType[] = ['moore', 'vonNeumann', 'extendedMoore'];
	const hexNeighborhoods: NeighborhoodType[] = ['hexagonal', 'extendedHexagonal'];
	
	const filteredNeighborhoods = $derived(
		gridType === 'hexagonal' 
			? hexNeighborhoods.map(nh => NEIGHBORHOODS[nh])
			: squareNeighborhoods.map(nh => NEIGHBORHOODS[nh])
	);
	
	// Check if a rule matches current grid type
	function ruleMatchesGridType(rule: CARule): boolean {
		const nh = rule.neighborhood ?? 'moore';
		if (gridType === 'hexagonal') {
			return nh === 'hexagonal' || nh === 'extendedHexagonal';
		}
		return nh !== 'hexagonal' && nh !== 'extendedHexagonal';
	}
	
	// Filter all rule presets by grid type
	const gridFilteredPresets = $derived(RULE_PRESETS.filter(ruleMatchesGridType));
	let selectedPreset = $state(
		RULE_PRESETS.findIndex((r) => r.ruleString === simState.currentRule.ruleString)
	);
	// Filter type: 'all', category name, or neighborhood type prefixed with 'nh:'
	// Use persisted value from module scope
	let selectedFilter = $state<string>(persistedFilter);
	let error = $state('');

	let birthToggles = $state(
		Array.from({ length: 25 }, (_, i) => !!(simState.currentRule.birthMask & (1 << i)))
	);
	let surviveToggles = $state(
		Array.from({ length: 25 }, (_, i) => !!(simState.currentRule.surviveMask & (1 << i)))
	);

	// Get max neighbors based on neighborhood type
	const maxNeighbors = $derived(NEIGHBORHOODS[neighborhood].maxNeighbors);

	// Filter presets by category, neighborhood, or state count
	const filteredPresets = $derived.by(() => {
		// Start with grid-type filtered presets
		let presets = gridFilteredPresets;
		
		// First apply category/neighborhood/state filter
		if (selectedFilter !== 'all') {
			if (selectedFilter.startsWith('nh:')) {
				const nhType = selectedFilter.slice(3) as NeighborhoodType;
				if (nhType === 'moore') {
					// Moore includes rules with no neighborhood specified
					presets = presets.filter(r => !r.neighborhood || r.neighborhood === 'moore');
				} else if (nhType === 'hexagonal') {
					// Hexagonal filter shows both hexagonal and extendedHexagonal
					presets = presets.filter(r => r.neighborhood === 'hexagonal' || r.neighborhood === 'extendedHexagonal');
				} else {
					presets = presets.filter(r => r.neighborhood === nhType);
				}
			} else if (selectedFilter.startsWith('states:')) {
				const stateFilter = selectedFilter.slice(7);
				switch (stateFilter) {
					case '2':
						presets = presets.filter(r => r.numStates === 2);
						break;
					case '3-4':
						presets = presets.filter(r => r.numStates >= 3 && r.numStates <= 4);
						break;
					case '5-8':
						presets = presets.filter(r => r.numStates >= 5 && r.numStates <= 8);
						break;
					case '9+':
						presets = presets.filter(r => r.numStates >= 9);
						break;
				}
			} else {
				presets = presets.filter(r => r.category === selectedFilter);
			}
		}
		
		// Then apply search query if active
		if (ruleSearchQuery.trim()) {
			const query = ruleSearchQuery.toLowerCase().trim();
			
			// Filter and score by relevance
			const scored = presets
				.map(r => {
					const nameLower = r.name.toLowerCase();
					const ruleLower = r.ruleString.toLowerCase();
					const descLower = r.description?.toLowerCase() || '';
					
					let score = 0;
					
					// Exact name match - highest priority
					if (nameLower === query) score += 1000;
					// Name starts with query - very high priority
					else if (nameLower.startsWith(query)) score += 500;
					// Name contains query as word boundary
					else if (nameLower.includes(' ' + query) || nameLower.includes(query + ' ')) score += 200;
					// Name contains query anywhere
					else if (nameLower.includes(query)) score += 100;
					
					// Rule string matches
					if (ruleLower.startsWith(query)) score += 50;
					else if (ruleLower.includes(query)) score += 25;
					
					// Description contains query
					if (descLower.includes(query)) score += 10;
					
					return { preset: r, score };
				})
				.filter(item => item.score > 0)
				.sort((a, b) => b.score - a.score || a.preset.name.localeCompare(b.preset.name));
			
			return scored.map(item => item.preset);
		}
		
		// Sort alphabetically by name when not searching
		return [...presets].sort((a, b) => a.name.localeCompare(b.name));
	});

	// Get display name for current filter
	const currentFilterName = $derived.by(() => {
		if (selectedFilter === 'all') return 'All';
		if (selectedFilter.startsWith('nh:')) {
			const nhType = selectedFilter.slice(3) as NeighborhoodType;
			return NEIGHBORHOODS[nhType]?.name ?? 'Unknown';
		}
		if (selectedFilter.startsWith('states:')) {
			const stateFilter = selectedFilter.slice(7);
			switch (stateFilter) {
				case '2': return 'Binary';
				case '3-4': return 'Short Trails';
				case '5-8': return 'Medium Trails';
				case '9+': return 'Long Trails';
				default: return 'All';
			}
		}
		return RULE_CATEGORIES.find(c => c.id === selectedFilter)?.name ?? 'All';
	});

	// Count rules for each filter (for display in dropdown) - uses grid-filtered presets
	function getFilterCount(filter: string): number {
		return getFilteredRulesForGridType(filter, gridFilteredPresets).length;
	}

	// Precompute counts for all filters - reactive to grid type
	const filterCounts = $derived.by(() => {
		const presets = gridFilteredPresets;
		const getCount = (f: string) => getFilteredRulesForGridType(f, presets).length;
		return {
			all: presets.length,
			// Categories
			...Object.fromEntries(RULE_CATEGORIES.map(c => [c.id, getCount(c.id)])),
			// Neighborhoods - only show counts for current grid type
			...(gridType === 'square' ? {
				'nh:moore': getCount('nh:moore'),
				'nh:vonNeumann': getCount('nh:vonNeumann'),
				'nh:extendedMoore': getCount('nh:extendedMoore'),
			} : {
				'nh:hexagonal': getCount('nh:hexagonal'),
			}),
			// States
			'states:2': getCount('states:2'),
			'states:3-4': getCount('states:3-4'),
			'states:5-8': getCount('states:5-8'),
			'states:9+': getCount('states:9+'),
		};
	});

	function getBirthMask(): number {
		return birthToggles.reduce((mask, on, i) => (on ? mask | (1 << i) : mask), 0);
	}

	function getSurviveMask(): number {
		return surviveToggles.reduce((mask, on, i) => (on ? mask | (1 << i) : mask), 0);
	}

	function ensureRuleSnapshot() {
		if (!wasRuleEditorSnapshotTaken()) {
			const sim = getSimulationRef();
			sim?.snapshotUndo().then(() => {
				markRuleEditorSnapshotTaken();
			}).catch(() => {});
		}
	}

	onMount(() => {
	resetRuleEditorSession();
	const sim = getSimulationRef();
	if (sim) {
		sim.getCellDataAsync().then(setRuleEditorPreSnapshot).catch(() => {});
	}
		if (previewCanvas) {
			previewCtx = previewCanvas.getContext('2d');
			randomizePreview();
		}
	});

	onDestroy(() => {
		if (previewAnimationId) cancelAnimationFrame(previewAnimationId);
	resetRuleEditorSession();
	});

	// Re-render preview when theme or color changes
	$effect(() => {
		// Track theme and color changes
		simState.isLightTheme;
		simState.aliveColor;
		// Re-render if we have a context
		if (previewCtx) {
			renderPreview();
		}
	});

	// Reinitialize preview grid when neighborhood changes (grid size changes for hex)
	let lastNeighborhood: NeighborhoodType | null = null;
	$effect(() => {
		// Track neighborhood changes
		const currentNeighborhood = neighborhood;
		if (lastNeighborhood !== null && lastNeighborhood !== currentNeighborhood) {
			// Neighborhood changed, reinitialize preview grid
			randomizePreview();
		}
		lastNeighborhood = currentNeighborhood;
	});

	// Scroll to selected preset when dropdown opens
	$effect(() => {
		if (dropdownOpen && presetListRef) {
			// Use requestAnimationFrame to ensure DOM is updated
			requestAnimationFrame(() => {
				const selectedItem = presetListRef?.querySelector('.dropdown-item.selected') as HTMLElement;
				if (selectedItem) {
					selectedItem.scrollIntoView({ block: 'center', behavior: 'instant' });
				}
			});
		}
	});

	// Re-randomize preview when numStates changes between 2-state and multi-state
	// This ensures the preview shows the spectrum correctly
	let lastNumStatesWasMulti: boolean | null = null;
	$effect(() => {
		const isMultiState = numStates > 2;
		if (lastNumStatesWasMulti !== null && lastNumStatesWasMulti !== isMultiState) {
			// Switched between 2-state and multi-state, re-randomize
			randomizePreview();
		}
		lastNumStatesWasMulti = isMultiState;
	});

	function randomizePreview() {
		const gridSize = PREVIEW_SIZE_X * previewSizeY;
		const density = 0.3; // 30% density like the main simulation
		
		previewGrid = Array.from({ length: gridSize }, () => {
			if (Math.random() < density) {
				if (numStates > 2) {
					// For multi-state rules, distribute across all states
					// Same logic as the main simulation
					const rand = Math.random();
					if (rand < 0.5) {
						// 50% chance of being fully alive
						return 1;
					} else {
						// 50% chance of being in a dying state (2 to numStates-1)
						// Weighted towards earlier dying states (more colorful)
						const dyingStates = numStates - 2;
						const weightedRand = Math.pow(Math.random(), 1.5);
						const dyingState = 2 + Math.floor(weightedRand * dyingStates);
						return Math.min(dyingState, numStates - 1);
					}
				} else {
					// Simple alive for 2-state rules
					return 1;
				}
			}
			return 0;
		});
		previewNextGrid = new Array(gridSize).fill(0);
		renderPreview();
	}

	// Count neighbors based on neighborhood type
	function countNeighbors(x: number, y: number): number {
		let count = 0;
		const sizeX = PREVIEW_SIZE_X;
		const sizeY = previewSizeY;
		
		if (neighborhood === 'vonNeumann') {
			// 4 orthogonal neighbors
			const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
			for (const [dx, dy] of dirs) {
				const nx = (x + dx + sizeX) % sizeX;
				const ny = (y + dy + sizeY) % sizeY;
				if (previewGrid[ny * sizeX + nx] === 1) count++;
			}
		} else if (neighborhood === 'extendedMoore') {
			// 24 neighbors (5x5 minus center)
			for (let dy = -2; dy <= 2; dy++) {
				for (let dx = -2; dx <= 2; dx++) {
					if (dx === 0 && dy === 0) continue;
					const nx = (x + dx + sizeX) % sizeX;
					const ny = (y + dy + sizeY) % sizeY;
					if (previewGrid[ny * sizeX + nx] === 1) count++;
				}
			}
		} else if (neighborhood === 'hexagonal' || neighborhood === 'extendedHexagonal') {
			// Hexagonal grid (odd-r offset coordinates)
			const isOddRow = (y & 1) === 1;
			
			// Ring 1: 6 immediate neighbors
			const ring1 = isOddRow
				? [[0, -1], [1, -1], [-1, 0], [1, 0], [0, 1], [1, 1]]  // odd row
				: [[-1, -1], [0, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]]; // even row
			
			for (const [dx, dy] of ring1) {
				const nx = (x + dx + sizeX) % sizeX;
				const ny = (y + dy + sizeY) % sizeY;
				if (previewGrid[ny * sizeX + nx] === 1) count++;
			}
			
			// Ring 2: 12 outer neighbors (only for extended hexagonal)
			if (neighborhood === 'extendedHexagonal') {
				// Row y-2 (2 cells)
				const isOddRowM1 = ((y - 1) & 1) === 1;
				if (isOddRowM1) {
					// y-2 is even row
					const offsets = [[0, -2], [1, -2]];
					for (const [dx, dy] of offsets) {
						const nx = (x + dx + sizeX) % sizeX;
						const ny = (y + dy + sizeY) % sizeY;
						if (previewGrid[ny * sizeX + nx] === 1) count++;
					}
				} else {
					// y-2 is odd row
					const offsets = [[-1, -2], [0, -2]];
					for (const [dx, dy] of offsets) {
						const nx = (x + dx + sizeX) % sizeX;
						const ny = (y + dy + sizeY) % sizeY;
						if (previewGrid[ny * sizeX + nx] === 1) count++;
					}
				}
				
				// Row y-1 outer cells (2 cells)
				if (isOddRow) {
					const offsets = [[-1, -1], [2, -1]];
					for (const [dx, dy] of offsets) {
						const nx = (x + dx + sizeX) % sizeX;
						const ny = (y + dy + sizeY) % sizeY;
						if (previewGrid[ny * sizeX + nx] === 1) count++;
					}
				} else {
					const offsets = [[-2, -1], [1, -1]];
					for (const [dx, dy] of offsets) {
						const nx = (x + dx + sizeX) % sizeX;
						const ny = (y + dy + sizeY) % sizeY;
						if (previewGrid[ny * sizeX + nx] === 1) count++;
					}
				}
				
				// Row y far left/right (2 cells)
				const rowYOffsets = [[-2, 0], [2, 0]];
				for (const [dx, dy] of rowYOffsets) {
					const nx = (x + dx + sizeX) % sizeX;
					const ny = (y + dy + sizeY) % sizeY;
					if (previewGrid[ny * sizeX + nx] === 1) count++;
				}
				
				// Row y+1 outer cells (2 cells)
				if (isOddRow) {
					const offsets = [[-1, 1], [2, 1]];
					for (const [dx, dy] of offsets) {
						const nx = (x + dx + sizeX) % sizeX;
						const ny = (y + dy + sizeY) % sizeY;
						if (previewGrid[ny * sizeX + nx] === 1) count++;
					}
				} else {
					const offsets = [[-2, 1], [1, 1]];
					for (const [dx, dy] of offsets) {
						const nx = (x + dx + sizeX) % sizeX;
						const ny = (y + dy + sizeY) % sizeY;
						if (previewGrid[ny * sizeX + nx] === 1) count++;
					}
				}
				
				// Row y+2 (2 cells)
				const isOddRowP1 = ((y + 1) & 1) === 1;
				if (isOddRowP1) {
					// y+2 is even row
					const offsets = [[0, 2], [1, 2]];
					for (const [dx, dy] of offsets) {
						const nx = (x + dx + sizeX) % sizeX;
						const ny = (y + dy + sizeY) % sizeY;
						if (previewGrid[ny * sizeX + nx] === 1) count++;
					}
				} else {
					// y+2 is odd row
					const offsets = [[-1, 2], [0, 2]];
					for (const [dx, dy] of offsets) {
						const nx = (x + dx + sizeX) % sizeX;
						const ny = (y + dy + sizeY) % sizeY;
						if (previewGrid[ny * sizeX + nx] === 1) count++;
					}
				}
			}
		} else {
			// Moore: 8 neighbors
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
		const birthMask = getBirthMask();
		const surviveMask = getSurviveMask();
		const sizeX = PREVIEW_SIZE_X;
		const sizeY = previewSizeY;

		for (let y = 0; y < sizeY; y++) {
			for (let x = 0; x < sizeX; x++) {
				const idx = y * sizeX + x;
				const state = previewGrid[idx];
				const neighbors = countNeighbors(x, y);

				if (state === 0) {
					previewNextGrid[idx] = (birthMask & (1 << neighbors)) !== 0 ? 1 : 0;
				} else if (state === 1) {
					if ((surviveMask & (1 << neighbors)) !== 0) {
						previewNextGrid[idx] = 1;
					} else {
						previewNextGrid[idx] = numStates > 2 ? 2 : 0;
					}
				} else {
					previewNextGrid[idx] = state + 1 >= numStates ? 0 : state + 1;
				}
			}
		}

		[previewGrid, previewNextGrid] = [previewNextGrid, previewGrid];
		renderPreview();
	}

	function renderPreview() {
		if (!previewCtx) return;
		
		// Clear canvas
		previewCtx.fillStyle = simState.isLightTheme ? '#f0f0f3' : '#0a0a0f';
		previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

		if (isHexNeighborhood) {
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
		// For hexagonal grids, we have more rows (previewSizeY) to fill the visual space
		// The hex width determines the horizontal spacing
		// The hex height (width * sqrt(3)/2) determines vertical spacing
		const hexWidth = previewCanvas.width / (sizeX + 0.5);
		const hexHeight = hexWidth * HEX_HEIGHT_RATIO;
		const hexRadius = hexWidth / 2;

		for (let y = 0; y < sizeY; y++) {
			for (let x = 0; x < sizeX; x++) {
				const state = previewGrid[y * sizeX + x];
				
				// Calculate hex center position
				const isOddRow = (y & 1) === 1;
				const centerX = (x + 0.5) * hexWidth + (isOddRow ? hexWidth / 2 : 0);
				const centerY = (y + 0.5) * hexHeight;
				
				// Draw hex
				previewCtx.fillStyle = state > 0 ? getStateColor(state) : (simState.isLightTheme ? '#f0f0f3' : '#0a0a0f');
				drawHexagon(previewCtx, centerX, centerY, hexRadius * 0.95);
			}
		}
	}

	function drawHexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
		ctx.beginPath();
		for (let i = 0; i < 6; i++) {
			// Pointy-top hexagon (rotate by 30 degrees)
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
		const bg = isLight ? [0.95, 0.95, 0.97] : [0.05, 0.05, 0.08];
		
		if (state === 0) {
			return `rgb(${Math.round(bg[0] * 255)}, ${Math.round(bg[1] * 255)}, ${Math.round(bg[2] * 255)})`;
		}
		
		if (state === 1 || numStates === 2) {
			return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
		}
		
		const dyingProgress = (state - 1) / (numStates - 1);
		const aliveHsl = rgbToHsl(r, g, b);
		
		let dyingHue = aliveHsl[0] + 0.25 * dyingProgress;
		if (dyingHue > 1) dyingHue -= 1;
		
		const satCurve = 1 - dyingProgress * dyingProgress;
		const dyingSat = aliveHsl[1] * Math.max(satCurve, 0.2);
		
		let dyingLight: number;
		if (isLight) {
			dyingLight = aliveHsl[2] + (0.35 - aliveHsl[2]) * dyingProgress * 0.8;
		} else {
			dyingLight = aliveHsl[2] + (0.15 - aliveHsl[2]) * dyingProgress * dyingProgress;
		}
		
		const dyingRgb = hslToRgb(dyingHue, dyingSat, dyingLight);
		const bgBlend = dyingProgress * dyingProgress * dyingProgress * 0.6;
		const finalR = Math.round((dyingRgb[0] * (1 - bgBlend) + bg[0] * bgBlend) * 255);
		const finalG = Math.round((dyingRgb[1] * (1 - bgBlend) + bg[1] * bgBlend) * 255);
		const finalB = Math.round((dyingRgb[2] * (1 - bgBlend) + bg[2] * bgBlend) * 255);
		
		return `rgb(${finalR}, ${finalG}, ${finalB})`;
	}

	function togglePreviewPlay() {
		previewPlaying = !previewPlaying;
		if (previewPlaying) runPreviewLoop();
	}

	function runPreviewLoop() {
		if (!previewPlaying) return;
		const now = performance.now();
		if (now - lastPreviewStep > 120) {
			stepPreview();
			lastPreviewStep = now;
		}
		previewAnimationId = requestAnimationFrame(runPreviewLoop);
	}

	function updateRuleString() {
		// Collect active neighbor counts
		const birthNums: number[] = [];
		const surviveNums: number[] = [];
		for (let i = 0; i <= maxNeighbors; i++) {
			if (birthToggles[i]) birthNums.push(i);
			if (surviveToggles[i]) surviveNums.push(i);
		}
		
		// Format neighbor specs - use comma separation if any number >= 10
		const formatSpec = (nums: number[]): string => {
			if (nums.length === 0) return '';
			// Check if we need comma separation (any double-digit numbers)
			const needsCommas = nums.some(n => n >= 10);
			if (needsCommas) {
				return nums.join(',');
			}
			// Simple concatenation for single digits
			return nums.join('');
		};
		
		ruleString = `B${formatSpec(birthNums)}/S${formatSpec(surviveNums)}`;
		if (numStates > 2) ruleString += `/C${numStates}`;
		selectedPreset = RULE_PRESETS.findIndex((r) => r.ruleString === ruleString);
		error = '';
		
		// Apply changes to canvas immediately (live preview)
		applyToCanvas();
	}

	function selectPreset(index: number) {
		const preset = RULE_PRESETS[index];
		if (!preset) return;
		
		ruleString = preset.ruleString;
		numStates = preset.numStates;
		neighborhood = preset.neighborhood ?? 'moore';
		birthToggles = Array.from({ length: 25 }, (_, i) => !!(preset.birthMask & (1 << i)));
		surviveToggles = Array.from({ length: 25 }, (_, i) => !!(preset.surviveMask & (1 << i)));
		selectedPreset = index;
		error = '';
		
		// Apply vitality settings from the preset if present
		simState.setVitalitySettings(preset.vitality);
		
		randomizePreview();
		dropdownOpen = false;
		
		// Apply changes to canvas immediately (live preview)
		applyToCanvas();
	}

	function getFilteredRulesForGridType(filter: string, presets: CARule[]) {
		if (filter === 'all') return presets;
		if (filter.startsWith('nh:')) {
			const nhType = filter.slice(3);
			if (nhType === 'moore') {
				return presets.filter(r => !r.neighborhood || r.neighborhood === 'moore');
			}
			if (nhType === 'hexagonal') {
				// Hexagonal filter shows both hexagonal and extendedHexagonal
				return presets.filter(r => r.neighborhood === 'hexagonal' || r.neighborhood === 'extendedHexagonal');
			}
			return presets.filter(r => r.neighborhood === nhType);
		}
		if (filter.startsWith('states:')) {
			const stateFilter = filter.slice(7);
			switch (stateFilter) {
				case '2': return presets.filter(r => r.numStates === 2);
				case '3-4': return presets.filter(r => r.numStates >= 3 && r.numStates <= 4);
				case '5-8': return presets.filter(r => r.numStates >= 5 && r.numStates <= 8);
				case '9+': return presets.filter(r => r.numStates >= 9);
				default: return presets;
			}
		}
		return presets.filter(r => r.category === filter);
	}

	function selectFilter(filter: string) {
		selectedFilter = filter;
		persistedFilter = filter; // Persist across modal opens
		categoryDropdownOpen = false;
		
		// If current rule is not in filtered list, select the first filtered rule
		const filtered = getFilteredRulesForGridType(filter, gridFilteredPresets);
		
		const currentRuleInFiltered = filtered.some(r => 
			RULE_PRESETS.indexOf(r) === selectedPreset
		);
		
		if (!currentRuleInFiltered && filtered.length > 0) {
			selectPreset(RULE_PRESETS.indexOf(filtered[0]));
		}
	}
	
	// Handle grid type change
	function setGridType(type: GridType) {
		if (gridType === type) return;
		gridType = type;
		
		// Reset filter to 'all' when switching grid types
		selectedFilter = 'all';
		persistedFilter = 'all';
		
		// Update neighborhood to be compatible with new grid type
		if (type === 'hexagonal') {
			neighborhood = 'hexagonal';
		} else {
			neighborhood = 'moore';
		}
		
		// Select first rule of new grid type
		const newPresets = type === 'hexagonal' 
			? RULE_PRESETS.filter(r => r.neighborhood === 'hexagonal' || r.neighborhood === 'extendedHexagonal')
			: RULE_PRESETS.filter(r => r.neighborhood !== 'hexagonal' && r.neighborhood !== 'extendedHexagonal');
		
		if (newPresets.length > 0) {
			selectPreset(RULE_PRESETS.indexOf(newPresets[0]));
		}
	}

	function selectNeighborhood(nh: NeighborhoodType) {
		neighborhood = nh;
		// Clear toggles beyond new max
		const newMax = NEIGHBORHOODS[nh].maxNeighbors;
		birthToggles = birthToggles.map((v, i) => i <= newMax ? v : false);
		surviveToggles = surviveToggles.map((v, i) => i <= newMax ? v : false);
		updateRuleString();
		neighborhoodDropdownOpen = false;
	}

	function handleRuleStringChange(e: Event) {
		const input = e.target as HTMLInputElement;
		ruleString = input.value;
		const parsed = parseRule(ruleString);
		if (parsed) {
			birthToggles = Array.from({ length: 25 }, (_, i) => !!(parsed.birthMask & (1 << i)));
			surviveToggles = Array.from({ length: 25 }, (_, i) => !!(parsed.surviveMask & (1 << i)));
			numStates = parsed.numStates;
			selectedPreset = RULE_PRESETS.findIndex((r) => r.ruleString === parsed.ruleString);
			error = '';
			// Apply changes to canvas immediately (live preview)
			applyToCanvas();
		} else {
			error = 'Invalid';
		}
	}

	// Apply current settings to the canvas immediately (live preview)
	function applyToCanvas() {
		const parsed = parseRule(ruleString);
		if (!parsed) return; // Don't apply invalid rules
		
		ensureRuleSnapshot();
		markRuleEditorEdited();

		const preset = RULE_PRESETS.find((r) => r.ruleString === parsed.ruleString);
		const rule: CARule = { 
			...parsed, 
			name: preset?.name ?? 'Custom',
			neighborhood,
			category: preset?.category,
			description: preset?.description,
			density: preset?.density
		};
		
		simState.currentRule = rule;
		onrulechange(); // This will reset canvas only if neighborhood changed
	}
	
	// Called when user clicks the apply/checkmark button - just close, changes are already applied
	function applyRule() {
		const parsed = parseRule(ruleString);
		if (!parsed) { error = 'Invalid rule'; return; }
		const sim = getSimulationRef();
		if (sim && wasRuleEditorSnapshotTaken() && wasRuleEditorEdited()) {
			const before = getRuleEditorPreSnapshot();
			addSnapshotWithBefore(sim, before, 'Rule change', 'rule', getHeadId());
			sim.clearUndo();
		}
		resetRuleEditorSession();
		onclose();
	}
	
	// Called when user clicks the X button - revert to original rule
	function cancelAndClose() {
		const sim = getSimulationRef();
		if (sim && wasRuleEditorSnapshotTaken()) {
			if (wasRuleEditorEdited()) {
				sim.undoLast().catch(() => {});
			} else {
				sim.clearUndo();
			}
		}
		// Revert to the original rule
		simState.currentRule = originalRule;
		// Revert boundary mode
		simState.boundaryMode = originalBoundaryMode;
		// If neighborhood changed during editing, need to reset canvas back
		if (neighborhood !== originalNeighborhood) {
			onrulechange();
		} else {
			onrulechange(); // Still need to apply the reverted rule
		}
		resetRuleEditorSession();
		onclose();
	}

	function closeAllDropdowns() {
		dropdownOpen = false;
		categoryDropdownOpen = false;
		neighborhoodDropdownOpen = false;
		ruleSearchQuery = '';
		ruleSearchMode = false;
	}

	const currentPresetName = $derived(selectedPreset >= 0 ? RULE_PRESETS[selectedPreset].name : 'Custom');
	const currentNeighborhoodInfo = $derived(NEIGHBORHOODS[neighborhood]);
	
	// Short names for neighborhood display
	const neighborhoodShortName = $derived.by(() => {
		switch (neighborhood) {
			case 'moore': return 'Moore';
			case 'vonNeumann': return 'VN';
			case 'extendedMoore': return 'Ext';
			case 'hexagonal': return 'Hex';
			case 'extendedHexagonal': return 'Hex2';
			default: return 'Moore';
		}
	});

	// Calculate grid columns based on max neighbors
	const gridCols = $derived(neighborhood === 'extendedMoore' ? 5 : 3);
	const neighborNumbers = $derived(Array.from({ length: maxNeighbors + 1 }, (_, i) => i));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div class="modal-backdrop" onwheel={(e) => {
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
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div 
		class="editor" 
		style="z-index: {modalState.zIndex};"
		onclick={handleModalClick}
		use:draggable={{ 
			handle: '.header', 
			bounds: true,
			initialPosition: modalState.position,
			onDragEnd: handleDragEnd
		}}
	>
		<!-- Row 1: Title + Apply + Close -->
		<div class="header">
			<span class="title">
				<svg class="header-icon" viewBox="0 0 24 24" fill="currentColor">
					<!-- Bold italic f -->
					<path d="M16.5 3C14 3 12.5 4.5 11.8 7L10.5 11H7.5C7 11 6.5 11.4 6.5 12s.5 1 1 1h2.3l-1.6 5.5C7.7 20 6.8 21 5.5 21c-.5 0-.9-.1-1.2-.3-.4-.2-.9-.1-1.1.3-.2.4-.1.9.3 1.1.6.3 1.3.5 2 .5 2.5 0 4-1.5 4.8-4.2L12 13h3.5c.5 0 1-.4 1-1s-.5-1-1-1h-2.8l1.1-3.5C14.3 5.8 15.2 5 16.5 5c.4 0 .8.1 1.1.2.4.2.9 0 1.1-.4.2-.4 0-.9-.4-1.1-.6-.4-1.4-.7-2.3-.7z" />
				</svg>
				Rule Editor
			</span>
			<button class="apply-btn" onclick={applyRule} title="Apply rule">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
					<path d="M5 12l5 5L20 7" />
				</svg>
			</button>
			<button class="close-btn" onclick={cancelAndClose} aria-label="Close">✕</button>
		</div>

		<!-- Grid type toggle -->
		<div class="grid-type-toggle">
			<button 
				class="grid-type-btn" 
				class:active={gridType === 'square'} 
				onclick={() => setGridType('square')}
				title="Square grid (Moore, Von Neumann, Extended)"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<rect x="4" y="4" width="6" height="6" />
					<rect x="14" y="4" width="6" height="6" />
					<rect x="4" y="14" width="6" height="6" />
					<rect x="14" y="14" width="6" height="6" />
				</svg>
				Square
			</button>
			<button 
				class="grid-type-btn" 
				class:active={gridType === 'hexagonal'} 
				onclick={() => setGridType('hexagonal')}
				title="Hexagonal grid (6 or 18 neighbors)"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2z" />
				</svg>
				Hexagonal
			</button>
		</div>

		<!-- Row 2: Category, Preset, Neighborhood dropdowns -->
		<div class="selectors-row">
			<!-- Category/Filter dropdown -->
			<div class="dropdown-wrapper">
				<button class="select-btn" onclick={() => { closeAllDropdowns(); categoryDropdownOpen = true; }}>
					<span class="select-label">Type</span>
					<span class="select-value">{currentFilterName}</span>
					<svg class="chevron" class:open={categoryDropdownOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg>
				</button>
				{#if categoryDropdownOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="dropdown-backdrop" onclick={() => (categoryDropdownOpen = false)} onkeydown={() => {}}></div>
					<div class="dropdown-menu filter-menu">
						<button class="dropdown-item" class:selected={selectedFilter === 'all'} onclick={() => selectFilter('all')}>
							<span class="item-name">All Rules <span class="filter-count">[{filterCounts.all}]</span></span>
						</button>
						
						<div class="dropdown-divider"></div>
						<div class="dropdown-section">By Category</div>
						{#each RULE_CATEGORIES as cat}
							<button class="dropdown-item" class:selected={selectedFilter === cat.id} onclick={() => selectFilter(cat.id)}>
								<span class="item-name">{cat.name} <span class="filter-count">[{filterCounts[cat.id]}]</span></span>
								<span class="item-desc">{cat.description}</span>
							</button>
						{/each}
						
						<div class="dropdown-divider"></div>
						<div class="dropdown-section">By Neighborhood</div>
						{#if gridType === 'square'}
							<button class="dropdown-item" class:selected={selectedFilter === 'nh:moore'} onclick={() => selectFilter('nh:moore')}>
								<span class="item-name">Moore (8) <span class="filter-count">[{filterCounts['nh:moore']}]</span></span>
								<span class="item-desc">Standard 8-neighbor rules</span>
							</button>
							<button class="dropdown-item" class:selected={selectedFilter === 'nh:vonNeumann'} onclick={() => selectFilter('nh:vonNeumann')}>
								<span class="item-name">Von Neumann (4) <span class="filter-count">[{filterCounts['nh:vonNeumann']}]</span></span>
								<span class="item-desc">Orthogonal 4-neighbor rules</span>
							</button>
							<button class="dropdown-item" class:selected={selectedFilter === 'nh:extendedMoore'} onclick={() => selectFilter('nh:extendedMoore')}>
								<span class="item-name">Extended (24) <span class="filter-count">[{filterCounts['nh:extendedMoore']}]</span></span>
								<span class="item-desc">Large radius 24-neighbor rules</span>
							</button>
						{:else}
							<button class="dropdown-item" class:selected={selectedFilter === 'nh:hexagonal'} onclick={() => selectFilter('nh:hexagonal')}>
								<span class="item-name">Hexagonal <span class="filter-count">[{filterCounts['nh:hexagonal']}]</span></span>
								<span class="item-desc">All honeycomb grid rules (6 & 18 neighbors)</span>
							</button>
						{/if}
						
						<div class="dropdown-divider"></div>
						<div class="dropdown-section">By Trail Length</div>
						<button class="dropdown-item" class:selected={selectedFilter === 'states:2'} onclick={() => selectFilter('states:2')}>
							<span class="item-name">Binary (2) <span class="filter-count">[{filterCounts['states:2']}]</span></span>
							<span class="item-desc">Classic on/off, no trails</span>
						</button>
						<button class="dropdown-item" class:selected={selectedFilter === 'states:3-4'} onclick={() => selectFilter('states:3-4')}>
							<span class="item-name">Short (3-4) <span class="filter-count">[{filterCounts['states:3-4']}]</span></span>
							<span class="item-desc">Brief fading trails</span>
						</button>
						<button class="dropdown-item" class:selected={selectedFilter === 'states:5-8'} onclick={() => selectFilter('states:5-8')}>
							<span class="item-name">Medium (5-8) <span class="filter-count">[{filterCounts['states:5-8']}]</span></span>
							<span class="item-desc">Visible colorful trails</span>
						</button>
						<button class="dropdown-item" class:selected={selectedFilter === 'states:9+'} onclick={() => selectFilter('states:9+')}>
							<span class="item-name">Long (9+) <span class="filter-count">[{filterCounts['states:9+']}]</span></span>
							<span class="item-desc">Extended rainbow trails</span>
						</button>
					</div>
				{/if}
			</div>

			<!-- Preset dropdown -->
			<div class="dropdown-wrapper flex-1">
				<button class="select-btn" onclick={() => { closeAllDropdowns(); dropdownOpen = true; }}>
					<span class="select-label">Rule</span>
					<span class="select-value">{currentPresetName}</span>
					<svg class="chevron" class:open={dropdownOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg>
				</button>
				{#if dropdownOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="dropdown-backdrop" onclick={() => (dropdownOpen = false)} onkeydown={() => {}}></div>
					<div class="dropdown-menu preset-menu" onkeydown={(e) => {
						// On desktop, typing filters results
						if (!isMobile && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
							ruleSearchMode = true;
							ruleSearchQuery += e.key;
							e.preventDefault();
						} else if (e.key === 'Backspace' && ruleSearchMode) {
							ruleSearchQuery = ruleSearchQuery.slice(0, -1);
							if (!ruleSearchQuery) ruleSearchMode = false;
							e.preventDefault();
						} else if (e.key === 'Escape') {
							if (ruleSearchMode) {
								ruleSearchQuery = '';
								ruleSearchMode = false;
								e.preventDefault();
								e.stopPropagation();
							}
						}
					}}>
						<!-- Search bar -->
						<div class="search-bar" class:active={ruleSearchMode || ruleSearchQuery}>
							<svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="11" cy="11" r="8" />
								<path d="M21 21l-4.35-4.35" />
							</svg>
							<input 
								bind:this={ruleSearchInput}
								type="text" 
								class="search-input" 
								placeholder="Search rules..."
								bind:value={ruleSearchQuery}
								onfocus={() => ruleSearchMode = true}
							/>
							{#if ruleSearchQuery}
								<button class="search-clear" onclick={() => { ruleSearchQuery = ''; ruleSearchInput?.focus(); }} aria-label="Clear search">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M18 6L6 18M6 6l12 12" />
									</svg>
								</button>
							{/if}
						</div>
						
						<div class="preset-list" bind:this={presetListRef}>
							{#each filteredPresets as preset}
								{@const presetIndex = RULE_PRESETS.indexOf(preset)}
								<button class="dropdown-item" class:selected={selectedPreset === presetIndex} onclick={() => selectPreset(presetIndex)}>
									<span class="item-name">{preset.name}</span>
									<span class="item-code">{preset.ruleString}</span>
									{#if preset.description}
										<span class="item-desc">{preset.description}</span>
									{/if}
								</button>
							{:else}
								<div class="no-results">No rules found</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Neighborhood dropdown -->
			<div class="dropdown-wrapper">
				<button class="select-btn compact" onclick={() => { closeAllDropdowns(); neighborhoodDropdownOpen = true; }}>
					<span class="select-value">{neighborhoodShortName}</span>
					<span class="select-num">{currentNeighborhoodInfo.maxNeighbors}</span>
					<svg class="chevron" class:open={neighborhoodDropdownOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg>
				</button>
				{#if neighborhoodDropdownOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="dropdown-backdrop" onclick={() => (neighborhoodDropdownOpen = false)} onkeydown={() => {}}></div>
					<div class="dropdown-menu neighborhood-menu">
						{#each filteredNeighborhoods as nh}
							<button class="dropdown-item" class:selected={neighborhood === nh.type} onclick={() => selectNeighborhood(nh.type)}>
								<span class="item-name">{nh.name} ({nh.maxNeighbors})</span>
								<span class="item-desc">{nh.description}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Main content: Birth + Survive + Preview -->
		<div class="main-row">
			<div class="grid-col">
				<span class="label birth">Birth</span>
				<span class="hint">Dead → Alive</span>
				<div class="grid grid-{neighborhood}">
					{#each neighborNumbers as i}
						<label 
							class="cell" 
							class:on={birthToggles[i]}
							title={getNeighborDescription(i, true)}
						>
							<input type="checkbox" bind:checked={birthToggles[i]} onchange={updateRuleString} />
							{i}
						</label>
					{/each}
				</div>
			</div>

			<div class="grid-col">
				<span class="label survive">Survive</span>
				<span class="hint">Alive → Alive</span>
				<div class="grid grid-{neighborhood}">
					{#each neighborNumbers as i}
						<label 
							class="cell" 
							class:on={surviveToggles[i]}
							title={getNeighborDescription(i, false)}
						>
							<input type="checkbox" bind:checked={surviveToggles[i]} onchange={updateRuleString} />
							{i}
						</label>
					{/each}
				</div>
			</div>

			<div class="preview-col">
				<span class="label preview">Preview</span>
				<span class="hint">Live test</span>
				<div class="preview-area">
					<canvas bind:this={previewCanvas} width={108} height={108} class="canvas"></canvas>
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
						<button class="pbtn" onclick={randomizePreview} title="Reset">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v5h.6m14.8 2A8 8 0 004.6 9m0 0H9m11 11v-5h-.6m0 0a8 8 0 01-15.2-2M19.4 15H15" /></svg>
						</button>
					</div>
				</div>
			</div>
		</div>

		<!-- Footer: States + Rule String -->
		<div class="footer">
			<div class="states">
				<span class="foot-label">States</span>
				<input type="range" min="2" max="1024" bind:value={numStates} oninput={updateRuleString} />
				<span class="states-val">{numStates}</span>
			</div>
			<div class="rule-input">
				<span class="foot-label">Rule</span>
				<input type="text" value={ruleString} oninput={handleRuleStringChange} class:error={!!error} />
			</div>
			<button class="reinit-btn" onclick={onreinitialize} title="Re-initialize Grid (R)" aria-label="Re-initialize Grid">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<!-- Dice/random scatter icon - same as Initialize button -->
					<rect x="4" y="4" width="16" height="16" rx="2" />
					<circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
					<circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none" />
					<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
					<circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none" />
					<circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" />
				</svg>
			</button>
		</div>
		
		<!-- Boundary Mode -->
		<div class="boundary-section">
			<div class="boundary-header">
				<span class="boundary-label">Boundary</span>
				<span class="boundary-name">{currentBoundaryName}</span>
			</div>
			<div class="boundary-grid">
				{#each BOUNDARY_MODES as mode}
					<button 
						class="boundary-btn" 
						class:active={simState.boundaryMode === mode.id}
						onclick={() => selectBoundaryMode(mode.id)}
						title={mode.description}
						aria-label={mode.name}
					>
						<BoundaryIcon mode={mode.id} size={38} />
					</button>
				{/each}
			</div>
		</div>
		
		<!-- Vitality Influence -->
		{#if numStates > 2}
			<div class="vitality-section">
				<div class="vitality-header">
					<span class="vitality-label">Vitality</span>
				</div>
				<div class="vitality-modes">
					<!-- Off mode - standard behavior -->
					<button 
						class="vitality-mode-btn" 
						class:active={simState.vitalityMode === 'none'}
						onclick={() => { simState.vitalityMode = 'none'; }}
						title="Only fully alive cells count as neighbors"
					>
						<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
							<circle cx="10" cy="10" r="7" />
							<line x1="5" y1="5" x2="15" y2="15" />
						</svg>
						<span>Off</span>
					</button>
					
					<!-- Threshold (Cut) mode -->
					<button 
						class="vitality-mode-btn" 
						class:active={simState.vitalityMode === 'threshold'}
						onclick={() => { simState.vitalityMode = 'threshold'; }}
						title="Cells above vitality threshold count as alive"
					>
						<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
							<line x1="3" y1="14" x2="10" y2="14" />
							<line x1="10" y1="14" x2="10" y2="6" />
							<line x1="10" y1="6" x2="17" y2="6" />
						</svg>
						<span>Cut</span>
					</button>
					
					<!-- Ghost mode -->
					<button 
						class="vitality-mode-btn" 
						class:active={simState.vitalityMode === 'ghost'}
						onclick={() => { simState.vitalityMode = 'ghost'; }}
						title="Dying cells contribute fractionally based on vitality"
					>
						<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
							<path d="M10 3 Q6 3 6 8 L6 14 Q6 17 8 17 L8 15 L10 17 L12 15 L12 17 Q14 17 14 14 L14 8 Q14 3 10 3" />
							<circle cx="8" cy="9" r="1" fill="currentColor" />
							<circle cx="12" cy="9" r="1" fill="currentColor" />
						</svg>
						<span>Ghost</span>
					</button>
					
					<!-- Sigmoid (Soft) mode -->
					<button 
						class="vitality-mode-btn" 
						class:active={simState.vitalityMode === 'sigmoid'}
						onclick={() => { simState.vitalityMode = 'sigmoid'; }}
						title="Smooth S-curve transition between counting and not"
					>
						<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
							<path d="M3 15 Q7 15 10 10 Q13 5 17 5" />
						</svg>
						<span>Soft</span>
					</button>
					
					<!-- Decay mode -->
					<button 
						class="vitality-mode-btn" 
						class:active={simState.vitalityMode === 'decay'}
						onclick={() => { simState.vitalityMode = 'decay'; }}
						title="Power curve controls how fast influence falls off"
					>
						<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
							<path d="M3 5 Q5 5 7 7 Q10 11 14 14 L17 15" />
						</svg>
						<span>Decay</span>
					</button>
				</div>
				
				<!-- Sliders row - context-sensitive based on mode -->
				{#if simState.vitalityMode !== 'none'}
					<div class="vitality-sliders">
						{#if simState.vitalityMode === 'threshold'}
							<div class="vitality-slider-item">
								<span class="slider-label">Threshold</span>
								<input type="range" min="0" max="1" step="0.01" bind:value={simState.vitalityThreshold} />
								<span class="slider-value">{simState.vitalityThreshold.toFixed(2)}</span>
							</div>
						{:else if simState.vitalityMode === 'ghost'}
							<div class="vitality-slider-item">
								<span class="slider-label">Factor</span>
						<input type="range" min="-1" max="1" step="0.01" bind:value={simState.vitalityGhostFactor} />
								<span class="slider-value">{simState.vitalityGhostFactor.toFixed(2)}</span>
							</div>
						{:else if simState.vitalityMode === 'sigmoid'}
							<div class="vitality-slider-item">
								<span class="slider-label">Center</span>
								<input type="range" min="0" max="1" step="0.01" bind:value={simState.vitalityThreshold} />
								<span class="slider-value">{simState.vitalityThreshold.toFixed(2)}</span>
							</div>
							<div class="vitality-slider-item">
								<span class="slider-label">Sharp</span>
								<input type="range" min="1" max="20" step="0.5" bind:value={simState.vitalitySigmoidSharpness} />
								<span class="slider-value">{simState.vitalitySigmoidSharpness.toFixed(1)}</span>
							</div>
						{:else if simState.vitalityMode === 'decay'}
							<div class="vitality-slider-item">
								<span class="slider-label">Factor</span>
						<input type="range" min="-1" max="1" step="0.01" bind:value={simState.vitalityGhostFactor} />
								<span class="slider-value">{simState.vitalityGhostFactor.toFixed(2)}</span>
							</div>
							<div class="vitality-slider-item">
								<span class="slider-label">Curve</span>
								<input type="range" min="0.5" max="3" step="0.1" bind:value={simState.vitalityDecayPower} />
								<span class="slider-value">{simState.vitalityDecayPower.toFixed(1)}</span>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
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
		pointer-events: none; /* Allow clicks to pass through to canvas */
	}

	.editor {
		background: var(--ui-bg, rgba(12, 12, 18, 0.9));
		backdrop-filter: blur(16px);
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 12px;
		padding: 0.8rem;
		display: flex;
		pointer-events: auto; /* But capture clicks on the editor itself */
		flex-direction: column;
		gap: 0.6rem;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
		max-width: 520px;
		/* Draggable support */
		position: relative;
		will-change: transform;
	}

	.editor:global(.dragging) {
		box-shadow: 0 16px 64px rgba(0, 0, 0, 0.5);
	}

	/* Header */
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.title {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--ui-text-hover, #e0e0e0);
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.header-icon {
		width: 18px;
		height: 18px;
		color: var(--ui-accent, #33e6f2);
		flex-shrink: 0;
	}

	.apply-btn {
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

	.apply-btn:hover {
		background: var(--ui-accent-bg-hover, rgba(45, 212, 191, 0.25));
		border-color: var(--ui-accent, #2dd4bf);
		transform: scale(1.05);
	}

	.apply-btn svg {
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
		background: var(--ui-border, rgba(255,255,255,0.1)); 
		color: var(--ui-text-hover, #fff); 
	}

	/* Grid type toggle */
	.grid-type-toggle {
		display: flex;
		gap: 0.4rem;
	}

	.grid-type-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.5rem 0.8rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 6px;
		color: var(--ui-text, #888);
		font-size: 0.7rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.grid-type-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		border-color: var(--ui-border-hover, rgba(255, 255, 255, 0.2));
		color: var(--ui-text-hover, #ccc);
	}

	.grid-type-btn.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.4));
		color: var(--ui-accent, #2dd4bf);
	}

	.grid-type-btn svg {
		width: 16px;
		height: 16px;
	}

	/* Selectors row */
	.selectors-row {
		display: flex;
		align-items: stretch;
		gap: 0.5rem;
	}

	.dropdown-wrapper {
		position: relative;
		display: flex;
	}

	.dropdown-wrapper.flex-1 {
		flex: 1;
	}

	.select-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.6rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 5px;
		color: var(--ui-text-hover, #ccc);
		font-size: 0.7rem;
		cursor: pointer;
		width: 100%;
		text-align: left;
	}

	.select-btn .select-value {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Ensure chevron is always at the far right */
	.select-btn .chevron {
		margin-left: auto;
	}

	.select-btn:hover { 
		border-color: var(--ui-border-hover, rgba(255, 255, 255, 0.2)); 
	}

	.select-btn.compact {
		padding: 0.4rem 0.5rem;
		gap: 0.3rem;
	}

	.select-num {
		color: var(--ui-accent, #2dd4bf);
		font-family: 'SF Mono', Monaco, monospace;
		font-size: 0.65rem;
	}

	.select-label {
		font-size: 0.55rem;
		color: var(--ui-text, #666);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.select-value {
		color: var(--ui-text-hover, #e0e0e0);
		font-weight: 500;
	}

	.select-code {
		margin-left: auto;
		color: var(--ui-accent, #2dd4bf);
		font-family: 'SF Mono', Monaco, monospace;
		font-size: 0.65rem;
	}

	.chevron {
		width: 12px;
		height: 12px;
		color: var(--ui-text, #666);
		transition: transform 0.15s;
		flex-shrink: 0;
	}

	.chevron.open { transform: rotate(180deg); }

	.dropdown-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10;
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		min-width: 100%;
		background: var(--ui-bg, rgba(16, 16, 24, 0.98));
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.15));
		border-radius: 6px;
		max-height: 220px;
		overflow-y: auto;
		z-index: 20;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
	}

	/* Theme-aware scrollbar for dropdowns */
	.dropdown-menu::-webkit-scrollbar {
		width: 6px;
	}

	.dropdown-menu::-webkit-scrollbar-track {
		background: transparent;
	}

	.dropdown-menu::-webkit-scrollbar-thumb {
		background: var(--ui-border, rgba(255, 255, 255, 0.2));
		border-radius: 3px;
	}

	.dropdown-menu::-webkit-scrollbar-thumb:hover {
		background: var(--ui-text, rgba(255, 255, 255, 0.3));
	}

	.preset-menu {
		min-width: 280px;
		max-width: 320px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.search-bar {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.2));
	}

	.search-bar.active {
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
	}

	.search-icon {
		width: 14px;
		height: 14px;
		color: var(--ui-text, #888);
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: var(--ui-text-hover, #fff);
		font-size: 0.75rem;
		padding: 0.2rem 0;
		min-width: 0;
	}

	.search-input::placeholder {
		color: var(--ui-text, #666);
	}

	.search-clear {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 50%;
		color: var(--ui-text, #888);
		cursor: pointer;
		flex-shrink: 0;
	}

	.search-clear:hover {
		background: rgba(255, 255, 255, 0.2);
		color: #fff;
	}

	.search-clear svg {
		width: 10px;
		height: 10px;
	}

	.preset-list {
		overflow-y: auto;
		max-height: 180px;
	}

	/* Theme-aware scrollbar for preset list */
	.preset-list::-webkit-scrollbar {
		width: 6px;
	}

	.preset-list::-webkit-scrollbar-track {
		background: transparent;
	}

	.preset-list::-webkit-scrollbar-thumb {
		background: var(--ui-border, rgba(255, 255, 255, 0.2));
		border-radius: 3px;
	}

	.preset-list::-webkit-scrollbar-thumb:hover {
		background: var(--ui-text, rgba(255, 255, 255, 0.3));
	}

	.no-results {
		padding: 1rem;
		text-align: center;
		color: var(--ui-text, #666);
		font-size: 0.75rem;
	}

	.filter-menu {
		min-width: 180px;
	}

	.neighborhood-menu {
		min-width: 200px;
		right: 0;
		left: auto;
	}

	.dropdown-divider {
		height: 1px;
		background: var(--ui-border, rgba(255, 255, 255, 0.1));
		margin: 0.3rem 0;
	}

	.dropdown-section {
		padding: 0.3rem 0.7rem;
		font-size: 0.55rem;
		color: var(--ui-text, #666);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.filter-count {
		color: var(--ui-accent, #2dd4bf);
		font-weight: 500;
		margin-left: 0.2rem;
	}

	.dropdown-item {
		width: 100%;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem;
		padding: 0.5rem 0.7rem;
		background: transparent;
		border: none;
		color: var(--ui-text-hover, #d0d0d0);
		font-size: 0.7rem;
		cursor: pointer;
		text-align: left;
		overflow: hidden;
	}

	.dropdown-item:hover { 
		background: var(--ui-bg-hover, rgba(255, 255, 255, 0.08)); 
		color: var(--ui-text-hover, #fff); 
	}

	.dropdown-item.selected { 
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15)); 
		color: var(--ui-accent, #2dd4bf); 
	}

	.item-name {
		font-weight: 500;
	}

	.item-code {
		margin-left: auto;
		font-family: 'SF Mono', Monaco, monospace;
		font-size: 0.6rem;
		color: var(--ui-text, #888);
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex-shrink: 1;
	}

	.dropdown-item.selected .item-code {
		color: var(--ui-accent, #2dd4bf);
		opacity: 0.8;
	}

	.item-desc {
		width: 100%;
		font-size: 0.55rem;
		color: var(--ui-text, #666);
		margin-top: 0.1rem;
		text-align: left;
	}

	.dropdown-item.selected .item-desc {
		color: var(--ui-accent, #2dd4bf);
		opacity: 0.6;
	}

	/* Main row */
	.main-row {
		display: flex;
		justify-content: center;
		gap: 1.2rem;
		padding: 0.3rem 0;
		flex-wrap: nowrap; /* Never wrap - scale down instead */
	}

	.grid-col, .preview-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		flex-shrink: 0;
	}

	.label {
		font-size: 0.7rem;
		font-weight: 600;
	}

	.label.birth { color: #4ade80; }
	.label.survive { color: #60a5fa; }
	.label.preview { color: var(--ui-accent, #f472b6); }

	.hint {
		font-size: 0.5rem;
		color: var(--ui-text, #555);
		text-transform: uppercase;
		letter-spacing: 0.03em;
		margin-bottom: 0.15rem;
	}

	/* Grid - fixed 108px to match preview canvas */
	.grid {
		display: grid;
		gap: 2px;
		width: 108px;
		height: 108px;
		flex-shrink: 0;
	}

	/* Moore: 9 cells in 3x3, each ~35px */
	.grid.grid-moore {
		grid-template-columns: repeat(3, 1fr);
		grid-template-rows: repeat(3, 1fr);
	}

	/* Von Neumann: 5 cells - 3 on top row, 2 on bottom */
	.grid.grid-vonNeumann {
		grid-template-columns: repeat(3, 1fr);
		grid-template-rows: repeat(2, 1fr);
	}

	/* Extended Moore: 25 cells in 5x5, each ~20px */
	.grid.grid-extendedMoore {
		grid-template-columns: repeat(5, 1fr);
		grid-template-rows: repeat(5, 1fr);
	}

	/* Hexagonal: 7 cells in honeycomb pattern (0-6)
	   Visual layout (pointy-top hexagons):
	        1   2
	      3   0   4
	        5   6
	   
	   For uniform spacing in a honeycomb:
	   - Horizontal distance between adjacent hex centers = hex_width
	   - Vertical distance between row centers = hex_width * sqrt(3)/2 ≈ hex_width * 0.866
	   - Staggered rows are offset by hex_width / 2
	*/
	.grid.grid-hexagonal {
		/* Size hexagons to match preview canvas height (108px) */
		--hex-w: 35px;
		/* Gap between hexagons (edge to edge) */
		--hex-gap: 4px;
		/* Center-to-center horizontal distance */
		--hex-dx: calc(var(--hex-w) + var(--hex-gap));
		/* Center-to-center vertical distance (sqrt(3)/2 of dx for equilateral spacing) */
		--hex-dy: calc(var(--hex-dx) * 0.866);
		/* Pointy-top hex height = width * 2/sqrt(3) ≈ width * 1.1547 */
		--hex-h: calc(var(--hex-w) * 1.1547);
		
		display: block;
		position: relative;
		/* Container: 3 columns wide, 3 rows tall */
		width: calc(var(--hex-dx) * 2 + var(--hex-w));
		height: calc(var(--hex-dy) * 2 + var(--hex-h));
	}

	/* Hexagonal cells - pointy-top hexagon shape */
	.grid.grid-hexagonal .cell {
		position: absolute;
		width: var(--hex-w);
		height: var(--hex-h);
		/* Pointy-top hexagon clip-path */
		clip-path: polygon(
			50% 0%,
			100% 25%,
			100% 75%,
			50% 100%,
			0% 75%,
			0% 25%
		);
		border-radius: 0;
		border: none;
		/* Remove transform - use direct positioning */
	}

	/* Honeycomb positioning with mathematically uniform spacing
	   All adjacent hexagons have the same center-to-center distance
	   
	   Neighbor count layout (clockwise from top-right, 0 in center):
	        6   1
	      5   0   2
	        4   3
	   
	   This mirrors how numbers increase clockwise starting from top-right,
	   similar to a clock face, with 0 (no neighbors) at the center.
	   
	   Grid coordinates (col, row) where center is (1, 1):
	   Row 0 (top):    (0.5, 0) and (1.5, 0) - half-offset
	   Row 1 (middle): (0, 1), (1, 1), (2, 1)
	   Row 2 (bottom): (0.5, 2) and (1.5, 2) - half-offset
	*/
	
	/* 0 (center) - no neighbors */
	.grid.grid-hexagonal .cell:nth-child(1) {
		left: calc(var(--hex-dx) * 1);
		top: calc(var(--hex-dy) * 1);
	}
	/* 1 (top-right) - 1 neighbor */
	.grid.grid-hexagonal .cell:nth-child(2) {
		left: calc(var(--hex-dx) * 1.5);
		top: calc(var(--hex-dy) * 0);
	}
	/* 2 (right) - 2 neighbors */
	.grid.grid-hexagonal .cell:nth-child(3) {
		left: calc(var(--hex-dx) * 2);
		top: calc(var(--hex-dy) * 1);
	}
	/* 3 (bottom-right) - 3 neighbors */
	.grid.grid-hexagonal .cell:nth-child(4) {
		left: calc(var(--hex-dx) * 1.5);
		top: calc(var(--hex-dy) * 2);
	}
	/* 4 (bottom-left) - 4 neighbors */
	.grid.grid-hexagonal .cell:nth-child(5) {
		left: calc(var(--hex-dx) * 0.5);
		top: calc(var(--hex-dy) * 2);
	}
	/* 5 (left) - 5 neighbors */
	.grid.grid-hexagonal .cell:nth-child(6) {
		left: calc(var(--hex-dx) * 0);
		top: calc(var(--hex-dy) * 1);
	}
	/* 6 (top-left) - 6 neighbors (all) */
	.grid.grid-hexagonal .cell:nth-child(7) {
		left: calc(var(--hex-dx) * 0.5);
		top: calc(var(--hex-dy) * 0);
	}

	/* Extended Hexagonal: 19 cells in 2-ring honeycomb pattern (0-18)
	   Visual layout (neighbor counts, clockwise from top-right):
	   
	         16  17  18        (row -2: 3 cells)
	       15   6   1   7      (row -1: 4 cells)
	     14   5   0   2   8    (row  0: 5 cells, center)
	       13   4   3   9      (row +1: 4 cells)
	         12  11  10        (row +2: 3 cells)
	   
	   Ring 0: 0 (center)
	   Ring 1: 1-6 (clockwise from top-right)
	   Ring 2: 7-18 (clockwise from top-right)
	*/
	.grid.grid-extendedHexagonal {
		/* Size hexagons to match preview canvas height (108px) */
		--hex-w: 22px;
		--hex-gap: 2px;
		--hex-dx: calc(var(--hex-w) + var(--hex-gap));
		--hex-dy: calc(var(--hex-dx) * 0.866);
		--hex-h: calc(var(--hex-w) * 1.1547);
		
		display: block;
		position: relative;
		/* Container: 5 columns wide, 5 rows tall */
		width: calc(var(--hex-dx) * 4 + var(--hex-w));
		height: calc(var(--hex-dy) * 4 + var(--hex-h));
	}

	.grid.grid-extendedHexagonal .cell {
		position: absolute;
		width: var(--hex-w);
		height: var(--hex-h);
		clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
		border-radius: 0;
		border: none;
		font-size: 0.5rem;
	}

	/* Center (0) - row 0, col 2 */
	.grid.grid-extendedHexagonal .cell:nth-child(1) {
		left: calc(var(--hex-dx) * 2);
		top: calc(var(--hex-dy) * 2);
	}
	
	/* Ring 1: 1-6 clockwise from top-right */
	/* 1 (top-right of center) - row -1, col 2.5 */
	.grid.grid-extendedHexagonal .cell:nth-child(2) {
		left: calc(var(--hex-dx) * 2.5);
		top: calc(var(--hex-dy) * 1);
	}
	/* 2 (right of center) - row 0, col 3 */
	.grid.grid-extendedHexagonal .cell:nth-child(3) {
		left: calc(var(--hex-dx) * 3);
		top: calc(var(--hex-dy) * 2);
	}
	/* 3 (bottom-right of center) - row +1, col 2.5 */
	.grid.grid-extendedHexagonal .cell:nth-child(4) {
		left: calc(var(--hex-dx) * 2.5);
		top: calc(var(--hex-dy) * 3);
	}
	/* 4 (bottom-left of center) - row +1, col 1.5 */
	.grid.grid-extendedHexagonal .cell:nth-child(5) {
		left: calc(var(--hex-dx) * 1.5);
		top: calc(var(--hex-dy) * 3);
	}
	/* 5 (left of center) - row 0, col 1 */
	.grid.grid-extendedHexagonal .cell:nth-child(6) {
		left: calc(var(--hex-dx) * 1);
		top: calc(var(--hex-dy) * 2);
	}
	/* 6 (top-left of center) - row -1, col 1.5 */
	.grid.grid-extendedHexagonal .cell:nth-child(7) {
		left: calc(var(--hex-dx) * 1.5);
		top: calc(var(--hex-dy) * 1);
	}
	
	/* Ring 2: 7-18 clockwise from top-right */
	/* 7 (far top-right) - row -1, col 3.5 */
	.grid.grid-extendedHexagonal .cell:nth-child(8) {
		left: calc(var(--hex-dx) * 3.5);
		top: calc(var(--hex-dy) * 1);
	}
	/* 8 (far right) - row 0, col 4 */
	.grid.grid-extendedHexagonal .cell:nth-child(9) {
		left: calc(var(--hex-dx) * 4);
		top: calc(var(--hex-dy) * 2);
	}
	/* 9 (right-bottom) - row +1, col 3.5 */
	.grid.grid-extendedHexagonal .cell:nth-child(10) {
		left: calc(var(--hex-dx) * 3.5);
		top: calc(var(--hex-dy) * 3);
	}
	/* 10 (far bottom-right) - row +2, col 3 */
	.grid.grid-extendedHexagonal .cell:nth-child(11) {
		left: calc(var(--hex-dx) * 3);
		top: calc(var(--hex-dy) * 4);
	}
	/* 11 (bottom) - row +2, col 2 */
	.grid.grid-extendedHexagonal .cell:nth-child(12) {
		left: calc(var(--hex-dx) * 2);
		top: calc(var(--hex-dy) * 4);
	}
	/* 12 (far bottom-left) - row +2, col 1 */
	.grid.grid-extendedHexagonal .cell:nth-child(13) {
		left: calc(var(--hex-dx) * 1);
		top: calc(var(--hex-dy) * 4);
	}
	/* 13 (left-bottom) - row +1, col 0.5 */
	.grid.grid-extendedHexagonal .cell:nth-child(14) {
		left: calc(var(--hex-dx) * 0.5);
		top: calc(var(--hex-dy) * 3);
	}
	/* 14 (far left) - row 0, col 0 */
	.grid.grid-extendedHexagonal .cell:nth-child(15) {
		left: calc(var(--hex-dx) * 0);
		top: calc(var(--hex-dy) * 2);
	}
	/* 15 (left-top) - row -1, col 0.5 */
	.grid.grid-extendedHexagonal .cell:nth-child(16) {
		left: calc(var(--hex-dx) * 0.5);
		top: calc(var(--hex-dy) * 1);
	}
	/* 16 (far top-left) - row -2, col 1 */
	.grid.grid-extendedHexagonal .cell:nth-child(17) {
		left: calc(var(--hex-dx) * 1);
		top: calc(var(--hex-dy) * 0);
	}
	/* 17 (top) - row -2, col 2 */
	.grid.grid-extendedHexagonal .cell:nth-child(18) {
		left: calc(var(--hex-dx) * 2);
		top: calc(var(--hex-dy) * 0);
	}
	/* 18 (far top-right) - row -2, col 3 */
	.grid.grid-extendedHexagonal .cell:nth-child(19) {
		left: calc(var(--hex-dx) * 3);
		top: calc(var(--hex-dy) * 0);
	}

	.cell {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--ui-border, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
		border-radius: 4px;
		color: var(--ui-text, #555);
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.1s;
	}

	/* Smaller font for extended moore */
	.grid.grid-extendedMoore .cell {
		font-size: 0.6rem;
		border-radius: 3px;
	}

	.cell:hover { 
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08)); 
	}

	.cell.on {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.5));
		color: var(--ui-accent, #2dd4bf);
	}

	.cell input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	/* Preview */
	.preview-area {
		display: flex;
		gap: 0.4rem;
		align-items: stretch;
		flex-shrink: 0;
	}

	.canvas {
		width: 108px;
		height: 108px;
		border-radius: 5px;
		background: var(--ui-canvas-bg, #0a0a0f);
		flex-shrink: 0;
	}

	.preview-btns {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		/* Height matches canvas via align-items: stretch on parent */
	}

	.pbtn {
		width: 28px;
		height: 28px;
		border: none;
		background: var(--ui-border, rgba(255, 255, 255, 0.06));
		color: var(--ui-text, #666);
		border-radius: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}

	.pbtn:hover { 
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.12)); 
		color: var(--ui-text-hover, #fff); 
	}

	.pbtn.active { 
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2)); 
		color: var(--ui-accent, #2dd4bf); 
	}

	.pbtn svg { width: 12px; height: 12px; }

	/* Footer */
	.footer {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--ui-border, rgba(255, 255, 255, 0.06));
	}
	
	/* Boundary Section */
	.boundary-section {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--ui-border, rgba(255, 255, 255, 0.06));
	}
	
	.boundary-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	
	.boundary-label {
		font-size: 0.6rem;
		color: var(--ui-text, #555);
		text-transform: uppercase;
	}
	
	.boundary-name {
		font-size: 0.6rem;
		color: var(--ui-text-hover, #aaa);
	}
	
	.boundary-grid {
		display: flex;
		justify-content: space-between;
		gap: 0.25rem;
	}
	
	.boundary-btn {
		width: 42px;
		height: 42px;
		padding: 0;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.1s;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--ui-text, #666);
	}
	
	.boundary-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		border-color: var(--ui-border-hover, rgba(255, 255, 255, 0.15));
		color: var(--ui-text-hover, #fff);
	}
	
	.boundary-btn.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.3));
		color: var(--ui-accent, #2dd4bf);
	}

	/* Vitality Influence Section */
	.vitality-section {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding-top: 0.4rem;
		border-top: 1px solid var(--ui-border, rgba(255, 255, 255, 0.06));
	}
	
	.vitality-header {
		display: flex;
		align-items: center;
	}
	
	.vitality-label {
		font-size: 0.55rem;
		color: var(--ui-text, #555);
		text-transform: uppercase;
	}
	
	.vitality-modes {
		display: flex;
		gap: 0.2rem;
	}
	
	.vitality-mode-btn {
		flex: 1;
		padding: 0.25rem 0.15rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
	}
	
	.vitality-mode-btn svg {
		width: 16px;
		height: 16px;
	}
	
	.vitality-mode-btn span {
		font-size: 0.5rem;
		color: var(--ui-text, #666);
	}
	
	.vitality-mode-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		border-color: var(--ui-border-hover, rgba(255, 255, 255, 0.15));
	}
	
	.vitality-mode-btn:hover svg {
		color: var(--ui-text-hover, #fff);
	}
	
	.vitality-mode-btn:hover span {
		color: var(--ui-text-hover, #fff);
	}
	
	.vitality-mode-btn.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.3));
	}
	
	.vitality-mode-btn.active svg {
		color: var(--ui-accent, #2dd4bf);
	}
	
	.vitality-mode-btn.active span {
		color: var(--ui-accent, #2dd4bf);
	}
	
	.vitality-sliders {
		display: flex;
		gap: 0.5rem;
	}
	
	.vitality-slider-item {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	
	.vitality-slider-item .slider-label {
		font-size: 0.5rem;
		color: var(--ui-text, #666);
		min-width: 2.2rem;
	}
	
	.vitality-slider-item input[type='range'] {
		flex: 1;
		height: 3px;
		-webkit-appearance: none;
		appearance: none;
		background: var(--ui-border, rgba(255, 255, 255, 0.15));
		border-radius: 2px;
		outline: none;
		cursor: pointer;
	}
	
	.vitality-slider-item input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 10px;
		height: 10px;
		background: var(--ui-accent, #2dd4bf);
		border-radius: 50%;
		cursor: pointer;
		border: none;
		transition: transform 0.1s;
	}
	
	.vitality-slider-item input[type='range']::-webkit-slider-thumb:hover {
		transform: scale(1.2);
	}
	
	.vitality-slider-item input[type='range']::-moz-range-thumb {
		width: 10px;
		height: 10px;
		background: var(--ui-accent, #2dd4bf);
		border-radius: 50%;
		cursor: pointer;
		border: none;
		transition: transform 0.1s;
	}
	
	.vitality-slider-item input[type='range']::-moz-range-thumb:hover {
		transform: scale(1.2);
	}
	
	.vitality-slider-item .slider-value {
		font-size: 0.5rem;
		color: var(--ui-text-hover, #aaa);
		min-width: 1.5rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.foot-label {
		font-size: 0.55rem;
		color: var(--ui-text, #555);
		text-transform: uppercase;
		margin-right: 0.25rem;
	}

	.states {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.states input[type='range'] {
		width: 60px;
		height: 6px;
		-webkit-appearance: none;
		appearance: none;
		background: transparent;
		cursor: pointer;
		outline: none;
		margin: 0;
		padding: 0;
	}

	.states input[type='range']::-webkit-slider-runnable-track {
		width: 100%;
		height: 6px;
		background: var(--slider-track-bg, rgba(255, 255, 255, 0.25));
		border-radius: 3px;
		border: 1px solid var(--slider-track-border, rgba(255, 255, 255, 0.1));
	}

	.states input[type='range']::-webkit-slider-thumb {
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

	.states input[type='range']::-moz-range-track {
		width: 100%;
		height: 6px;
		background: var(--slider-track-bg, rgba(255, 255, 255, 0.25));
		border-radius: 3px;
		border: 1px solid var(--slider-track-border, rgba(255, 255, 255, 0.1));
	}

	.states input[type='range']::-moz-range-thumb {
		width: 14px;
		height: 14px;
		background: var(--ui-accent, #2dd4bf);
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid rgba(255, 255, 255, 0.9);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}

	.states-val {
		font-size: 0.65rem;
		color: var(--ui-accent, #2dd4bf);
		font-family: 'SF Mono', Monaco, monospace;
		min-width: 1rem;
	}

	.rule-input {
		display: flex;
		align-items: center;
		flex: 1;
	}

	.rule-input input {
		flex: 1;
		min-width: 120px;
		padding: 0.25rem 0.4rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 4px;
		color: var(--ui-accent, #2dd4bf);
		font-family: 'SF Mono', Monaco, monospace;
		font-size: 0.7rem;
		outline: none;
	}

	.rule-input input:focus {
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.5));
	}

	.rule-input input.error { border-color: #ef4444; }

	/* Re-initialize button */
	.reinit-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 4px;
		color: var(--ui-text, #666);
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.reinit-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		border-color: var(--ui-border-hover, rgba(255, 255, 255, 0.15));
		color: var(--ui-text-hover, #fff);
	}

	.reinit-btn svg {
		width: 14px;
		height: 14px;
	}

	/* Mobile adjustments */
	@media (max-width: 540px) {
		.editor {
			max-width: 95vw;
			padding: 0.6rem;
			gap: 0.5rem;
		}

		.header {
			margin-bottom: 0;
		}

		.grid-type-toggle {
			gap: 0.3rem;
		}

		.grid-type-btn {
			padding: 0.4rem 0.5rem;
			font-size: 0.65rem;
		}

		.grid-type-btn svg {
			width: 14px;
			height: 14px;
		}

		/* Keep selectors on ONE row - make them compact */
		.selectors-row {
			flex-wrap: nowrap;
			gap: 0.3rem;
		}

		.select-btn {
			padding: 0.3rem 0.4rem;
			gap: 0.2rem;
			font-size: 0.65rem;
		}

		.select-label {
			display: none; /* Hide labels on mobile to save space */
		}

		.select-value {
			font-size: 0.7rem;
		}

		.select-num {
			font-size: 0.6rem;
		}

		.chevron {
			width: 10px;
			height: 10px;
		}

		/* Rule dropdown should take remaining space */
		.dropdown-wrapper.flex-1 {
			flex: 1;
			min-width: 0; /* Allow shrinking */
		}

		.dropdown-wrapper.flex-1 .select-value {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			max-width: 100px;
		}

		.main-row {
			justify-content: center;
			gap: 0.5rem;
		}

		/* Scale down grids and preview on mobile - keep them equal */
		.grid {
			width: 80px;
			height: 80px;
			gap: 1px;
		}

		/* Mobile hex grid - scale to match 80px canvas */
		.grid.grid-hexagonal {
			--hex-w: 26px;
			--hex-gap: 3px;
		}

		/* Mobile extended hex grid - scale to match 80px canvas */
		.grid.grid-extendedHexagonal {
			--hex-w: 16px;
			--hex-gap: 1.5px;
		}

		.canvas {
			width: 80px;
			height: 80px;
		}

		.cell {
			font-size: 0.55rem;
		}

		.pbtn {
			width: 22px;
			height: 22px;
			padding: 4px;
		}

		.pbtn svg {
			width: 10px;
			height: 10px;
		}

		.footer {
			flex-wrap: wrap;
			gap: 0.4rem;
		}

		.rule-input {
			flex: 1;
			min-width: 0;
		}

		.rule-input input {
			min-width: 80px;
		}
	}
</style>
