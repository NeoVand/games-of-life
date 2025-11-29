<script lang="ts">
	import { getSimulationState, GRID_SCALES, type GridScale } from '../stores/simulation.svelte.js';

	interface Props {
		onclose: () => void;
		onscalechange: (scale: GridScale) => void;
	}

	let { onclose, onscalechange }: Props = $props();

	const simState = getSimulationState();

	// Confirmation dialog state
	let showConfirm = $state(false);
	let pendingScale = $state<GridScale | null>(null);

	// Different palettes for dark and light themes
	const darkThemeColors: { name: string; color: [number, number, number]; hex: string }[] = [
		{ name: 'White', color: [1.0, 1.0, 1.0], hex: '#ffffff' },
		{ name: 'Cyan', color: [0.2, 0.9, 0.95], hex: '#33e6f2' },
		{ name: 'Green', color: [0.3, 0.95, 0.5], hex: '#4df280' },
		{ name: 'Purple', color: [0.7, 0.5, 1.0], hex: '#b380ff' },
		{ name: 'Orange', color: [1.0, 0.65, 0.2], hex: '#ffa633' },
		{ name: 'Pink', color: [1.0, 0.45, 0.65], hex: '#ff73a6' }
	];

	const lightThemeColors: { name: string; color: [number, number, number]; hex: string }[] = [
		{ name: 'Black', color: [0.1, 0.1, 0.12], hex: '#1a1a1f' },
		{ name: 'Teal', color: [0.0, 0.5, 0.55], hex: '#00808c' },
		{ name: 'Green', color: [0.1, 0.55, 0.25], hex: '#1a8c40' },
		{ name: 'Purple', color: [0.45, 0.2, 0.7], hex: '#7333b3' },
		{ name: 'Orange', color: [0.85, 0.4, 0.1], hex: '#d9661a' },
		{ name: 'Rose', color: [0.75, 0.2, 0.4], hex: '#bf3366' }
	];

	const colorPalettes = $derived(simState.isLightTheme ? lightThemeColors : darkThemeColors);

	function getSelectedColorIndex(): number {
		const [r, g, b] = simState.aliveColor;
		const palettes = simState.isLightTheme ? lightThemeColors : darkThemeColors;
		return palettes.findIndex(
			(p) => Math.abs(p.color[0] - r) < 0.15 && Math.abs(p.color[1] - g) < 0.15 && Math.abs(p.color[2] - b) < 0.15
		);
	}

	function selectColor(color: [number, number, number]) {
		simState.aliveColor = color;
	}

	function setTheme(isLight: boolean) {
		// Get current color index before switching
		const currentIndex = getSelectedColorIndex();
		const safeIndex = currentIndex >= 0 ? currentIndex : 0;
		
		simState.isLightTheme = isLight;
		// Keep the same index in the new palette
		const newPalette = isLight ? lightThemeColors : darkThemeColors;
		simState.aliveColor = newPalette[safeIndex].color;
	}

	function requestScale(scale: GridScale) {
		if (scale === simState.gridScale) return;
		
		// Pause if playing
		if (simState.isPlaying) {
			simState.pause();
		}
		
		pendingScale = scale;
		showConfirm = true;
	}

	function confirmResize() {
		if (pendingScale) {
			onscalechange(pendingScale);
		}
		showConfirm = false;
		pendingScale = null;
	}

	function cancelResize() {
		showConfirm = false;
		pendingScale = null;
	}
	
	// Get current dimensions for display
	const currentDimensions = $derived(`${simState.gridWidth}×${simState.gridHeight}`);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (showConfirm ? cancelResize() : onclose())} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={(e) => e.target === e.currentTarget && onclose()}>
	{#if showConfirm}
		<!-- Confirmation Dialog -->
		<div class="confirm-dialog">
			<p>Changing grid scale will clear the simulation.</p>
			<p class="sub">A new grid will be created to fit your screen.</p>
			<div class="confirm-btns">
				<button class="btn secondary" onclick={cancelResize}>Cancel</button>
				<button class="btn primary" onclick={confirmResize}>Continue</button>
			</div>
		</div>
	{:else}
		<!-- Settings Panel -->
		<div class="panel">
			<div class="header">
				<span class="title">Settings</span>
				<button class="close-btn" onclick={onclose} aria-label="Close">✕</button>
			</div>

			<div class="content">
				<!-- Grid Toggle -->
				<div class="row">
					<span class="label">Grid Lines</span>
					<button
						class="toggle"
						class:on={simState.showGrid}
						onclick={() => (simState.showGrid = !simState.showGrid)}
					>
						<span class="track"><span class="thumb"></span></span>
					</button>
				</div>

				<!-- Theme -->
				<div class="row">
					<span class="label">Theme</span>
					<div class="theme-btns">
						<button 
							class="theme-btn" 
							class:active={!simState.isLightTheme} 
							onclick={() => setTheme(false)}
							title="Dark"
						>
							<svg viewBox="0 0 24 24" fill="currentColor">
								<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
							</svg>
						</button>
						<button 
							class="theme-btn" 
							class:active={simState.isLightTheme} 
							onclick={() => setTheme(true)}
							title="Light"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="5"/>
								<path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
							</svg>
						</button>
					</div>
				</div>

				<!-- Color Palette -->
				<div class="row">
					<span class="label">Color</span>
					<div class="colors">
						{#each colorPalettes as cp, i}
							<button
								class="swatch"
								class:selected={getSelectedColorIndex() === i}
								style="--c: {cp.hex}"
								title={cp.name}
								onclick={() => selectColor(cp.color)}
							></button>
						{/each}
					</div>
				</div>

				<!-- Boundary Mode -->
				<div class="row">
					<span class="label">Boundary</span>
					<div class="boundary-btns">
						<button 
							class="boundary-btn" 
							class:active={simState.wrapBoundary} 
							onclick={() => (simState.wrapBoundary = true)}
							title="Wrap (Toroidal)"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="9" />
								<path d="M12 3c-2 3-2 9 0 18M12 3c2 3 2 9 0 18M3 12h18" />
							</svg>
						</button>
						<button 
							class="boundary-btn" 
							class:active={!simState.wrapBoundary} 
							onclick={() => (simState.wrapBoundary = false)}
							title="Fixed Edges"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<rect x="3" y="3" width="18" height="18" rx="2" />
								<path d="M3 3l18 18M21 3l-18 18" />
							</svg>
						</button>
					</div>
				</div>

				<!-- Grid Scale -->
				<div class="row col">
					<div class="label-row">
						<span class="label">Grid Scale</span>
						<span class="dim-hint">{currentDimensions}</span>
					</div>
					<div class="sizes">
						{#each GRID_SCALES as scale}
							<button
								class="size"
								class:selected={simState.gridScale === scale.name}
								onclick={() => requestScale(scale.name)}
							>
								{scale.label}
							</button>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.panel {
		background: var(--ui-bg, rgba(12, 12, 18, 0.85));
		backdrop-filter: blur(16px);
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 10px;
		padding: 0.6rem;
		min-width: 240px;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--ui-border, rgba(255, 255, 255, 0.06));
		margin-bottom: 0.5rem;
	}

	.title {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--ui-text-hover, #e0e0e0);
	}

	.close-btn {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: var(--ui-text, #555);
		font-size: 0.8rem;
		cursor: pointer;
		border-radius: 3px;
	}

	.close-btn:hover {
		background: var(--ui-border, rgba(255, 255, 255, 0.1));
		color: var(--ui-text-hover, #fff);
	}

	.content {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.row.col {
		flex-direction: column;
		align-items: flex-start;
	}

	.label {
		font-size: 0.7rem;
		color: var(--ui-text, #888);
	}

	.label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
	}

	.dim-hint {
		font-size: 0.6rem;
		color: var(--ui-text, #555);
		font-family: 'SF Mono', Monaco, monospace;
	}

	/* Toggle */
	.toggle {
		display: flex;
		align-items: center;
		padding: 0;
		background: none;
		border: none;
		cursor: pointer;
	}

	.track {
		width: 32px;
		height: 18px;
		background: var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 9px;
		position: relative;
		transition: background 0.15s;
	}

	.toggle.on .track {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.4));
	}

	.thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 14px;
		height: 14px;
		background: var(--ui-text, #555);
		border-radius: 50%;
		transition: all 0.15s;
	}

	.toggle.on .thumb {
		left: 16px;
		background: var(--ui-accent, #2dd4bf);
	}

	/* Theme buttons with icons */
	.theme-btns {
		display: flex;
		gap: 0.3rem;
	}

	.theme-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--ui-border, rgba(255, 255, 255, 0.05));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
		border-radius: 5px;
		color: var(--ui-text, #666);
		cursor: pointer;
		transition: all 0.1s;
	}

	.theme-btn svg {
		width: 14px;
		height: 14px;
	}

	.theme-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		color: var(--ui-text-hover, #fff);
	}

	.theme-btn.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.3));
		color: var(--ui-accent, #2dd4bf);
	}

	/* Boundary buttons */
	.boundary-btns {
		display: flex;
		gap: 0.3rem;
	}

	.boundary-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--ui-border, rgba(255, 255, 255, 0.05));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
		border-radius: 5px;
		color: var(--ui-text, #666);
		cursor: pointer;
		transition: all 0.1s;
	}

	.boundary-btn svg {
		width: 14px;
		height: 14px;
	}

	.boundary-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		color: var(--ui-text-hover, #fff);
	}

	.boundary-btn.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.3));
		color: var(--ui-accent, #2dd4bf);
	}

	/* Generic option buttons */
	.btns {
		display: flex;
		gap: 0.25rem;
	}

	.opt {
		padding: 0.25rem 0.5rem;
		background: var(--ui-border, rgba(255, 255, 255, 0.05));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
		border-radius: 4px;
		color: var(--ui-text, #666);
		font-size: 0.65rem;
		cursor: pointer;
		transition: all 0.1s;
	}

	.opt:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
	}

	.opt.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.3));
		color: var(--ui-accent, #2dd4bf);
	}

	/* Color swatches */
	.colors {
		display: flex;
		gap: 0.3rem;
	}

	.swatch {
		width: 20px;
		height: 20px;
		background: var(--c);
		border: 2px solid transparent;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.1s;
	}

	.swatch:hover {
		transform: scale(1.1);
	}

	.swatch.selected {
		border-color: #fff;
		box-shadow: 0 0 6px var(--c);
	}

	/* Grid sizes */
	.sizes {
		display: flex;
		gap: 0.3rem;
		width: 100%;
	}

	.size {
		flex: 1;
		padding: 0.35rem 0.4rem;
		background: var(--ui-border, rgba(255, 255, 255, 0.05));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
		border-radius: 4px;
		color: var(--ui-text, #666);
		font-size: 0.65rem;
		cursor: pointer;
		transition: all 0.1s;
	}

	.size:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
	}

	.size.selected {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.3));
		color: var(--ui-accent, #2dd4bf);
	}

	/* Confirmation Dialog */
	.confirm-dialog {
		background: var(--ui-bg, rgba(12, 12, 18, 0.95));
		backdrop-filter: blur(16px);
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 10px;
		padding: 1rem;
		max-width: 280px;
		text-align: center;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
	}

	.confirm-dialog p {
		margin: 0 0 0.3rem;
		font-size: 0.8rem;
		color: var(--ui-text-hover, #e0e0e0);
	}

	.confirm-dialog .sub {
		font-size: 0.7rem;
		color: var(--ui-text, #666);
		margin-bottom: 0.8rem;
	}

	.confirm-btns {
		display: flex;
		gap: 0.4rem;
		justify-content: center;
	}

	.btn {
		padding: 0.35rem 0.8rem;
		border-radius: 5px;
		font-size: 0.7rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.1s;
	}

	.btn.secondary {
		background: transparent;
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		color: var(--ui-text, #888);
	}

	.btn.secondary:hover {
		background: var(--ui-border, rgba(255, 255, 255, 0.05));
		color: var(--ui-text-hover, #e0e0e0);
	}

	.btn.primary {
		background: var(--ui-accent, #2dd4bf);
		border: none;
		color: #0a0a0f;
	}

	.btn.primary:hover {
		filter: brightness(1.1);
	}

	/* Mobile adjustments */
	@media (max-width: 768px) {
		.modal {
			max-width: 95vw;
			padding: 0.8rem;
		}

		.colors-grid {
			gap: 0.4rem;
		}

		.color-btn {
			width: 28px;
			height: 28px;
		}

		.scale-options {
			flex-wrap: wrap;
		}

		.scale-btn {
			padding: 0.4rem 0.6rem;
			font-size: 0.65rem;
		}

		.header h2 {
			font-size: 0.9rem;
		}
	}
</style>
