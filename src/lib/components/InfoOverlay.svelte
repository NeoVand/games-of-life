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
			<!-- Rule - same icon as Rule Editor button -->
			<div class="info-row">
				<div class="info-label">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<circle cx="5" cy="5" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="19" cy="5" r="2" />
						<circle cx="5" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
						<circle cx="5" cy="19" r="2" /><circle cx="12" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
						<path d="M7 5h3M14 5h3M5 7v3M19 7v3M5 14v3M19 14v3M7 19h3M14 19h3" />
					</svg>
				</div>
				{#if simState.currentRule.name && simState.currentRule.name !== simState.currentRule.ruleString}
					<span class="info-value rule">{simState.currentRule.name}</span>
				{:else}
					<span class="info-value code">{simState.currentRule.ruleString}</span>
				{/if}
			</div>

			<!-- Generation - clock icon like Speed button -->
			<div class="info-row">
				<div class="info-label">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="9" />
						<path d="M12 6v6l4 2" />
					</svg>
				</div>
				<span class="info-value mono">{simState.generation.toLocaleString()}</span>
			</div>

			<!-- Speed - same clock icon -->
			<div class="info-row">
				<div class="info-label">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="9" />
						<path d="M12 6v6l4 2" />
					</svg>
				</div>
				<span class="info-value">
					{simState.speed} sps
					{#if simState.isPlaying && fps > 0}
						<span class="actual">({fps})</span>
					{/if}
				</span>
			</div>

			<!-- Alive cells - filled squares -->
			<div class="info-row">
				<div class="info-label">
					<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
						<rect x="3" y="3" width="7" height="7" rx="1" />
						<rect x="14" y="3" width="7" height="7" rx="1" />
						<rect x="3" y="14" width="7" height="7" rx="1" />
					</svg>
				</div>
				<span class="info-value mono alive">{aliveCellsDisplay}</span>
			</div>

			<!-- Status -->
			<div class="info-row">
				<div class="info-label">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						{#if simState.isPlaying}
							<path d="M5 3l14 9-14 9V3z" fill="currentColor" />
						{:else}
							<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" />
							<rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" />
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
		background: rgba(12, 12, 18, 0.4);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.06);
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
		background: rgba(20, 20, 30, 0.5);
		border-color: rgba(255, 255, 255, 0.12);
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
		background: rgba(12, 12, 18, 0.45);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.06);
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
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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
		background: var(--ui-border, rgba(255, 255, 255, 0.1));
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

	/* Hide on mobile */
	@media (max-width: 768px) {
		.info-icon,
		.info-panel {
			display: none;
		}
	}
</style>
