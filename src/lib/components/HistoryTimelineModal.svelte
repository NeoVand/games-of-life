<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { getSimulationRef } from '../stores/simulation.svelte.js';
	import { getNodes, getHeadId, jumpToNode, renameNode, deleteNode, getRootId, getMaxHistory, subscribeHistory, clearHistory, type HistoryNode } from '../stores/history.js';
	import { draggable, centerInViewport } from '../utils/draggable.js';
	import { bringToFront, setModalPosition, getModalState } from '../stores/modalManager.svelte.js';

	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();
	const modalState = $derived(getModalState('historyTimeline'));
	let modalEl = $state<HTMLDivElement | null>(null);
	const maxHistory = getMaxHistory();

	let selectedId = $state<string | null>(null);

	// Reactive data from history store
	let nodes = $state<HistoryNode[]>([]);
	let headId = $state<string | null>(null);
	let rootId = $state<string | null>(null);

	// Layout parameters
	const ROW_HEIGHT = 52;
	const COL_WIDTH = 20;
	const DOT_SIZE = 14;
	const LINE_LEFT = 20; // Left margin for the rail

	// Tree layout structure
	interface LayoutNode {
		node: HistoryNode;
		col: number; // column (0 = main rail, 1+ = branches)
		row: number; // row index (0 = top = newest)
	}

	let layoutNodes = $state<LayoutNode[]>([]);
	let maxCol = $state(0);

	// Subscribe to history changes for real-time updates
	let unsubscribe: (() => void) | null = null;

// Inline rename state
let editingId = $state<string | null>(null);
let editingValue = $state('');

	onMount(async () => {
		refresh();
		selectedId = getHeadId();
		
		unsubscribe = subscribeHistory(() => {
			refresh();
		});
	});

	onDestroy(() => {
		if (unsubscribe) unsubscribe();
	});

	function refresh() {
		nodes = getNodes();
		headId = getHeadId();
		rootId = getRootId();
		computeLayout();
	// Always keep selection on the current head so actions target the live state
	if (headId) {
		selectedId = headId;
		editingId = null;
	}
	}

	function computeLayout() {
		if (nodes.length === 0) {
			layoutNodes = [];
			maxCol = 0;
			return;
		}

		// Build maps
		const nodeMap = new Map<string, HistoryNode>();
		nodes.forEach(n => nodeMap.set(n.id, n));

		// Build children map
		const childrenMap = new Map<string, HistoryNode[]>();
		nodes.forEach(n => {
			if (n.parentId && nodeMap.has(n.parentId)) {
				const siblings = childrenMap.get(n.parentId) || [];
				siblings.push(n);
				childrenMap.set(n.parentId, siblings);
			}
		});

		// Sort children by createdAt
		childrenMap.forEach(children => {
			children.sort((a, b) => a.createdAt - b.createdAt);
		});

		// Find root
		const root = nodes.find(n => !n.parentId || !nodeMap.has(n.parentId));
		if (!root) {
			layoutNodes = [];
			maxCol = 0;
			return;
		}

		// DFS to assign columns - first child continues, others branch
		const layoutMap = new Map<string, LayoutNode>();
		let columnCounter = 0;

		function assignColumn(n: HistoryNode, col: number) {
			const ln: LayoutNode = { node: n, col, row: 0 };
			layoutMap.set(n.id, ln);
			columnCounter = Math.max(columnCounter, col);

			const children = childrenMap.get(n.id) || [];
			children.forEach((child, i) => {
				const childCol = i === 0 ? col : ++columnCounter;
				assignColumn(child, childCol);
			});
		}

		assignColumn(root, 0);
		maxCol = columnCounter;

		// Assign rows: newest at top (row 0)
		const sorted = Array.from(layoutMap.values()).sort((a, b) => b.node.createdAt - a.node.createdAt);
		sorted.forEach((ln, i) => {
			ln.row = i;
		});

		layoutNodes = sorted;
	}

	// Calculate pixel positions
	function getX(col: number): number {
		return LINE_LEFT + col * COL_WIDTH;
	}

	function getY(row: number): number {
		return row * ROW_HEIGHT + ROW_HEIGHT / 2;
	}

	// Icon paths for history kinds (only for non-pre nodes)
	const iconPaths: Record<string, string> = {
		brush: 'M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-10',
		rule: 'M16.5 3c-2.5 0-4 1.5-4.7 4l-1.3 4H7.5c-.5 0-1 .4-1 1s.5 1 1 1h2.3l-1.6 5.5C7.7 20 6.8 21 5.5 21c-.5 0-.9-.1-1.2-.3-.4-.2-.9-.1-1.1.3-.2.4-.1.9.3 1.1.6.3 1.3.5 2 .5 2.5 0 4-1.5 4.8-4.2L12 13h3.5c.5 0 1-.4 1-1s-.5-1-1-1h-2.8l1.1-3.5c.5-1.7 1.4-2.5 2.7-2.5.4 0 .8.1 1.1.2.4.2.9 0 1.1-.4.2-.4 0-.9-.4-1.1-.6-.4-1.4-.7-2.3-.7Z'
	};

	// Generate SVG paths for connections
	function getConnectionPaths(): string[] {
		const paths: string[] = [];
		const layoutMap = new Map<string, LayoutNode>();
		layoutNodes.forEach(ln => layoutMap.set(ln.node.id, ln));

		layoutNodes.forEach(ln => {
			if (!ln.node.parentId) return;
			const parent = layoutMap.get(ln.node.parentId);
			if (!parent) return;

			const px = getX(parent.col);
			const py = getY(parent.row);
			const cx = getX(ln.col);
			const cy = getY(ln.row);

			if (parent.col === ln.col) {
				// Same column - straight vertical line
				paths.push(`M ${px} ${py} L ${cx} ${cy}`);
			} else {
				// Branch - go horizontal first, then vertical so the vertical segment lives on the child column
				paths.push(`M ${px} ${py} L ${cx} ${py} L ${cx} ${cy}`);
			}
		});

		return paths;
	}

	const connectionPaths = $derived(getConnectionPaths());
	const svgWidth = $derived(LINE_LEFT + (maxCol + 1) * COL_WIDTH + 10);
	const svgHeight = $derived(Math.max(layoutNodes.length * ROW_HEIGHT, ROW_HEIGHT));
	const contentLeft = $derived(svgWidth + 8);

	function handleModalClick() {
		bringToFront('historyTimeline');
	}

	function handleDragEnd(position: { x: number; y: number }) {
		setModalPosition('historyTimeline', position);
	}

	function closeModal() {
		onclose();
	}

	function handleNodeClick(id: string) {
		const sim = getSimulationRef();
		if (!sim) return;
		jumpToNode(sim, id);
		selectedId = id;
	editingId = null;
		refresh();
	}

	function handleRename(id: string) {
	const current = nodes.find(n => n.id === id);
	if (!current) return;
	editingId = id;
	editingValue = current.name;
	}

function commitEdit() {
	if (!editingId) return;
	const trimmed = editingValue.trim();
	if (trimmed) {
		renameNode(editingId, trimmed);
	}
	editingId = null;
	editingValue = '';
	refresh();
}

function cancelEdit() {
	editingId = null;
	editingValue = '';
}

	function handleDelete(id: string) {
		if (id === rootId) return;
		deleteNode(id);
		const sim = getSimulationRef();
		if (sim) {
			const newHead = getHeadId();
			if (newHead && selectedId === id) {
				jumpToNode(sim, newHead);
				selectedId = newHead;
			}
		}
		refresh();
	}
</script>

<div class="modal-backdrop" role="presentation" style="z-index: {modalState.zIndex};">
	<div
		class="modal"
		bind:this={modalEl}
		style={modalState.position ? `transform: translate(${modalState.position.x}px, ${modalState.position.y}px);` : ''}
		onclick={handleModalClick}
		onkeydown={(e) => e.key === 'Escape' && closeModal()}
		role="dialog"
		aria-label="History Timeline"
		tabindex="-1"
		use:draggable={{
			handle: '.header',
			bounds: true,
			initialPosition: modalState.position ?? (modalEl ? centerInViewport(modalEl) : null),
			onDragEnd: handleDragEnd
		}}
	>
		<div class="header">
			<span class="title">
				<svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
					<circle cx="6" cy="6" r="2"/>
					<circle cx="18" cy="10" r="2"/>
					<circle cx="12" cy="18" r="2"/>
					<path d="M6 8v2a4 4 0 004 4h2"/>
					<path d="M16 10h-2a4 4 0 00-4 4v2"/>
				</svg>
				Timeline
			</span>
			<div class="header-actions">
				<button type="button" class="ghost close-btn" onclick={closeModal} title="Close" aria-label="Close">
					<svg viewBox="0 0 24 24" class="close-icon" aria-hidden="true">
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>

		<div class="body">
			{#if layoutNodes.length === 0}
				<div class="empty">No history yet. Draw to create entries.</div>
			{:else}
				<div class="timeline" style="min-height: {svgHeight}px;">
					<!-- SVG for tree lines and dots -->
					<svg 
						class="tree-svg" 
						width={svgWidth} 
						height={svgHeight}
						aria-hidden="true"
					>
						<!-- Connection lines -->
						{#each connectionPaths as path}
							<path d={path} class="conn-line" />
						{/each}

						<!-- Node dots with icons -->
						{#each layoutNodes as ln}
							{@const x = getX(ln.col)}
							{@const y = getY(ln.row)}
							{@const isHead = ln.node.id === headId}
							{@const isSelected = ln.node.id === selectedId}
							{@const isPre = ln.node.name.toLowerCase().includes('(pre)')}
							{@const showIcon = iconPaths[ln.node.kind] && !isPre}

							{#if isHead}
								<g class="node-dot-group">
									{#if showIcon}
										<g transform={`translate(${x} ${y})`}>
											<path d={iconPaths[ln.node.kind]} class="node-icon-outline head-icon" transform="translate(-11 -11) scale(0.92)" />
											<path d={iconPaths[ln.node.kind]} class="node-icon head-icon" transform="translate(-11 -11) scale(0.85)" />
										</g>
									{/if}
								</g>
							{:else if isPre}
								<g class="node-dot-group">
									<circle 
										cx={x} 
										cy={y} 
										r={DOT_SIZE / 2 - 2} 
										class="node-dot pre"
									/>
								</g>
							{:else}
								{#if showIcon}
									<g class="node-dot-group icon-only" transform={`translate(${x} ${y})`}>
										<path d={iconPaths[ln.node.kind]} class="node-icon-outline" transform="translate(-11 -11) scale(0.93)" />
										<path d={iconPaths[ln.node.kind]} class="node-icon" transform="translate(-11 -11) scale(0.86)" />
									</g>
								{:else}
									<circle 
										cx={x} 
										cy={y} 
										r={DOT_SIZE / 2 - 2} 
										class="node-dot"
										class:selected={isSelected}
									/>
								{/if}
							{/if}
						{/each}
					</svg>

					<!-- Node labels -->
					<div class="labels" style="left: {contentLeft}px;">
						{#each layoutNodes as ln}
							{@const isHead = ln.node.id === headId}
							{@const isRoot = ln.node.id === rootId}
							{@const isSelected = ln.node.id === selectedId}
							<div 
								class="node-row"
								class:selected={isSelected}
								style="top: {ln.row * ROW_HEIGHT}px; height: {ROW_HEIGHT}px;"
								onclick={() => handleNodeClick(ln.node.id)}
								onkeydown={(e) => e.key === 'Enter' && handleNodeClick(ln.node.id)}
								role="button"
								tabindex="0"
								aria-pressed={isSelected}
							>
								<div class="node-info">
									<div class="node-header">
										{#if !ln.node.name.toLowerCase().includes('(pre)')}
											{#if editingId === ln.node.id}
												<!-- Inline edit mode -->
												<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
												<div class="inline-edit" onclick={(e) => e.stopPropagation()}>
													<input
														type="text"
														bind:value={editingValue}
														placeholder="Name"
														onkeydown={(e) => {
															if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
															if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
														}}
														onblur={commitEdit}
														autofocus
													/>
												</div>
											{:else}
												<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
												<span 
													class="node-name editable" 
													onclick={(e) => { e.stopPropagation(); handleRename(ln.node.id); }}
													title="Click to rename"
												>{ln.node.name}</span>
											{/if}
											{#if isHead}
												<span class="badge head">HEAD</span>
											{/if}
											{#if isRoot}
												<span class="badge root">ROOT</span>
											{/if}
										{/if}
									</div>
									<div class="node-meta">
										{#if !ln.node.name.toLowerCase().includes('(pre)')}
											<span class="kind">{ln.node.kind}</span>
										{/if}
										<span class="time">{new Date(ln.node.createdAt).toLocaleTimeString()}</span>
									</div>
								</div>

								{#if isSelected && !ln.node.name.toLowerCase().includes('(pre)') && !isRoot}
									<div class="node-actions">
										<button 
											type="button"
											class="action-btn danger" 
											onclick={(e) => { e.stopPropagation(); handleDelete(ln.node.id); }} 
											title="Delete"
											aria-label="Delete"
										>
											<svg viewBox="0 0 24 24" aria-hidden="true">
												<polyline points="3 6 5 6 21 6" />
												<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
											</svg>
										</button>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<div class="footer">
			<span class="hint">{layoutNodes.length} / {maxHistory} snapshots</span>
			{#if layoutNodes.length > 1}
				<button 
					type="button" 
					class="clear-btn" 
					onclick={() => { clearHistory(); refresh(); }}
					title="Clear history - make current state the new root"
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
						<path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6h12z" />
					</svg>
					Clear
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		pointer-events: none;
	}
	.modal {
		position: fixed;
		top: 0;
		left: 0;
		min-width: 280px;
		max-width: 360px;
		max-height: 55vh;
		display: flex;
		flex-direction: column;
		background: var(--ui-bg, rgba(12, 12, 18, 0.95));
		backdrop-filter: blur(20px);
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
		border-radius: 12px;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
		pointer-events: auto;
		overflow: hidden;
	}
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.55rem 0.75rem;
		border-bottom: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
		cursor: grab;
		flex-shrink: 0;
	}
	.header:active { cursor: grabbing; }
	.title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--ui-text-hover, #fff);
		font-weight: 600;
		font-size: 0.85rem;
	}
	.icon {
		width: 16px;
		height: 16px;
		stroke: currentColor;
		fill: none;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.ghost {
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		background: rgba(255, 255, 255, 0.03);
		color: var(--ui-text, #9ca3af);
		border-radius: 5px;
		padding: 0.25rem 0.45rem;
		font-size: 0.68rem;
		cursor: pointer;
		transition: all 0.12s ease;
	}
	.ghost:hover {
		background: rgba(255, 255, 255, 0.07);
		color: var(--ui-text-hover, #fff);
	}
	.close-btn { padding: 0.25rem; }
	.close-icon {
		width: 12px;
		height: 12px;
		stroke: currentColor;
		fill: none;
		stroke-width: 2.5;
		stroke-linecap: round;
	}
	.body {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 0.4rem;
		scrollbar-width: thin;
		scrollbar-color: color-mix(in srgb, var(--ui-text, #6b7280) 40%, transparent) transparent;
	}
	.body::-webkit-scrollbar {
		width: 8px;
	}
	.body::-webkit-scrollbar-track {
		background: transparent;
	}
	.body::-webkit-scrollbar-thumb {
		background: color-mix(in srgb, var(--ui-text, #6b7280) 40%, transparent);
		border-radius: 999px;
	}
	.empty {
		padding: 1.5rem 1rem;
		color: var(--ui-text, #6b7280);
		text-align: center;
		font-size: 0.8rem;
	}
	.timeline {
		position: relative;
	}
	.tree-svg {
		position: absolute;
		top: 0;
		left: 0;
	}
	.conn-line {
		fill: none;
		/* use theme-aware text color for contrast in both themes */
		stroke: color-mix(in srgb, var(--ui-text, #4b5563) 45%, transparent);
		stroke-width: 1.8;
		stroke-linecap: round;
	}
	.node-dot {
		/* solid, theme-aware base so lines don't show through */
		fill: color-mix(in srgb, var(--ui-text, #6b7280) 80%, var(--ui-bg, #0f1115) 20%);
		stroke: var(--ui-bg, #0f1115);
		stroke-width: 1.2;
		transition: all 0.12s ease;
	}
	.node-dot.pre {
		fill: color-mix(in srgb, var(--ui-text, #6b7280) 70%, var(--ui-bg, #0f1115) 30%);
		stroke: var(--ui-bg, #0f1115);
	}
	.node-icon {
		fill: currentColor;
		stroke: none;
		color: color-mix(in srgb, var(--ui-text, #6b7280) 80%, var(--ui-bg, #0f1115) 20%);
	}
	.head-icon {
		color: var(--ui-accent, #2dd4bf);
	}
	.node-icon-outline {
		fill: none;
		stroke: color-mix(in srgb, var(--ui-bg, #0f1115) 65%, transparent);
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.labels {
		position: absolute;
		top: 0;
		right: 0;
	}
	.node-row {
		position: absolute;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 0.5rem;
		cursor: pointer;
		border-radius: 6px;
		transition: background 0.1s ease;
		margin-right: 0.25rem;
	}
	.node-row:hover {
		background: rgba(255, 255, 255, 0.04);
	}
	.node-row.selected {
		background: var(--ui-accent-bg, rgba(var(--ui-accent-rgb, 45, 212, 191), 0.12));
	}
	.node-row:focus-visible {
		outline: 1px solid rgba(var(--ui-accent-rgb, 45, 212, 191), 0.5);
	}
	.node-info {
		flex: 1;
		min-width: 0;
	}
	.node-header {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.node-name {
		font-weight: 500;
		color: var(--ui-text-hover, #e5e7eb);
		font-size: 0.78rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.node-name.editable {
		cursor: text;
		padding: 0.1rem 0.25rem;
		margin: -0.1rem -0.25rem;
		border-radius: 4px;
		transition: background 0.15s;
	}
	.node-name.editable:hover {
		background: rgba(255, 255, 255, 0.08);
	}
	.inline-edit {
		display: flex;
		align-items: center;
	}
	.inline-edit input {
		min-width: 100px;
		max-width: 140px;
		padding: 0.18rem 0.35rem;
		border-radius: 4px;
		border: 1px solid var(--ui-accent, rgba(45, 212, 191, 0.6));
		background: color-mix(in srgb, var(--ui-bg, #0f1115) 85%, white 15%);
		color: var(--ui-text-hover, #e5e7eb);
		font-size: 0.78rem;
		font-weight: 500;
		outline: none;
	}
	.inline-edit input:focus {
		border-color: var(--ui-accent, #2dd4bf);
		box-shadow: 0 0 0 2px rgba(var(--ui-accent-rgb, 45, 212, 191), 0.2);
	}
	.badge {
		font-size: 0.52rem;
		padding: 0.08rem 0.28rem;
		border-radius: 3px;
		font-weight: 600;
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}
	.badge.head {
		background: rgba(var(--ui-accent-rgb, 45, 212, 191), 0.18);
		color: var(--ui-accent, #2dd4bf);
	}
	.badge.root {
		background: rgba(var(--ui-text-rgb, 156, 163, 175), 0.1);
		color: var(--ui-text, #9ca3af);
	}
	.node-meta {
		display: flex;
		gap: 0.35rem;
		font-size: 0.65rem;
		color: var(--ui-text, #6b7280);
		margin-top: 0.05rem;
	}
	.kind {
		text-transform: uppercase;
		letter-spacing: 0.04em;
		opacity: 0.7;
	}
	.node-actions {
		display: flex;
		gap: 0.2rem;
		flex-shrink: 0;
	}
	.action-btn {
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		background: rgba(255, 255, 255, 0.04);
		color: var(--ui-text, #9ca3af);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.1s ease;
	}
	.action-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: var(--ui-text-hover, #fff);
	}
	.action-btn.danger:hover {
		background: rgba(239, 68, 68, 0.12);
		color: #ef4444;
		border-color: rgba(239, 68, 68, 0.3);
	}
	.action-btn svg {
		width: 11px;
		height: 11px;
		stroke: currentColor;
		fill: none;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.4rem 0.75rem;
		border-top: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
		color: var(--ui-text, #6b7280);
		font-size: 0.68rem;
		flex-shrink: 0;
	}
	.clear-btn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		background: transparent;
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 4px;
		color: var(--ui-text, #6b7280);
		font-size: 0.62rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.clear-btn:hover {
		background: rgba(239, 68, 68, 0.1);
		border-color: rgba(239, 68, 68, 0.4);
		color: #ef4444;
	}
	.clear-btn svg {
		width: 12px;
		height: 12px;
	}
</style>
