<script lang="ts" module>
	// Module-level state persists across component mounts
	let persistedFilter = 'all';
</script>

<script lang="ts">
	import { getSimulationState } from '../stores/simulation.svelte.js';
	import { 
		RULE_PRESETS, 
		RULE_CATEGORIES, 
		NEIGHBORHOODS,
		parseRule, 
		getNeighborDescription,
		type CARule, 
		type RuleCategory,
		type NeighborhoodType 
	} from '../utils/rules.js';
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		onclose: () => void;
		onrulechange: () => void;
	}

	let { onclose, onrulechange }: Props = $props();

	const simState = getSimulationState();

	const PREVIEW_SIZE = 20;
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
	let ruleSearchInput: HTMLInputElement;
	const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
	let ruleString = $state(simState.currentRule.ruleString);
	let numStates = $state(simState.currentRule.numStates);
	let neighborhood = $state<NeighborhoodType>(simState.currentRule.neighborhood ?? 'moore');
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
		let presets = RULE_PRESETS;
		
		// First apply category/neighborhood/state filter
		if (selectedFilter !== 'all') {
			if (selectedFilter.startsWith('nh:')) {
				const nhType = selectedFilter.slice(3) as NeighborhoodType;
				if (nhType === 'moore') {
					presets = presets.filter(r => !r.neighborhood || r.neighborhood === 'moore');
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

	// Count rules for each filter (for display in dropdown)
	function getFilterCount(filter: string): number {
		return getFilteredRules(filter).length;
	}

	// Precompute counts for all filters
	const filterCounts = $derived.by(() => ({
		all: RULE_PRESETS.length,
		// Categories
		...Object.fromEntries(RULE_CATEGORIES.map(c => [c.id, getFilterCount(c.id)])),
		// Neighborhoods
		'nh:moore': getFilterCount('nh:moore'),
		'nh:vonNeumann': getFilterCount('nh:vonNeumann'),
		'nh:extendedMoore': getFilterCount('nh:extendedMoore'),
		// States
		'states:2': getFilterCount('states:2'),
		'states:3-4': getFilterCount('states:3-4'),
		'states:5-8': getFilterCount('states:5-8'),
		'states:9+': getFilterCount('states:9+'),
	}));

	function getBirthMask(): number {
		return birthToggles.reduce((mask, on, i) => (on ? mask | (1 << i) : mask), 0);
	}

	function getSurviveMask(): number {
		return surviveToggles.reduce((mask, on, i) => (on ? mask | (1 << i) : mask), 0);
	}

	onMount(() => {
		if (previewCanvas) {
			previewCtx = previewCanvas.getContext('2d');
			randomizePreview();
		}
	});

	onDestroy(() => {
		if (previewAnimationId) cancelAnimationFrame(previewAnimationId);
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

	function randomizePreview() {
		previewGrid = Array.from({ length: PREVIEW_SIZE * PREVIEW_SIZE }, () =>
			Math.random() < 0.3 ? 1 : 0
		);
		previewNextGrid = new Array(PREVIEW_SIZE * PREVIEW_SIZE).fill(0);
		renderPreview();
	}

	// Count neighbors based on neighborhood type
	function countNeighbors(x: number, y: number): number {
		let count = 0;
		
		if (neighborhood === 'vonNeumann') {
			// 4 orthogonal neighbors
			const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
			for (const [dx, dy] of dirs) {
				const nx = (x + dx + PREVIEW_SIZE) % PREVIEW_SIZE;
				const ny = (y + dy + PREVIEW_SIZE) % PREVIEW_SIZE;
				if (previewGrid[ny * PREVIEW_SIZE + nx] === 1) count++;
			}
		} else if (neighborhood === 'extendedMoore') {
			// 24 neighbors (5x5 minus center)
			for (let dy = -2; dy <= 2; dy++) {
				for (let dx = -2; dx <= 2; dx++) {
					if (dx === 0 && dy === 0) continue;
					const nx = (x + dx + PREVIEW_SIZE) % PREVIEW_SIZE;
					const ny = (y + dy + PREVIEW_SIZE) % PREVIEW_SIZE;
					if (previewGrid[ny * PREVIEW_SIZE + nx] === 1) count++;
				}
			}
		} else {
			// Moore: 8 neighbors
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (dx === 0 && dy === 0) continue;
					const nx = (x + dx + PREVIEW_SIZE) % PREVIEW_SIZE;
					const ny = (y + dy + PREVIEW_SIZE) % PREVIEW_SIZE;
					if (previewGrid[ny * PREVIEW_SIZE + nx] === 1) count++;
				}
			}
		}
		
		return count;
	}

	function stepPreview() {
		const birthMask = getBirthMask();
		const surviveMask = getSurviveMask();

		for (let y = 0; y < PREVIEW_SIZE; y++) {
			for (let x = 0; x < PREVIEW_SIZE; x++) {
				const idx = y * PREVIEW_SIZE + x;
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
		randomizePreview();
		dropdownOpen = false;
	}

	function getFilteredRules(filter: string) {
		if (filter === 'all') return RULE_PRESETS;
		if (filter.startsWith('nh:')) {
			const nhType = filter.slice(3);
			if (nhType === 'moore') {
				return RULE_PRESETS.filter(r => !r.neighborhood || r.neighborhood === 'moore');
			}
			return RULE_PRESETS.filter(r => r.neighborhood === nhType);
		}
		if (filter.startsWith('states:')) {
			const stateFilter = filter.slice(7);
			switch (stateFilter) {
				case '2': return RULE_PRESETS.filter(r => r.numStates === 2);
				case '3-4': return RULE_PRESETS.filter(r => r.numStates >= 3 && r.numStates <= 4);
				case '5-8': return RULE_PRESETS.filter(r => r.numStates >= 5 && r.numStates <= 8);
				case '9+': return RULE_PRESETS.filter(r => r.numStates >= 9);
				default: return RULE_PRESETS;
			}
		}
		return RULE_PRESETS.filter(r => r.category === filter);
	}

	function selectFilter(filter: string) {
		selectedFilter = filter;
		persistedFilter = filter; // Persist across modal opens
		categoryDropdownOpen = false;
		
		// If current rule is not in filtered list, select the first filtered rule
		const filtered = getFilteredRules(filter);
		
		const currentRuleInFiltered = filtered.some(r => 
			RULE_PRESETS.indexOf(r) === selectedPreset
		);
		
		if (!currentRuleInFiltered && filtered.length > 0) {
			selectPreset(RULE_PRESETS.indexOf(filtered[0]));
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
		} else {
			error = 'Invalid';
		}
	}

	function applyRule() {
		const parsed = parseRule(ruleString);
		if (!parsed) { error = 'Invalid rule'; return; }
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
		onrulechange();
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
			default: return 'Moore';
		}
	});

	// Calculate grid columns based on max neighbors
	const gridCols = $derived(neighborhood === 'extendedMoore' ? 5 : 3);
	const neighborNumbers = $derived(Array.from({ length: maxNeighbors + 1 }, (_, i) => i));
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="editor">
		<!-- Row 1: Title + Close -->
		<div class="header">
			<span class="title">
				<svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<!-- 3x3 grid outline -->
					<rect x="4" y="4" width="16" height="16" rx="1" />
					<!-- Grid lines -->
					<line x1="4" y1="9.33" x2="20" y2="9.33" />
					<line x1="4" y1="14.66" x2="20" y2="14.66" />
					<line x1="9.33" y1="4" x2="9.33" y2="20" />
					<line x1="14.66" y1="4" x2="14.66" y2="20" />
					<!-- A few filled cells - like a glider pattern -->
					<rect x="10.33" y="5" width="3.33" height="3.33" fill="currentColor" stroke="none" />
					<rect x="15.66" y="10.33" width="3.33" height="3.33" fill="currentColor" stroke="none" />
					<rect x="5" y="15.66" width="3.33" height="3.33" fill="currentColor" stroke="none" />
				</svg>
				Rule Editor
			</span>
			<button class="close-btn" onclick={onclose} aria-label="Close">✕</button>
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
								<button class="search-clear" onclick={() => { ruleSearchQuery = ''; ruleSearchInput?.focus(); }}>
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M18 6L6 18M6 6l12 12" />
									</svg>
								</button>
							{/if}
						</div>
						
						<div class="preset-list">
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
						{#each Object.values(NEIGHBORHOODS) as nh}
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

		<!-- Footer: States + Rule String + Actions -->
		<div class="footer">
			<div class="states">
				<span class="foot-label">States</span>
				<input type="range" min="2" max="32" bind:value={numStates} oninput={updateRuleString} />
				<span class="states-val">{numStates}</span>
			</div>
			<div class="rule-input">
				<span class="foot-label">Rule</span>
				<input type="text" value={ruleString} oninput={handleRuleStringChange} class:error={!!error} />
			</div>
			<div class="actions">
				<button class="btn cancel" onclick={onclose}>Cancel</button>
				<button class="btn apply" onclick={applyRule}>Apply</button>
			</div>
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

	.editor {
		background: var(--ui-bg, rgba(12, 12, 18, 0.9));
		backdrop-filter: blur(16px);
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 12px;
		padding: 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
		max-width: 520px;
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
	}

	.close-btn:hover { 
		background: var(--ui-border, rgba(255,255,255,0.1)); 
		color: var(--ui-text-hover, #fff); 
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
		justify-content: space-between;
		padding: 0.3rem 0;
		flex-wrap: nowrap; /* Never wrap - scale down instead */
	}

	.grid-col, .preview-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		flex-shrink: 1;
		min-width: 0;
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

	/* Grid - 108px default, scales down on mobile */
	.grid {
		display: grid;
		gap: 2px;
		width: 108px;
		height: 108px;
		flex-shrink: 1;
		min-width: 60px;
		min-height: 60px;
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
		flex-shrink: 1;
		min-width: 0;
	}

	.canvas {
		width: 108px;
		height: 108px;
		border-radius: 5px;
		background: var(--ui-canvas-bg, #0a0a0f);
		flex-shrink: 1;
		min-width: 60px;
		min-height: 60px;
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
	}

	.rule-input input {
		width: 90px;
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

	.actions {
		display: flex;
		gap: 0.4rem;
		margin-left: auto;
	}

	.btn {
		padding: 0.35rem 0.7rem;
		border-radius: 5px;
		font-size: 0.7rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn.cancel {
		background: transparent;
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		color: var(--ui-text, #888);
	}

	.btn.cancel:hover { 
		background: var(--ui-border, rgba(255, 255, 255, 0.05)); 
		color: var(--ui-text-hover, #e0e0e0); 
	}

	.btn.apply {
		background: var(--ui-accent, #2dd4bf);
		border: none;
		color: var(--ui-apply-text, #0a0a0f);
	}

	.btn.apply:hover { filter: brightness(1.15); }

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
			justify-content: space-between;
		}

		/* Scale down grids and preview on mobile */
		.grid {
			width: 80px;
			height: 80px;
			min-width: 55px;
			min-height: 55px;
			gap: 1px;
		}

		.canvas {
			width: 80px;
			height: 80px;
			min-width: 55px;
			min-height: 55px;
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

		.actions {
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>
