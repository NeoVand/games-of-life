<script lang="ts">
	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onclose();
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<div class="help-overlay" role="dialog" aria-modal="true" onclick={handleBackdropClick}>
	<div class="help-panel">
		<div class="help-header">
			<h2>Keyboard Shortcuts</h2>
			<button class="close-btn" onclick={onclose} aria-label="Close">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</div>

		<div class="help-content">
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
						<div class="shortcut"><kbd>C</kbd><span>Clear grid</span></div>
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
						<div class="shortcut"><kbd>H</kbd><span>Reset view</span></div>
						<div class="shortcut"><kbd>G</kbd><span>Toggle grid lines</span></div>
					</section>

					<section class="shortcut-group">
						<h3>Dialogs</h3>
						<div class="shortcut"><kbd>E</kbd><span>Edit rules</span></div>
						<div class="shortcut"><kbd>?</kbd><span>Help</span></div>
						<div class="shortcut"><kbd>Esc</kbd><span>Close dialog</span></div>
					</section>
				</div>
			</div>
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

	/* Hide on mobile - keyboard shortcuts aren't useful on touch devices */
	@media (max-width: 768px) {
		.help-overlay {
			display: none;
		}
	}
</style>
