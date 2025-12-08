<script lang="ts">
	import { getSimulationState, BRUSH_SHAPES, BRUSH_TYPES, BRUSH_FALLOFFS, type BrushShape, type BrushType, type BrushFalloff, DEFAULT_BRUSH_CONFIG, getSimulationRef, resetBrushEditorSession, wasBrushEditorSnapshotTaken, wasBrushEditorEdited, setBrushEditorPreSnapshot, getBrushEditorPreSnapshot } from '../stores/simulation.svelte.js';
	import { addSnapshotWithBefore, getHeadId } from '../stores/history.js';
	import { onMount, onDestroy } from 'svelte';
	import { draggable, centerInViewport } from '../utils/draggable.js';
	import { bringToFront, setModalPosition, getModalState } from '../stores/modalManager.svelte.js';

	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();

	const simState = getSimulationState();
	
	// Modal dragging state
	const modalState = $derived(getModalState('brushEditor'));
	let modalEl: HTMLDivElement | null = null;
	
	// Track if we've initialized the center position
	let initialPosition = $state<{ x: number; y: number } | null>(null);
	
	// Compute initial position - center of viewport for first open
	$effect(() => {
		if (!modalState.position && modalEl && !initialPosition) {
			// Calculate center position
			const rect = modalEl.getBoundingClientRect();
			const centerX = (window.innerWidth - rect.width) / 2;
			const centerY = (window.innerHeight - rect.height) / 2;
			initialPosition = { x: centerX, y: centerY };
			// Also save it so it persists
			setModalPosition('brushEditor', initialPosition);
		} else if (modalState.position) {
			initialPosition = modalState.position;
		}
	});

	onMount(async () => {
		resetBrushEditorSession();
		const sim = getSimulationRef();
		if (sim) {
			const snap = await sim.getCellDataAsync().catch(() => null);
			setBrushEditorPreSnapshot(snap);
		}
	});

	onDestroy(() => {
		// If modal closes unexpectedly, avoid stale flags
		resetBrushEditorSession();
	});
	
	function handleDragEnd(position: { x: number; y: number }) {
		setModalPosition('brushEditor', position);
	}
	
	function handleModalClick() {
		bringToFront('brushEditor');
	}

	// Store original values for reverting on cancel
	const originalConfig = { ...simState.brushConfig };
	const originalBrushState = simState.brushState;

	function resetToDefaults() {
		simState.brushConfig = DEFAULT_BRUSH_CONFIG;
	}

	function applyAndClose() {
		const sim = getSimulationRef();
		if (sim && wasBrushEditorSnapshotTaken()) {
			// If edits happened, record to history and clear the temp snapshot
			if (wasBrushEditorEdited()) {
				const before = getBrushEditorPreSnapshot();
				addSnapshotWithBefore(sim, before, 'Brush editor', 'brush', getHeadId());
			}
			sim.clearUndo();
		}
		resetBrushEditorSession();
		onclose();
	}

	function cancelAndClose() {
		const sim = getSimulationRef();
		if (sim && wasBrushEditorSnapshotTaken()) {
			if (wasBrushEditorEdited()) {
				sim.undoLast().catch(() => {});
			} else {
				// No edits; just drop the snapshot
				sim.clearUndo();
			}
		}
		simState.brushConfig = originalConfig;
		simState.brushState = originalBrushState;
		resetBrushEditorSession();
		onclose();
	}

	// Shape icons as SVG paths
	const shapeIcons: Record<BrushShape, string> = {
		circle: '<circle cx="12" cy="12" r="7" />',
		square: '<rect x="5" y="5" width="14" height="14" />',
		diamond: '<path d="M12 5 L19 12 L12 19 L5 12 Z" />',
		line: '<line x1="5" y1="12" x2="19" y2="12" stroke-width="3" />',
		ring: '<circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="3.5" />',
		star: '<path d="M12 3 L13.5 9 L20 9 L15 13 L17 20 L12 16 L7 20 L9 13 L4 9 L10.5 9 Z" />',
		cross: '<path d="M9 5 L15 5 L15 9 L19 9 L19 15 L15 15 L15 19 L9 19 L9 15 L5 15 L5 9 L9 9 Z" />',
		scatter: '<circle cx="6" cy="8" r="1.5" /><circle cx="14" cy="6" r="1" /><circle cx="10" cy="13" r="1.5" /><circle cx="17" cy="11" r="1" /><circle cx="8" cy="17" r="1" />',
		custom: '<path d="M5 18 Q9 10 12 13 T19 5" stroke-width="2" fill="none" />'
	};

	// Fill type icons
	const fillIcons: Record<BrushType, string> = {
		solid: '<circle cx="12" cy="12" r="8" fill="currentColor" opacity="0.9" />',
		gradient: '<defs><radialGradient id="grad"><stop offset="0%" stop-color="currentColor" stop-opacity="1"/><stop offset="100%" stop-color="currentColor" stop-opacity="0.1"/></radialGradient></defs><circle cx="12" cy="12" r="8" fill="url(#grad)" />',
		noise: '<circle cx="7" cy="8" r="2" fill="currentColor" opacity="0.9" /><circle cx="14" cy="7" r="1.5" fill="currentColor" opacity="0.6" /><circle cx="10" cy="12" r="2.5" fill="currentColor" opacity="0.8" /><circle cx="16" cy="13" r="1.5" fill="currentColor" opacity="0.7" /><circle cx="8" cy="16" r="1.5" fill="currentColor" opacity="0.5" /><circle cx="14" cy="17" r="2" fill="currentColor" opacity="0.6" />',
		spray: '<circle cx="6" cy="7" r="1" fill="currentColor" /><circle cx="11" cy="5" r="0.8" fill="currentColor" /><circle cx="16" cy="8" r="1" fill="currentColor" /><circle cx="8" cy="12" r="0.7" fill="currentColor" /><circle cx="14" cy="11" r="1" fill="currentColor" /><circle cx="18" cy="14" r="0.8" fill="currentColor" /><circle cx="6" cy="16" r="0.9" fill="currentColor" /><circle cx="12" cy="17" r="1" fill="currentColor" />'
	};

	// Edge falloff icons (gradient representations)
	const edgeIcons: Record<BrushFalloff, string> = {
		hard: '<rect x="6" y="6" width="12" height="12" fill="currentColor" opacity="0.8" />',
		linear: '<defs><linearGradient id="lin" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="currentColor" stop-opacity="0.9"/><stop offset="100%" stop-color="currentColor" stop-opacity="0.1"/></linearGradient></defs><rect x="4" y="6" width="16" height="12" fill="url(#lin)" />',
		smooth: '<defs><linearGradient id="smo" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="currentColor" stop-opacity="0.9"/><stop offset="40%" stop-color="currentColor" stop-opacity="0.7"/><stop offset="100%" stop-color="currentColor" stop-opacity="0.05"/></linearGradient></defs><rect x="4" y="6" width="16" height="12" fill="url(#smo)" />',
		gaussian: '<defs><radialGradient id="gau" cx="30%" cy="50%"><stop offset="0%" stop-color="currentColor" stop-opacity="0.9"/><stop offset="100%" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs><rect x="4" y="6" width="16" height="12" fill="url(#gau)" />'
	};
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && cancelAndClose()} />

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div class="modal-backdrop" style="z-index: {modalState.zIndex};">
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div 
		class="modal"
		class:centered={!initialPosition}
		bind:this={modalEl}
		style={initialPosition ? `transform: translate(${initialPosition.x}px, ${initialPosition.y}px);` : ''}
		onclick={handleModalClick}
		use:draggable={{ 
			handle: '.header', 
			bounds: true,
			initialPosition: initialPosition,
			onDragEnd: handleDragEnd
		}}
	>
		<!-- Header -->
		<div class="header">
			<span class="title">
				<svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18.37 2.63L14 7l-1.59-1.59a2 2 0 00-2.82 0L8 7l9 9 1.59-1.59a2 2 0 000-2.82L17 10l4.37-4.37a2.12 2.12 0 10-3-3z" />
					<path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-10" />
				</svg>
				Brush
			</span>
			<button class="apply-btn" onclick={applyAndClose} title="Apply">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
					<path d="M5 12l5 5L20 7" />
				</svg>
			</button>
			<button class="close-btn" onclick={cancelAndClose} aria-label="Close">✕</button>
		</div>

		<div class="content">
			<!-- Mode toggle -->
			<div class="mode-row">
				<button 
					class="mode-btn"
					class:active={simState.brushState === 1}
					onclick={() => simState.brushState = 1}
				>
					<svg viewBox="0 0 24 24" fill="currentColor">
						<circle cx="12" cy="12" r="6" />
					</svg>
					Draw
				</button>
				<button 
					class="mode-btn erase"
					class:active={simState.brushState === 0}
					onclick={() => simState.brushState = 0}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="6" />
						<line x1="8" y1="8" x2="16" y2="16" />
					</svg>
					Erase
				</button>
			</div>

			<!-- Shape selector -->
			<div class="section">
				<span class="section-label">Shape</span>
				<div class="shape-grid">
					{#each BRUSH_SHAPES.slice(0, 7) as shape}
						<button 
							class="shape-btn"
							class:active={simState.brushShape === shape.id}
							onclick={() => simState.brushShape = shape.id}
							title={shape.description}
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
								{@html shapeIcons[shape.id]}
							</svg>
						</button>
					{/each}
				</div>
			</div>

			<!-- Fill type selector -->
			<div class="section">
				<span class="section-label">Fill</span>
				<div class="fill-grid">
					{#each BRUSH_TYPES as type}
						<button 
							class="fill-btn"
							class:active={simState.brushType === type.id}
							onclick={() => simState.brushType = type.id}
							title={type.description}
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="none">
								{@html fillIcons[type.id]}
							</svg>
							<span>{type.name}</span>
						</button>
					{/each}
				</div>
			</div>

			<!-- Edge falloff selector -->
			<div class="section">
				<span class="section-label">Edge</span>
				<div class="edge-grid">
					{#each BRUSH_FALLOFFS as falloff}
						<button 
							class="edge-btn"
							class:active={simState.brushFalloff === falloff.id}
							onclick={() => simState.brushFalloff = falloff.id}
							title={falloff.description}
						>
							<svg viewBox="0 0 24 24">
								{@html edgeIcons[falloff.id]}
							</svg>
							<span>{falloff.name}</span>
						</button>
					{/each}
				</div>
			</div>

			<!-- Size slider -->
			<div class="slider-section">
				<div class="slider-row">
					<span class="slider-label">Size</span>
					<input type="range" min="1" max="150" bind:value={simState.brushSize} />
					<span class="slider-value">{simState.brushSize}</span>
				</div>

				<div class="slider-row">
					<span class="slider-label">Intensity</span>
					<input type="range" min="0.1" max="1" step="0.05" bind:value={simState.brushIntensity} />
					<span class="slider-value">{Math.round(simState.brushIntensity * 100)}%</span>
				</div>

				{#if simState.brushShape === 'line' || simState.brushShape === 'diamond' || simState.brushAspectRatio !== 1}
					<div class="slider-row">
						<span class="slider-label">Angle</span>
						<input type="range" min="0" max="180" step="5" bind:value={simState.brushRotation} />
						<span class="slider-value">{simState.brushRotation}°</span>
					</div>
				{/if}

				{#if simState.brushType === 'spray' || simState.brushShape === 'scatter'}
					<div class="slider-row">
						<span class="slider-label">Density</span>
						<input type="range" min="0.1" max="1" step="0.05" bind:value={simState.brushDensity} />
						<span class="slider-value">{Math.round(simState.brushDensity * 100)}%</span>
					</div>
				{/if}
			</div>

			<!-- Footer with reset -->
			<div class="footer">
				<button class="reset-btn" onclick={resetToDefaults}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
						<path d="M3 3v5h5" />
					</svg>
					Reset
				</button>
				<span class="hint">Move cursor over canvas to preview</span>
			</div>
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		pointer-events: none;
	}

	.modal {
		background: var(--ui-bg, rgba(12, 12, 18, 0.95));
		backdrop-filter: blur(20px);
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
		border-radius: 14px;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		width: 280px;
		pointer-events: auto;
		position: fixed;
		top: 0;
		left: 0;
	}

	/* Center the modal when no saved position exists */
	.modal.centered {
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
	}

	.modal:global(.dragging) {
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
	}

	/* Header */
	.header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid var(--ui-border, rgba(255, 255, 255, 0.06));
	}

	.title {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--ui-text-hover, #e0e0e0);
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.header-icon {
		width: 16px;
		height: 16px;
		color: var(--ui-accent, #33e6f2);
	}

	.apply-btn {
		width: 26px;
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		border: 1px solid var(--ui-accent-border, rgba(45, 212, 191, 0.4));
		color: var(--ui-accent, #2dd4bf);
		cursor: pointer;
		border-radius: 6px;
		margin-left: auto;
		transition: all 0.15s;
	}

	.apply-btn:hover {
		background: var(--ui-accent-bg-hover, rgba(45, 212, 191, 0.25));
		transform: scale(1.05);
	}

	.apply-btn svg {
		width: 14px;
		height: 14px;
	}

	.close-btn {
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: var(--ui-text, #666);
		font-size: 0.8rem;
		cursor: pointer;
		border-radius: 4px;
	}

	.close-btn:hover {
		background: var(--ui-border, rgba(255, 255, 255, 0.1));
		color: var(--ui-text-hover, #fff);
	}

	/* Content */
	.content {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	/* Mode toggle */
	.mode-row {
		display: flex;
		gap: 4px;
	}

	.mode-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		padding: 0.4rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
		border-radius: 6px;
		color: var(--ui-text, #888);
		font-size: 0.7rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.12s;
	}

	.mode-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		color: var(--ui-text-hover, #fff);
	}

	.mode-btn.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.5));
		color: var(--ui-accent, #2dd4bf);
	}

	.mode-btn.erase.active {
		background: rgba(239, 68, 68, 0.15);
		border-color: rgba(239, 68, 68, 0.5);
		color: #ef4444;
	}

	.mode-btn svg {
		width: 14px;
		height: 14px;
	}

	/* Sections */
	.section {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.section-label {
		font-size: 0.6rem;
		color: var(--ui-text, #666);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-weight: 500;
	}

	/* Shape grid */
	.shape-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 3px;
	}

	.shape-btn {
		aspect-ratio: 1;
		padding: 5px;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.06));
		border-radius: 5px;
		color: var(--ui-text, #666);
		cursor: pointer;
		transition: all 0.1s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.shape-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		color: var(--ui-text-hover, #fff);
	}

	.shape-btn.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.5));
		color: var(--ui-accent, #2dd4bf);
	}

	.shape-btn svg {
		width: 100%;
		height: 100%;
	}

	/* Fill grid */
	.fill-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 3px;
	}

	.fill-btn {
		padding: 0.3rem 0.2rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.06));
		border-radius: 5px;
		color: var(--ui-text, #888);
		cursor: pointer;
		transition: all 0.1s;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
	}

	.fill-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		color: var(--ui-text-hover, #fff);
	}

	.fill-btn.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.5));
		color: var(--ui-accent, #2dd4bf);
	}

	.fill-btn svg {
		width: 20px;
		height: 20px;
	}

	.fill-btn span {
		font-size: 0.55rem;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	/* Edge grid */
	.edge-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 3px;
	}

	.edge-btn {
		padding: 0.3rem 0.2rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.06));
		border-radius: 5px;
		color: var(--ui-text, #888);
		cursor: pointer;
		transition: all 0.1s;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
	}

	.edge-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		color: var(--ui-text-hover, #fff);
	}

	.edge-btn.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.5));
		color: var(--ui-accent, #2dd4bf);
	}

	.edge-btn svg {
		width: 20px;
		height: 20px;
	}

	.edge-btn span {
		font-size: 0.55rem;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	/* Sliders section */
	.slider-section {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.5rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.15));
		border-radius: 8px;
	}

	.slider-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.slider-label {
		font-size: 0.6rem;
		color: var(--ui-text, #666);
		min-width: 48px;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.slider-row input[type='range'] {
		flex: 1;
		height: 4px;
		-webkit-appearance: none;
		appearance: none;
		background: var(--slider-track-bg, rgba(255, 255, 255, 0.15));
		border-radius: 2px;
		cursor: pointer;
		outline: none;
	}

	.slider-row input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 12px;
		height: 12px;
		background: var(--ui-accent, #2dd4bf);
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid rgba(255, 255, 255, 0.9);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}

	.slider-row input[type='range']::-moz-range-track {
		height: 4px;
		background: var(--slider-track-bg, rgba(255, 255, 255, 0.15));
		border-radius: 2px;
	}

	.slider-row input[type='range']::-moz-range-thumb {
		width: 12px;
		height: 12px;
		background: var(--ui-accent, #2dd4bf);
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid rgba(255, 255, 255, 0.9);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}

	.slider-value {
		font-size: 0.6rem;
		color: var(--ui-accent, #2dd4bf);
		min-width: 28px;
		text-align: right;
		font-family: 'SF Mono', Monaco, monospace;
	}

	/* Footer */
	.footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 0.35rem;
		border-top: 1px solid var(--ui-border, rgba(255, 255, 255, 0.06));
	}

	.reset-btn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.3rem 0.5rem;
		background: transparent;
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
		border-radius: 4px;
		color: var(--ui-text, #888);
		font-size: 0.6rem;
		cursor: pointer;
		transition: all 0.1s;
	}

	.reset-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		color: var(--ui-text-hover, #fff);
	}

	.reset-btn svg {
		width: 11px;
		height: 11px;
	}

	.hint {
		font-size: 0.5rem;
		color: var(--ui-text, #555);
		font-style: italic;
	}

	/* Mobile responsive styles */
	@media (max-width: 768px), (pointer: coarse) {
		.modal {
			width: min(280px, 90vw);
			max-width: 90vw;
			padding: 0.6rem;
			gap: 0.4rem;
		}

		.header {
			padding-bottom: 0.3rem;
		}

		.title {
			font-size: 0.8rem;
		}

		/* Shape grid - 4 columns on mobile instead of 7 */
		.shape-grid {
			grid-template-columns: repeat(4, 1fr);
			gap: 4px;
		}

		.shape-btn {
			padding: 6px;
			min-height: 36px;
		}

		.shape-btn svg {
			width: 18px;
			height: 18px;
		}

		/* Fill grid - 2x2 on mobile */
		.fill-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 4px;
		}

		.fill-btn {
			padding: 0.35rem;
			flex-direction: row;
			gap: 0.3rem;
		}

		.fill-btn svg {
			width: 18px;
			height: 18px;
		}

		.fill-btn span {
			font-size: 0.6rem;
		}

		/* Edge grid - 2x2 on mobile */
		.edge-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 4px;
		}

		.edge-btn {
			padding: 0.35rem;
			flex-direction: row;
			gap: 0.3rem;
		}

		.edge-btn svg {
			width: 18px;
			height: 18px;
		}

		.edge-btn span {
			font-size: 0.6rem;
		}

		/* Mode buttons */
		.mode-btn {
			padding: 0.5rem;
		}

		.mode-btn svg {
			width: 16px;
			height: 16px;
		}

		/* Sliders - larger touch targets */
		.slider-section {
			padding: 0.6rem;
		}

		.slider-row input[type='range'] {
			height: 6px;
		}

		.slider-row input[type='range']::-webkit-slider-thumb {
			width: 20px;
			height: 20px;
		}

		.slider-row input[type='range']::-moz-range-thumb {
			width: 20px;
			height: 20px;
		}

		.slider-label {
			font-size: 0.65rem;
			min-width: 52px;
		}

		.slider-value {
			font-size: 0.65rem;
			min-width: 32px;
		}

		/* Hide hint on mobile */
		.hint {
			display: none;
		}

		.footer {
			justify-content: center;
		}
	}

	/* Very small screens */
	@media (max-width: 360px) {
		.modal {
			width: 95vw;
			padding: 0.5rem;
		}

		.shape-grid {
			grid-template-columns: repeat(4, 1fr);
		}

		.fill-grid,
		.edge-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
