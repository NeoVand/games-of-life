<script lang="ts">
	import { onMount } from 'svelte';
	import Canvas from '$lib/components/Canvas.svelte';
	import Controls from '$lib/components/Controls.svelte';
	import RuleEditor from '$lib/components/RuleEditor.svelte';
	import HelpOverlay from '$lib/components/HelpOverlay.svelte';
	import Settings from '$lib/components/Settings.svelte';
	import InitializeModal from '$lib/components/InitializeModal.svelte';
	import InfoOverlay from '$lib/components/InfoOverlay.svelte';
	import AboutModal from '$lib/components/AboutModal.svelte';
	import { getSimulationState, getUIState, type GridScale } from '$lib/stores/simulation.svelte.js';
	import { hasTourBeenCompleted, startTour, getTourStyles } from '$lib/utils/tour.js';
	import 'driver.js/dist/driver.css';

	const simState = getSimulationState();
	const uiState = getUIState();
	
	let showHelp = $state(false);
	let showInitialize = $state(false);
	let showAbout = $state(false);
	let canvas: Canvas;
	let tourStyleElement: HTMLStyleElement | null = null;

	// Convert alive color (0-1 RGB) to CSS color strings
	const accentColor = $derived.by(() => {
		const [r, g, b] = simState.aliveColor;
		return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
	});

	const accentColorBg = $derived.by(() => {
		const [r, g, b] = simState.aliveColor;
		return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.15)`;
	});

	const accentColorBorder = $derived.by(() => {
		const [r, g, b] = simState.aliveColor;
		return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.3)`;
	});

	const accentColorBgHover = $derived.by(() => {
		const [r, g, b] = simState.aliveColor;
		return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.25)`;
	});

	// Toolbar background derived from theme and accent color
	const toolbarBg = $derived.by(() => {
		const [r, g, b] = simState.aliveColor;
		if (simState.isLightTheme) {
			return `rgba(${Math.round(r * 255 * 0.1 + 245)}, ${Math.round(g * 255 * 0.1 + 245)}, ${Math.round(b * 255 * 0.1 + 245)}, 0.7)`;
		}
		return `rgba(${Math.round(r * 255 * 0.05)}, ${Math.round(g * 255 * 0.05)}, ${Math.round(b * 255 * 0.05 + 8)}, 0.6)`;
	});

	const toolbarBorder = $derived.by(() => {
		const [r, g, b] = simState.aliveColor;
		if (simState.isLightTheme) {
			// Light theme: use the accent color with moderate opacity
			return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.2)`;
		}
		// Dark theme: use the accent color with lower opacity for subtle glow
		return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.15)`;
	});

	// Button backgrounds based on theme and accent
	const btnBg = $derived.by(() => {
		const [r, g, b] = simState.aliveColor;
		if (simState.isLightTheme) {
			return `rgba(${Math.round(r * 255 * 0.1)}, ${Math.round(g * 255 * 0.1)}, ${Math.round(b * 255 * 0.1)}, 0.08)`;
		}
		return `rgba(${Math.round(r * 255 * 0.2 + 40)}, ${Math.round(g * 255 * 0.2 + 40)}, ${Math.round(b * 255 * 0.2 + 40)}, 0.15)`;
	});

	const btnBgHover = $derived.by(() => {
		const [r, g, b] = simState.aliveColor;
		if (simState.isLightTheme) {
			return `rgba(${Math.round(r * 255 * 0.15)}, ${Math.round(g * 255 * 0.15)}, ${Math.round(b * 255 * 0.15)}, 0.15)`;
		}
		return `rgba(${Math.round(r * 255 * 0.3 + 60)}, ${Math.round(g * 255 * 0.3 + 60)}, ${Math.round(b * 255 * 0.3 + 60)}, 0.25)`;
	});

	const btnBgActive = $derived.by(() => {
		const [r, g, b] = simState.aliveColor;
		if (simState.isLightTheme) {
			return `rgba(${Math.round(r * 255 * 0.2)}, ${Math.round(g * 255 * 0.2)}, ${Math.round(b * 255 * 0.2)}, 0.2)`;
		}
		return `rgba(${Math.round(r * 255 * 0.4 + 80)}, ${Math.round(g * 255 * 0.4 + 80)}, ${Math.round(b * 255 * 0.4 + 80)}, 0.3)`;
	});

	// Update tour styles when theme or color changes
	function updateTourStyles() {
		if (!tourStyleElement) {
			tourStyleElement = document.createElement('style');
			tourStyleElement.id = 'tour-styles';
			document.head.appendChild(tourStyleElement);
		}
		tourStyleElement.textContent = getTourStyles(accentColor, simState.isLightTheme);
	}

	// Start the tour
	function handleStartTour() {
		updateTourStyles();
		startTour({
			accentColor,
			isLightTheme: simState.isLightTheme
		});
	}

	// Auto-start tour on first visit
	onMount(() => {
		// Small delay to ensure everything is rendered
		setTimeout(() => {
			if (!hasTourBeenCompleted()) {
				handleStartTour();
			}
		}, 500);

		return () => {
			// Cleanup tour styles
			if (tourStyleElement) {
				tourStyleElement.remove();
			}
		};
	});

	// Update tour styles when theme/color changes
	$effect(() => {
		// Track dependencies
		accentColor;
		simState.isLightTheme;
		// Update styles
		updateTourStyles();
	});

	function handleClear() {
		canvas.clear();
	}

	function handleInitialize(type: string, options?: { density?: number; tiled?: boolean; spacing?: number }) {
		canvas.initialize(type, options);
	}

	function handleReinitialize() {
		// Reinitialize using the last initialization settings
		const pattern = simState.lastInitPattern;
		const tiled = simState.lastInitTiling;
		const spacing = simState.lastInitSpacing;
		
		// Determine density from pattern name if it's a random pattern
		let density = 0.15;
		if (pattern === 'random-sparse') density = 0.08;
		else if (pattern === 'random-medium') density = 0.15;
		else if (pattern === 'random-dense') density = 0.25;
		else if (pattern.startsWith('random-')) density = 0.3; // custom
		
		canvas.initialize(pattern, { density, tiled, spacing });
	}

	function handleStep() {
		canvas.stepOnce();
	}

	function handleResetView() {
		canvas.resetView();
	}

	function handleRuleChange() {
		canvas.updateRule();
	}

	function handleScaleChange(scale: GridScale) {
		canvas.setScale(scale);
	}

	function handleScreenshot() {
		canvas.screenshot();
	}

	function handleKeydown(e: KeyboardEvent) {
		// Ignore if typing in an input
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
			return;
		}

		switch (e.code) {
			case 'Space':
				e.preventDefault();
				simState.togglePlay();
				break;
			case 'KeyC':
				if (!e.ctrlKey && !e.metaKey) {
					handleClear();
				}
				break;
			case 'KeyR':
				if (!e.ctrlKey && !e.metaKey) {
					handleReinitialize();
				}
				break;
			case 'KeyS':
				if (!e.ctrlKey && !e.metaKey) {
					handleStep();
				}
				break;
			case 'KeyG':
				simState.showGrid = !simState.showGrid;
				break;
			case 'KeyE':
				uiState.showRuleEditor = !uiState.showRuleEditor;
				break;
			case 'KeyI':
				// Toggle initialize modal
				showInitialize = !showInitialize;
				break;
			case 'KeyF':
			case 'Home':
				handleResetView();
				break;
			case 'Escape':
				showHelp = false;
				showInitialize = false;
				showAbout = false;
				uiState.closeAll();
				break;
			case 'Slash':
				if (e.shiftKey) {
					e.preventDefault();
					showHelp = !showHelp;
				}
				break;
			case 'BracketLeft':
				simState.brushSize = Math.max(1, simState.brushSize - 1);
				break;
			case 'BracketRight':
				simState.brushSize = Math.min(50, simState.brushSize + 1);
				break;
			case 'Comma':
				simState.speed = Math.max(1, simState.speed - 5);
				break;
			case 'Period':
				simState.speed = Math.min(120, simState.speed + 5);
				break;
		}
	}
</script>

<svelte:head>
	<title>Games of Life</title>
	<meta name="description" content="WebGPU-powered cellular automaton visualizer with customizable rules - explore Conway's Game of Life and beyond" />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<main 
	class="app" 
	class:light-theme={simState.isLightTheme}
	style="--ui-accent: {accentColor}; --ui-accent-bg: {accentColorBg}; --ui-accent-border: {accentColorBorder}; --ui-accent-bg-hover: {accentColorBgHover}; --toolbar-bg: {toolbarBg}; --toolbar-border: {toolbarBorder}; --btn-bg: {btnBg}; --btn-bg-hover: {btnBgHover}; --btn-bg-active: {btnBgActive};"
>
	<Canvas bind:this={canvas} />

	<InfoOverlay />

	<Controls
		onclear={handleClear}
		oninitialize={() => (showInitialize = true)}
		onstep={handleStep}
		onresetview={handleResetView}
		onscreenshot={handleScreenshot}
		onhelp={() => (showHelp = !showHelp)}
		onabout={() => (showAbout = !showAbout)}
		{showHelp}
		{showInitialize}
		{showAbout}
	/>

	{#if showHelp}
		<HelpOverlay onclose={() => (showHelp = false)} onstarttour={handleStartTour} />
	{/if}

	{#if showInitialize}
		<InitializeModal
			onclose={() => (showInitialize = false)}
			oninitialize={handleInitialize}
		/>
	{/if}

	{#if uiState.showRuleEditor}
		<RuleEditor
			onclose={() => (uiState.showRuleEditor = false)}
			onrulechange={handleRuleChange}
		/>
	{/if}

	{#if uiState.showSettings}
		<Settings
			onclose={() => (uiState.showSettings = false)}
			onscalechange={handleScaleChange}
		/>
	{/if}

	{#if showAbout}
		<AboutModal onclose={() => (showAbout = false)} onstarttour={handleStartTour} />
	{/if}
</main>

<style>
	.app {
		position: fixed;
		inset: 0;
		overflow: hidden;
		--ui-bg: rgba(12, 12, 18, 0.7);
		--ui-bg-hover: rgba(20, 20, 30, 0.8);
		--ui-border: rgba(255, 255, 255, 0.08);
		--ui-border-hover: rgba(255, 255, 255, 0.15);
		--ui-text: #888;
		--ui-text-hover: #fff;
		--ui-input-bg: rgba(0, 0, 0, 0.3);
		--ui-canvas-bg: #0a0a0f;
		--ui-apply-text: #0a0a0f;
		--slider-track-bg: rgba(255, 255, 255, 0.2);
		--slider-track-border: rgba(255, 255, 255, 0.15);
		/* --ui-accent, --ui-accent-bg, --ui-accent-border are set via inline style */
	}

	.app.light-theme {
		--ui-bg: rgba(255, 255, 255, 0.85);
		--ui-bg-hover: rgba(240, 240, 245, 0.95);
		--ui-border: rgba(0, 0, 0, 0.1);
		--ui-border-hover: rgba(0, 0, 0, 0.2);
		--ui-text: #555;
		--ui-text-hover: #1a1a1a;
		--ui-input-bg: rgba(255, 255, 255, 0.5);
		--ui-canvas-bg: #f0f0f3;
		--ui-apply-text: #ffffff;
		--slider-track-bg: rgba(0, 0, 0, 0.15);
		--slider-track-border: rgba(0, 0, 0, 0.1);
		/* accent colors come from inline style based on selected color */
	}
</style>
