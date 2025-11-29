<script lang="ts">
	import Canvas from '$lib/components/Canvas.svelte';
	import Controls from '$lib/components/Controls.svelte';
	import RuleEditor from '$lib/components/RuleEditor.svelte';
	import HelpOverlay from '$lib/components/HelpOverlay.svelte';
	import { getSimulationState, getUIState } from '$lib/stores/simulation.svelte.js';

	const simState = getSimulationState();
	const uiState = getUIState();
	
	let showHelp = $state(false);

	let canvas: Canvas;

	function handleClear() {
		canvas.clear();
	}

	function handleRandomize() {
		canvas.randomize();
	}

	function handleStep() {
		canvas.stepOnce();
	}

	function handleResetView() {
		canvas.resetView();
	}

	function handleRuleChange() {
		canvas.updateRule();
	}

	function handleKeydown(e: KeyboardEvent) {
		// Ignore if typing in an input
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
			return;
		}

		switch (e.code) {
			case 'Space':
				e.preventDefault();
				simState.togglePlay();
				break;
			case 'KeyC':
				if (!e.ctrlKey && !e.metaKey) {
					handleClear();
				}
				break;
			case 'KeyR':
				if (!e.ctrlKey && !e.metaKey) {
					handleRandomize();
				}
				break;
			case 'KeyS':
				if (!e.ctrlKey && !e.metaKey) {
					handleStep();
				}
				break;
			case 'KeyG':
				simState.showGrid = !simState.showGrid;
				break;
			case 'KeyE':
				uiState.showRuleEditor = !uiState.showRuleEditor;
				break;
			case 'Home':
				handleResetView();
				break;
		case 'Escape':
			showHelp = false;
			uiState.closeAll();
			break;
		case 'F1':
		case 'Slash':
			if (e.shiftKey || e.code === 'F1') {
				e.preventDefault();
				showHelp = !showHelp;
			}
			break;
			case 'BracketLeft':
				simState.brushSize = Math.max(1, simState.brushSize - 1);
				break;
			case 'BracketRight':
				simState.brushSize = Math.min(50, simState.brushSize + 1);
				break;
			case 'Comma':
				simState.speed = Math.max(1, simState.speed - 5);
				break;
			case 'Period':
				simState.speed = Math.min(120, simState.speed + 5);
				break;
		}
	}
</script>

<svelte:head>
	<title>Cellular Automaton</title>
	<meta name="description" content="WebGPU-powered cellular automaton visualizer with customizable rules" />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<main class="app">
	<Canvas bind:this={canvas} />

	<!-- Help Button (top-left) -->
	<button
		class="help-button"
		onclick={() => (showHelp = !showHelp)}
		title="Help (? or F1)"
		class:active={showHelp}
	>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<circle cx="12" cy="12" r="10" />
			<path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
			<circle cx="12" cy="17" r="0.5" fill="currentColor" />
		</svg>
	</button>

	<Controls
		onclear={handleClear}
		onrandomize={handleRandomize}
		onstep={handleStep}
		onresetview={handleResetView}
	/>

	{#if showHelp}
		<HelpOverlay onclose={() => (showHelp = false)} />
	{/if}

	{#if uiState.showRuleEditor}
		<RuleEditor
			onclose={() => (uiState.showRuleEditor = false)}
			onrulechange={handleRuleChange}
		/>
	{/if}
</main>

<!-- Help tooltip (shown briefly on first load) -->
<div class="help-hint">
	<p>
		<strong>Controls:</strong> Space = Play/Pause | Click = Draw | Right-click = Erase | Scroll = Zoom | Shift+Drag = Pan
	</p>
	<p>E = Edit Rules | [ ] = Brush Size | &lt; &gt; = Speed</p>
</div>

<style>
	.app {
		width: 100%;
		height: 100vh;
		overflow: hidden;
	}

	.help-button {
		position: fixed;
		top: 1rem;
		left: 1rem;
		width: 40px;
		height: 40px;
		border: none;
		background: rgba(20, 20, 30, 0.85);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		color: #a0a0a0;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
		z-index: 100;
	}

	.help-button:hover {
		background: rgba(30, 30, 45, 0.9);
		color: #fff;
		border-color: rgba(255, 255, 255, 0.2);
	}

	.help-button.active {
		background: rgba(45, 212, 191, 0.2);
		color: #2dd4bf;
		border-color: rgba(45, 212, 191, 0.3);
	}

	.help-button svg {
		width: 20px;
		height: 20px;
	}

	.help-hint {
		position: fixed;
		bottom: 3.5rem;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(20, 20, 30, 0.9);
		backdrop-filter: blur(10px);
		padding: 0.5rem 1rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		font-size: 0.75rem;
		color: #888;
		text-align: center;
		z-index: 50;
		opacity: 1;
		animation: fadeOut 8s forwards;
		pointer-events: none;
	}

	.help-hint p {
		margin: 0.25rem 0;
	}

	.help-hint strong {
		color: #a0a0a0;
	}

	@keyframes fadeOut {
		0%,
		70% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}
</style>
