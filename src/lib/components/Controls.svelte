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
	<!-- GROUP 1: Playback Controls -->
	<div class="button-group" id="tour-playback-group">
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
		<button id="tour-step-btn" class="control-btn" onclick={onstep} data-tooltip="Step (S)" disabled={simState.isPlaying} aria-label="Step">
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
				aria-label="Speed"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
				</svg>
			</button>
			{#if showSpeedSlider}
				<div class="slider-popup">
					<span>{simState.speed} fps</span>
					<input type="range" min="1" max="120" bind:value={simState.speed} />
				</div>
			{/if}
		</div>
	</div>

	<!-- GROUP 2: Editing Controls -->
	<div class="button-group" id="tour-editing-group">
		<!-- Rules - Calligraphic f (function) -->
		<button id="tour-rules-btn" class="control-btn" class:active={uiState.showRuleEditor} onclick={openRules} data-tooltip="Edit Rules (E)">
			<svg viewBox="0 0 24 24" fill="currentColor">
				<!-- Bold italic f -->
				<path d="M16.5 3C14 3 12.5 4.5 11.8 7L10.5 11H7.5C7 11 6.5 11.4 6.5 12s.5 1 1 1h2.3l-1.6 5.5C7.7 20 6.8 21 5.5 21c-.5 0-.9-.1-1.2-.3-.4-.2-.9-.1-1.1.3-.2.4-.1.9.3 1.1.6.3 1.3.5 2 .5 2.5 0 4-1.5 4.8-4.2L12 13h3.5c.5 0 1-.4 1-1s-.5-1-1-1h-2.8l1.1-3.5C14.3 5.8 15.2 5 16.5 5c.4 0 .8.1 1.1.2.4.2.9 0 1.1-.4.2-.4 0-.9-.4-1.1-.6-.4-1.4-.7-2.3-.7z" />
			</svg>
		</button>

		<!-- Initialize -->
		<button id="tour-init-btn" class="control-btn" class:active={showInitialize} onclick={openInitialize} data-tooltip="Initialize (I)">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<!-- Dice/random scatter icon -->
				<rect x="4" y="4" width="16" height="16" rx="2" />
				<circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
				<circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none" />
				<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
				<circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none" />
				<circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" />
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
				{#if simState.brushState === 1}
					<!-- Paint brush icon for draw mode -->
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18.37 2.63L14 7l-1.59-1.59a2 2 0 00-2.82 0L8 7l9 9 1.59-1.59a2 2 0 000-2.82L17 10l4.37-4.37a2.12 2.12 0 10-3-3z" />
						<path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-10" fill="currentColor" opacity="0.2" />
						<path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-10" />
					</svg>
				{:else}
					<!-- Eraser icon for erase mode -->
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M20 20H9L4 15a1 1 0 010-1.4l9.6-9.6a2 2 0 012.8 0l4.2 4.2a2 2 0 010 2.8L12 20" />
						<path d="M6.5 13.5L13 7" />
						<path d="M4 15l5 5" fill="currentColor" opacity="0.3" />
					</svg>
				{/if}
			</button>
			{#if showBrushSlider}
				<div class="slider-popup brush-popup">
					<div class="mode-toggle">
						<button 
							class="mode-btn" 
							class:active={simState.brushState === 1}
							onclick={() => simState.brushState = 1}
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M18.37 2.63L14 7l-1.59-1.59a2 2 0 00-2.82 0L8 7l9 9 1.59-1.59a2 2 0 000-2.82L17 10l4.37-4.37a2.12 2.12 0 10-3-3z" />
								<path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-10" />
							</svg>
							<span>Draw</span>
						</button>
						<button 
							class="mode-btn" 
							class:active={simState.brushState === 0}
							onclick={() => simState.brushState = 0}
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M20 20H9L4 15a1 1 0 010-1.4l9.6-9.6a2 2 0 012.8 0l4.2 4.2a2 2 0 010 2.8L12 20" />
								<path d="M6.5 13.5L13 7" />
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
		<button id="tour-clear-btn" class="control-btn" onclick={onclear} data-tooltip="Clear (D)" aria-label="Clear">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
			</svg>
		</button>
	</div>

	<!-- GROUP 3: Camera Controls -->
	<div class="button-group" id="tour-camera-group">
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
		<button id="tour-screenshot-btn" class="control-btn" onclick={onscreenshot} data-tooltip="Screenshot" aria-label="Screenshot">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2v11z" />
				<circle cx="12" cy="13" r="4" />
			</svg>
		</button>
	</div>

	<!-- GROUP 4: Info Controls -->
	<div class="button-group" id="tour-info-group">
		<!-- Help -->
		<button id="tour-help-btn" class="control-btn" class:active={showHelp} onclick={handleHelp} data-tooltip="Help (?)" aria-label="Help">
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
	</div>

	<!-- Collapse/Expand toggle - invisible button-group to match sizing -->
	<div class="button-group collapse-group">
		<button class="control-btn collapse-btn" class:collapsed onclick={() => (collapsed = !collapsed)} data-tooltip={collapsed ? "Expand" : "Collapse"} aria-label={collapsed ? "Expand toolbar" : "Collapse toolbar"}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
				<path d="M12 4v16M4 12h16" />
			</svg>
		</button>
	</div>
</div>


<style>
	.controls {
		position: fixed;
		top: 1rem;
		right: 1rem;
		display: flex;
		gap: 0.35rem;
		align-items: center;
		background: var(--toolbar-bg, rgba(12, 12, 18, 0.5));
		backdrop-filter: blur(12px);
		padding: 0.35rem;
		border-radius: 9999px;
		border: 1px solid var(--toolbar-border, rgba(255, 255, 255, 0.08));
		z-index: 100;
		transition: gap 0.2s ease, padding 0.2s ease, background 0.2s ease;
	}

	.controls.collapsed {
		padding: 0.35rem;
		gap: 0;
	}

	/* Button groups - shared background container */
	.button-group {
		display: flex;
		gap: 0;
		align-items: center;
		background: var(--group-bg, rgba(255, 255, 255, 0.04));
		padding: 0.2rem 0.35rem;
		border-radius: 9999px;
		border: 1px solid var(--group-border, rgba(255, 255, 255, 0.06));
		transition: background 0.15s, border-color 0.15s;
	}

	.button-group:hover {
		background: var(--group-bg-hover, rgba(255, 255, 255, 0.06));
		border-color: var(--group-border-hover, rgba(255, 255, 255, 0.1));
	}

	/* Hide all button groups except collapse-group when collapsed */
	.controls.collapsed .button-group:not(.collapse-group) {
		opacity: 0;
		max-width: 0;
		max-height: 0;
		padding: 0;
		margin: 0;
		border-width: 0;
		overflow: hidden;
		pointer-events: none;
	}

	/* Animate button groups appearing/disappearing */
	.button-group {
		transition: opacity 0.2s ease, max-width 0.2s ease, max-height 0.2s ease, padding 0.2s ease, margin 0.2s ease, border-width 0.2s ease, background 0.15s, border-color 0.15s;
		max-width: 200px;
		max-height: 50px;
	}

	.control-btn:not(.collapse-btn),
	.control-group {
		max-width: 50px;
		max-height: 50px;
	}

	.control-btn {
		width: 26px;
		height: 26px;
		border: none;
		outline: none;
		background: transparent;
		color: var(--ui-text, #888);
		cursor: pointer;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.15s;
		-webkit-tap-highlight-color: transparent;
	}

	.control-btn:focus {
		outline: none;
	}

	.control-btn:focus-visible {
		outline: none;
	}

	.control-btn:hover:not(:disabled) {
		color: var(--ui-text-hover, #fff);
	}

	.control-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.control-btn.primary {
		color: var(--ui-accent, #2dd4bf);
	}

	.control-btn.primary:hover {
		filter: brightness(1.2);
	}

	.control-btn.active {
		color: var(--ui-accent, #2dd4bf);
	}

	.control-btn.active:hover:not(:disabled) {
		filter: brightness(1.2);
	}

	.control-btn svg {
		width: 16px;
		height: 16px;
	}

	/* Collapse group - same as button-group but invisible and square */
	.button-group.collapse-group {
		background: transparent;
		border: none;
		/* Make it square */
		padding: 0.25rem;
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		justify-content: center;
	}

	.button-group.collapse-group:hover {
		background: transparent;
		border: none;
	}

	/* Larger icon for collapse button */
	.collapse-btn svg {
		width: 22px;
		height: 22px;
	}

	/* Keep collapse-group visible when collapsed, reset margin/gap effects */
	.controls.collapsed .button-group.collapse-group {
		opacity: 1;
		max-width: none;
		max-height: none;
		padding: 0.25rem;
		margin: 0;
		pointer-events: auto;
		overflow: visible;
	}

	.collapse-btn {
		opacity: 0.7;
		transition: opacity 0.15s, color 0.15s;
	}

	.collapse-btn:hover {
		opacity: 1;
	}

	/* When collapsed, use accent color for the + icon */
	.collapse-btn.collapsed {
		opacity: 1;
		color: var(--ui-accent, #2dd4bf);
	}

	.collapse-btn svg {
		transition: transform 0.2s ease;
	}

	/* Rotate + to × when expanded (speed dial effect) */
	.collapse-btn:not(.collapsed) svg {
		transform: rotate(45deg);
	}

	.control-group {
		position: relative;
	}

	.slider-popup {
		position: absolute;
		top: calc(100% + 0.4rem);
		right: 0;
		background: var(--ui-bg, rgba(12, 12, 18, 0.95));
		-webkit-backdrop-filter: blur(16px);
		backdrop-filter: blur(16px);
		padding: 0.5rem 0.7rem;
		border-radius: 6px;
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		min-width: 120px;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
	}

	/* Make popup more opaque for readability */
	:global(.app) .slider-popup {
		background: rgba(12, 12, 18, 0.95);
	}

	:global(.app.light-theme) .slider-popup {
		background: rgba(255, 255, 255, 0.95);
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
			padding: 0.35rem;
			gap: 0.35rem;
		}

		.controls.collapsed {
			padding: 0.35rem;
			gap: 0;
		}

		/* Button groups stack vertically on mobile */
		.button-group {
			flex-direction: column;
			padding: 0.25rem; /* Equal padding all around */
			gap: 0.1rem; /* Small gap between buttons vertically */
			max-height: none; /* Allow vertical expansion */
			max-width: 50px; /* Constrain width instead */
		}

		/* Collapse group at bottom */
		.button-group.collapse-group {
			order: 100; /* Push to end (bottom) */
			width: 40px;
			height: 40px;
			padding: 0.25rem;
			gap: 0;
		}

		/* Mobile collapsed state */
		.controls.collapsed .button-group:not(.collapse-group) {
			opacity: 0;
			max-width: 0;
			max-height: 0;
			padding: 0;
			margin: 0;
			overflow: hidden;
			pointer-events: none;
		}

		.control-btn {
			width: 28px;
			height: 28px;
			flex-shrink: 0;
		}

		.control-btn svg {
			width: 16px;
			height: 16px;
		}

		/* Keep collapse button icon larger on mobile too */
		.collapse-btn svg {
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
