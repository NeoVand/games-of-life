<script lang="ts">
	import { onMount } from 'svelte';
	import Canvas from '$lib/components/Canvas.svelte';
	import Controls from '$lib/components/Controls.svelte';
	import RuleEditor from '$lib/components/RuleEditor.svelte';
	import HelpOverlay from '$lib/components/HelpOverlay.svelte';
	import Settings from '$lib/components/Settings.svelte';
	import InitializeModal from '$lib/components/InitializeModal.svelte';
	import InfoOverlay from '$lib/components/InfoOverlay.svelte';
	import ClickHint from '$lib/components/ClickHint.svelte';
	import AboutModal from '$lib/components/AboutModal.svelte';
	import HistoryTimelineModal from '$lib/components/HistoryTimelineModal.svelte';
	import BrushEditorModal from '$lib/components/BrushEditorModal.svelte';
	import { getSimulationState, getUIState, DARK_THEME_COLORS, LIGHT_THEME_COLORS, SPECTRUM_MODES, type GridScale } from '$lib/stores/simulation.svelte.js';
	import { 
		openModal, closeModal, toggleModal, isModalOpen, getModalStates,
		type ModalId
	} from '$lib/stores/modalManager.svelte.js';
	import { hasTourBeenCompleted, startTour, getTourStyles } from '$lib/utils/tour.js';
	import 'driver.js/dist/driver.css';

	const simState = getSimulationState();
	const uiState = getUIState();
	
	// Use modal manager for multi-modal support
	const modalStates = $derived(getModalStates());
	const showHelp = $derived(modalStates.help.isOpen);
	const showInitialize = $derived(modalStates.initialize.isOpen);
	const showAbout = $derived(modalStates.about.isOpen);
	const showRuleEditor = $derived(modalStates.ruleEditor.isOpen);
	const showSettings = $derived(modalStates.settings.isOpen);
	const showHistoryTimeline = $derived(modalStates.historyTimeline.isOpen);
	const showBrushEditor = $derived(modalStates.brushEditor.isOpen);
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

	// Button group backgrounds
	const groupBg = $derived.by(() => {
		const [r, g, b] = simState.aliveColor;
		if (simState.isLightTheme) {
			return `rgba(${Math.round(r * 255 * 0.05)}, ${Math.round(g * 255 * 0.05)}, ${Math.round(b * 255 * 0.05)}, 0.08)`;
		}
		return `rgba(255, 255, 255, 0.04)`;
	});

	const groupBorder = $derived.by(() => {
		const [r, g, b] = simState.aliveColor;
		if (simState.isLightTheme) {
			return `rgba(${Math.round(r * 255 * 0.1)}, ${Math.round(g * 255 * 0.1)}, ${Math.round(b * 255 * 0.1)}, 0.12)`;
		}
		return `rgba(255, 255, 255, 0.06)`;
	});

	const groupBgHover = $derived.by(() => {
		const [r, g, b] = simState.aliveColor;
		if (simState.isLightTheme) {
			return `rgba(${Math.round(r * 255 * 0.08)}, ${Math.round(g * 255 * 0.08)}, ${Math.round(b * 255 * 0.08)}, 0.12)`;
		}
		return `rgba(255, 255, 255, 0.06)`;
	});

	const groupBorderHover = $derived.by(() => {
		const [r, g, b] = simState.aliveColor;
		if (simState.isLightTheme) {
			return `rgba(${Math.round(r * 255 * 0.15)}, ${Math.round(g * 255 * 0.15)}, ${Math.round(b * 255 * 0.15)}, 0.18)`;
		}
		return `rgba(255, 255, 255, 0.1)`;
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
		// Prevent browser-level zoom gestures on iOS Safari
		const preventGesture = (e: Event) => {
			e.preventDefault();
		};
		
		// Prevent pinch zoom via gesturestart (iOS)
		document.addEventListener('gesturestart', preventGesture, { passive: false });
		document.addEventListener('gesturechange', preventGesture, { passive: false });
		document.addEventListener('gestureend', preventGesture, { passive: false });
		
		// Prevent Ctrl+scroll zoom on desktop browsers
		const preventCtrlScroll = (e: WheelEvent) => {
			if (e.ctrlKey || e.metaKey) {
				e.preventDefault();
			}
		};
		document.addEventListener('wheel', preventCtrlScroll, { passive: false });
		
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
			// Cleanup zoom prevention
			document.removeEventListener('gesturestart', preventGesture);
			document.removeEventListener('gesturechange', preventGesture);
			document.removeEventListener('gestureend', preventGesture);
			document.removeEventListener('wheel', preventCtrlScroll);
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

	function handleRecord() {
		canvas.toggleRecording();
	}

	// Track recording state from canvas
	let isRecording = $state(false);
	
	// Poll recording state (since we can't easily make it reactive across component boundary)
	$effect(() => {
		const interval = setInterval(() => {
			if (canvas) {
				isRecording = canvas.getIsRecording();
			}
		}, 100);
		return () => clearInterval(interval);
	});

	function cycleColorScheme() {
		const palette = simState.isLightTheme ? LIGHT_THEME_COLORS : DARK_THEME_COLORS;
		const [r, g, b] = simState.aliveColor;
		
		// Find current color index using exact match (colors are set from palette)
		let currentIndex = palette.findIndex(
			(p) => p.color[0] === r && p.color[1] === g && p.color[2] === b
		);
		
		// Cycle to next color
		const nextIndex = (currentIndex + 1) % palette.length;
		simState.aliveColor = palette[nextIndex].color;
	}

	function cycleSpectrum() {
		const currentIndex = SPECTRUM_MODES.findIndex(m => m.id === simState.spectrumMode);
		const nextIndex = (currentIndex + 1) % SPECTRUM_MODES.length;
		simState.spectrumMode = SPECTRUM_MODES[nextIndex].id;
	}

	function toggleTheme() {
		// Get current color index before switching
		const currentPalette = simState.isLightTheme ? LIGHT_THEME_COLORS : DARK_THEME_COLORS;
		const [r, g, b] = simState.aliveColor;
		let currentIndex = currentPalette.findIndex(
			(p) => p.color[0] === r && p.color[1] === g && p.color[2] === b
		);
		const safeIndex = currentIndex >= 0 ? currentIndex : 0;
		
		// Toggle theme
		simState.isLightTheme = !simState.isLightTheme;
		
		// Keep the same index in the new palette
		const newPalette = simState.isLightTheme ? LIGHT_THEME_COLORS : DARK_THEME_COLORS;
		simState.aliveColor = newPalette[safeIndex].color;
	}

	function handleKeydown(e: KeyboardEvent) {
		// Ignore if typing in an input
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
			return;
		}

		switch (e.code) {
			case 'Enter':
				// Enter/Return toggles play/pause
				e.preventDefault();
				simState.togglePlay();
				break;
			case 'KeyB':
				// B toggles brush tool mode
				if (!e.ctrlKey && !e.metaKey) {
					simState.toolMode = simState.toolMode === 'brush' ? 'pan' : 'brush';
				}
				break;
			case 'KeyC':
				if (!e.ctrlKey && !e.metaKey) {
					if (e.shiftKey) {
						cycleSpectrum();
					} else {
						cycleColorScheme();
					}
				}
				break;
			case 'KeyD':
				if (!e.ctrlKey && !e.metaKey) {
					handleClear();
				}
				break;
			case 'KeyT':
				if (!e.ctrlKey && !e.metaKey) {
					toggleTheme();
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
			case 'KeyA':
				if (!e.ctrlKey && !e.metaKey) {
					simState.showAxes = !simState.showAxes;
				}
				break;
			case 'KeyE':
				toggleModal('ruleEditor');
				break;
			case 'KeyI':
				// Toggle initialize modal
				toggleModal('initialize');
				break;
			case 'KeyF':
			case 'Home':
				handleResetView();
				break;
			case 'Escape':
				// Close all modals
				closeModal('help');
				closeModal('initialize');
				closeModal('about');
				closeModal('ruleEditor');
				closeModal('settings');
				uiState.closeAll();
				break;
			case 'Slash':
				if (e.shiftKey) {
					e.preventDefault();
					toggleModal('help');
				}
				break;
			case 'BracketLeft':
				simState.brushSize = Math.max(1, simState.brushSize - 1);
				break;
			case 'BracketRight':
				simState.brushSize = Math.min(500, simState.brushSize + 1);
				break;
			case 'Comma':
				simState.speed = Math.max(1, simState.speed - 5);
				break;
			case 'Period':
				simState.speed = Math.min(240, simState.speed + 5);
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
	style="--ui-accent: {accentColor}; --ui-accent-bg: {accentColorBg}; --ui-accent-border: {accentColorBorder}; --ui-accent-bg-hover: {accentColorBgHover}; --toolbar-bg: {toolbarBg}; --toolbar-border: {toolbarBorder}; --btn-bg: {btnBg}; --btn-bg-hover: {btnBgHover}; --btn-bg-active: {btnBgActive}; --group-bg: {groupBg}; --group-border: {groupBorder}; --group-bg-hover: {groupBgHover}; --group-border-hover: {groupBorderHover};"
>
	<Canvas bind:this={canvas} />

	<ClickHint />

	<InfoOverlay />

	<Controls
		onclear={handleClear}
		oninitialize={() => toggleModal('initialize')}
		onstep={handleStep}
		onresetview={handleResetView}
		onrecord={handleRecord}
		{isRecording}
		onhelp={() => toggleModal('help')}
		onabout={() => toggleModal('about')}
		{showHelp}
		{showInitialize}
		{showAbout}
	/>

	{#if showHelp}
		<HelpOverlay onclose={() => closeModal('help')} onstarttour={handleStartTour} />
	{/if}

	{#if showInitialize}
		<InitializeModal
			onclose={() => closeModal('initialize')}
			oninitialize={handleInitialize}
			onscalechange={handleScaleChange}
		/>
	{/if}

	{#if showRuleEditor}
		<RuleEditor
			onclose={() => closeModal('ruleEditor')}
			onrulechange={handleRuleChange}
			onreinitialize={() => canvas?.reinitialize()}
		/>
	{/if}

	{#if showSettings}
		<Settings
			onclose={() => closeModal('settings')}
		/>
	{/if}

	{#if showHistoryTimeline}
		<HistoryTimelineModal onclose={() => closeModal('historyTimeline')} />
	{/if}

	{#if showBrushEditor}
		<BrushEditorModal
			onclose={() => closeModal('brushEditor')}
		/>
	{/if}

	{#if showAbout}
		<AboutModal onclose={() => closeModal('about')} onstarttour={handleStartTour} />
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
