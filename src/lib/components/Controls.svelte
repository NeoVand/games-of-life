<script lang="ts">
	import { getSimulationState, getUIState } from '../stores/simulation.svelte.js';

	interface Props {
		onclear: () => void;
		onrandomize: () => void;
		onstep: () => void;
		onresetview: () => void;
	}

	let { onclear, onrandomize, onstep, onresetview }: Props = $props();

	const simState = getSimulationState();
	const uiState = getUIState();

	let showSpeedSlider = $state(false);
	let showBrushSlider = $state(false);
</script>

<div class="controls">
	<!-- Play/Pause -->
	<button
		class="control-btn primary"
		onclick={() => simState.togglePlay()}
		title={simState.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
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
	<button
		class="control-btn"
		onclick={onstep}
		title="Step (S)"
		disabled={simState.isPlaying}
	>
		<svg viewBox="0 0 24 24" fill="currentColor">
			<path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2V6z" />
		</svg>
	</button>

	<div class="separator"></div>

	<!-- Speed -->
	<div class="control-group">
		<button
			class="control-btn"
			onclick={() => (showSpeedSlider = !showSpeedSlider)}
			title="Speed"
			class:active={showSpeedSlider}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="10" />
				<path d="M12 6v6l4 2" />
			</svg>
		</button>
		{#if showSpeedSlider}
			<div class="slider-popup">
				<label>
					<span>Speed: {simState.speed} fps</span>
					<input
						type="range"
						min="1"
						max="120"
						bind:value={simState.speed}
					/>
				</label>
			</div>
		{/if}
	</div>

	<!-- Brush Size -->
	<div class="control-group">
		<button
			class="control-btn"
			onclick={() => (showBrushSlider = !showBrushSlider)}
			title="Brush Size"
			class:active={showBrushSlider}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r={Math.min(8, simState.brushSize)} />
			</svg>
		</button>
		{#if showBrushSlider}
			<div class="slider-popup">
				<label>
					<span>Brush: {simState.brushSize}px</span>
					<input
						type="range"
						min="1"
						max="50"
						bind:value={simState.brushSize}
					/>
				</label>
			</div>
		{/if}
	</div>

	<div class="separator"></div>

	<!-- Clear -->
	<button class="control-btn" onclick={onclear} title="Clear (C)">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
		</svg>
	</button>

	<!-- Randomize -->
	<button class="control-btn" onclick={onrandomize} title="Randomize (R)">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
		</svg>
	</button>

	<!-- Reset View -->
	<button class="control-btn" onclick={onresetview} title="Reset View (Home)">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
		</svg>
	</button>

	<div class="separator"></div>

	<!-- Grid Toggle -->
	<button
		class="control-btn"
		onclick={() => (simState.showGrid = !simState.showGrid)}
		title="Toggle Grid (G)"
		class:active={simState.showGrid}
	>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M3 3h18v18H3V3zm6 0v18M15 3v18M3 9h18M3 15h18" />
		</svg>
	</button>

	<!-- Rules -->
	<button
		class="control-btn"
		onclick={() => (uiState.showRuleEditor = true)}
		title="Edit Rules (E)"
	>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
		</svg>
	</button>
</div>

<!-- Generation Counter -->
<div class="generation">
	Gen: {simState.generation.toLocaleString()}
</div>

<!-- Current Rule -->
<div class="rule-display">
	{simState.currentRule.name} ({simState.currentRule.ruleString})
</div>

<style>
	.controls {
		position: fixed;
		top: 1rem;
		right: 1rem;
		display: flex;
		gap: 0.5rem;
		align-items: center;
		background: rgba(20, 20, 30, 0.85);
		backdrop-filter: blur(10px);
		padding: 0.5rem;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		z-index: 100;
	}

	.control-btn {
		width: 40px;
		height: 40px;
		border: none;
		background: transparent;
		color: #a0a0a0;
		cursor: pointer;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.control-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	.control-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.control-btn.primary {
		background: rgba(45, 212, 191, 0.2);
		color: #2dd4bf;
	}

	.control-btn.primary:hover {
		background: rgba(45, 212, 191, 0.3);
	}

	.control-btn.active {
		background: rgba(255, 255, 255, 0.15);
		color: #fff;
	}

	.control-btn svg {
		width: 20px;
		height: 20px;
	}

	.separator {
		width: 1px;
		height: 24px;
		background: rgba(255, 255, 255, 0.1);
		margin: 0 0.25rem;
	}

	.control-group {
		position: relative;
	}

	.slider-popup {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		background: rgba(20, 20, 30, 0.95);
		backdrop-filter: blur(10px);
		padding: 0.75rem 1rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		min-width: 160px;
	}

	.slider-popup label {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.slider-popup span {
		font-size: 0.8rem;
		color: #a0a0a0;
	}

	.slider-popup input[type='range'] {
		width: 100%;
		accent-color: #2dd4bf;
	}

	.generation {
		position: fixed;
		bottom: 1rem;
		left: 1rem;
		background: rgba(20, 20, 30, 0.85);
		backdrop-filter: blur(10px);
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		font-size: 0.85rem;
		color: #a0a0a0;
		font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
		z-index: 100;
	}

	.rule-display {
		position: fixed;
		bottom: 1rem;
		right: 1rem;
		background: rgba(20, 20, 30, 0.85);
		backdrop-filter: blur(10px);
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		font-size: 0.85rem;
		color: #a0a0a0;
		z-index: 100;
	}
</style>

