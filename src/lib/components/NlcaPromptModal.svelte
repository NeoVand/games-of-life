<script lang="ts">
	import { draggable } from '$lib/utils/draggable.js';
	import { bringToFront, setModalPosition, getModalState } from '$lib/stores/modalManager.svelte.js';
	import { getSimulationState } from '$lib/stores/simulation.svelte.js';
	import { getNlcaPromptState, SYSTEM_PLACEHOLDERS, USER_PLACEHOLDERS, DEFAULT_TASK, DEFAULT_TEMPLATE } from '$lib/stores/nlcaPrompt.svelte.js';

	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();
	const modalState = $derived(getModalState('nlcaPrompt'));
	const simState = getSimulationState();
	const promptState = getNlcaPromptState();

	// Local editing state (saved on explicit save)
	let localTask = $state(promptState.taskDescription);
	let localAdvancedMode = $state(promptState.useAdvancedMode);
	let localTemplate = $state(promptState.advancedTemplate);
	let hasUnsavedChanges = $derived(
		localTask !== promptState.taskDescription ||
		localAdvancedMode !== promptState.useAdvancedMode ||
		localTemplate !== promptState.advancedTemplate
	);

	// Sample cell position for preview
	let sampleX = $state(5);
	let sampleY = $state(5);

	// Generate preview based on local editing state
	const previewPrompt = $derived.by(() => {
		const template = localAdvancedMode ? localTemplate : DEFAULT_TEMPLATE;
		const width = simState.gridWidth || 10;
		const height = simState.gridHeight || 10;
		
		return template
			.replace(/\{\{CELL_X\}\}/g, String(sampleX))
			.replace(/\{\{CELL_Y\}\}/g, String(sampleY))
			.replace(/\{\{GRID_WIDTH\}\}/g, String(width))
			.replace(/\{\{GRID_HEIGHT\}\}/g, String(height))
			.replace(/\{\{MAX_X\}\}/g, String(width - 1))
			.replace(/\{\{MAX_Y\}\}/g, String(height - 1))
			.replace(/\{\{TASK\}\}/g, localTask);
	});

	function handleModalClick() {
		bringToFront('nlcaPrompt');
	}
	function handleDragEnd(position: { x: number; y: number }) {
		setModalPosition('nlcaPrompt', position);
	}

	function saveChanges() {
		promptState.taskDescription = localTask;
		promptState.useAdvancedMode = localAdvancedMode;
		promptState.advancedTemplate = localTemplate;
	}

	function discardChanges() {
		localTask = promptState.taskDescription;
		localAdvancedMode = promptState.useAdvancedMode;
		localTemplate = promptState.advancedTemplate;
	}

	function resetTask() {
		localTask = DEFAULT_TASK;
	}

	function resetTemplate() {
		localTemplate = DEFAULT_TEMPLATE;
	}

	function resetAll() {
		localTask = DEFAULT_TASK;
		localAdvancedMode = false;
		localTemplate = DEFAULT_TEMPLATE;
	}

	// Highlight placeholders in template for visual clarity
	function highlightPlaceholders(text: string): string {
		// System placeholders (gray)
		let result = text.replace(
			/\{\{(CELL_X|CELL_Y|GRID_WIDTH|GRID_HEIGHT|MAX_X|MAX_Y)\}\}/g,
			'<span class="placeholder system">{{$1}}</span>'
		);
		// User placeholders (green)
		result = result.replace(
			/\{\{(TASK)\}\}/g,
			'<span class="placeholder user">{{$1}}</span>'
		);
		return result;
	}
</script>

<div class="modal-backdrop" role="presentation" style="z-index: {modalState.zIndex};">
	<div
		class="modal"
		role="dialog"
		aria-label="NLCA Prompt Editor"
		tabindex="0"
		use:draggable={{ id: 'nlcaPrompt', onDragEnd: handleDragEnd }}
		onclick={handleModalClick}
		onkeydown={() => {}}
		style={modalState.position ? `transform: translate(${modalState.position.x}px, ${modalState.position.y}px);` : ''}
	>
		<div class="header">
			<h3>Prompt Editor</h3>
			<div class="header-actions">
				{#if hasUnsavedChanges}
					<span class="unsaved-badge">Unsaved</span>
				{/if}
				<button class="close" onclick={onclose} aria-label="Close">×</button>
			</div>
		</div>

		<div class="content">
			<!-- Mode Toggle -->
			<div class="mode-toggle">
				<button 
					class="mode-btn" 
					class:active={!localAdvancedMode}
					onclick={() => localAdvancedMode = false}
				>
					Simple Mode
				</button>
				<button 
					class="mode-btn" 
					class:active={localAdvancedMode}
					onclick={() => localAdvancedMode = true}
				>
					Advanced Mode
				</button>
			</div>

			<!-- Simple Mode: Task Description Only -->
			{#if !localAdvancedMode}
				<div class="section">
					<div class="section-header">
						<h4>Task Description</h4>
						<button class="btn-small" onclick={resetTask}>Reset</button>
					</div>
					<p class="hint">
						Describe what you want the cells to do. This is the main instruction each cell receives.
					</p>
					<textarea 
						class="task-input"
						bind:value={localTask}
						rows="8"
						placeholder="Describe the task for cells..."
					></textarea>
				</div>
			{:else}
				<!-- Advanced Mode: Full Template -->
				<div class="section">
					<div class="section-header">
						<h4>Full Prompt Template</h4>
						<button class="btn-small" onclick={resetTemplate}>Reset</button>
					</div>
					<p class="hint">
						Edit the complete system prompt template. Use placeholders for dynamic values.
					</p>
					
					<!-- Placeholder Legend -->
					<div class="placeholder-legend">
					<div class="legend-group">
						<span class="legend-title">System (auto-filled):</span>
						{#each SYSTEM_PLACEHOLDERS as p (p.key)}
							<code class="placeholder-tag system">{p.key}</code>
						{/each}
					</div>
					<div class="legend-group">
						<span class="legend-title">Your content:</span>
						{#each USER_PLACEHOLDERS as p (p.key)}
							<code class="placeholder-tag user">{p.key}</code>
						{/each}
					</div>
					</div>

					<textarea 
						class="template-input"
						bind:value={localTemplate}
						rows="10"
						placeholder="Enter prompt template..."
					></textarea>
					
					<!-- Task input for advanced mode too -->
					<div class="sub-section">
						<div class="section-header">
							<h5>Task Content (fills <code>{'{{TASK}}'}</code>)</h5>
							<button class="btn-small" onclick={resetTask}>Reset</button>
						</div>
						<textarea 
							class="task-input"
							bind:value={localTask}
							rows="6"
							placeholder="Task description..."
						></textarea>
					</div>
				</div>
			{/if}

			<!-- Live Preview -->
			<div class="section preview-section">
				<div class="section-header">
					<h4>Preview</h4>
					<div class="preview-controls">
						<label>
							Cell: ({sampleX}, {sampleY})
							<input type="number" min="0" max={Math.max(0, (simState.gridWidth || 10) - 1)} bind:value={sampleX} />
							<input type="number" min="0" max={Math.max(0, (simState.gridHeight || 10) - 1)} bind:value={sampleY} />
						</label>
					</div>
				</div>
				<pre class="preview-code">{previewPrompt}</pre>
			</div>

			<!-- User Prompt Info -->
			<div class="section info-section">
				<h4>Cell State Input (sent each generation)</h4>
				<p class="hint">
					Each generation, cells receive their current state and neighborhood as JSON:
				</p>
				<pre class="example-code">{`{"generation":0,"state":0,"neighbors":2,"neighborhood":[[-1,-1,0],[0,-1,1],...]}`}</pre>
				<div class="format-legend">
					<span><code>generation</code> = time step</span>
					<span><code>state</code> = your current state (0/1)</span>
					<span><code>neighbors</code> = alive neighbor count</span>
					<span><code>neighborhood</code> = [dx, dy, state] per neighbor</span>
				</div>
			</div>
		</div>

		<div class="footer">
			<button class="btn" onclick={resetAll}>Reset All</button>
			<div class="footer-right">
				{#if hasUnsavedChanges}
					<button class="btn" onclick={discardChanges}>Discard</button>
				{/if}
				<button class="btn primary" onclick={() => { saveChanges(); onclose(); }} disabled={!hasUnsavedChanges && false}>
					{hasUnsavedChanges ? 'Save & Close' : 'Close'}
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
	}
	.modal {
		position: absolute;
		left: 50%;
		top: 5%;
		transform: translate(-50%, 0);
		width: min(720px, calc(100vw - 24px));
		max-height: calc(100vh - 60px);
		overflow-y: auto;
		background: var(--ui-bg);
		border: 1px solid var(--ui-border);
		border-radius: 18px;
		backdrop-filter: blur(18px);
		color: var(--ui-text-hover);
	}
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border-bottom: 1px solid var(--ui-border);
		position: sticky;
		top: 0;
		background: var(--ui-bg);
		z-index: 1;
	}
	.header-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.unsaved-badge {
		font-size: 0.75rem;
		padding: 3px 8px;
		background: rgba(255, 180, 100, 0.2);
		border: 1px solid rgba(255, 180, 100, 0.4);
		border-radius: 6px;
		color: #ffb464;
	}
	.close {
		width: 34px;
		height: 34px;
		border-radius: 10px;
		border: 1px solid var(--ui-border);
		background: var(--btn-bg);
		color: var(--ui-text-hover);
		cursor: pointer;
	}
	.content {
		padding: 14px 16px;
		display: grid;
		gap: 16px;
	}
	
	/* Mode Toggle */
	.mode-toggle {
		display: flex;
		gap: 4px;
		padding: 4px;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 12px;
	}
	.mode-btn {
		flex: 1;
		padding: 10px 16px;
		border: none;
		border-radius: 10px;
		background: transparent;
		color: var(--ui-text);
		cursor: pointer;
		transition: all 0.15s;
	}
	.mode-btn.active {
		background: var(--ui-accent);
		color: #000;
	}
	.mode-btn:hover:not(.active) {
		background: rgba(255, 255, 255, 0.08);
	}

	/* Sections */
	.section {
		display: grid;
		gap: 10px;
	}
	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.section-header h4, .section-header h5 {
		margin: 0;
		font-size: 0.95rem;
	}
	.section-header h5 {
		font-size: 0.85rem;
		font-weight: 500;
	}
	.section-header code {
		font-size: 0.75rem;
		background: rgba(100, 200, 100, 0.15);
		padding: 2px 6px;
		border-radius: 4px;
	}
	.sub-section {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--ui-border);
	}
	.hint {
		color: var(--ui-text);
		font-size: 0.85rem;
		margin: 0;
		line-height: 1.4;
	}
	.btn-small {
		padding: 4px 10px;
		font-size: 0.75rem;
		border-radius: 8px;
		border: 1px solid var(--ui-border);
		background: var(--btn-bg);
		color: var(--ui-text);
		cursor: pointer;
	}
	.btn-small:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	/* Inputs */
	.task-input, .template-input {
		width: 100%;
		border-radius: 10px;
		border: 1px solid var(--ui-border);
		background: rgba(0, 0, 0, 0.3);
		color: var(--ui-text-hover);
		padding: 12px;
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 0.85rem;
		line-height: 1.5;
		resize: vertical;
	}
	.task-input:focus, .template-input:focus {
		outline: none;
		border-color: var(--ui-accent);
	}

	/* Placeholder Legend */
	.placeholder-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		padding: 10px;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 10px;
		font-size: 0.75rem;
	}
	.legend-group {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.legend-title {
		color: var(--ui-text);
	}
	.placeholder-tag {
		padding: 2px 6px;
		border-radius: 4px;
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 0.7rem;
	}
	.placeholder-tag.system {
		background: rgba(150, 150, 150, 0.2);
		color: #aaa;
	}
	.placeholder-tag.user {
		background: rgba(100, 200, 100, 0.15);
		color: #7dce82;
	}

	/* Preview */
	.preview-section {
		background: rgba(0, 0, 0, 0.15);
		padding: 12px;
		border-radius: 12px;
	}
	.preview-controls {
		display: flex;
		gap: 8px;
	}
	.preview-controls label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.8rem;
		color: var(--ui-text);
	}
	.preview-controls input {
		width: 50px;
		padding: 4px 6px;
		border-radius: 6px;
		border: 1px solid var(--ui-border);
		background: var(--ui-input-bg);
		color: var(--ui-text-hover);
		font-size: 0.8rem;
	}
	.preview-code {
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid var(--ui-border);
		border-radius: 10px;
		padding: 12px;
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 0.8rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
		color: #a8dadc;
		max-height: 200px;
		overflow-y: auto;
	}

	/* Info Section */
	.info-section {
		border-top: 1px solid var(--ui-border);
		padding-top: 16px;
	}
	.info-section h4 {
		margin: 0 0 8px 0;
		font-size: 0.9rem;
		color: var(--ui-text);
	}
	.example-code {
		background: rgba(100, 200, 100, 0.08);
		border: 1px solid var(--ui-border);
		border-radius: 8px;
		padding: 10px;
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 0.75rem;
		color: #98c379;
		margin: 8px 0;
	}
	.format-legend {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
		font-size: 0.75rem;
		color: var(--ui-text);
	}
	.format-legend code {
		background: rgba(255, 255, 255, 0.1);
		padding: 1px 5px;
		border-radius: 4px;
		font-family: 'SF Mono', 'Fira Code', monospace;
	}

	/* Footer */
	.footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		padding: 14px 16px;
		border-top: 1px solid var(--ui-border);
		position: sticky;
		bottom: 0;
		background: var(--ui-bg);
	}
	.footer-right {
		display: flex;
		gap: 10px;
	}
	.btn {
		height: 38px;
		padding: 0 16px;
		border-radius: 12px;
		border: 1px solid var(--ui-border);
		background: var(--btn-bg);
		color: var(--ui-text-hover);
		cursor: pointer;
	}
	.btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}
	.btn.primary {
		background: var(--ui-accent);
		color: #000;
		border-color: transparent;
	}
	.btn.primary:hover {
		filter: brightness(1.1);
	}
</style>
