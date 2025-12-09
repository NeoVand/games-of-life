<script lang="ts">
	import { getSimulationState, BRUSH_SHAPES, BRUSH_TYPES, type BrushShape, type BrushType, DEFAULT_BRUSH_CONFIG, getSimulationRef, resetBrushEditorSession, wasBrushEditorSnapshotTaken, wasBrushEditorEdited, setBrushEditorPreSnapshot, getBrushEditorPreSnapshot } from '../stores/simulation.svelte.js';
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
	let modalEl = $state<HTMLDivElement | null>(null);

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

	// Check if current shape supports rotation
	const currentShapeInfo = $derived(BRUSH_SHAPES.find(s => s.id === simState.brushShape));
	const showRotation = $derived(currentShapeInfo?.rotatable ?? false);

	// Shape icons as SVG paths (17 shapes: 6, 6, 5)
	const shapeIcons: Record<BrushShape, string> = {
		// Row 1: Basic geometric shapes
		circle: '<circle cx="12" cy="12" r="6" />',
		square: '<rect x="6" y="6" width="12" height="12" />',
		diamond: '<path d="M12 5 L19 12 L12 19 L5 12 Z" />',
		hexagon: '<path d="M12 5 L18 8 L18 16 L12 19 L6 16 L6 8 Z" />',
		ring: '<circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="3" />',
		triangle: '<path d="M12 5 L19 17 L5 17 Z" />',
		// Row 2: Complex shapes
		line: '<line x1="5" y1="12" x2="19" y2="12" stroke-width="2.5" />',
		cross: '<path d="M10 5 L14 5 L14 10 L19 10 L19 14 L14 14 L14 19 L10 19 L10 14 L5 14 L5 10 L10 10 Z" />',
		star: '<path d="M12 4 L13.5 9 L19 9 L14.5 12.5 L16 18 L12 15 L8 18 L9.5 12.5 L5 9 L10.5 9 Z" />',
		heart: '<path d="M12 18 C5 13 5 8 8 6.5 C10 5.5 12 7 12 8 C12 7 14 5.5 16 6.5 C19 8 19 13 12 18 Z" />',
		spiral: '<path d="M12 12 Q15 12 15 9 Q15 5 12 5 Q7 5 7 10 Q7 16 13 16 Q18 16 18 12" fill="none" stroke-width="1.8" />',
		flower: '<circle cx="12" cy="7" r="2.5" /><circle cx="16" cy="10" r="2.5" /><circle cx="15" cy="15" r="2.5" /><circle cx="9" cy="15" r="2.5" /><circle cx="8" cy="10" r="2.5" /><circle cx="12" cy="12" r="2" />',
		// Row 3: Textured/pattern shapes
		burst: '<path d="M12 4 L13 9 L18 6 L14 10 L19 12 L14 14 L18 18 L13 15 L12 20 L11 15 L6 18 L10 14 L5 12 L10 10 L6 6 L11 9 Z" />',
		wave: '<path d="M4 12 Q7 6 10 12 T16 12 T22 12" fill="none" stroke-width="2.5" />',
		dots: '<circle cx="7" cy="7" r="1.8" /><circle cx="12" cy="7" r="1.8" /><circle cx="17" cy="7" r="1.8" /><circle cx="7" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="17" cy="12" r="1.8" /><circle cx="7" cy="17" r="1.8" /><circle cx="12" cy="17" r="1.8" /><circle cx="17" cy="17" r="1.8" />',
		scatter: '<circle cx="6" cy="8" r="1.3" /><circle cx="15" cy="5" r="1" /><circle cx="10" cy="13" r="1.3" /><circle cx="18" cy="11" r="0.9" /><circle cx="7" cy="17" r="1.1" /><circle cx="14" cy="16" r="0.9" />',
		text: '<text x="12" y="16" font-size="14" font-weight="bold" text-anchor="middle" fill="currentColor">T</text>'
	};

	// Font options for text brush
	const TEXT_FONTS = [
		{ id: 'monospace', name: 'Mono' },
		{ id: 'sans-serif', name: 'Sans' },
		{ id: 'serif', name: 'Serif' },
		{ id: 'pixel', name: 'Pixel' }
	] as const;

	// Fill type icons
	const fillIcons: Record<BrushType, string> = {
		solid: '<circle cx="12" cy="12" r="8" fill="currentColor" opacity="0.9" />',
		gradient: '<defs><radialGradient id="grad"><stop offset="0%" stop-color="currentColor" stop-opacity="1"/><stop offset="100%" stop-color="currentColor" stop-opacity="0.1"/></radialGradient></defs><circle cx="12" cy="12" r="8" fill="url(#grad)" />',
		noise: '<circle cx="7" cy="8" r="2" fill="currentColor" opacity="0.9" /><circle cx="14" cy="7" r="1.5" fill="currentColor" opacity="0.6" /><circle cx="10" cy="12" r="2.5" fill="currentColor" opacity="0.8" /><circle cx="16" cy="13" r="1.5" fill="currentColor" opacity="0.7" /><circle cx="8" cy="16" r="1.5" fill="currentColor" opacity="0.5" /><circle cx="14" cy="17" r="2" fill="currentColor" opacity="0.6" />',
		spray: '<circle cx="6" cy="7" r="1" fill="currentColor" /><circle cx="11" cy="5" r="0.8" fill="currentColor" /><circle cx="16" cy="8" r="1" fill="currentColor" /><circle cx="8" cy="12" r="0.7" fill="currentColor" /><circle cx="14" cy="11" r="1" fill="currentColor" /><circle cx="18" cy="14" r="0.8" fill="currentColor" /><circle cx="6" cy="16" r="0.9" fill="currentColor" /><circle cx="12" cy="17" r="1" fill="currentColor" />'
	};
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && cancelAndClose()} />

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div class="modal-backdrop" style="z-index: {modalState.zIndex};">
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div 
		class="modal"
		bind:this={modalEl}
		style={modalState.position ? `transform: translate(${modalState.position.x}px, ${modalState.position.y}px);` : ''}
		onclick={handleModalClick}
		use:draggable={{ 
			handle: '.header', 
			bounds: true,
			initialPosition: modalState.position ?? (modalEl ? centerInViewport(modalEl) : null),
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
				{#each BRUSH_SHAPES as shape}
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

		<!-- Text options (shown when text brush is selected) -->
		{#if simState.brushShape === 'text'}
			<div class="section text-section">
				<span class="section-label">Text</span>
				<input 
					type="text" 
					class="text-input"
					maxlength="20"
					placeholder="Enter text..."
					bind:value={simState.brushText}
				/>
				<div class="text-options">
					<div class="font-selector">
						{#each TEXT_FONTS as font}
							<button 
								class="font-btn"
								class:active={simState.brushTextFont === font.id}
								onclick={() => simState.brushTextFont = font.id}
							>
								{font.name}
							</button>
						{/each}
					</div>
					<div class="style-toggles">
						<button 
							class="style-btn"
							class:active={simState.brushTextBold}
							onclick={() => simState.brushTextBold = !simState.brushTextBold}
							title="Bold"
						>
							<strong>B</strong>
						</button>
						<button 
							class="style-btn italic"
							class:active={simState.brushTextItalic}
							onclick={() => simState.brushTextItalic = !simState.brushTextItalic}
							title="Italic"
						>
							<em>I</em>
						</button>
					</div>
				</div>
			</div>
		{/if}

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

		<!-- Size slider -->
		<div class="slider-section">
			<div class="slider-row">
				<span class="slider-label">Size</span>
				<input type="range" min="1" max="500" bind:value={simState.brushSize} />
				<span class="slider-value">{simState.brushSize}</span>
			</div>

			<div class="slider-row">
				<span class="slider-label">Intensity</span>
				<input type="range" min="0.1" max="1" step="0.05" bind:value={simState.brushIntensity} />
				<span class="slider-value">{Math.round(simState.brushIntensity * 100)}%</span>
			</div>

			{#if showRotation}
				<div class="slider-row">
					<span class="slider-label">Angle</span>
					<input type="range" min="0" max="360" step="5" bind:value={simState.brushRotation} />
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
		grid-template-columns: repeat(6, 1fr);
		gap: 2px;
	}

	.shape-btn {
		aspect-ratio: 1;
		padding: 3px;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.06));
		border-radius: 4px;
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
		width: 20px;
		height: 20px;
	}

	/* Text section */
	.text-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.text-input {
		width: 100%;
		padding: 0.5rem 0.6rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 6px;
		color: var(--ui-text, #e0e0e0);
		font-size: 0.9rem;
		font-family: inherit;
		outline: none;
		transition: border-color 0.15s;
	}

	.text-input:focus {
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.5));
	}

	.text-input::placeholder {
		color: var(--ui-text-muted, #666);
	}

	.text-options {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.font-selector {
		display: flex;
		gap: 2px;
		flex: 1;
	}

	.font-btn {
		flex: 1;
		padding: 0.35rem 0.3rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.06));
		border-radius: 4px;
		color: var(--ui-text, #888);
		font-size: 0.7rem;
		cursor: pointer;
		transition: all 0.1s;
	}

	.font-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		color: var(--ui-text-hover, #fff);
	}

	.font-btn.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.5));
		color: var(--ui-accent, #2dd4bf);
	}

	.style-toggles {
		display: flex;
		gap: 2px;
	}

	.style-btn {
		width: 28px;
		height: 28px;
		padding: 0;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.06));
		border-radius: 4px;
		color: var(--ui-text, #888);
		font-size: 0.85rem;
		cursor: pointer;
		transition: all 0.1s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.style-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		color: var(--ui-text-hover, #fff);
	}

	.style-btn.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.5));
		color: var(--ui-accent, #2dd4bf);
	}

	.style-btn.italic {
		font-style: italic;
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
			grid-template-columns: repeat(6, 1fr);
			gap: 2px;
		}

		.shape-btn {
			padding: 3px;
			min-height: 28px;
		}

		.shape-btn svg {
			width: 14px;
			height: 14px;
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
			grid-template-columns: repeat(6, 1fr);
		}

		.fill-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>