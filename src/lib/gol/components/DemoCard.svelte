<script lang="ts">
	import { LifeCanvas } from '@games-of-life/svelte';
	import { spectrumModeToIndex } from '@games-of-life/core';
	import { getSimulationState } from '$lib/stores/simulation.svelte.js';
	import type { GalleryRule } from '$lib/sims/gallery-rules.js';

	type Seed =
		| { kind: 'random'; density?: number; includeSpectrum?: boolean }
		| { kind: 'blank' }
		| { kind: 'cells'; cells: [number, number][]; tiled?: boolean; spacing?: number; state?: number };

	interface Props {
		title: string;
		teach: string;
		rule: GalleryRule;
		width?: number;
		height?: number;
		gridWidth?: number;
		gridHeight?: number;
		defaultDensity?: number;
		defaultSpeed?: number;
		seedKind?: 'random' | 'blank';
	}

	let {
		title,
		teach,
		rule,
		width = 460,
		height = 320,
		gridWidth = 192,
		gridHeight = 128,
		defaultDensity = 0.22,
		defaultSpeed = 18,
		seedKind = 'random'
	}: Props = $props();

	const simState = getSimulationState();

	let playing = $state(true);
	let speed = $state(defaultSpeed);
	let density = $state(defaultDensity);

	let canvasRef: LifeCanvas | null = $state(null);

	const neighborShadingIndex = $derived(
		simState.neighborShading === 'off' ? 0 : simState.neighborShading === 'alive' ? 1 : 2
	);

	const seed = $derived.by((): Seed => {
		if (seedKind === 'blank') return { kind: 'blank' };
		return { kind: 'random', density, includeSpectrum: true };
	});

	function handleReset() {
		canvasRef?.reset();
	}
</script>

<section class="demo-card">
	<header class="head">
		<div class="title">
			<h3>{title}</h3>
			<p>{teach}</p>
		</div>

		<div class="controls">
			<button class="btn" type="button" onclick={() => (playing = !playing)}>{playing ? 'Pause' : 'Play'}</button>
			<button class="btn" type="button" onclick={handleReset}>Reset</button>
		</div>
	</header>

	<div class="body">
		<div class="canvas-wrap">
			<LifeCanvas
				bind:this={canvasRef}
				{width}
				{height}
				{gridWidth}
				{gridHeight}
				rule={rule}
				{seed}
				{playing}
				speed={speed}
				neighborShading={neighborShadingIndex}
				spectrumMode={spectrumModeToIndex(simState.spectrumMode)}
				spectrumFrequency={simState.spectrumFrequency}
				isLightTheme={simState.isLightTheme}
				aliveColor={simState.aliveColor}
				className="gol-demo-canvas"
			/>
		</div>

		<div class="meta">
			<div class="row">
				<div class="label">Neighborhood</div>
				<div class="value"><code>{rule.neighborhood}</code></div>
			</div>
			<div class="row">
				<div class="label">States</div>
				<div class="value"><code>{rule.numStates}</code></div>
			</div>
			<div class="row">
				<div class="label">Rule</div>
				<div class="value mono">
					<div>B mask: <code>{rule.birthMask}</code></div>
					<div>S mask: <code>{rule.surviveMask}</code></div>
				</div>
			</div>

			<div class="sliders">
				<label class="slider">
					<span>Speed</span>
					<input type="range" min="1" max="60" step="1" bind:value={speed} />
					<code>{speed}</code>
				</label>

				{#if seedKind === 'random'}
					<label class="slider">
						<span>Seed</span>
						<input type="range" min="0.05" max="0.5" step="0.01" bind:value={density} />
						<code>{density.toFixed(2)}</code>
					</label>
				{/if}
			</div>
		</div>
	</div>
</section>

<style>
	.demo-card {
		border: 1px solid rgba(255, 255, 255, 0.10);
		background: rgba(0, 0, 0, 0.22);
		border-radius: 18px;
		padding: 1rem;
		backdrop-filter: blur(14px);
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.8rem;
	}

	h3 {
		margin: 0;
		font-size: 1.0rem;
		letter-spacing: -0.02em;
	}

	.title p {
		margin: 0.35rem 0 0;
		color: var(--color-text-muted);
		line-height: 1.5;
		max-width: 58ch;
	}

	.controls {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.btn {
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.06);
		color: var(--color-text);
		padding: 0.5rem 0.75rem;
		font-weight: 900;
		cursor: pointer;
	}

	.btn:hover {
		border-color: rgba(45, 212, 191, 0.35);
		background: rgba(45, 212, 191, 0.10);
	}

	.body {
		display: grid;
		grid-template-columns: 1fr 260px;
		gap: 1rem;
		align-items: start;
	}

	.canvas-wrap {
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.10);
		background: rgba(0, 0, 0, 0.25);
		padding: 0.65rem;
		display: grid;
		place-items: center;
	}

	:global(.gol-demo-canvas) {
		border-radius: 14px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(0, 0, 0, 0.35);
	}

	.meta {
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.10);
		background: rgba(0, 0, 0, 0.18);
		padding: 0.75rem;
	}

	.row {
		display: grid;
		grid-template-columns: 110px 1fr;
		gap: 0.6rem;
		align-items: baseline;
		padding: 0.35rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.row:last-of-type {
		border-bottom: none;
	}

	.label {
		color: var(--color-text-muted);
		font-weight: 800;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.value {
		color: var(--color-text);
	}

	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}

	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
		font-size: 0.9em;
		color: var(--color-text);
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		padding: 0.05rem 0.45rem;
	}

	.sliders {
		margin-top: 0.6rem;
		display: grid;
		gap: 0.55rem;
	}

	.slider {
		display: grid;
		grid-template-columns: 60px 1fr auto;
		gap: 0.5rem;
		align-items: center;
		color: var(--color-text-muted);
		font-weight: 800;
		font-size: 0.85rem;
	}

	input[type="range"] {
		width: 100%;
	}

	@media (max-width: 980px) {
		.body {
			grid-template-columns: 1fr;
		}
	}
</style>


