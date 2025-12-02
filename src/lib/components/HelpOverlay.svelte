<script lang="ts">
	interface Props {
		onclose: () => void;
		onstarttour: () => void;
	}

	let { onclose, onstarttour }: Props = $props();

	// Detect if we're on a touch device
	const isMobile = typeof window !== 'undefined' && 
		('ontouchstart' in window || navigator.maxTouchPoints > 0);

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onclose();
		}
	}

	function handleStartTour() {
		onclose();
		// Small delay to let the modal close animation complete
		setTimeout(() => onstarttour(), 150);
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<div class="help-overlay" role="dialog" aria-modal="true" tabindex="-1" onclick={handleBackdropClick}>
	<div class="help-panel">
		<div class="help-header">
			<h2>
				<svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
					<circle cx="12" cy="17" r="0.5" fill="currentColor" />
				</svg>
				{isMobile ? 'Touch Controls' : 'Keyboard Shortcuts'}
			</h2>
			<div class="header-actions">
				<button class="tour-btn" onclick={handleStartTour}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="6" cy="6" r="2"/>
						<circle cx="18" cy="10" r="2"/>
						<circle cx="12" cy="18" r="2"/>
						<path d="M6 8v2a4 4 0 004 4h2"/>
						<path d="M16 10h-2a4 4 0 00-4 4v2"/>
					</svg>
					<span>Tour</span>
				</button>
				<button class="close-btn" onclick={onclose} aria-label="Close">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>

		<div class="help-content">
			{#if isMobile}
				<!-- Mobile Touch Controls -->
				<div class="touch-controls">
					<section class="shortcut-group">
						<h3>Drawing</h3>
						<div class="shortcut-row">
							<span class="gesture-icon">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M12 19V5M5 12l7-7 7 7" />
								</svg>
							</span>
							<span class="gesture-label">Tap / Drag</span>
							<span class="gesture-desc">Draw or erase cells</span>
						</div>
						<div class="shortcut-row">
							<span class="gesture-icon">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<circle cx="12" cy="12" r="6" fill="currentColor" />
								</svg>
							</span>
							<span class="gesture-label">Brush menu</span>
							<span class="gesture-desc">Toggle draw/erase</span>
						</div>
					</section>

					<section class="shortcut-group">
						<h3>Navigation</h3>
						<div class="shortcut-row">
							<span class="gesture-icon">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M21 21l-6-6M9 3v6M3 9h6M15 3v6M21 9h-6M9 21v-6M3 15h6M15 21v-6M21 15h-6" />
								</svg>
							</span>
							<span class="gesture-label">Pinch</span>
							<span class="gesture-desc">Zoom in/out</span>
						</div>
						<div class="shortcut-row">
							<span class="gesture-icon">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l3 3 3-3M19 9l3 3-3 3" />
									<path d="M2 12h20M12 2v20" />
								</svg>
							</span>
							<span class="gesture-label">Two-finger drag</span>
							<span class="gesture-desc">Pan around</span>
						</div>
						<div class="shortcut-row">
							<span class="gesture-icon">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M4 14v4a2 2 0 002 2h4" />
									<path d="M20 14v4a2 2 0 01-2 2h-4" />
									<path d="M4 10V6a2 2 0 012-2h4" />
									<path d="M20 10V6a2 2 0 00-2-2h-4" />
									<path d="M9 9L4 4m0 0v3m0-3h3" />
									<path d="M15 9l5-5m0 0v3m0-3h-3" />
									<path d="M9 15l-5 5m0 0v-3m0 3h3" />
									<path d="M15 15l5 5m0 0v-3m0 3h-3" />
								</svg>
							</span>
							<span class="gesture-label">Fit button</span>
							<span class="gesture-desc">Reset view</span>
						</div>
					</section>

					<section class="shortcut-group">
						<h3>Tips</h3>
						<div class="tip">Use the toolbar buttons for all controls</div>
						<div class="tip">Tap brush icon to switch draw/erase</div>
						<div class="tip">Pinch with two fingers to zoom</div>
					</section>
				</div>
			{:else}
				<!-- Desktop Keyboard Shortcuts -->
				<div class="columns">
					<!-- Left Column -->
					<div class="column">
						<section class="shortcut-group">
							<h3>Simulation</h3>
							<div class="shortcut"><kbd>Space</kbd><span>Play / Pause</span></div>
							<div class="shortcut"><kbd>S</kbd><span>Step one generation</span></div>
							<div class="shortcut"><kbd>,</kbd> <kbd>.</kbd><span>Speed -/+</span></div>
						</section>

						<section class="shortcut-group">
							<h3>Grid</h3>
							<div class="shortcut"><kbd>I</kbd><span>Initialize (modal)</span></div>
							<div class="shortcut"><kbd>R</kbd><span>Reinitialize</span></div>
							<div class="shortcut"><kbd>D</kbd><span>Delete / Clear grid</span></div>
						</section>

						<section class="shortcut-group">
							<h3>Drawing</h3>
							<div class="shortcut"><kbd>Click</kbd><span>Draw cells</span></div>
							<div class="shortcut"><kbd>Right-click</kbd><span>Erase cells</span></div>
							<div class="shortcut"><kbd>[</kbd> <kbd>]</kbd><span>Brush size -/+</span></div>
						</section>
					</div>

					<!-- Right Column -->
					<div class="column">
						<section class="shortcut-group">
							<h3>Navigation</h3>
							<div class="shortcut"><kbd>Scroll</kbd><span>Zoom in/out</span></div>
							<div class="shortcut"><kbd>Shift</kbd>+<kbd>Drag</kbd><span>Pan</span></div>
							<div class="shortcut"><kbd>F</kbd><span>Fit to screen</span></div>
							<div class="shortcut"><kbd>G</kbd><span>Toggle grid lines</span></div>
						</section>

						<section class="shortcut-group">
							<h3>Visual</h3>
							<div class="shortcut"><kbd>T</kbd><span>Toggle theme</span></div>
							<div class="shortcut"><kbd>C</kbd><span>Cycle colors</span></div>
						</section>

						<section class="shortcut-group">
							<h3>Dialogs</h3>
							<div class="shortcut"><kbd>E</kbd><span>Edit rules</span></div>
							<div class="shortcut"><kbd>?</kbd><span>Help</span></div>
							<div class="shortcut"><kbd>Esc</kbd><span>Close dialog</span></div>
						</section>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.help-overlay {
		position: fixed;
		inset: 0;
		background: transparent;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 500;
	}

	.help-panel {
		background: var(--ui-bg, rgba(12, 12, 18, 0.75));
		backdrop-filter: blur(12px);
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
		border-radius: 10px;
		width: 380px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	}

	.help-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.6rem 0.9rem;
		border-bottom: 1px solid var(--ui-border, rgba(255, 255, 255, 0.06));
	}

	.help-header h2 {
		margin: 0;
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

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.tour-btn {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.25rem 0.5rem;
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.1));
		color: var(--ui-accent, #2dd4bf);
		border: 1px solid var(--ui-accent-border, rgba(45, 212, 191, 0.2));
		border-radius: 5px;
		font-size: 0.65rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.tour-btn:hover {
		background: var(--ui-accent-bg-hover, rgba(45, 212, 191, 0.2));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.35));
	}

	.tour-btn svg {
		width: 12px;
		height: 12px;
	}

	.close-btn {
		background: none;
		border: none;
		color: var(--ui-text, #666);
		cursor: pointer;
		padding: 0.15rem;
		display: flex;
		transition: color 0.15s;
	}

	.close-btn:hover {
		color: var(--ui-text-hover, #fff);
	}

	.close-btn svg {
		width: 14px;
		height: 14px;
	}

	.help-content {
		padding: 0.6rem 0.9rem;
	}

	.columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.shortcut-group {
		margin-bottom: 0.7rem;
	}

	.shortcut-group:last-child {
		margin-bottom: 0;
	}

	.shortcut-group h3 {
		margin: 0 0 0.35rem;
		font-size: 0.6rem;
		font-weight: 600;
		color: var(--ui-accent, #2dd4bf);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.shortcut {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.7rem;
		margin-bottom: 0.25rem;
	}

	.shortcut span {
		color: var(--ui-text, #888);
		margin-left: auto;
	}

	kbd {
		display: inline-block;
		padding: 0.1rem 0.3rem;
		background: var(--ui-border, rgba(255, 255, 255, 0.08));
		border: 1px solid var(--ui-border-hover, rgba(255, 255, 255, 0.1));
		border-radius: 3px;
		font-family: 'SF Mono', Monaco, Consolas, monospace;
		font-size: 0.6rem;
		color: var(--ui-text-hover, #ccc);
		min-width: 1.1rem;
		text-align: center;
	}

	/* Touch controls styling */
	.touch-controls {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.shortcut-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
	}

	.gesture-icon {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--ui-accent, #2dd4bf);
		flex-shrink: 0;
	}

	.gesture-icon svg {
		width: 16px;
		height: 16px;
	}

	.gesture-label {
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--ui-text-hover, #e0e0e0);
		min-width: 90px;
	}

	.gesture-desc {
		font-size: 0.65rem;
		color: var(--ui-text, #888);
		margin-left: auto;
	}

	.tip {
		font-size: 0.65rem;
		color: var(--ui-text, #888);
		padding: 0.25rem 0;
		border-left: 2px solid var(--ui-accent, #2dd4bf);
		padding-left: 0.5rem;
		margin-bottom: 0.25rem;
	}

	/* Mobile adjustments */
	@media (max-width: 768px) {
		.help-panel {
			width: 90vw;
			max-width: 320px;
		}

		.help-header h2 {
			font-size: 0.85rem;
		}
	}
</style>
