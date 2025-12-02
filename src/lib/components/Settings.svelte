<script lang="ts">
	import { getSimulationState, DARK_THEME_COLORS, LIGHT_THEME_COLORS, SPECTRUM_MODES, type SpectrumMode } from '../stores/simulation.svelte.js';

	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();

	const simState = getSimulationState();

	const colorPalettes = $derived(simState.isLightTheme ? LIGHT_THEME_COLORS : DARK_THEME_COLORS);

	function getSelectedColorIndex(): number {
		const [r, g, b] = simState.aliveColor;
		const palettes = simState.isLightTheme ? LIGHT_THEME_COLORS : DARK_THEME_COLORS;
		return palettes.findIndex(
			(p) => p.color[0] === r && p.color[1] === g && p.color[2] === b
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
		const newPalette = isLight ? LIGHT_THEME_COLORS : DARK_THEME_COLORS;
		simState.aliveColor = newPalette[safeIndex].color;
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div class="backdrop" onclick={(e) => e.target === e.currentTarget && onclose()} onwheel={(e) => {
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
	<!-- Theme Panel -->
		<div class="panel">
			<div class="header">
				<span class="title">
					<svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<!-- Color palette icon -->
						<circle cx="13.5" cy="6.5" r="2.5"/>
						<circle cx="17.5" cy="10.5" r="2.5"/>
						<circle cx="8.5" cy="7.5" r="2.5"/>
						<circle cx="6.5" cy="12.5" r="2.5"/>
						<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2Z"/>
					</svg>
					Theme
				</span>
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
						aria-label="Toggle grid lines"
					>
						<span class="track"><span class="thumb"></span></span>
					</button>
				</div>

				<!-- Theme -->
				<div class="row">
					<span class="label">Mode</span>
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

				<!-- Spectrum Mode -->
				<div class="row">
					<span class="label">Spectrum</span>
					<div class="spectrum-btns">
						{#each SPECTRUM_MODES as mode}
							<button 
								class="spectrum-btn" 
								class:active={simState.spectrumMode === mode.id}
								onclick={() => simState.spectrumMode = mode.id}
								title={mode.description}
							>
								{mode.name}
							</button>
						{/each}
					</div>
				</div>

				<!-- Neighbor Shading -->
				<div class="row">
					<span class="label">Clustering</span>
					<div class="shading-toggle">
						<button 
							class="shading-option" 
							class:active={simState.neighborShading === 'off'}
							onclick={() => simState.neighborShading = 'off'}
						>Off</button>
						<button 
							class="shading-option" 
							class:active={simState.neighborShading === 'alive'}
							onclick={() => simState.neighborShading = 'alive'}
						>Alive</button>
						<button 
							class="shading-option" 
							class:active={simState.neighborShading === 'vitality'}
							onclick={() => simState.neighborShading = 'vitality'}
						>Vitality</button>
					</div>
				</div>
			</div>
		</div>
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

	.label {
		font-size: 0.7rem;
		color: var(--ui-text, #888);
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

	/* Spectrum mode buttons */
	.spectrum-btns {
		display: flex;
		gap: 0.2rem;
		flex-wrap: wrap;
	}

	.spectrum-btn {
		padding: 0.2rem 0.4rem;
		background: var(--ui-border, rgba(255, 255, 255, 0.05));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
		border-radius: 4px;
		color: var(--ui-text, #666);
		font-size: 0.6rem;
		cursor: pointer;
		transition: all 0.1s;
	}

	.spectrum-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		color: var(--ui-text-hover, #fff);
	}

	.spectrum-btn.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.3));
		color: var(--ui-accent, #2dd4bf);
	}

	/* Shading toggle styling */
	.shading-toggle {
		display: flex;
		align-items: center;
		gap: 0;
		padding: 0;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 4px;
		overflow: hidden;
	}

	.shading-option {
		font-size: 0.6rem;
		font-weight: 500;
		padding: 0.2rem 0.4rem;
		color: var(--ui-text, #666);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all 0.15s;
		user-select: none;
		line-height: 1;
	}

	.shading-option:hover {
		color: var(--ui-text-hover, #fff);
	}

	.shading-option.active {
		color: var(--ui-accent, #2dd4bf);
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2));
	}

	/* Color swatches */
	.colors {
		display: grid;
		grid-template-columns: repeat(10, 1fr);
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

	/* Mobile adjustments */
	@media (max-width: 768px) {
		.panel {
			max-width: 95vw;
			padding: 0.8rem;
		}

		.colors {
			gap: 0.4rem;
		}

		.swatch {
			width: 24px;
			height: 24px;
		}

		.title {
			font-size: 0.9rem;
		}
	}
</style>
