<script lang="ts">
	import { getSimulationState } from '../stores/simulation.svelte.js';
	import { RULE_PRESETS, parseRule, type CARule } from '../utils/rules.js';
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		onclose: () => void;
		onrulechange: () => void;
	}

	let { onclose, onrulechange }: Props = $props();

	const simState = getSimulationState();

	const PREVIEW_SIZE = 20;
	let previewCanvas: HTMLCanvasElement;
	let previewCtx: CanvasRenderingContext2D | null = null;
	let previewGrid: number[] = [];
	let previewNextGrid: number[] = [];
	let previewPlaying = $state(false);
	let previewAnimationId: number | null = null;
	let lastPreviewStep = 0;

	let dropdownOpen = $state(false);
	let ruleString = $state(simState.currentRule.ruleString);
	let numStates = $state(simState.currentRule.numStates);
	let selectedPreset = $state(
		RULE_PRESETS.findIndex((r) => r.ruleString === simState.currentRule.ruleString)
	);
	let error = $state('');

	let birthToggles = $state(
		Array.from({ length: 9 }, (_, i) => !!(simState.currentRule.birthMask & (1 << i)))
	);
	let surviveToggles = $state(
		Array.from({ length: 9 }, (_, i) => !!(simState.currentRule.surviveMask & (1 << i)))
	);

	function getBirthMask(): number {
		return birthToggles.reduce((mask, on, i) => (on ? mask | (1 << i) : mask), 0);
	}

	function getSurviveMask(): number {
		return surviveToggles.reduce((mask, on, i) => (on ? mask | (1 << i) : mask), 0);
	}

	onMount(() => {
		if (previewCanvas) {
			previewCtx = previewCanvas.getContext('2d');
			randomizePreview();
		}
	});

	onDestroy(() => {
		if (previewAnimationId) cancelAnimationFrame(previewAnimationId);
	});

	function randomizePreview() {
		previewGrid = Array.from({ length: PREVIEW_SIZE * PREVIEW_SIZE }, () =>
			Math.random() < 0.3 ? 1 : 0
		);
		previewNextGrid = new Array(PREVIEW_SIZE * PREVIEW_SIZE).fill(0);
		renderPreview();
	}

	function stepPreview() {
		const birthMask = getBirthMask();
		const surviveMask = getSurviveMask();

		for (let y = 0; y < PREVIEW_SIZE; y++) {
			for (let x = 0; x < PREVIEW_SIZE; x++) {
				const idx = y * PREVIEW_SIZE + x;
				const state = previewGrid[idx];
				let neighbors = 0;
				
				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						if (dx === 0 && dy === 0) continue;
						const nx = (x + dx + PREVIEW_SIZE) % PREVIEW_SIZE;
						const ny = (y + dy + PREVIEW_SIZE) % PREVIEW_SIZE;
						if (previewGrid[ny * PREVIEW_SIZE + nx] === 1) neighbors++;
					}
				}

				if (state === 0) {
					previewNextGrid[idx] = (birthMask & (1 << neighbors)) !== 0 ? 1 : 0;
				} else if (state === 1) {
					if ((surviveMask & (1 << neighbors)) !== 0) {
						previewNextGrid[idx] = 1;
					} else {
						previewNextGrid[idx] = numStates > 2 ? 2 : 0;
					}
				} else {
					previewNextGrid[idx] = state + 1 >= numStates ? 0 : state + 1;
				}
			}
		}

		[previewGrid, previewNextGrid] = [previewNextGrid, previewGrid];
		renderPreview();
	}

	function renderPreview() {
		if (!previewCtx) return;
		const cellSize = previewCanvas.width / PREVIEW_SIZE;
		// Use theme-aware background
		previewCtx.fillStyle = simState.isLightTheme ? '#f0f0f3' : '#0a0a0f';
		previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

		for (let y = 0; y < PREVIEW_SIZE; y++) {
			for (let x = 0; x < PREVIEW_SIZE; x++) {
				const state = previewGrid[y * PREVIEW_SIZE + x];
				if (state > 0) {
					previewCtx.fillStyle = getStateColor(state);
					previewCtx.fillRect(x * cellSize, y * cellSize, cellSize - 0.5, cellSize - 0.5);
				}
			}
		}
	}

	function getStateColor(state: number): string {
		// Use the current alive color from simState
		const [r, g, b] = simState.aliveColor;
		const aliveColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
		
		if (state === 1) return aliveColor;
		if (numStates === 2) return aliveColor;
		
		// For dying states, fade toward gray
		const progress = (state - 1) / (numStates - 2);
		const fade = 1 - progress * 0.7;
		const grayBlend = progress * 0.5;
		const gray = 80;
		const finalR = Math.round(r * 255 * fade + gray * grayBlend);
		const finalG = Math.round(g * 255 * fade + gray * grayBlend);
		const finalB = Math.round(b * 255 * fade + gray * grayBlend);
		return `rgb(${finalR}, ${finalG}, ${finalB})`;
	}

	function togglePreviewPlay() {
		previewPlaying = !previewPlaying;
		if (previewPlaying) runPreviewLoop();
	}

	function runPreviewLoop() {
		if (!previewPlaying) return;
		const now = performance.now();
		if (now - lastPreviewStep > 120) {
			stepPreview();
			lastPreviewStep = now;
		}
		previewAnimationId = requestAnimationFrame(runPreviewLoop);
	}

	function updateRuleString() {
		let birthStr = 'B';
		let surviveStr = 'S';
		for (let i = 0; i <= 8; i++) {
			if (birthToggles[i]) birthStr += i;
			if (surviveToggles[i]) surviveStr += i;
		}
		ruleString = `${birthStr}/${surviveStr}`;
		if (numStates > 2) ruleString += `/C${numStates}`;
		selectedPreset = RULE_PRESETS.findIndex((r) => r.ruleString === ruleString);
		error = '';
	}

	function selectPreset(index: number) {
		if (index >= 0 && index < RULE_PRESETS.length) {
			const preset = RULE_PRESETS[index];
			ruleString = preset.ruleString;
			numStates = preset.numStates;
			birthToggles = Array.from({ length: 9 }, (_, i) => !!(preset.birthMask & (1 << i)));
			surviveToggles = Array.from({ length: 9 }, (_, i) => !!(preset.surviveMask & (1 << i)));
			selectedPreset = index;
			error = '';
			randomizePreview();
		}
		dropdownOpen = false;
	}

	function handleRuleStringChange(e: Event) {
		const input = e.target as HTMLInputElement;
		ruleString = input.value;
		const parsed = parseRule(ruleString);
		if (parsed) {
			birthToggles = Array.from({ length: 9 }, (_, i) => !!(parsed.birthMask & (1 << i)));
			surviveToggles = Array.from({ length: 9 }, (_, i) => !!(parsed.surviveMask & (1 << i)));
			numStates = parsed.numStates;
			selectedPreset = RULE_PRESETS.findIndex((r) => r.ruleString === parsed.ruleString);
			error = '';
		} else {
			error = 'Invalid';
		}
	}

	function applyRule() {
		const parsed = parseRule(ruleString);
		if (!parsed) { error = 'Invalid rule'; return; }
		const preset = RULE_PRESETS.find((r) => r.ruleString === parsed.ruleString);
		const rule: CARule = { ...parsed, name: preset?.name ?? 'Custom' };
		simState.currentRule = rule;
		onrulechange();
		onclose();
	}

	const currentPresetName = $derived(selectedPreset >= 0 ? RULE_PRESETS[selectedPreset].name : 'Custom');
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="editor">
		<!-- Compact header -->
		<div class="header">
			<span class="title">Rule Editor</span>
			<div class="preset-dropdown">
				<button class="dropdown-btn" onclick={() => (dropdownOpen = !dropdownOpen)}>
					{currentPresetName}
					<span class="code">{ruleString}</span>
					<svg class="chevron" class:open={dropdownOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg>
				</button>
				{#if dropdownOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="dropdown-backdrop" onclick={() => (dropdownOpen = false)} onkeydown={() => {}}></div>
					<div class="dropdown-menu">
						{#each RULE_PRESETS as preset, i}
							<button class="dropdown-item" class:selected={selectedPreset === i} onclick={() => selectPreset(i)}>
								{preset.name}<span class="item-code">{preset.ruleString}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
			<button class="close-btn" onclick={onclose} aria-label="Close">✕</button>
		</div>

		<!-- Main content: Birth + Survive + Preview -->
		<div class="main-row">
			<div class="grid-col">
				<span class="label birth">Birth</span>
				<span class="hint">Dead → Alive</span>
				<div class="grid">
					{#each [0,1,2,3,4,5,6,7,8] as i}
						<label class="cell" class:on={birthToggles[i]}>
							<input type="checkbox" bind:checked={birthToggles[i]} onchange={updateRuleString} />
							{i}
						</label>
					{/each}
				</div>
			</div>

			<div class="grid-col">
				<span class="label survive">Survive</span>
				<span class="hint">Alive → Alive</span>
				<div class="grid">
					{#each [0,1,2,3,4,5,6,7,8] as i}
						<label class="cell" class:on={surviveToggles[i]}>
							<input type="checkbox" bind:checked={surviveToggles[i]} onchange={updateRuleString} />
							{i}
						</label>
					{/each}
				</div>
			</div>

			<div class="preview-col">
				<span class="label preview">Preview</span>
				<span class="hint">Live test</span>
				<div class="preview-area">
					<canvas bind:this={previewCanvas} width={108} height={108} class="canvas"></canvas>
					<div class="preview-btns">
						<button class="pbtn" class:active={previewPlaying} onclick={togglePreviewPlay} title="Play/Pause">
							{#if previewPlaying}
								<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
							{:else}
								<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7-11-7z" /></svg>
							{/if}
						</button>
						<button class="pbtn" onclick={stepPreview} title="Step">
							<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z" /></svg>
						</button>
						<button class="pbtn" onclick={randomizePreview} title="Reset">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v5h.6m14.8 2A8 8 0 004.6 9m0 0H9m11 11v-5h-.6m0 0a8 8 0 01-15.2-2M19.4 15H15" /></svg>
						</button>
					</div>
				</div>
			</div>
		</div>

		<!-- Footer: States + Rule String + Actions -->
		<div class="footer">
			<div class="states">
				<span class="foot-label">States</span>
				<input type="range" min="2" max="16" bind:value={numStates} oninput={updateRuleString} />
				<span class="states-val">{numStates}</span>
			</div>
			<div class="rule-input">
				<span class="foot-label">Rule</span>
				<input type="text" value={ruleString} oninput={handleRuleStringChange} class:error={!!error} />
			</div>
			<div class="actions">
				<button class="btn cancel" onclick={onclose}>Cancel</button>
				<button class="btn apply" onclick={applyRule}>Apply</button>
			</div>
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.editor {
		background: var(--ui-bg, rgba(12, 12, 18, 0.8));
		backdrop-filter: blur(16px);
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 12px;
		padding: 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
	}

	/* Header */
	.header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.title {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--ui-text-hover, #e0e0e0);
	}

	.preset-dropdown {
		flex: 1;
		position: relative;
	}

	.dropdown-btn {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.6rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 5px;
		color: var(--ui-text-hover, #ccc);
		font-size: 0.75rem;
		cursor: pointer;
	}

	.dropdown-btn:hover { border-color: var(--ui-border-hover, rgba(255, 255, 255, 0.2)); }

	.dropdown-btn .code {
		margin-left: auto;
		color: var(--ui-accent, #2dd4bf);
		font-family: 'SF Mono', Monaco, monospace;
		font-size: 0.7rem;
	}

	.chevron {
		width: 12px;
		height: 12px;
		color: var(--ui-text, #666);
		transition: transform 0.15s;
	}

	.chevron.open { transform: rotate(180deg); }

	.dropdown-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10;
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 3px);
		left: 0;
		right: 0;
		background: rgba(16, 16, 24, 0.95);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 5px;
		max-height: 180px;
		overflow-y: auto;
		z-index: 20;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
	}

	.dropdown-item {
		width: 100%;
		display: flex;
		justify-content: space-between;
		padding: 0.4rem 0.6rem;
		background: transparent;
		border: none;
		color: #d0d0d0;
		font-size: 0.7rem;
		cursor: pointer;
	}

	.dropdown-item:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
	.dropdown-item.selected { background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2)); color: var(--ui-accent, #2dd4bf); }

	.item-code {
		font-family: 'SF Mono', Monaco, monospace;
		font-size: 0.6rem;
		color: #888;
	}

	.close-btn {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: var(--ui-text, #666);
		font-size: 0.9rem;
		cursor: pointer;
		border-radius: 4px;
	}

	.close-btn:hover { background: var(--ui-border, rgba(255,255,255,0.1)); color: var(--ui-text-hover, #fff); }

	/* Main row */
	.main-row {
		display: flex;
		justify-content: center;
		gap: 1.2rem;
	}

	.grid-col, .preview-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.label {
		font-size: 0.75rem;
		font-weight: 600;
	}

	.label.birth { color: #4ade80; }
	.label.survive { color: #60a5fa; }
	.label.preview { color: var(--ui-accent, #f472b6); }

	.hint {
		font-size: 0.55rem;
		color: var(--ui-text, #555);
		text-transform: uppercase;
		letter-spacing: 0.03em;
		margin-bottom: 0.2rem;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 3px;
	}

	.cell {
		width: 34px;
		height: 34px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--ui-border, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
		border-radius: 5px;
		color: var(--ui-text, #555);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.1s;
	}

	.cell:hover { background: var(--ui-border-hover, rgba(255, 255, 255, 0.08)); }
	.cell.on {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.5));
		color: var(--ui-accent, #2dd4bf);
	}

	.cell input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	/* Preview */
	.preview-area {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.canvas {
		border-radius: 5px;
		background: var(--ui-canvas-bg, #0a0a0f);
	}

	.preview-btns {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.pbtn {
		width: 32px;
		height: 32px;
		border: none;
		background: var(--ui-border, rgba(255, 255, 255, 0.06));
		color: var(--ui-text, #666);
		border-radius: 5px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}

	.pbtn:hover { background: var(--ui-border-hover, rgba(255, 255, 255, 0.12)); color: var(--ui-text-hover, #fff); }
	.pbtn.active { background: var(--ui-accent-bg, rgba(45, 212, 191, 0.2)); color: var(--ui-accent, #2dd4bf); }
	.pbtn svg { width: 14px; height: 14px; }

	/* Footer */
	.footer {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--ui-border, rgba(255, 255, 255, 0.06));
	}

	.foot-label {
		font-size: 0.6rem;
		color: var(--ui-text, #555);
		text-transform: uppercase;
		margin-right: 0.3rem;
	}

	.states {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.states input[type='range'] {
		width: 60px;
		height: 3px;
		accent-color: var(--ui-accent, #2dd4bf);
	}

	.states-val {
		font-size: 0.7rem;
		color: var(--ui-accent, #2dd4bf);
		font-family: 'SF Mono', Monaco, monospace;
		min-width: 1.2rem;
	}

	.rule-input {
		display: flex;
		align-items: center;
	}

	.rule-input input {
		width: 80px;
		padding: 0.3rem 0.5rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 4px;
		color: var(--ui-accent, #2dd4bf);
		font-family: 'SF Mono', Monaco, monospace;
		font-size: 0.75rem;
	}

	.rule-input input.error { border-color: #ef4444; }

	.actions {
		display: flex;
		gap: 0.4rem;
		margin-left: auto;
	}

	.btn {
		padding: 0.35rem 0.8rem;
		border-radius: 5px;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn.cancel {
		background: transparent;
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		color: var(--ui-text, #888);
	}

	.btn.cancel:hover { background: var(--ui-border, rgba(255, 255, 255, 0.05)); color: var(--ui-text-hover, #e0e0e0); }

	.btn.apply {
		background: var(--ui-accent, #2dd4bf);
		border: none;
		color: var(--ui-apply-text, #0a0a0f);
	}

	.btn.apply:hover { filter: brightness(1.15); }

	/* Mobile adjustments */
	@media (max-width: 768px) {
		.modal {
			max-width: 95vw;
			padding: 0.8rem;
		}

		.main-content {
			flex-direction: column;
		}

		.rules-section,
		.preview-section {
			min-width: unset;
		}

		.preview-section {
			flex-direction: row;
			align-items: center;
			gap: 0.5rem;
		}

		.preview-canvas {
			width: 80px;
			height: 80px;
		}

		.preview-controls {
			flex-direction: column;
		}

		.neighbor-grids {
			flex-direction: column;
			gap: 0.5rem;
		}

		.header h2 {
			font-size: 0.9rem;
		}
	}
</style>
