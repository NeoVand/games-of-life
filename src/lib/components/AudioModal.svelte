<script lang="ts">
	import { 
		getAudioState, 
		toggleAudio, 
		setVolume, 
		setFrequencyRange, 
		setSoftening, 
		updateAudioConfig 
	} from '../stores/audio.svelte.js';
	import { getSimulationState } from '../stores/simulation.svelte.js';
	import { draggable } from '../utils/draggable.js';
	import { bringToFront, setModalPosition, getModalState } from '../stores/modalManager.svelte.js';
	import { AUDIO_PRESETS } from '@games-of-life/audio';

	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();

	const audioState = getAudioState();
	const simState = getSimulationState();
	
	// Modal dragging state
	const modalState = $derived(getModalState('audio'));
	
	function handleDragEnd(position: { x: number; y: number }) {
		setModalPosition('audio', position);
	}
	
	function handleModalClick() {
		bringToFront('audio');
	}

	// Get accent color from simulation state
	const accentColor = $derived(() => {
		const [r, g, b] = simState.aliveColor;
		return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
	});

	// Local state for UI (synced from store config)
	let volume = $state(audioState.config.masterVolume);
	let minFreq = $state(audioState.config.minFreq);
	let maxFreq = $state(audioState.config.maxFreq);
	let softening = $state(audioState.config.softening);
	let selectedPreset = $state<string | null>(null);

	// Pitch curve state (maps vitality to frequency)
	let pitchCurvePoints = $state<{x: number, y: number}[]>([
		{ x: 0, y: 0.2 },
		{ x: 1, y: 0.8 }
	]);

	// Amplitude curve state (maps vitality to volume)
	let amplitudeCurvePoints = $state<{x: number, y: number}[]>([
		{ x: 0, y: 0 },
		{ x: 1, y: 1 }
	]);

	// Event handlers for sliders
	function handleVolumeChange() {
		setVolume(volume);
		selectedPreset = null;
	}

	function handleFreqChange() {
		setFrequencyRange(minFreq, maxFreq);
		selectedPreset = null;
	}

	function handleSofteningChange() {
		setSoftening(softening);
		selectedPreset = null;
	}

	// Apply preset
	function applyPreset(presetId: string) {
		const preset = AUDIO_PRESETS.find(p => p.id === presetId);
		if (!preset) return;
		
		selectedPreset = presetId;
		
		if (preset.config.masterVolume !== undefined) volume = preset.config.masterVolume;
		if (preset.config.minFreq !== undefined) minFreq = preset.config.minFreq;
		if (preset.config.maxFreq !== undefined) maxFreq = preset.config.maxFreq;
		if (preset.config.softening !== undefined) softening = preset.config.softening;
		
		updateAudioConfig(preset.config);
	}

	// Get frequency display
	function formatFreq(hz: number): string {
		if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`;
		return `${Math.round(hz)}`;
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div class="backdrop" style="z-index: {modalState.zIndex};" onwheel={(e) => {
	if (e.target !== e.currentTarget) return;
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
					<path d="M11 5L6 9H2v6h4l5 4V5z" />
					<path d="M15.54 8.46a5 5 0 010 7.07" />
					<path d="M19.07 4.93a10 10 0 010 14.14" />
				</svg>
				Audio
			</span>
			<button class="close-btn" onclick={onclose} aria-label="Close">✕</button>
		</div>

		<div class="content">
			<!-- Power Toggle -->
			<div class="row">
				<span class="label">Audio</span>
				<button 
					class="toggle" 
					class:on={audioState.isEnabled}
					onclick={() => toggleAudio()}
					aria-label={audioState.isEnabled ? 'Disable audio' : 'Enable audio'}
				>
					<span class="track"><span class="thumb"></span></span>
				</button>
			</div>

			<!-- Volume -->
			<div class="row col">
				<div class="row-header">
					<span class="label">Volume</span>
					<span class="value">{Math.round(volume * 100)}%</span>
				</div>
				<input 
					type="range" 
					min="0" 
					max="1" 
					step="0.01"
					bind:value={volume}
					oninput={handleVolumeChange}
					class="slider"
					aria-label="Volume"
				/>
			</div>

			<!-- Presets -->
			<div class="row col">
				<span class="label">Presets</span>
				<div class="preset-grid">
					{#each AUDIO_PRESETS as preset}
						<button
							class="preset-btn"
							class:active={selectedPreset === preset.id}
							onclick={() => applyPreset(preset.id)}
							title={preset.description}
						>
							{preset.name}
						</button>
					{/each}
				</div>
			</div>

			<!-- Frequency Range (dual-knob slider) -->
			<div class="row col">
				<div class="row-header">
					<span class="label">Freq Range</span>
					<span class="value">{formatFreq(minFreq)}Hz – {formatFreq(maxFreq)}Hz</span>
				</div>
				<div class="range-slider-container">
					<!-- Track background with colored active region -->
					<div class="range-track">
						<div 
							class="range-active" 
							style="left: {((minFreq - 20) / (8000 - 20)) * 100}%; right: {100 - ((maxFreq - 20) / (8000 - 20)) * 100}%"
						></div>
					</div>
					<!-- Two overlapping range inputs -->
					<input 
						type="range" 
						min="20" 
						max="8000" 
						step="10"
						bind:value={minFreq}
						oninput={() => { if (minFreq > maxFreq - 100) minFreq = maxFreq - 100; handleFreqChange(); }}
						class="range-input range-min"
						aria-label="Minimum frequency"
					/>
					<input 
						type="range" 
						min="20" 
						max="8000" 
						step="10"
						bind:value={maxFreq}
						oninput={() => { if (maxFreq < minFreq + 100) maxFreq = minFreq + 100; handleFreqChange(); }}
						class="range-input range-max"
						aria-label="Maximum frequency"
					/>
				</div>
			</div>

			<!-- Softening -->
			<div class="row col">
				<div class="row-header">
					<span class="label">Softening</span>
					<span class="value">{Math.round(softening * 100)}%</span>
				</div>
				<input 
					type="range" 
					min="0" 
					max="1" 
					step="0.01"
					bind:value={softening}
					oninput={handleSofteningChange}
					class="slider"
					aria-label="Softening"
				/>
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
		pointer-events: none;
	}

	.panel {
		pointer-events: auto;
		background: var(--ui-panel-bg, rgba(20, 20, 28, 0.95));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 8px;
		padding: 0.6rem;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
		width: 260px;
		backdrop-filter: blur(12px);
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
		cursor: grab;
		user-select: none;
	}

	.header:active {
		cursor: grabbing;
	}

	.title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--ui-text-bright, #e0e0e0);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.header-icon {
		width: 14px;
		height: 14px;
		color: var(--ui-accent, #2dd4bf);
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
		align-items: stretch;
		gap: 0.3rem;
	}

	.row-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
	}

	.label {
		font-size: 0.7rem;
		color: var(--ui-text, #888);
	}

	.value {
		font-size: 0.65rem;
		color: var(--ui-accent, #2dd4bf);
		font-weight: 500;
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

	/* Slider */
	.slider {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 4px;
		border-radius: 2px;
		background: var(--ui-border, rgba(255, 255, 255, 0.1));
		outline: none;
		cursor: pointer;
	}

	.slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--ui-accent, #2dd4bf);
		cursor: pointer;
		border: none;
		transition: transform 0.1s ease;
	}

	.slider::-webkit-slider-thumb:hover {
		transform: scale(1.2);
	}

	.slider::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--ui-accent, #2dd4bf);
		cursor: pointer;
		border: none;
	}

	/* Presets Grid */
	.preset-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.25rem;
		width: 100%;
	}

	.preset-btn {
		padding: 0.35rem 0.2rem;
		border-radius: 4px;
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		background: var(--ui-border, rgba(255, 255, 255, 0.03));
		color: var(--ui-text, #888);
		font-size: 0.6rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.1s ease;
		text-transform: capitalize;
	}

	.preset-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		color: var(--ui-text-hover, #fff);
	}

	.preset-btn.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.3));
		color: var(--ui-accent, #2dd4bf);
	}

	/* Dual-Knob Range Slider */
	.range-slider-container {
		position: relative;
		height: 20px;
		width: 100%;
	}

	.range-track {
		position: absolute;
		top: 50%;
		left: 0;
		right: 0;
		height: 6px;
		transform: translateY(-50%);
		border-radius: 3px;
		background: linear-gradient(to right, 
			hsl(20, 80%, 35%), 
			hsl(45, 90%, 40%), 
			hsl(120, 70%, 35%), 
			hsl(200, 80%, 40%), 
			hsl(280, 70%, 45%)
		);
		opacity: 0.4;
	}

	.range-active {
		position: absolute;
		top: 0;
		bottom: 0;
		background: linear-gradient(to right, 
			hsl(20, 80%, 50%), 
			hsl(45, 90%, 55%), 
			hsl(120, 70%, 45%), 
			hsl(200, 80%, 50%), 
			hsl(280, 70%, 55%)
		);
		border-radius: 3px;
		opacity: 1;
	}

	.range-input {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		-webkit-appearance: none;
		appearance: none;
		background: transparent;
		pointer-events: none;
		margin: 0;
		padding: 0;
	}

	.range-input::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--ui-accent, #2dd4bf);
		cursor: pointer;
		pointer-events: auto;
		border: 2px solid rgba(255, 255, 255, 0.3);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
		transition: transform 0.1s ease;
	}

	.range-input::-webkit-slider-thumb:hover {
		transform: scale(1.2);
	}

	.range-input::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--ui-accent, #2dd4bf);
		cursor: pointer;
		pointer-events: auto;
		border: 2px solid rgba(255, 255, 255, 0.3);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
	}

	/* Ensure min thumb is above on the left side */
	.range-min {
		z-index: 2;
	}

	.range-max {
		z-index: 1;
	}
</style>
