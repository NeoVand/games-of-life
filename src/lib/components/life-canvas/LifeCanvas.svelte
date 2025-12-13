<script lang="ts">
	import { initWebGPU, Simulation, type WebGPUError } from '@games-of-life/webgpu';
	import type { CARule } from '$lib/utils/rules.js';

	type Seed =
		| { kind: 'random'; density?: number; includeSpectrum?: boolean }
		| { kind: 'blank' };

	interface Props {
		/** Canvas bitmap size (pixels). */
		width: number;
		height: number;
		/** Grid size (cells). */
		gridWidth?: number;
		gridHeight?: number;
		/** Simulation rule (app-side shape is compatible with webgpu Simulation). */
		rule: CARule;
		/** Steps per second. */
		speed?: number;
		/** Whether the sim is playing (bindable). */
		playing?: boolean;
		/** Initial fill/reset behavior. */
		seed?: Seed;
		/** Render settings. */
		showGrid?: boolean;
		neighborShading?: 0 | 1 | 2;
		spectrumMode?: number;
		spectrumFrequency?: number;
		isLightTheme?: boolean;
		aliveColor?: [number, number, number];
		/** Optional class for the <canvas>. */
		className?: string;
	}

	let {
		width,
		height,
		gridWidth = 64,
		gridHeight = 64,
		rule,
		speed = 30,
		playing = $bindable(true),
		seed = { kind: 'random', density: 0.22, includeSpectrum: true },
		showGrid = false,
		neighborShading = 1,
		spectrumMode = 1,
		spectrumFrequency = 1.0,
		isLightTheme = false,
		aliveColor = [0.2, 0.9, 0.95],
		className
	}: Props = $props();

	let canvas: HTMLCanvasElement | null = $state(null);
	let simulation: Simulation | null = $state(null);
	let initError: WebGPUError | null = $state(null);

	let rafId: number | null = $state(null);
	let lastT = 0;
	let accMs = 0;

	function applyViewDefaults() {
		if (!simulation) return;
		simulation.setView({
			showGrid,
			neighborShading,
			spectrumMode,
			spectrumFrequency,
			isLightTheme,
			aliveColor,
			// Hide brush in previews unless parent enables it later
			brushRadius: -1
		});
	}

	export function stepOnce() {
		if (!simulation) return;
		simulation.step();
		simulation.render(width, height);
	}

	export function reset() {
		if (!simulation) return;
		if (seed.kind === 'blank') simulation.clear();
		else simulation.randomize(seed.density ?? 0.22, seed.includeSpectrum ?? true);
		simulation.render(width, height);
	}

	$effect(() => {
		if (!canvas) return;
		if (typeof window === 'undefined') return;

		let cancelled = false;
		let destroyed = false;

		(async () => {
			const res = await initWebGPU(canvas);
			if (cancelled) return;
			if (!res.ok) {
				initError = res.error;
				return;
			}

			const sim = new Simulation(res.value, { width: gridWidth, height: gridHeight, rule });
			simulation = sim;
			initError = null;

			applyViewDefaults();
			reset();

			const loop = (t: number) => {
				if (destroyed) return;
				if (!simulation) return;

				if (playing) {
					if (lastT === 0) lastT = t;
					const dt = t - lastT;
					lastT = t;
					accMs += dt;

					const stepMs = 1000 / Math.max(1, speed);
					let steps = 0;
					while (accMs >= stepMs && steps < 8) {
						simulation.step();
						accMs -= stepMs;
						steps++;
					}
				}

				simulation.render(width, height);
				rafId = requestAnimationFrame(loop);
			};

			rafId = requestAnimationFrame(loop);
		})();

		return () => {
			cancelled = true;
			destroyed = true;
			if (rafId) cancelAnimationFrame(rafId);
			rafId = null;
			lastT = 0;
			accMs = 0;
			simulation?.destroy();
			simulation = null;
		};
	});

	$effect(() => {
		if (!simulation) return;
		simulation.setRule(rule);
	});

	$effect(() => {
		applyViewDefaults();
	});

	$effect(() => {
		// If the seed settings change, reset for determinism.
		if (!simulation) return;
		reset();
	});
</script>

{#if initError}
	<div class="gol-life-canvas-error">
		{initError.message}
	</div>
{:else}
	<canvas bind:this={canvas} class={className} width={width} height={height}></canvas>
{/if}

<style>
	.gol-life-canvas-error {
		font-size: 12px;
		line-height: 1.2;
		padding: 8px;
		border-radius: 8px;
		border: 1px solid rgba(128, 128, 128, 0.35);
		background: rgba(0, 0, 0, 0.06);
	}
</style>


