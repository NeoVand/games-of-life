<script lang="ts">
	import HeartIcon from './HeartIcon.svelte';
	import { draggable } from '../utils/draggable.js';
	import { bringToFront, setModalPosition, getModalState } from '../stores/modalManager.svelte.js';
	import { getSimulationState } from '../stores/simulation.svelte.js';
	import { base } from '$app/paths';

	interface Props {
		onclose: () => void;
		onstarttour: () => void;
	}

	let { onclose, onstarttour }: Props = $props();
	
	const simState = getSimulationState();
	
	// Modal dragging state
	const modalState = $derived(getModalState('about'));
	
	function handleDragEnd(position: { x: number; y: number }) {
		setModalPosition('about', position);
	}
	
	function handleModalClick() {
		bringToFront('about');
	}

	function handleStartTour() {
		onclose();
		// Small delay to let the modal close
		setTimeout(() => onstarttour(), 150);
	}

	function handleLearnLibrary() {
		onclose();
	}

	// CA Tutorial visualization
	// A simple 5x5 grid showing a blinker oscillator
	// Initial state: vertical line of 3 cells
	const beforeGrid = [
		[0, 0, 0, 0, 0],
		[0, 0, 1, 0, 0],
		[0, 0, 1, 0, 0],
		[0, 0, 1, 0, 0],
		[0, 0, 0, 0, 0]
	];
	
	// After one step: horizontal line of 3 cells (blinker)
	const afterGrid = [
		[0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0],
		[0, 1, 1, 1, 0],
		[0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0]
	];

	// Get colors based on theme and alive color
	const aliveColor = $derived(() => {
		const [r, g, b] = simState.aliveColor;
		return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
	});
	
	const deadColor = $derived(() => {
		return simState.isLightTheme 
			? 'rgba(0, 0, 0, 0.08)' 
			: 'rgba(255, 255, 255, 0.08)';
	});
	
	const gridBorderColor = $derived(() => {
		return simState.isLightTheme 
			? 'rgba(0, 0, 0, 0.15)' 
			: 'rgba(255, 255, 255, 0.15)';
	});
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="modal-backdrop" style="z-index: {modalState.zIndex};" onwheel={(e) => {
	// Only forward wheel events if scrolling on the backdrop itself (not inside modal content)
	if (e.target !== e.currentTarget) return;
	
	// Forward wheel events to the canvas for zooming while modal is open
	const canvas = document.querySelector('canvas');
	if (canvas) {
		canvas.dispatchEvent(new WheelEvent('wheel', {
			deltaY: e.deltaY,
			deltaX: e.deltaX,
			clientX: e.clientX,
			clientY: e.clientY,
			bubbles: true
		}));
	}
}}>
	<div 
		class="modal"
		onclick={handleModalClick}
		use:draggable={{ 
			handle: '.header', 
			bounds: true,
			initialPosition: modalState.position,
			onDragEnd: handleDragEnd
		}}
	>
		<div class="header">
			<HeartIcon size={24} animated={true} />
			<span class="title">Games of Life</span>
			<button class="close-btn" onclick={onclose} aria-label="Close">✕</button>
		</div>

		<div class="content">
			<!-- What is this section -->
			<div class="intro-section">
				<p>
					<strong>Cellular automata</strong> are discrete computational systems where cells on a grid 
					evolve based on simple rules about their neighbors. Despite their simplicity, they can produce 
					remarkably complex and beautiful patterns.
				</p>
				<p>
					<strong>Conway's Game of Life</strong> (1970) is the most famous example: cells are born with 
					exactly 3 neighbors and survive with 2 or 3. This app lets you explore Life and many other 
					rule variants, all running on your GPU for smooth, real-time simulation.
				</p>
				<p>
					This app is powered by the <strong>Games of Life</strong> library packages:
					<code>@games-of-life/core</code>, <code>@games-of-life/webgpu</code>, <code>@games-of-life/svelte</code>.
				</p>
			</div>

			<div class="columns">
				<!-- Left column -->
				<div class="column">
					<div class="section">
						<h3>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
							</svg>
							Technology
						</h3>
						<ul>
							<li><strong>WebGPU</strong> — GPU compute shaders for parallel simulation</li>
							<li><strong>@games-of-life/*</strong> — reusable library powering this app</li>
							<li><strong>Svelte 5</strong> — Reactive UI with runes</li>
							<li><strong>SvelteKit</strong> — Static site generation</li>
						</ul>
					</div>

					<div class="section">
						<h3>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="10"/>
								<path d="M12 6v6l4 2"/>
							</svg>
							Features
						</h3>
						<ul>
							<li>Multiple rule presets (Life, HighLife, Day & Night...)</li>
							<li>Custom rule editor with live preview</li>
							<li>Multi-state cellular automata (Brian's Brain, etc.)</li>
							<li>Interactive painting and pattern placement</li>
							<li>Zoom, pan, and configurable grid sizes</li>
						</ul>
					</div>
				</div>

				<!-- Right column -->
				<div class="column">
					<div class="section ca-tutorial">
						<h3>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<rect x="3" y="3" width="7" height="7"/>
								<rect x="14" y="3" width="7" height="7"/>
								<rect x="14" y="14" width="7" height="7"/>
								<rect x="3" y="14" width="7" height="7"/>
							</svg>
							How It Works
						</h3>
						<div class="tutorial-content">
							<div class="tutorial-description">
								<p>The grid is made of <strong>cells</strong>. Each cell's state is somewhere between <strong>alive</strong> and <strong>dead</strong>.</p>
								<p>A cell's <strong>neighbors</strong> are the surrounding cells (8 in this example: up, down, left, right, and diagonals).</p>
								<p>Every step, each cell follows the rules:</p>
								<ul class="rules-list">
									<li><span class="rule-birth">Birth</span> — Dead + exactly 3 alive neighbors → alive</li>
									<li><span class="rule-survive">Survive</span> — Alive + 2-3 alive neighbors → stays</li>
									<li><span class="rule-death">Death</span> — Otherwise → dies</li>
						</ul>
							</div>
							<div class="tutorial-grids">
								<div class="grid-container">
									<div class="mini-grid" style="--alive-color: {aliveColor()}; --dead-color: {deadColor()}; --grid-border: {gridBorderColor()};">
										{#each beforeGrid as row, rowIdx (rowIdx)}
											{#each row as cell, colIdx (`before-${rowIdx}-${colIdx}`)}
												<div class="mini-cell" class:alive={cell === 1}></div>
											{/each}
										{/each}
									</div>
								</div>
								<div class="rule-arrow">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M5 12h14M12 5l7 7-7 7"/>
									</svg>
									<span>rule</span>
								</div>
								<div class="grid-container">
									<div class="mini-grid" style="--alive-color: {aliveColor()}; --dead-color: {deadColor()}; --grid-border: {gridBorderColor()};">
										{#each afterGrid as row, rowIdx (rowIdx)}
											{#each row as cell, colIdx (`after-${rowIdx}-${colIdx}`)}
												<div class="mini-cell" class:alive={cell === 1}></div>
											{/each}
										{/each}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div class="footer">
				<div class="author">
					Developed by <strong>Neo Mohsenvand</strong>
				</div>
				<div class="footer-buttons">
					<a href={`${base}/gol`} class="library-link" onclick={handleLearnLibrary}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
							<path d="M4 4.5A2.5 2.5 0 016.5 7H20" />
							<path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
						</svg>
						Learn GoL Library
					</a>
					<button class="tour-btn" onclick={handleStartTour}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M3 6l7-2 7 2 4-1v13l-4 1-7-2-7 2V5z" />
							<path d="M10 4v13" />
							<path d="M17 6v13" />
						</svg>
						<span>Take a Tour</span>
					</button>
					<a 
						href="https://github.com/NeoVand/games-of-life" 
						target="_blank" 
						rel="noopener noreferrer"
						class="github-link"
					>
						<svg viewBox="0 0 24 24" fill="currentColor">
							<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
						</svg>
						GitHub
					</a>
				</div>
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
		pointer-events: none; /* Allow clicks to pass through to canvas */
	}

	.modal {
		background: var(--ui-bg, rgba(12, 12, 18, 0.9));
		backdrop-filter: blur(16px);
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 12px;
		padding: 1.2rem;
		max-width: 580px;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
		/* Draggable support */
		pointer-events: auto;
		position: relative;
		will-change: transform;
	}

	.modal:global(.dragging) {
		box-shadow: 0 16px 64px rgba(0, 0, 0, 0.5);
	}

	.header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.8rem;
	}

	.title {
		flex: 1;
		font-size: 1rem;
		font-weight: 700;
		color: var(--ui-text-hover, #fff);
		letter-spacing: -0.02em;
	}

	.close-btn {
		width: 26px;
		height: 26px;
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

	.close-btn:hover {
		background: var(--ui-border, rgba(255, 255, 255, 0.1));
		color: var(--ui-text-hover, #fff);
	}

	.content {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}

	.intro-section {
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.2));
		border-radius: 8px;
		padding: 0.8rem;
	}

	.intro-section p {
		margin: 0;
		font-size: 0.75rem;
		color: var(--ui-text-hover, #ccc);
		line-height: 1.5;
	}

	.intro-section p + p {
		margin-top: 0.5rem;
	}

	.intro-section strong {
		color: var(--ui-accent, #2dd4bf);
	}

	.columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.7rem;
	}

	.column {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.section {
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.2));
		border-radius: 8px;
		padding: 0.7rem;
	}

	.section h3 {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0 0 0.5rem;
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--ui-accent, #2dd4bf);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.section h3 svg {
		width: 14px;
		height: 14px;
	}

	.section ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.section li {
		font-size: 0.7rem;
		color: var(--ui-text-hover, #ccc);
		padding: 0.2rem 0;
		padding-left: 0.8rem;
		position: relative;
		line-height: 1.4;
	}

	.section li::before {
		content: '•';
		position: absolute;
		left: 0;
		color: var(--ui-accent, #2dd4bf);
	}

	.section li strong {
		color: var(--ui-text-hover, #fff);
	}

	/* CA Tutorial Styles */
	.ca-tutorial {
		height: 100%;
	}

	.tutorial-content {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.tutorial-description p {
		margin: 0;
		font-size: 0.65rem;
		color: var(--ui-text-hover, #ccc);
		line-height: 1.4;
	}

	.tutorial-description p + p {
		margin-top: 0.25rem;
	}

	.tutorial-description strong {
		color: var(--ui-accent, #2dd4bf);
	}

	.rules-list {
		margin: 0.4rem 0 0 0;
		padding: 0;
		list-style: none;
		font-size: 0.65rem;
	}

	.rules-list li {
		padding: 0.15rem 0;
		padding-left: 0;
		color: var(--ui-text, #999);
	}

	.rules-list li::before {
		display: none;
	}

	.rule-birth {
		color: #4ade80;
		font-weight: 600;
	}

	.rule-survive {
		color: #60a5fa;
		font-weight: 600;
	}

	.rule-death {
		color: #ef4444;
		font-weight: 600;
	}

	.tutorial-grids {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.8rem;
	}

	.grid-container {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.mini-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 2px;
		padding: 3px;
		background: var(--grid-border);
		border-radius: 4px;
	}

	.mini-cell {
		width: 16px;
		height: 16px;
		background: var(--dead-color);
		border-radius: 2px;
		transition: background 0.3s ease;
	}

	.mini-cell.alive {
		background: var(--alive-color);
		box-shadow: 0 0 6px var(--alive-color);
	}

	.rule-arrow {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
	}

	.rule-arrow svg {
		width: 20px;
		height: 20px;
		color: var(--ui-accent, #2dd4bf);
	}

	.rule-arrow span {
		font-size: 0.55rem;
		font-weight: 600;
		color: var(--ui-text, #888);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 0.3rem;
	}

	.author {
		font-size: 0.7rem;
		color: var(--ui-text, #888);
	}

	.author strong {
		color: var(--ui-text-hover, #e0e0e0);
	}

	.footer-buttons {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.library-link {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.7rem;
		background: var(--ui-border, rgba(255, 255, 255, 0.08));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 6px;
		color: var(--ui-text-hover, #e0e0e0);
		font-size: 0.7rem;
		font-weight: 500;
		text-decoration: none;
		transition: all 0.15s;
	}

	.library-link:hover {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.3));
		color: var(--ui-accent, #2dd4bf);
	}

	.library-link svg {
		width: 16px;
		height: 16px;
	}

	.github-link {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.7rem;
		background: var(--ui-border, rgba(255, 255, 255, 0.08));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 6px;
		color: var(--ui-text-hover, #e0e0e0);
		font-size: 0.7rem;
		font-weight: 500;
		text-decoration: none;
		transition: all 0.15s;
	}

	.github-link:hover {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.3));
		color: var(--ui-accent, #2dd4bf);
	}

	.github-link svg {
		width: 16px;
		height: 16px;
	}

	/* Tour button */
	.tour-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.7rem;
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.1));
		color: var(--ui-accent, #2dd4bf);
		border: 1px solid var(--ui-accent-border, rgba(45, 212, 191, 0.2));
		border-radius: 6px;
		font-size: 0.7rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.tour-btn:hover {
		background: var(--ui-accent-bg-hover, rgba(45, 212, 191, 0.2));
		border-color: var(--ui-accent-border, rgba(45, 212, 191, 0.35));
		filter: brightness(1.1);
	}

	.tour-btn svg {
		width: 14px;
		height: 14px;
	}

	/* Mobile adjustments */
	@media (max-width: 768px) {
		.modal {
			max-width: 95vw;
			padding: 1rem;
			max-height: 85vh;
			overflow-y: auto;
		}

		.columns {
			grid-template-columns: 1fr;
		}

		.title {
			font-size: 1rem;
		}

		.intro-section p {
			font-size: 0.7rem;
		}

		.section li {
			font-size: 0.65rem;
		}

		.section h3 {
			font-size: 0.65rem;
		}

		.mini-cell {
			width: 12px;
			height: 12px;
		}

		.tutorial-grids {
			gap: 0.5rem;
		}
	}
</style>
