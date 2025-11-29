<script lang="ts">
	import { getSimulationState, getUIState } from '../stores/simulation.svelte.js';

	interface Props {
		onclear: () => void;
		oninitialize: () => void;
		onstep: () => void;
		onresetview: () => void;
		onscreenshot: () => void;
		onhelp: () => void;
		onabout: () => void;
		showHelp?: boolean;
	}

	let { onclear, oninitialize, onstep, onresetview, onscreenshot, onhelp, onabout, showHelp = false }: Props = $props();

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
		<button class="control-btn" onclick={onstep} data-tooltip="Step (S)" disabled={simState.isPlaying}>
			<svg viewBox="0 0 24 24" fill="currentColor">
				<path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2V6z" />
			</svg>
		</button>

		<div class="sep"></div>

		<!-- Speed -->
		<div class="control-group">
			<button
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

		<!-- Brush Size -->
		<div class="control-group">
			<button
				class="control-btn"
				onclick={toggleBrush}
				data-tooltip="Brush Size"
				class:active={showBrushSlider}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r={Math.min(8, simState.brushSize)} />
				</svg>
			</button>
			{#if showBrushSlider}
				<div class="slider-popup">
					<span>{simState.brushSize}px</span>
					<input type="range" min="1" max="50" bind:value={simState.brushSize} />
				</div>
			{/if}
		</div>

		<div class="sep"></div>

		<!-- Clear -->
		<button class="control-btn" onclick={onclear} data-tooltip="Clear (C)">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
			</svg>
		</button>

		<!-- Initialize -->
		<button class="control-btn" onclick={openInitialize} data-tooltip="Initialize (I)">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
			</svg>
		</button>

		<!-- Reset View -->
		<button class="control-btn" onclick={onresetview} data-tooltip="Reset View (H)">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
			</svg>
		</button>

		<!-- Rules - Abstract cellular pattern icon -->
		<button class="control-btn" onclick={openRules} data-tooltip="Edit Rules (E)">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<!-- Abstract connected nodes representing rules/patterns -->
				<circle cx="6" cy="6" r="2" fill="currentColor" />
				<circle cx="18" cy="6" r="2" />
				<circle cx="6" cy="18" r="2" />
				<circle cx="18" cy="18" r="2" fill="currentColor" />
				<circle cx="12" cy="12" r="2.5" fill="currentColor" />
				<path d="M8 6h8M6 8v8M18 8v8M8 18h8" stroke-dasharray="2 2" />
			</svg>
		</button>

		<div class="sep"></div>

		<!-- Screenshot -->
		<button class="control-btn" onclick={onscreenshot} data-tooltip="Screenshot">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2v11z" />
				<circle cx="12" cy="13" r="4" />
			</svg>
		</button>

		<!-- Help -->
		<button class="control-btn" class:active={showHelp} onclick={handleHelp} data-tooltip="Help (?)">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="10" />
				<path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
				<circle cx="12" cy="17" r="0.5" fill="currentColor" />
			</svg>
		</button>

		<!-- Settings -->
		<button class="control-btn" onclick={openSettings} data-tooltip="Settings">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="3" />
				<path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
			</svg>
		</button>

		<!-- About / Logo - pixelated heart with two shades -->
		<button class="control-btn logo-btn" onclick={onabout} data-tooltip="About">
			<svg viewBox="0 0 16 16" class="heart-icon">
				<!-- Outer glow / half-alive cells (dimmer shade) -->
				<rect class="heart-dim" x="1" y="2" width="1" height="1"/>
				<rect class="heart-dim" x="5" y="1" width="1" height="1"/>
				<rect class="heart-dim" x="6" y="2" width="1" height="1"/>
				<rect class="heart-dim" x="9" y="2" width="1" height="1"/>
				<rect class="heart-dim" x="10" y="1" width="1" height="1"/>
				<rect class="heart-dim" x="14" y="2" width="1" height="1"/>
				<rect class="heart-dim" x="1" y="5" width="1" height="1"/>
				<rect class="heart-dim" x="14" y="5" width="1" height="1"/>
				<rect class="heart-dim" x="2" y="7" width="1" height="1"/>
				<rect class="heart-dim" x="13" y="7" width="1" height="1"/>
				<rect class="heart-dim" x="3" y="8" width="1" height="1"/>
				<rect class="heart-dim" x="12" y="8" width="1" height="1"/>
				<rect class="heart-dim" x="4" y="9" width="1" height="1"/>
				<rect class="heart-dim" x="11" y="9" width="1" height="1"/>
				<rect class="heart-dim" x="5" y="10" width="1" height="1"/>
				<rect class="heart-dim" x="10" y="10" width="1" height="1"/>
				<rect class="heart-dim" x="6" y="11" width="1" height="1"/>
				<rect class="heart-dim" x="9" y="11" width="1" height="1"/>
				<rect class="heart-dim" x="7" y="12" width="2" height="1"/>
				<!-- Main heart - alive cells (bright) -->
				<rect class="heart-bright" x="2" y="2" width="3" height="1"/>
				<rect class="heart-bright" x="11" y="2" width="3" height="1"/>
				<rect class="heart-bright" x="2" y="3" width="5" height="1"/>
				<rect class="heart-bright" x="9" y="3" width="5" height="1"/>
				<rect class="heart-bright" x="2" y="4" width="12" height="1"/>
				<rect class="heart-bright" x="2" y="5" width="12" height="1"/>
				<rect class="heart-bright" x="3" y="6" width="10" height="1"/>
				<rect class="heart-bright" x="4" y="7" width="8" height="1"/>
				<rect class="heart-bright" x="5" y="8" width="6" height="1"/>
				<rect class="heart-bright" x="6" y="9" width="4" height="1"/>
				<rect class="heart-bright" x="7" y="10" width="2" height="1"/>
			</svg>
		</button>

		<div class="sep"></div>

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
		gap: 0.35rem;
		align-items: center;
		background: rgba(12, 12, 18, 0.45);
		backdrop-filter: blur(8px);
		padding: 0.4rem;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.06);
		z-index: 100;
		transition: gap 0.2s ease, padding 0.2s ease;
	}

	.controls.collapsed {
		padding: 0.3rem;
		gap: 0;
	}

	/* Hide all buttons except collapse when collapsed */
	.controls.collapsed .control-btn:not(.collapse-btn),
	.controls.collapsed .control-group,
	.controls.collapsed .sep {
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
	.control-group,
	.sep {
		transition: opacity 0.2s ease, max-width 0.2s ease, max-height 0.2s ease;
		max-width: 50px;
		max-height: 50px;
	}

	.control-btn {
		width: 34px;
		height: 34px;
		border: none;
		outline: none;
		background: transparent;
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
		background: var(--ui-border, rgba(255, 255, 255, 0.08));
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
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.25));
		filter: brightness(1.15);
	}

	.control-btn.active {
		background: var(--ui-border, rgba(255, 255, 255, 0.12));
		color: var(--ui-text-hover, #fff);
	}

	.control-btn svg {
		width: 18px;
		height: 18px;
	}

	.collapse-btn {
		opacity: 0.5;
	}

	.collapse-btn:hover {
		opacity: 1;
	}

	.collapse-btn svg {
		transition: transform 0.2s ease;
	}

	/* Desktop: arrow points left when collapsed (expand to left), right when expanded */
	.controls.collapsed .collapse-btn svg {
		transform: rotate(180deg);
	}

	.sep {
		width: 1px;
		height: 20px;
		background: var(--ui-border, rgba(255, 255, 255, 0.08));
		margin: 0 0.15rem;
	}

	.control-group {
		position: relative;
	}

	.slider-popup {
		position: absolute;
		top: calc(100% + 0.4rem);
		right: 0;
		background: rgba(12, 12, 18, 0.55);
		backdrop-filter: blur(8px);
		padding: 0.5rem 0.7rem;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.06);
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
		accent-color: var(--ui-accent, #2dd4bf);
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

	/* Heart icon styling with two shades */
	.heart-icon {
		width: 18px;
		height: 18px;
	}

	.heart-icon .heart-bright {
		fill: var(--ui-accent, #2dd4bf);
	}

	.heart-icon .heart-dim {
		fill: var(--ui-accent, #2dd4bf);
		opacity: 0.4;
	}

	.logo-btn:hover .heart-icon .heart-bright {
		fill: var(--ui-accent, #2dd4bf);
		filter: brightness(1.2);
	}

	.logo-btn:hover .heart-icon .heart-dim {
		opacity: 0.6;
	}

	/* Mobile: vertical toolbar anchored to bottom-right */
	@media (max-width: 768px) {
		.controls {
			top: auto;
			bottom: 1rem;
			right: 1rem;
			flex-direction: column;
			padding: 0.35rem;
		}

		.controls.collapsed {
			padding: 0.25rem;
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
		.controls.collapsed .control-group,
		.controls.collapsed .sep {
			width: 0;
			height: 0;
		}

		.sep {
			width: 20px;
			height: 1px;
			margin: 0.1rem 0;
		}

		.control-btn {
			width: 40px;
			height: 40px;
		}

		.control-btn svg {
			width: 20px;
			height: 20px;
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
