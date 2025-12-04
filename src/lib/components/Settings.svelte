<script lang="ts">
	import { getSimulationState, DARK_THEME_COLORS, LIGHT_THEME_COLORS, SPECTRUM_MODES, type SpectrumMode } from '../stores/simulation.svelte.js';

	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();

	const simState = getSimulationState();

	const colorPalettes = $derived(simState.isLightTheme ? LIGHT_THEME_COLORS : DARK_THEME_COLORS);

	// Split spectrum modes into two rows
	const smoothModes = SPECTRUM_MODES.slice(0, 6);
	const sharpModes = SPECTRUM_MODES.slice(6);

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

	// Helper functions for color conversion (matching shader logic)
	function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const l = (max + min) / 2;
		
		if (max === min) return [0, 0, l];
		
		const d = max - min;
		const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		
		let h = 0;
		if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
		else if (max === g) h = ((b - r) / d + 2) / 6;
		else h = ((r - g) / d + 4) / 6;
		
		return [h, s, l];
	}

	function hslToRgb(h: number, s: number, l: number): [number, number, number] {
		if (s === 0) return [l, l, l];
		
		const hue2rgb = (p: number, q: number, t: number) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1/6) return p + (q - p) * 6 * t;
			if (t < 1/2) return q;
			if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
			return p;
		};
		
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		
		return [hue2rgb(p, q, h + 1/3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1/3)];
	}

	function rgbToHex(r: number, g: number, b: number): string {
		const toHex = (c: number) => Math.round(c * 255).toString(16).padStart(2, '0');
		return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
	}

	// Generate gradient CSS for a spectrum mode
	function getSpectrumGradient(modeId: SpectrumMode): string {
		const [r, g, b] = simState.aliveColor;
		const [aliveH, aliveS, aliveL] = rgbToHsl(r, g, b);
		const isLight = simState.isLightTheme;
		const numStops = 12;
		const colors: string[] = [];

		for (let i = 0; i <= numStops; i++) {
			const progress = i / numStops;
			let h = aliveH, s = aliveS, l = aliveL;
			const fade = progress * progress;

			switch (modeId) {
				case 'hueShift':
					h = (aliveH + 0.25 * progress) % 1;
					s = Math.max(aliveS, 0.5) * Math.max(1 - progress * 0.4, 0.5);
					l = isLight ? aliveL + (0.92 - aliveL) * fade : aliveL + (0.12 - aliveL) * fade;
					break;
				case 'rainbow':
					h = (aliveH + progress) % 1;
					s = isLight ? 0.7 : Math.max(aliveS, 0.5) * Math.max(1 - progress * 0.3, 0.45);
					l = isLight ? aliveL + (0.88 - aliveL) * fade : aliveL + (0.15 - aliveL) * fade;
					break;
				case 'warm':
					h = aliveH + (0.05 - aliveH) * progress;
					if (h < 0) h += 1;
					s = Math.max(aliveS, 0.5) * Math.max(1 - progress * 0.3, 0.4);
					l = isLight ? aliveL + (0.9 - aliveL) * fade : aliveL + (0.1 - aliveL) * fade;
					break;
				case 'cool':
					h = aliveH + (0.7 - aliveH) * progress;
					if (h < 0) h += 1;
					s = Math.max(aliveS, 0.5) * Math.max(1 - progress * 0.3, 0.4);
					l = isLight ? aliveL + (0.9 - aliveL) * fade : aliveL + (0.1 - aliveL) * fade;
					break;
				case 'monochrome':
					s = Math.max(aliveS, 0.4) * (1 - progress * 0.6);
					l = isLight ? aliveL + (0.93 - aliveL) * progress : aliveL + (0.1 - aliveL) * progress;
					break;
				case 'fire':
					if (progress < 0.33) h = aliveH + (0.12 - aliveH) * (progress * 3);
					else if (progress < 0.66) h = 0.12 + (0.06 - 0.12) * ((progress - 0.33) * 3);
					else h = 0.06 + (0.0 - 0.06) * ((progress - 0.66) * 3);
					s = isLight ? Math.max(0.85 - fade * 0.25, 0.55) : Math.max(1 - fade * 0.2, 0.75);
					l = isLight ? 0.55 + (0.9 - 0.55) * fade : 0.65 + (0.04 - 0.65) * fade;
					break;
				case 'thermal': {
					const band = Math.floor(progress * 16);
					const hues = [0.83, 0.75, 0.66, 0.5, 0.33, 0.16, 0.05, 0.0];
					h = hues[Math.floor((band / 8 % 1) * 7)];
					s = band % 2 === 0 ? 0.95 : 0.75;
					l = isLight ? 0.5 + (0.88 - 0.5) * fade : 0.55 + (0.1 - 0.55) * fade;
					break;
				}
				case 'bands': {
					const band = Math.floor(progress * 16);
					h = (aliveH + (band / 15) * 1.5) % 1;
					s = isLight ? 0.8 : 0.85;
					l = isLight ? (band % 2 === 0 ? 0.45 : 0.6) : (band % 2 === 0 ? 0.55 : 0.4);
					const fadeCubic = progress * progress * progress;
					l = l + (isLight ? 0.9 - l : 0.1 - l) * fadeCubic * 0.7;
					break;
				}
				case 'neon': {
					const band = Math.floor(progress * 12);
					const colorIdx = band % 3;
					h = colorIdx === 0 ? 0.5 : colorIdx === 1 ? 0.83 : 0.14;
					s = Math.max(1 - fade * 0.5, 0.4);
					l = isLight ? 0.45 + (0.9 - 0.45) * fade * 0.6 : 0.5 + (0.1 - 0.5) * fade * 0.6;
					break;
				}
				case 'sunset': {
					const band = Math.floor(progress * 20);
					const bandProgress = band / 19;
					h = bandProgress < 0.3 ? 0.14 + (0 - 0.14) * (bandProgress / 0.3) : (bandProgress - 0.3) / 0.7 * 0.66;
					if (h < 0) h += 1;
					s = band % 2 === 0 ? 0.9 : 0.7;
					l = isLight ? 0.5 + (0.9 - 0.5) * fade : 0.55 + (0.1 - 0.55) * fade;
					break;
				}
				case 'aurora': {
					const band = Math.floor(progress * 24);
					const colorPhase = (band % 6) / 6;
					if (colorPhase < 0.33) h = 0.33 + (0.5 - 0.33) * colorPhase * 3;
					else if (colorPhase < 0.66) h = 0.5 + (0.85 - 0.5) * (colorPhase - 0.33) * 3;
					else h = 0.85 + (0.33 - 0.85) * (colorPhase - 0.66) * 3;
					if (h > 1) h -= 1;
					const wave = Math.sin(band * 0.5) * 0.5 + 0.5;
					s = 0.7 + wave * 0.25;
					l = isLight ? 0.5 + wave * 0.15 + (0.88 - 0.5) * fade : 0.45 + wave * 0.2 + (0.1 - 0.45) * fade;
					break;
				}
			}

			const [cr, cg, cb] = hslToRgb(h, s, l);
			colors.push(rgbToHex(cr, cg, cb));
		}

		return `linear-gradient(to right, ${colors.join(', ')})`;
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
						<!-- Droplet icon - simple and clean -->
						<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
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

				<!-- Spectrum Mode - Smooth Gradients Row -->
				<div class="row col">
					<span class="label">Spectrum <span class="label-hint">(Smooth)</span></span>
					<div class="spectrum-grid">
						{#each smoothModes as mode}
							<button 
								class="spectrum-btn" 
								class:active={simState.spectrumMode === mode.id}
								onclick={() => simState.spectrumMode = mode.id}
								title={mode.description}
							>
								<div class="spectrum-preview" style="background: {getSpectrumGradient(mode.id)}"></div>
								<span class="spectrum-label">{mode.name}</span>
							</button>
						{/each}
					</div>
				</div>

				<!-- Spectrum Mode - Sharp Transitions Row -->
				<div class="row col">
					<span class="label"><span class="label-hint">(Sharp)</span></span>
					<div class="spectrum-grid">
						{#each sharpModes as mode}
							<button 
								class="spectrum-btn" 
								class:active={simState.spectrumMode === mode.id}
								onclick={() => simState.spectrumMode = mode.id}
								title={mode.description}
							>
								<div class="spectrum-preview" style="background: {getSpectrumGradient(mode.id)}"></div>
								<span class="spectrum-label">{mode.name}</span>
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

	/* Spectrum mode buttons with gradient preview */
	.spectrum-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.spectrum-grid .spectrum-btn {
		flex: 1 1 calc(16.66% - 0.3rem);
		min-width: 36px;
		max-width: calc(20% - 0.3rem);
	}

	.spectrum-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		padding: 0.2rem;
		background: var(--ui-border, rgba(255, 255, 255, 0.05));
		border: 2px solid transparent;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.1s;
	}

	.spectrum-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.1));
	}

	.spectrum-btn.active {
		border-color: var(--ui-accent, #2dd4bf);
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.1));
	}

	.spectrum-preview {
		width: 100%;
		height: 10px;
		border-radius: 2px;
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
	}

	.spectrum-label {
		font-size: 0.5rem;
		color: var(--ui-text, #888);
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.spectrum-btn.active .spectrum-label {
		color: var(--ui-accent, #2dd4bf);
	}

	.label-hint {
		font-size: 0.55rem;
		color: var(--ui-text-muted, #666);
		font-weight: normal;
	}

	.row.col {
		flex-direction: column;
		align-items: flex-start;
		gap: 0.3rem;
	}

	.row.col .label {
		margin-bottom: 0;
	}

	.row.col .spectrum-grid {
		width: 100%;
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
