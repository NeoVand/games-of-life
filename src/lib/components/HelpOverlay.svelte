<script lang="ts">
	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();
</script>

<div class="help-overlay" role="dialog" aria-modal="true">
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
			<section class="shortcut-group">
				<h3>Simulation</h3>
				<div class="shortcut-list">
					<div class="shortcut">
						<kbd>Space</kbd>
						<span>Play / Pause</span>
					</div>
					<div class="shortcut">
						<kbd>S</kbd>
						<span>Step forward one generation</span>
					</div>
					<div class="shortcut">
						<kbd>&lt;</kbd> <kbd>&gt;</kbd>
						<span>Decrease / Increase speed</span>
					</div>
				</div>
			</section>

			<section class="shortcut-group">
				<h3>Drawing</h3>
				<div class="shortcut-list">
					<div class="shortcut">
						<kbd>Click</kbd>
						<span>Draw cells</span>
					</div>
					<div class="shortcut">
						<kbd>Right-click</kbd>
						<span>Erase cells</span>
					</div>
					<div class="shortcut">
						<kbd>[</kbd> <kbd>]</kbd>
						<span>Decrease / Increase brush size</span>
					</div>
					<div class="shortcut">
						<kbd>C</kbd>
						<span>Clear grid</span>
					</div>
					<div class="shortcut">
						<kbd>R</kbd>
						<span>Randomize grid</span>
					</div>
				</div>
			</section>

			<section class="shortcut-group">
				<h3>Navigation</h3>
				<div class="shortcut-list">
					<div class="shortcut">
						<kbd>Scroll</kbd>
						<span>Zoom in / out</span>
					</div>
					<div class="shortcut">
						<kbd>Shift</kbd> + <kbd>Drag</kbd>
						<span>Pan around</span>
					</div>
					<div class="shortcut">
						<kbd>Home</kbd>
						<span>Reset view to default</span>
					</div>
					<div class="shortcut">
						<kbd>G</kbd>
						<span>Toggle grid lines</span>
					</div>
				</div>
			</section>

			<section class="shortcut-group">
				<h3>Settings</h3>
				<div class="shortcut-list">
					<div class="shortcut">
						<kbd>E</kbd>
						<span>Open rule editor</span>
					</div>
					<div class="shortcut">
						<kbd>Esc</kbd>
						<span>Close dialogs</span>
					</div>
				</div>
			</section>
		</div>

		<div class="help-footer">
			<p>Click anywhere outside or press <kbd>Esc</kbd> to close</p>
		</div>
	</div>
</div>

<style>
	.help-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(2px);
		display: flex;
		align-items: flex-start;
		justify-content: flex-start;
		z-index: 500;
		padding: 4.5rem 1rem 1rem 1rem;
	}

	.help-panel {
		background: rgba(20, 20, 30, 0.95);
		backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		max-width: 420px;
		width: 100%;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
		overflow: hidden;
	}

	.help-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.help-header h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: #e0e0e0;
	}

	.close-btn {
		background: none;
		border: none;
		color: #888;
		cursor: pointer;
		padding: 0.25rem;
		display: flex;
		transition: color 0.2s;
	}

	.close-btn:hover {
		color: #fff;
	}

	.close-btn svg {
		width: 18px;
		height: 18px;
	}

	.help-content {
		padding: 1rem 1.25rem;
		max-height: 60vh;
		overflow-y: auto;
	}

	.shortcut-group {
		margin-bottom: 1.25rem;
	}

	.shortcut-group:last-child {
		margin-bottom: 0;
	}

	.shortcut-group h3 {
		margin: 0 0 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: #2dd4bf;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.shortcut-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.shortcut {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
	}

	.shortcut span {
		color: #a0a0a0;
	}

	kbd {
		display: inline-block;
		padding: 0.2rem 0.5rem;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
		font-size: 0.75rem;
		color: #e0e0e0;
		min-width: 1.5rem;
		text-align: center;
	}

	.help-footer {
		padding: 0.75rem 1.25rem;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
		text-align: center;
	}

	.help-footer p {
		margin: 0;
		font-size: 0.75rem;
		color: #666;
	}

	.help-footer kbd {
		padding: 0.1rem 0.35rem;
		font-size: 0.7rem;
	}
</style>

