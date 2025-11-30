<script lang="ts">
	import { getSimulationState, getUIState } from '../stores/simulation.svelte.js';
	import HeartIcon from './HeartIcon.svelte';

	interface Props {
		onclear: () => void;
		oninitialize: () => void;
		onstep: () => void;
		onresetview: () => void;
		onscreenshot: () => void;
		onhelp: () => void;
		onabout: () => void;
		showHelp?: boolean;
		showInitialize?: boolean;
		showAbout?: boolean;
	}

	let { onclear, oninitialize, onstep, onresetview, onscreenshot, onhelp, onabout, showHelp = false, showInitialize = false, showAbout = false }: Props = $props();

	const simState = getSimulationState();
	const uiState = getUIState();

	let collapsed = $state(false);
	let showSpeedSlider = $state(false);
	let showBrushSlider = $state(false);

	// Close all popups
	function closeAllPopups() {
		showSpeedSlider = false;
		showBrushSlider = false;
	}

	function toggleSpeed() {
		const wasOpen = showSpeedSlider;
		closeAllPopups();
		showSpeedSlider = !wasOpen;
	}

	function toggleBrush() {
		const wasOpen = showBrushSlider;
		closeAllPopups();
		showBrushSlider = !wasOpen;
	}

	function openRules() {
		closeAllPopups();
		uiState.showRuleEditor = true;
	}

	function openSettings() {
		closeAllPopups();
		uiState.showSettings = true;
	}

	function openInitialize() {
		closeAllPopups();
		oninitialize();
	}

	function handleHelp() {
		closeAllPopups();
		onhelp();
	}
</script>

<div class="controls" class:collapsed>
	<!-- Play/Pause -->
		<button
			id="tour-play-btn"
			class="control-btn primary"
			onclick={() => simState.togglePlay()}
			data-tooltip={simState.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
		>
			{#if simState.isPlaying}
				<svg viewBox="0 0 24 24" fill="currentColor">
					<rect x="6" y="4" width="4" height="16" rx="1" />
					<rect x="14" y="4" width="4" height="16" rx="1" />
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path d="M8 5.14v14l11-7-11-7z" />
				</svg>
			{/if}
		</button>

		<!-- Step -->
		<button id="tour-step-btn" class="control-btn" onclick={onstep} data-tooltip="Step (S)" disabled={simState.isPlaying}>
			<svg viewBox="0 0 24 24" fill="currentColor">
				<path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2V6z" />
			</svg>
		</button>

		<!-- Speed -->
		<div class="control-group">
			<button
				id="tour-speed-btn"
				class="control-btn"
				onclick={toggleSpeed}
				data-tooltip="Speed"
				class:active={showSpeedSlider}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<path d="M12 6v6l4 2" />
				</svg>
			</button>
			{#if showSpeedSlider}
				<div class="slider-popup">
					<span>{simState.speed} fps</span>
					<input type="range" min="1" max="120" bind:value={simState.speed} />
				</div>
			{/if}
		</div>

		<!-- Rules - Grid with a few alive cells -->
		<button id="tour-rules-btn" class="control-btn" class:active={uiState.showRuleEditor} onclick={openRules} data-tooltip="Edit Rules (E)">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
		</button>

		<!-- Brush Size -->
		<div class="control-group">
			<button
				id="tour-brush-btn"
				class="control-btn"
				onclick={toggleBrush}
				data-tooltip="Brush"
				class:active={showBrushSlider}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					{#if simState.brushState === 1}
						<!-- Filled circle for draw mode -->
						<circle cx="12" cy="12" r={Math.min(8, simState.brushSize)} fill="currentColor" />
					{:else}
						<!-- Empty circle with X for erase mode -->
						<circle cx="12" cy="12" r={Math.min(8, simState.brushSize)} />
						<path d="M9 9l6 6M15 9l-6 6" stroke-width="1.5" />
					{/if}
				</svg>
			</button>
			{#if showBrushSlider}
				<div class="slider-popup brush-popup">
					<div class="mode-toggle">
						<button 
							class="mode-btn" 
							class:active={simState.brushState === 1}
							onclick={() => simState.brushState = 1}
						>
							<svg viewBox="0 0 24 24" fill="currentColor">
								<circle cx="12" cy="12" r="6" />
							</svg>
							<span>Draw</span>
						</button>
						<button 
							class="mode-btn" 
							class:active={simState.brushState === 0}
							onclick={() => simState.brushState = 0}
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="6" />
								<path d="M9 9l6 6M15 9l-6 6" stroke-width="1.5" />
							</svg>
							<span>Erase</span>
						</button>
					</div>
					<div class="size-control">
						<span>{simState.brushSize}px</span>
						<input type="range" min="1" max="50" bind:value={simState.brushSize} />
					</div>
				</div>
			{/if}
		</div>

		<!-- Clear -->
		<button id="tour-clear-btn" class="control-btn" onclick={onclear} data-tooltip="Clear (C)">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
			</svg>
		</button>

		<!-- Initialize -->
		<button id="tour-init-btn" class="control-btn" class:active={showInitialize} onclick={openInitialize} data-tooltip="Initialize (I)">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
			</svg>
		</button>

		<!-- Reset View / Zoom to Fit -->
		<button id="tour-fit-btn" class="control-btn" onclick={onresetview} data-tooltip="Fit to Screen (F)">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<!-- Zoom to fit / fullscreen corners -->
				<path d="M4 14v4a2 2 0 002 2h4" />
				<path d="M20 14v4a2 2 0 01-2 2h-4" />
				<path d="M4 10V6a2 2 0 012-2h4" />
				<path d="M20 10V6a2 2 0 00-2-2h-4" />
				<!-- Inward arrows -->
				<path d="M9 9L4 4m0 0v3m0-3h3" />
				<path d="M15 9l5-5m0 0v3m0-3h-3" />
				<path d="M9 15l-5 5m0 0v-3m0 3h3" />
				<path d="M15 15l5 5m0 0v-3m0 3h-3" />
			</svg>
		</button>

		<!-- Screenshot -->
		<button id="tour-screenshot-btn" class="control-btn" onclick={onscreenshot} data-tooltip="Screenshot">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2v11z" />
				<circle cx="12" cy="13" r="4" />
			</svg>
		</button>

		<!-- Help -->
		<button id="tour-help-btn" class="control-btn" class:active={showHelp} onclick={handleHelp} data-tooltip="Help (?)">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="10" />
				<path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
				<circle cx="12" cy="17" r="0.5" fill="currentColor" />
			</svg>
		</button>

		<!-- Settings -->
		<button id="tour-settings-btn" class="control-btn" class:active={uiState.showSettings} onclick={openSettings} data-tooltip="Settings">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<!-- Sliders/tuner icon -->
				<line x1="4" y1="6" x2="20" y2="6" />
				<line x1="4" y1="12" x2="20" y2="12" />
				<line x1="4" y1="18" x2="20" y2="18" />
				<circle cx="8" cy="6" r="2" fill="currentColor" />
				<circle cx="16" cy="12" r="2" fill="currentColor" />
				<circle cx="10" cy="18" r="2" fill="currentColor" />
			</svg>
		</button>

		<!-- About / Logo -->
		<button id="tour-about-btn" class="control-btn logo-btn" class:active={showAbout} onclick={onabout} data-tooltip="About">
			<HeartIcon size={18} animated={true} />
		</button>

		<!-- Collapse/Expand toggle -->
		<button class="control-btn collapse-btn" onclick={() => (collapsed = !collapsed)} data-tooltip={collapsed ? "Expand" : "Collapse"}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M9 5l7 7-7 7" />
			</svg>
		</button>
</div>


<style>
	.controls {
		position: fixed;
		top: 1rem;
		right: 1rem;
		display: flex;
		gap: 0.2rem;
		align-items: center;
		background: var(--toolbar-bg, rgba(12, 12, 18, 0.5));
		backdrop-filter: blur(12px);
		padding: 0.3rem;
		border-radius: 10px;
		border: 1px solid var(--toolbar-border, rgba(255, 255, 255, 0.08));
		z-index: 100;
		transition: gap 0.2s ease, padding 0.2s ease, background 0.2s ease;
	}

	.controls.collapsed {
		padding: 0.25rem;
		gap: 0;
	}

	/* Hide all buttons except collapse when collapsed */
	.controls.collapsed .control-btn:not(.collapse-btn),
	.controls.collapsed .control-group {
		opacity: 0;
		max-width: 0;
		max-height: 0;
		padding: 0;
		margin: 0;
		overflow: hidden;
		pointer-events: none;
	}

	/* Animate buttons appearing/disappearing */
	.control-btn:not(.collapse-btn),
	.control-group {
		transition: opacity 0.2s ease, max-width 0.2s ease, max-height 0.2s ease;
		max-width: 50px;
		max-height: 50px;
	}

	.control-btn {
		width: 32px;
		height: 32px;
		border: none;
		outline: none;
		background: var(--btn-bg, rgba(255, 255, 255, 0.04));
		color: var(--ui-text, #888);
		cursor: pointer;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
		-webkit-tap-highlight-color: transparent;
	}

	.control-btn:focus {
		outline: none;
	}

	.control-btn:focus-visible {
		outline: none;
	}

	.control-btn:hover:not(:disabled) {
		background: var(--btn-bg-hover, rgba(255, 255, 255, 0.1));
		color: var(--ui-text-hover, #fff);
	}

	.control-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.control-btn.primary {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		color: var(--ui-accent, #2dd4bf);
	}

	.control-btn.primary:hover {
		background: var(--ui-accent-bg-hover, rgba(45, 212, 191, 0.25));
		filter: brightness(1.1);
	}

	.control-btn.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2));
		color: var(--ui-accent, #2dd4bf);
	}

	.control-btn.active:hover:not(:disabled) {
		background: var(--ui-accent-bg-hover, rgba(45, 212, 191, 0.25));
		color: var(--ui-accent, #2dd4bf);
	}

	.control-btn svg {
		width: 16px;
		height: 16px;
	}

	.collapse-btn {
		opacity: 0.6;
		background: transparent;
	}

	.collapse-btn:hover {
		opacity: 1;
		background: var(--btn-bg-hover, rgba(255, 255, 255, 0.08));
	}

	.collapse-btn svg {
		transition: transform 0.2s ease;
	}

	/* Desktop: arrow points left when collapsed (expand to left), right when expanded */
	.controls.collapsed .collapse-btn svg {
		transform: rotate(180deg);
	}

	.control-group {
		position: relative;
	}

	.slider-popup {
		position: absolute;
		top: calc(100% + 0.4rem);
		right: 0;
		background: var(--toolbar-bg, rgba(12, 12, 18, 0.7));
		backdrop-filter: blur(12px);
		padding: 0.5rem 0.7rem;
		border-radius: 6px;
		border: 1px solid var(--toolbar-border, rgba(255, 255, 255, 0.08));
		min-width: 120px;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.slider-popup span {
		font-size: 0.7rem;
		color: var(--ui-text, #888);
		text-align: center;
	}

	.slider-popup input[type='range'] {
		width: 100%;
		height: 20px;
		-webkit-appearance: none;
		appearance: none;
		background: transparent;
		outline: none;
		margin: 0;
		padding: 0;
	}

	.slider-popup input[type='range']::-webkit-slider-runnable-track {
		width: 100%;
		height: 6px;
		background: var(--slider-track-bg, rgba(255, 255, 255, 0.25));
		border-radius: 3px;
		border: 1px solid var(--slider-track-border, rgba(255, 255, 255, 0.1));
	}

	.slider-popup input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 16px;
		background: var(--ui-accent, #2dd4bf);
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid rgba(255, 255, 255, 0.9);
		margin-top: -6px; /* Center thumb on track */
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}

	.slider-popup input[type='range']::-moz-range-track {
		width: 100%;
		height: 6px;
		background: var(--slider-track-bg, rgba(255, 255, 255, 0.25));
		border-radius: 3px;
		border: 1px solid var(--slider-track-border, rgba(255, 255, 255, 0.1));
	}

	.slider-popup input[type='range']::-moz-range-thumb {
		width: 16px;
		height: 16px;
		background: var(--ui-accent, #2dd4bf);
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid rgba(255, 255, 255, 0.9);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}

	/* Brush popup with mode toggle */
	.brush-popup {
		min-width: 140px;
		gap: 0.5rem;
	}

	.mode-toggle {
		display: flex;
		gap: 0.25rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border-radius: 5px;
		padding: 0.2rem;
	}

	.mode-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		padding: 0.35rem 0.5rem;
		border: none;
		background: transparent;
		color: var(--ui-text, #888);
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.65rem;
		transition: all 0.15s;
	}

	.mode-btn svg {
		width: 12px;
		height: 12px;
	}

	.mode-btn:hover {
		color: var(--ui-text-hover, #fff);
	}

	.mode-btn.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2));
		color: var(--ui-accent, #2dd4bf);
	}

	.size-control {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.size-control span {
		font-size: 0.65rem;
		color: var(--ui-text, #888);
		text-align: center;
	}

	/* Custom tooltips that appear below */
	.control-btn[data-tooltip] {
		position: relative;
	}

	.control-btn[data-tooltip]::after {
		content: attr(data-tooltip);
		position: absolute;
		top: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		background: rgba(12, 12, 18, 0.95);
		color: #e0e0e0;
		padding: 0.35rem 0.6rem;
		border-radius: 5px;
		font-size: 0.65rem;
		white-space: nowrap;
		opacity: 0;
		visibility: hidden;
		transition: opacity 0.15s, visibility 0.15s;
		pointer-events: none;
		z-index: 200;
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.control-btn[data-tooltip]::before {
		content: '';
		position: absolute;
		top: calc(100% + 3px);
		left: 50%;
		transform: translateX(-50%);
		border: 5px solid transparent;
		border-bottom-color: rgba(12, 12, 18, 0.95);
		opacity: 0;
		visibility: hidden;
		transition: opacity 0.15s, visibility 0.15s;
		pointer-events: none;
		z-index: 201;
	}

	.control-btn[data-tooltip]:hover::after,
	.control-btn[data-tooltip]:hover::before {
		opacity: 1;
		visibility: visible;
	}

	/* Don't show tooltip when button is disabled */
	.control-btn[data-tooltip]:disabled::after,
	.control-btn[data-tooltip]:disabled::before {
		display: none;
	}


	/* Mobile: vertical toolbar anchored to bottom-right */
	@media (max-width: 768px) {
		.controls {
			top: auto;
			bottom: 1rem;
			right: 1rem;
			flex-direction: column;
			padding: 0.25rem;
		}

		.controls.collapsed {
			padding: 0.2rem;
		}

		/* Collapse button at bottom - arrow points down (click to collapse) */
		.collapse-btn {
			order: 100; /* Push to end (bottom) */
		}

		.collapse-btn svg {
			transform: rotate(90deg); /* Arrow pointing down */
		}

		/* Expand button arrow points up when collapsed (click to expand upward) */
		.controls.collapsed .collapse-btn svg {
			transform: rotate(-90deg); /* Arrow pointing up */
		}

		/* Mobile collapsed state - hide width/height for vertical layout */
		.controls.collapsed .control-btn:not(.collapse-btn),
		.controls.collapsed .control-group {
			width: 0;
			height: 0;
		}

		.control-btn {
			width: 36px;
			height: 36px;
		}

		.control-btn svg {
			width: 18px;
			height: 18px;
		}

		/* Slider popups appear to the left on mobile */
		.slider-popup {
			top: 50%;
			right: calc(100% + 0.4rem);
			transform: translateY(-50%);
		}

		/* Hide tooltips on mobile (touch devices don't have hover) */
		.control-btn[data-tooltip]::after,
		.control-btn[data-tooltip]::before {
			display: none;
		}
	}

</style>
