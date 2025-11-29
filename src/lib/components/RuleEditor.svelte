<script lang="ts">
	import Modal from './Modal.svelte';
	import { getSimulationState } from '../stores/simulation.svelte.js';
	import { RULE_PRESETS, parseRule, type CARule } from '../utils/rules.js';
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		onclose: () => void;
		onrulechange: () => void;
	}

	let { onclose, onrulechange }: Props = $props();

	const simState = getSimulationState();

	// Preview grid settings
	const PREVIEW_SIZE = 24;
	let previewCanvas: HTMLCanvasElement;
	let previewCtx: CanvasRenderingContext2D | null = null;
	let previewGrid: number[] = [];
	let previewNextGrid: number[] = [];
	let previewPlaying = $state(false);
	let previewAnimationId: number | null = null;
	let lastPreviewStep = 0;

	// Local state for editing
	let ruleString = $state(simState.currentRule.ruleString);
	let numStates = $state(simState.currentRule.numStates);
	let selectedPreset = $state(
		RULE_PRESETS.findIndex((r) => r.ruleString === simState.currentRule.ruleString)
	);
	let error = $state('');

	// Birth/Survival toggles
	let birthToggles = $state(
		Array.from({ length: 9 }, (_, i) => !!(simState.currentRule.birthMask & (1 << i)))
	);
	let surviveToggles = $state(
		Array.from({ length: 9 }, (_, i) => !!(simState.currentRule.surviveMask & (1 << i)))
	);

	// Computed masks
	function getBirthMask(): number {
		return birthToggles.reduce((mask, on, i) => (on ? mask | (1 << i) : mask), 0);
	}

	function getSurviveMask(): number {
		return surviveToggles.reduce((mask, on, i) => (on ? mask | (1 << i) : mask), 0);
	}

	// Initialize preview
	onMount(() => {
		if (previewCanvas) {
			previewCtx = previewCanvas.getContext('2d');
			randomizePreview();
			renderPreview();
		}
	});

	onDestroy(() => {
		if (previewAnimationId) {
			cancelAnimationFrame(previewAnimationId);
		}
	});

	function randomizePreview() {
		previewGrid = Array.from({ length: PREVIEW_SIZE * PREVIEW_SIZE }, () =>
			Math.random() < 0.3 ? 1 : 0
		);
		previewNextGrid = new Array(PREVIEW_SIZE * PREVIEW_SIZE).fill(0);
		renderPreview();
	}

	function clearPreview() {
		previewGrid = new Array(PREVIEW_SIZE * PREVIEW_SIZE).fill(0);
		renderPreview();
	}

	function stepPreview() {
		const birthMask = getBirthMask();
		const surviveMask = getSurviveMask();

		for (let y = 0; y < PREVIEW_SIZE; y++) {
			for (let x = 0; x < PREVIEW_SIZE; x++) {
				const idx = y * PREVIEW_SIZE + x;
				const state = previewGrid[idx];

				// Count alive neighbors (state === 1)
				let neighbors = 0;
				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						if (dx === 0 && dy === 0) continue;
						const nx = (x + dx + PREVIEW_SIZE) % PREVIEW_SIZE;
						const ny = (y + dy + PREVIEW_SIZE) % PREVIEW_SIZE;
						if (previewGrid[ny * PREVIEW_SIZE + nx] === 1) {
							neighbors++;
						}
					}
				}

				// Apply rule
				if (state === 0) {
					// Dead cell - check birth
					previewNextGrid[idx] = (birthMask & (1 << neighbors)) !== 0 ? 1 : 0;
				} else if (state === 1) {
					// Alive cell - check survival
					if ((surviveMask & (1 << neighbors)) !== 0) {
						previewNextGrid[idx] = 1;
					} else {
						// Dies - goes to state 2 if multi-state, else 0
						previewNextGrid[idx] = numStates > 2 ? 2 : 0;
					}
				} else {
					// Dying state - advance toward death
					previewNextGrid[idx] = state + 1 >= numStates ? 0 : state + 1;
				}
			}
		}

		// Swap buffers
		[previewGrid, previewNextGrid] = [previewNextGrid, previewGrid];
		renderPreview();
	}

	function renderPreview() {
		if (!previewCtx) return;

		const cellSize = previewCanvas.width / PREVIEW_SIZE;
		previewCtx.fillStyle = '#0a0a0f';
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
		if (state === 1) return '#2dd4bf';
		if (numStates === 2) return '#2dd4bf';

		// Multi-state colors
		const progress = (state - 1) / (numStates - 2);
		if (progress < 0.33) return '#a78bfa'; // Purple
		if (progress < 0.66) return '#f472b6'; // Pink
		return '#4b5563'; // Gray
	}

	function togglePreviewPlay() {
		previewPlaying = !previewPlaying;
		if (previewPlaying) {
			runPreviewLoop();
		}
	}

	function runPreviewLoop() {
		if (!previewPlaying) return;

		const now = performance.now();
		if (now - lastPreviewStep > 150) {
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
		if (numStates > 2) {
			ruleString += `/C${numStates}`;
		}

		selectedPreset = RULE_PRESETS.findIndex((r) => r.ruleString === ruleString);
		error = '';
	}

	function handlePresetChange(e: Event) {
		const select = e.target as HTMLSelectElement;
		const index = parseInt(select.value, 10);

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
			error = 'Invalid format';
		}
	}

	function handleNumStatesChange() {
		updateRuleString();
	}

	function applyRule() {
		const parsed = parseRule(ruleString);
		if (!parsed) {
			error = 'Invalid rule format';
			return;
		}

		const preset = RULE_PRESETS.find((r) => r.ruleString === parsed.ruleString);
		const rule: CARule = {
			...parsed,
			name: preset?.name ?? 'Custom'
		};

		simState.currentRule = rule;
		onrulechange();
		onclose();
	}

	// Preset descriptions
	const presetDescriptions: Record<string, string> = {
		"Conway's Life": "The classic. Cells need exactly 3 neighbors to be born, and 2-3 to survive.",
		HighLife: "Life variant with replicators. Cells also born with 6 neighbors.",
		'Day & Night': "Symmetric chaos. Both alive and dead states follow similar patterns.",
		Seeds: "Explosive! Every cell dies immediately but spawns new life.",
		'Life without Death': "Cells never die once born. Creates growing crystals.",
		Diamoeba: "Amoeba-like growth with diamond shapes.",
		'2x2': "Stable blocks form everywhere. Great for testing patterns.",
		Replicator: "Self-copying patterns appear naturally.",
		"Brian's Brain": "3-state rule with firing neurons and refractory periods.",
		'Star Wars': "Multi-state with colorful trails following the action.",
		Lava: "Slow-moving, lava-like flows with long decay trails.",
		Frogs: "Chaotic jumping patterns with medium-length trails."
	};
</script>

<Modal title="Rule Editor" {onclose}>
	<div class="rule-editor">
		<!-- Two-column layout -->
		<div class="editor-layout">
			<!-- Left: Controls -->
			<div class="controls-section">
				<!-- Explanation Banner -->
				<div class="info-banner">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10" />
						<path d="M12 16v-4m0-4h.01" />
					</svg>
					<p>
						Cellular automata rules determine when cells are <strong>born</strong> (created)
						or <strong>survive</strong> (stay alive) based on their neighbor count (0-8).
					</p>
				</div>

				<!-- Preset Selection -->
				<div class="field">
					<label for="preset">Quick Start - Preset Rules</label>
					<select id="preset" value={selectedPreset} onchange={handlePresetChange}>
						<option value={-1}>— Custom Rule —</option>
						{#each RULE_PRESETS as preset, i}
							<option value={i}>{preset.name} ({preset.ruleString})</option>
						{/each}
					</select>
				</div>

				<!-- Description -->
				{#if selectedPreset >= 0 && presetDescriptions[RULE_PRESETS[selectedPreset].name]}
					<div class="description">
						{presetDescriptions[RULE_PRESETS[selectedPreset].name]}
					</div>
				{/if}

				<!-- Birth and Survive Grids -->
				<div class="neighborhood-grids">
					<div class="neighborhood-section">
						<div class="section-header">
							<span class="section-label birth">Birth</span>
							<span class="section-hint">Dead → Alive</span>
						</div>
						<div class="neighbor-grid">
							{#each [0, 1, 2, 3, 4, 5, 6, 7, 8] as i}
								<label class="neighbor-cell" class:checked={birthToggles[i]}>
									<input
										type="checkbox"
										bind:checked={birthToggles[i]}
										onchange={updateRuleString}
										aria-label="{i} neighbors for birth"
									/>
									<span class="neighbor-count">{i}</span>
								</label>
							{/each}
						</div>
					</div>

					<div class="neighborhood-section">
						<div class="section-header">
							<span class="section-label survive">Survive</span>
							<span class="section-hint">Alive → Alive</span>
						</div>
						<div class="neighbor-grid">
							{#each [0, 1, 2, 3, 4, 5, 6, 7, 8] as i}
								<label class="neighbor-cell" class:checked={surviveToggles[i]}>
									<input
										type="checkbox"
										bind:checked={surviveToggles[i]}
										onchange={updateRuleString}
										aria-label="{i} neighbors for survival"
									/>
									<span class="neighbor-count">{i}</span>
								</label>
							{/each}
						</div>
					</div>
				</div>

				<!-- Multi-state Section -->
				<div class="multistate-section">
					<div class="multistate-header">
						<label for="num-states">
							<span class="section-label">States: {numStates}</span>
							<span class="multistate-badge" class:active={numStates > 2}>
								{numStates === 2 ? 'Standard' : 'Generations'}
							</span>
						</label>
					</div>
					<input
						id="num-states"
						type="range"
						min="2"
						max="16"
						bind:value={numStates}
						oninput={handleNumStatesChange}
					/>
					<div class="multistate-explanation">
						{#if numStates === 2}
							<p>Standard 2-state: cells are either <span class="alive">alive</span> or <span class="dead">dead</span>.</p>
						{:else}
							<p>
								Generations ({numStates} states): dying cells decay through
								<span class="decay">{numStates - 2} intermediate states</span>
								before death, creating colorful trails.
							</p>
						{/if}
					</div>
				</div>

				<!-- Rule String (Advanced) -->
				<div class="field rule-string-field">
					<label for="rule-string">
						Rule String
						<span class="advanced-hint">(Advanced)</span>
					</label>
					<div class="rule-string-row">
						<input
							id="rule-string"
							type="text"
							value={ruleString}
							oninput={handleRuleStringChange}
							placeholder="B3/S23"
							class:error={!!error}
						/>
						{#if error}
							<span class="error-indicator" title={error}>!</span>
						{/if}
					</div>
					<span class="format-hint">Format: B[digits]/S[digits] or B[digits]/S[digits]/C[states]</span>
				</div>
			</div>

			<!-- Right: Preview -->
			<div class="preview-section">
				<div class="preview-header">
					<span class="preview-title">Live Preview</span>
					<span class="preview-hint">Test your rule here</span>
				</div>

				<div class="preview-canvas-container">
					<canvas
						bind:this={previewCanvas}
						width={192}
						height={192}
						class="preview-canvas"
					></canvas>
				</div>

				<div class="preview-controls">
					<button
						class="preview-btn"
						onclick={togglePreviewPlay}
						class:playing={previewPlaying}
						title={previewPlaying ? 'Pause' : 'Play'}
					>
						{#if previewPlaying}
							<svg viewBox="0 0 24 24" fill="currentColor">
								<rect x="6" y="4" width="4" height="16" rx="1" />
								<rect x="14" y="4" width="4" height="16" rx="1" />
							</svg>
						{:else}
							<svg viewBox="0 0 24 24" fill="currentColor">
								<path d="M8 5.14v14l11-7-11-7z" />
							</svg>
						{/if}
					</button>
					<button class="preview-btn" onclick={stepPreview} title="Step" aria-label="Step one generation">
						<svg viewBox="0 0 24 24" fill="currentColor">
							<path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2V6z" />
						</svg>
					</button>
					<button class="preview-btn" onclick={randomizePreview} title="Randomize" aria-label="Randomize preview">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
					</button>
					<button class="preview-btn" onclick={clearPreview} title="Clear" aria-label="Clear preview">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
					</button>
				</div>
			</div>
		</div>

		<!-- Actions -->
		<div class="actions">
			<button class="btn secondary" onclick={onclose}>Cancel</button>
			<button class="btn primary" onclick={applyRule}>Apply to Main Grid</button>
		</div>
	</div>
</Modal>

<style>
	.rule-editor {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.editor-layout {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 1.5rem;
	}

	/* Info Banner */
	.info-banner {
		display: flex;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: rgba(45, 212, 191, 0.1);
		border: 1px solid rgba(45, 212, 191, 0.2);
		border-radius: 8px;
		margin-bottom: 0.5rem;
	}

	.info-banner svg {
		width: 18px;
		height: 18px;
		color: #2dd4bf;
		flex-shrink: 0;
		margin-top: 2px;
	}

	.info-banner p {
		margin: 0;
		font-size: 0.8rem;
		color: #a0a0a0;
		line-height: 1.5;
	}

	.info-banner strong {
		color: #2dd4bf;
	}

	/* Fields */
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.field > label {
		font-size: 0.8rem;
		color: #888;
		font-weight: 500;
	}

	select,
	input[type='text'] {
		background: rgba(10, 10, 15, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		padding: 0.5rem 0.75rem;
		color: #e0e0e0;
		font-size: 0.85rem;
		width: 100%;
	}

	select:focus,
	input[type='text']:focus {
		outline: none;
		border-color: #2dd4bf;
	}

	input[type='text'].error {
		border-color: #ff6b6b;
	}

	/* Description */
	.description {
		font-size: 0.8rem;
		color: #888;
		padding: 0.5rem 0.75rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 6px;
		line-height: 1.5;
	}

	/* Neighborhood Grids */
	.neighborhood-grids {
		display: flex;
		gap: 1.5rem;
		justify-content: center;
		margin: 0.5rem 0;
	}

	.neighborhood-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.section-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
	}

	.section-label {
		font-size: 0.85rem;
		font-weight: 600;
	}

	.section-label.birth {
		color: #4ade80;
	}

	.section-label.survive {
		color: #60a5fa;
	}

	.section-hint {
		font-size: 0.65rem;
		color: #555;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.neighbor-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 3px;
	}

	.neighbor-cell {
		width: 38px;
		height: 38px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(20, 20, 30, 0.8);
		border: 2px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
		position: relative;
	}

	.neighbor-cell:hover {
		border-color: rgba(255, 255, 255, 0.2);
		background: rgba(30, 30, 45, 0.8);
	}

	.neighbor-cell.checked {
		background: rgba(45, 212, 191, 0.25);
		border-color: #2dd4bf;
	}

	.neighbor-cell input {
		position: absolute;
		opacity: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}

	.neighbor-count {
		font-size: 0.95rem;
		font-weight: 600;
		color: #555;
		pointer-events: none;
	}

	.neighbor-cell.checked .neighbor-count {
		color: #2dd4bf;
	}

	/* Multi-state Section */
	.multistate-section {
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.02);
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.05);
	}

	.multistate-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.multistate-header label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: #e0e0e0;
	}

	.multistate-badge {
		font-size: 0.65rem;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.1);
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.multistate-badge.active {
		background: rgba(168, 85, 247, 0.2);
		color: #a855f7;
	}

	input[type='range'] {
		width: 100%;
		accent-color: #2dd4bf;
		height: 4px;
	}

	.multistate-explanation {
		margin-top: 0.5rem;
	}

	.multistate-explanation p {
		margin: 0;
		font-size: 0.75rem;
		color: #666;
		line-height: 1.5;
	}

	.multistate-explanation .alive {
		color: #2dd4bf;
	}

	.multistate-explanation .dead {
		color: #666;
	}

	.multistate-explanation .decay {
		color: #a855f7;
	}

	/* Rule String */
	.rule-string-field {
		margin-top: 0.5rem;
	}

	.advanced-hint {
		font-weight: 400;
		color: #555;
		margin-left: 0.25rem;
	}

	.rule-string-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.error-indicator {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #ff6b6b;
		color: #fff;
		border-radius: 50%;
		font-size: 0.75rem;
		font-weight: bold;
		flex-shrink: 0;
	}

	.format-hint {
		font-size: 0.7rem;
		color: #555;
	}

	/* Preview Section */
	.preview-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.05);
	}

	.preview-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
	}

	.preview-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: #e0e0e0;
	}

	.preview-hint {
		font-size: 0.65rem;
		color: #555;
	}

	.preview-canvas-container {
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
	}

	.preview-canvas {
		display: block;
		background: #0a0a0f;
	}

	.preview-controls {
		display: flex;
		gap: 0.5rem;
	}

	.preview-btn {
		width: 36px;
		height: 36px;
		border: none;
		background: rgba(255, 255, 255, 0.08);
		color: #888;
		cursor: pointer;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.preview-btn:hover {
		background: rgba(255, 255, 255, 0.15);
		color: #fff;
	}

	.preview-btn.playing {
		background: rgba(45, 212, 191, 0.2);
		color: #2dd4bf;
	}

	.preview-btn svg {
		width: 16px;
		height: 16px;
	}

	/* Actions */
	.actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}

	.btn {
		padding: 0.6rem 1.25rem;
		border-radius: 8px;
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn.secondary {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: #888;
	}

	.btn.secondary:hover {
		background: rgba(255, 255, 255, 0.05);
		color: #e0e0e0;
	}

	.btn.primary {
		background: #2dd4bf;
		border: none;
		color: #0a0a0f;
	}

	.btn.primary:hover {
		background: #5eead4;
	}

	/* Responsive */
	@media (max-width: 600px) {
		.editor-layout {
			grid-template-columns: 1fr;
		}

		.preview-section {
			order: -1;
		}
	}
</style>
