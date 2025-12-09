<script lang="ts">
	import { getSimulationState, DARK_THEME_COLORS, LIGHT_THEME_COLORS, SPECTRUM_MODES, type SpectrumMode } from '../stores/simulation.svelte.js';
	import { draggable } from '../utils/draggable.js';
	import { bringToFront, setModalPosition, getModalState } from '../stores/modalManager.svelte.js';

	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();

	const simState = getSimulationState();
	
	// Modal dragging state
	const modalState = $derived(getModalState('settings'));
	
	function handleDragEnd(position: { x: number; y: number }) {
		setModalPosition('settings', position);
	}
	
	function handleModalClick() {
		bringToFront('settings');
	}

	const colorPalettes = $derived(simState.isLightTheme ? LIGHT_THEME_COLORS : DARK_THEME_COLORS);

	// Split spectrum modes into three rows
	const smoothModes = SPECTRUM_MODES.slice(0, 6);    // Row 1: Smooth gradients
	const harmonyModes = SPECTRUM_MODES.slice(6, 12);  // Row 2: Color harmonies
	const bandedModes = SPECTRUM_MODES.slice(12, 18);  // Row 3: Banded/themed

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

	// Generate gradient CSS for a spectrum mode (simplified preview, matches shader logic)
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
				// Row 1: Smooth gradients
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
				
				// Row 2: Color harmonies
				case 'complement': {
					const complementH = (aliveH + 0.5) % 1;
					h = aliveH + (complementH - aliveH) * progress;
					if (h > 1) h -= 1;
					const satCurve = 1 - Math.abs(progress - 0.5) * 1.5;
					s = Math.max(aliveS, 0.6) * Math.max(satCurve, 0.5);
					l = isLight ? aliveL + (0.9 - aliveL) * fade : aliveL + (0.12 - aliveL) * fade;
					break;
				}
				case 'triadic': {
					const triadic1 = (aliveH + 0.333) % 1;
					const triadic2 = (aliveH + 0.666) % 1;
					h = progress < 0.5 
						? aliveH + (triadic1 - aliveH) * (progress * 2)
						: triadic1 + (triadic2 - triadic1) * ((progress - 0.5) * 2);
					if (h > 1) h -= 1;
					s = Math.max(aliveS, 0.55) * Math.max(1 - progress * 0.25, 0.5);
					l = isLight ? aliveL + (0.88 - aliveL) * fade : aliveL + (0.12 - aliveL) * fade;
					break;
				}
				case 'split': {
					const split1 = (aliveH + 0.417) % 1;
					const split2 = (aliveH - 0.417 + 1) % 1;
					const phase = Math.sin(progress * Math.PI * 2) * 0.5 + 0.5;
					h = split1 + (split2 - split1) * phase;
					if (h < 0) h += 1;
					s = Math.max(aliveS, 0.5) * Math.max(1 - progress * 0.3, 0.45);
					l = isLight ? aliveL + (0.88 - aliveL) * fade : aliveL + (0.12 - aliveL) * fade;
					break;
				}
				case 'analogous': {
					const wave = Math.sin(progress * Math.PI * 3);
					h = aliveH + wave * 0.083;
					if (h < 0) h += 1;
					if (h > 1) h -= 1;
					s = Math.max(aliveS, 0.45) * Math.max(1 - progress * 0.35, 0.4);
					l = isLight ? aliveL + (0.9 - aliveL) * fade : aliveL + (0.12 - aliveL) * fade;
					break;
				}
				case 'pastel':
					h = (aliveH + progress * 0.15) % 1;
					s = Math.max(aliveS * 0.5, 0.2) * (1 - progress * 0.5);
					l = isLight ? Math.max(aliveL, 0.7) + (0.95 - Math.max(aliveL, 0.7)) * progress
						: Math.max(aliveL, 0.5) + (0.2 - Math.max(aliveL, 0.5)) * progress;
					break;
				case 'vivid': {
					const band = Math.floor(progress * 8);
					h = (aliveH + (band / 8) * 0.4) % 1;
					s = Math.min(1, Math.max(aliveS, 0.75) + 0.15);
					l = isLight ? 0.5 + (0.85 - 0.5) * fade : 0.55 + (0.1 - 0.55) * fade;
					break;
				}
				
				// Row 3: Banded/themed
				case 'thermal': {
					const band = Math.floor(progress * 12);
					const bandT = band / 11;
					const isWarmStart = aliveH < 0.17 || aliveH > 0.83;
					h = isWarmStart ? aliveH + (0.75 - aliveH) * bandT : aliveH + (0 - aliveH) * bandT;
					if (h < 0) h += 1;
					if (h > 1) h -= 1;
					s = band % 2 === 0 ? 0.9 : 0.7;
					l = isLight ? 0.5 + (0.88 - 0.5) * fade : 0.55 + (0.12 - 0.55) * fade;
					break;
				}
				case 'bands': {
					const band = Math.floor(progress * 10);
					h = (aliveH + (band / 10) * 0.6) % 1;
					s = band % 2 === 0 ? Math.max(aliveS, 0.75) : Math.max(aliveS, 0.55);
					l = isLight ? (band % 2 === 0 ? 0.5 : 0.62) : (band % 2 === 0 ? 0.52 : 0.4);
					l = l + (isLight ? 0.9 - l : 0.1 - l) * fade;
					break;
				}
				case 'neon': {
					const band = Math.floor(progress * 9);
					const colorIdx = band % 3;
					h = colorIdx === 0 ? aliveH : colorIdx === 1 ? (aliveH + 0.333) % 1 : (aliveH + 0.666) % 1;
					s = 1;
					// Match shader: lightness varies by band % 3, then fades
					const bandLightVar = colorIdx; // 0, 1, or 2
					const baseL = isLight ? 0.48 + bandLightVar * 0.04 : 0.52 + bandLightVar * 0.05;
					l = baseL + (isLight ? 0.88 - baseL : 0.08 - baseL) * fade;
					break;
				}
				case 'sunset': {
					const band = Math.floor(progress * 12);
					const bandT = band / 11;
					const warmH = aliveH + (0.08 - aliveH) * 0.5;
					h = warmH + (0.6 - warmH) * bandT;
					if (h < 0) h += 1;
					s = band % 2 === 0 ? 0.85 : 0.65;
					l = isLight ? 0.55 + (0.88 - 0.55) * fade : 0.55 + (0.1 - 0.55) * fade;
					break;
				}
				case 'ocean': {
					const band = Math.floor(progress * 10);
					const bandT = band / 9;
					const baseOcean = 0.5 + (0.66 - 0.5) * bandT;
					h = aliveH + (baseOcean - aliveH) * (0.3 + progress * 0.7);
					const wave = Math.sin(bandT * Math.PI * 2) * 0.15;
					s = isLight ? Math.max(0.5, aliveS * 0.8) + wave : Math.max(0.6, aliveS * 0.9) + wave;
					l = isLight ? 0.55 + (0.88 - 0.55) * fade : 0.5 + (0.08 - 0.5) * fade;
					break;
				}
				case 'forest': {
					const band = Math.floor(progress * 10);
					const bandT = band / 9;
					const forestH = 0.33 + (0.08 - 0.33) * bandT;
					h = aliveH + (forestH - aliveH) * (0.4 + progress * 0.6);
					if (h < 0) h += 1;
					s = isLight ? Math.max(aliveS, 0.5) + (0.35 - Math.max(aliveS, 0.5)) * bandT
						: Math.max(aliveS, 0.6) + (0.4 - Math.max(aliveS, 0.6)) * bandT;
					l = isLight ? 0.5 + (0.88 - 0.5) * fade : 0.45 + (0.1 - 0.45) * fade;
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
<div class="backdrop" style="z-index: {modalState.zIndex};" onwheel={(e) => {
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
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div 
			class="panel"
			onclick={handleModalClick}
			use:draggable={{ 
				handle: '.header', 
				bounds: true,
				initialPosition: modalState.position,
				onDragEnd: handleDragEnd
			}}
		>
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

				<!-- Axes Toggle -->
				<div class="row">
					<span class="label">Axes</span>
					<button
						class="toggle"
						class:on={simState.showAxes}
						onclick={() => (simState.showAxes = !simState.showAxes)}
						aria-label="Toggle axes"
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

				<!-- Spectrum Mode - Row 1: Smooth Gradients -->
				<div class="row col">
					<span class="label">Spectrum</span>
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

				<!-- Spectrum Mode - Row 2: Color Harmonies -->
				<div class="row col spectrum-row-extra">
					<div class="spectrum-grid">
						{#each harmonyModes as mode}
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

				<!-- Spectrum Mode - Row 3: Banded/Themed -->
				<div class="row col spectrum-row-extra">
					<div class="spectrum-grid">
						{#each bandedModes as mode}
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

				<!-- Spectrum Frequency -->
				<div class="row">
					<span class="label">Frequency</span>
					<div class="slider-container">
						<input 
							type="range" 
							min="0.1" 
							max="5" 
							step="0.05" 
							bind:value={simState.spectrumFrequency}
							class="slider frequency-slider"
						/>
						<span class="slider-value">{simState.spectrumFrequency.toFixed(2)}×</span>
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
		pointer-events: none; /* Allow clicks to pass through to canvas */
	}

	.panel {
		background: var(--ui-bg, rgba(12, 12, 18, 0.85));
		backdrop-filter: blur(16px);
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 10px;
		padding: 0.6rem;
		min-width: 240px;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
		/* Draggable support */
		pointer-events: auto;
		position: relative;
		will-change: transform;
	}

	.panel:global(.dragging) {
		box-shadow: 0 16px 64px rgba(0, 0, 0, 0.5);
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
		font-size: 0.4rem;
		color: var(--ui-text, #888);
		text-transform: uppercase;
		letter-spacing: 0.01em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}

	.spectrum-btn.active .spectrum-label {
		color: var(--ui-accent, #2dd4bf);
	}

	.spectrum-row-extra {
		margin-top: -0.2rem;
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

	/* Slider styles */
	.slider-container {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
	}

	.slider {
		flex: 1;
		-webkit-appearance: none;
		appearance: none;
		height: 4px;
		background: var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 2px;
		outline: none;
		cursor: pointer;
	}

	.slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		background: var(--ui-accent, #2dd4bf);
		border-radius: 50%;
		cursor: pointer;
		transition: transform 0.1s;
	}

	.slider::-webkit-slider-thumb:hover {
		transform: scale(1.15);
	}

	.slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
		background: var(--ui-accent, #2dd4bf);
		border-radius: 50%;
		border: none;
		cursor: pointer;
		transition: transform 0.1s;
	}

	.slider::-moz-range-thumb:hover {
		transform: scale(1.15);
	}

	.slider-value {
		font-size: 0.7rem;
		color: var(--ui-text, #888);
		min-width: 2.5rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
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
