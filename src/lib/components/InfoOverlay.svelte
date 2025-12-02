<script lang="ts">
	import { getSimulationState } from '../stores/simulation.svelte.js';

	const simState = getSimulationState();

	let collapsed = $state(false); // Expanded by default
	let fps = $state(0);
	let lastFrameTime = 0;
	let frameCount = 0;

	// Track FPS
	$effect(() => {
		if (!simState.isPlaying) {
			fps = 0;
			return;
		}

		const updateFPS = () => {
			const now = performance.now();
			frameCount++;
			
			if (now - lastFrameTime >= 1000) {
				fps = frameCount;
				frameCount = 0;
				lastFrameTime = now;
			}
			
			if (simState.isPlaying) {
				requestAnimationFrame(updateFPS);
			}
		};

		lastFrameTime = performance.now();
		frameCount = 0;
		requestAnimationFrame(updateFPS);
	});

	// Alive cells - show ~ prefix when running since we can't track GPU changes in real-time
	const aliveCellsDisplay = $derived(
		simState.isPlaying 
			? `~${simState.aliveCells.toLocaleString()}` 
			: simState.aliveCells.toLocaleString()
	);
</script>

{#if collapsed}
	<!-- Collapsed: just an info icon -->
	<button class="info-icon" onclick={() => collapsed = false} title="Show info panel">
		<span class="i-icon">i</span>
	</button>
{:else}
	<!-- Expanded: full info panel -->
	<div class="info-panel">
		<div class="info-header">
			<div class="header-left">
				<span class="i-icon small">i</span>
				<span class="info-title">Info</span>
			</div>
			<button class="collapse-btn" onclick={() => collapsed = true} title="Collapse">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M19 9l-7 7-7-7" />
				</svg>
			</button>
		</div>

		<div class="info-content">
			<!-- Rule - bold italic f (matches toolbar) -->
			<div class="info-row">
				<div class="info-label">
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M16.5 3C14 3 12.5 4.5 11.8 7L10.5 11H7.5C7 11 6.5 11.4 6.5 12s.5 1 1 1h2.3l-1.6 5.5C7.7 20 6.8 21 5.5 21c-.5 0-.9-.1-1.2-.3-.4-.2-.9-.1-1.1.3-.2.4-.1.9.3 1.1.6.3 1.3.5 2 .5 2.5 0 4-1.5 4.8-4.2L12 13h3.5c.5 0 1-.4 1-1s-.5-1-1-1h-2.8l1.1-3.5C14.3 5.8 15.2 5 16.5 5c.4 0 .8.1 1.1.2.4.2.9 0 1.1-.4.2-.4 0-.9-.4-1.1-.6-.4-1.4-.7-2.3-.7z" />
					</svg>
				</div>
				{#if simState.currentRule.name && simState.currentRule.name !== simState.currentRule.ruleString}
					<span class="info-value rule">{simState.currentRule.name}</span>
				{:else}
					<span class="info-value code">{simState.currentRule.ruleString}</span>
				{/if}
			</div>

			<!-- Generation - counter/hash icon -->
			<div class="info-row">
				<div class="info-label">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="4" y1="9" x2="20" y2="9" />
						<line x1="4" y1="15" x2="20" y2="15" />
						<line x1="10" y1="3" x2="8" y2="21" />
						<line x1="16" y1="3" x2="14" y2="21" />
					</svg>
				</div>
				<span class="info-value mono">{simState.generation.toLocaleString()}</span>
			</div>

			<!-- Speed - clock icon (matches toolbar) -->
			<div class="info-row">
				<div class="info-label">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="9" />
						<path d="M12 7v5l3 2" />
					</svg>
				</div>
				<span class="info-value">
					{simState.speed} sps
					{#if simState.isPlaying && fps > 0}
						<span class="actual">({fps})</span>
					{/if}
				</span>
			</div>

			<!-- Alive cells - brush/cells icon -->
			<div class="info-row">
				<div class="info-label">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="3" fill="currentColor" />
						<circle cx="12" cy="12" r="8" />
					</svg>
				</div>
				<span class="info-value mono alive">{aliveCellsDisplay}</span>
			</div>

			<!-- Status - play/pause icon (matches toolbar) -->
			<div class="info-row">
				<div class="info-label">
					<svg viewBox="0 0 24 24" fill="currentColor">
						{#if simState.isPlaying}
							<path d="M8 5v14l11-7-11-7z" />
						{:else}
							<rect x="6" y="4" width="4" height="16" rx="1" />
							<rect x="14" y="4" width="4" height="16" rx="1" />
						{/if}
					</svg>
				</div>
				<span class="info-value status" class:playing={simState.isPlaying}>
					{simState.isPlaying ? 'Running' : 'Paused'}
				</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.info-icon {
		position: fixed;
		bottom: 1rem;
		left: 1rem;
		width: 32px;
		height: 32px;
		background: var(--toolbar-bg, rgba(12, 12, 18, 0.4));
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid var(--toolbar-border, rgba(255, 255, 255, 0.06));
		border-radius: 8px;
		color: var(--ui-accent, #2dd4bf);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
		z-index: 100;
	}

	.info-icon:hover {
		background: var(--btn-bg-hover, rgba(20, 20, 30, 0.5));
		border-color: var(--ui-border-hover, rgba(255, 255, 255, 0.12));
	}

	.i-icon {
		font-family: Georgia, 'Times New Roman', serif;
		font-style: italic;
		font-weight: bold;
		font-size: 16px;
		line-height: 1;
	}

	.i-icon.small {
		font-size: 12px;
		color: var(--ui-accent, #2dd4bf);
	}

	.info-panel {
		position: fixed;
		bottom: 1rem;
		left: 1rem;
		background: var(--toolbar-bg, rgba(12, 12, 18, 0.45));
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid var(--toolbar-border, rgba(255, 255, 255, 0.06));
		border-radius: 10px;
		min-width: 170px;
		z-index: 100;
		overflow: hidden;
	}

	.info-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.35rem 0.5rem;
		border-bottom: 1px solid var(--ui-border, rgba(255, 255, 255, 0.05));
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.info-title {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--ui-text-hover, #e0e0e0);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.collapse-btn {
		width: 18px;
		height: 18px;
		background: transparent;
		border: none;
		color: var(--ui-text, #666);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		transition: all 0.15s;
	}

	.collapse-btn:hover {
		background: var(--btn-bg-hover, rgba(255, 255, 255, 0.1));
		color: var(--ui-text-hover, #fff);
	}

	.collapse-btn svg {
		width: 12px;
		height: 12px;
	}

	.info-content {
		padding: 0.4rem 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.info-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.info-row.sub {
		margin-top: -0.2rem;
		padding-left: 1.4rem;
	}

	.info-label {
		width: 14px;
		height: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--ui-text, #666);
		flex-shrink: 0;
	}

	.info-label svg {
		width: 12px;
		height: 12px;
	}

	.info-value {
		font-size: 0.68rem;
		color: var(--ui-text-hover, #e0e0e0);
		flex: 1;
		text-align: right;
	}

	.info-value.rule {
		color: var(--ui-accent, #2dd4bf);
		font-weight: 500;
	}

	.info-value.code {
		font-family: 'SF Mono', Monaco, Consolas, monospace;
		font-size: 0.6rem;
		color: var(--ui-text, #888);
	}

	.info-value.mono {
		font-family: 'SF Mono', Monaco, Consolas, monospace;
	}

	.info-value .actual {
		font-size: 0.58rem;
		color: var(--ui-text, #666);
	}

	.info-value.status {
		font-size: 0.62rem;
	}

	.info-value.status.playing {
		color: var(--ui-accent, #2dd4bf);
	}

	.info-value.alive {
		color: var(--ui-accent, #2dd4bf);
	}

	/* Hide on mobile - use both max-width and pointer check for touch devices */
	@media (max-width: 768px), (pointer: coarse) {
		.info-icon,
		.info-panel {
			display: none;
		}
	}
</style>
