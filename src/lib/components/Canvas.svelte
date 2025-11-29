<script lang="ts">
	import { onMount } from 'svelte';
	import { initWebGPU, type WebGPUContext, type WebGPUError } from '../webgpu/context.js';
	import { Simulation } from '../webgpu/simulation.js';
	import { getSimulationState } from '../stores/simulation.svelte.js';

	const simState = getSimulationState();

	let canvas: HTMLCanvasElement;
	let container: HTMLDivElement;
	let ctx: WebGPUContext | null = null;
	let simulation: Simulation | null = null;
	let error = $state<WebGPUError | null>(null);

	let canvasWidth = $state(0);
	let canvasHeight = $state(0);

	// Mouse state
	let isDrawing = $state(false);
	let isPanning = $state(false);
	let lastMouseX = 0;
	let lastMouseY = 0;

	// Animation
	let animationId: number | null = null;
	let lastStepTime = 0;

	onMount(() => {
		initializeWebGPU();

		// Handle resize
		const resizeObserver = new ResizeObserver(handleResize);
		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
			if (animationId !== null) {
				cancelAnimationFrame(animationId);
			}
			simulation?.destroy();
		};
	});

	async function initializeWebGPU() {
		const result = await initWebGPU(canvas);

		if (!result.ok) {
			error = result.error;
			return;
		}

		ctx = result.value;
		simulation = new Simulation(ctx, {
			width: simState.gridWidth,
			height: simState.gridHeight,
			rule: simState.currentRule
		});

		// Initial randomization for visual appeal
		simulation.randomize(0.15);

		// Start animation loop
		animationLoop(performance.now());
	}

	function handleResize(entries: ResizeObserverEntry[]) {
		const entry = entries[0];
		if (!entry) return;

		const { width, height } = entry.contentRect;
		const dpr = window.devicePixelRatio || 1;

		canvasWidth = Math.floor(width * dpr);
		canvasHeight = Math.floor(height * dpr);

		canvas.width = canvasWidth;
		canvas.height = canvasHeight;

		if (ctx) {
			ctx.context.configure({
				device: ctx.device,
				format: ctx.format,
				alphaMode: 'premultiplied'
			});
		}
	}

	function animationLoop(timestamp: number) {
		animationId = requestAnimationFrame(animationLoop);

		if (!simulation || canvasWidth === 0 || canvasHeight === 0) return;

		// Run simulation steps if playing
		if (simState.isPlaying) {
			const stepInterval = 1000 / simState.speed;
			if (timestamp - lastStepTime >= stepInterval) {
				simulation.step();
				simState.incrementGeneration();
				lastStepTime = timestamp;
			}
		}

		// Sync view state
		simulation.setView({ showGrid: simState.showGrid });

		// Always render
		simulation.render(canvasWidth, canvasHeight);
	}

	// Mouse event handlers
	function handleMouseDown(e: MouseEvent) {
		if (!simulation) return;

		const rect = canvas.getBoundingClientRect();
		const x = (e.clientX - rect.left) * (canvasWidth / rect.width);
		const y = (e.clientY - rect.top) * (canvasHeight / rect.height);

		lastMouseX = e.clientX;
		lastMouseY = e.clientY;

		// Middle mouse button or shift+left = pan
		if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
			isPanning = true;
			e.preventDefault();
			return;
		}

		// Left click = draw, right click = erase
		if (e.button === 0 || e.button === 2) {
			isDrawing = true;
			const state = e.button === 0 ? simState.brushState : 0;
			const gridPos = simulation.screenToGrid(x, y, canvasWidth, canvasHeight);
			simulation.paintBrush(gridPos.x, gridPos.y, simState.brushSize, state);
		}
	}

	function handleMouseMove(e: MouseEvent) {
		if (!simulation) return;

		const rect = canvas.getBoundingClientRect();
		const x = (e.clientX - rect.left) * (canvasWidth / rect.width);
		const y = (e.clientY - rect.top) * (canvasHeight / rect.height);

		if (isPanning) {
			const deltaX = e.clientX - lastMouseX;
			const deltaY = e.clientY - lastMouseY;
			simulation.pan(deltaX, deltaY, rect.width, rect.height);
			lastMouseX = e.clientX;
			lastMouseY = e.clientY;
			return;
		}

		if (isDrawing) {
			const state = e.buttons === 1 ? simState.brushState : 0;
			const gridPos = simulation.screenToGrid(x, y, canvasWidth, canvasHeight);
			simulation.paintBrush(gridPos.x, gridPos.y, simState.brushSize, state);
		}
	}

	function handleMouseUp() {
		isDrawing = false;
		isPanning = false;
	}

	function handleWheel(e: WheelEvent) {
		if (!simulation) return;
		e.preventDefault();

		const rect = canvas.getBoundingClientRect();
		const x = (e.clientX - rect.left) * (canvasWidth / rect.width);
		const y = (e.clientY - rect.top) * (canvasHeight / rect.height);

		// Zoom factor
		const factor = e.deltaY > 0 ? 1.1 : 0.9;
		simulation.zoomAt(x, y, canvasWidth, canvasHeight, factor);
	}

	function handleContextMenu(e: MouseEvent) {
		e.preventDefault();
	}

	// Expose simulation methods
	export function clear() {
		simulation?.clear();
		simState.resetGeneration();
	}

	export function randomize() {
		simulation?.randomize(0.15);
		simState.resetGeneration();
	}

	export function stepOnce() {
		simulation?.step();
		simState.incrementGeneration();
	}

	export function resetView() {
		simulation?.resetView();
	}

	export function updateRule() {
		simulation?.setRule(simState.currentRule);
	}

	export function getSimulation(): Simulation | null {
		return simulation;
	}
</script>

<div class="canvas-container" bind:this={container}>
	{#if error}
		<div class="error">
			<div class="error-icon">⚠️</div>
			<h2>WebGPU Not Available</h2>
			<p>{error.message}</p>
			<p class="hint">
				Try using a recent version of Chrome, Edge, Safari, or Firefox.
			</p>
		</div>
	{/if}
	<canvas
		bind:this={canvas}
		onmousedown={handleMouseDown}
		onmousemove={handleMouseMove}
		onmouseup={handleMouseUp}
		onmouseleave={handleMouseUp}
		onwheel={handleWheel}
		oncontextmenu={handleContextMenu}
		class:hidden={!!error}
	></canvas>
</div>

<style>
	.canvas-container {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: #0d0d12;
	}

	canvas {
		width: 100%;
		height: 100%;
		display: block;
		cursor: crosshair;
	}

	canvas.hidden {
		display: none;
	}

	.error {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: #e0e0e0;
		text-align: center;
		padding: 2rem;
	}

	.error-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}

	.error h2 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 1rem;
		color: #ff6b6b;
	}

	.error p {
		margin: 0.5rem 0;
		max-width: 500px;
		line-height: 1.6;
	}

	.error .hint {
		color: #888;
		font-size: 0.9rem;
	}
</style>

