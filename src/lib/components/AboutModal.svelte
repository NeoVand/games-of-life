<script lang="ts">
	import HeartIcon from './HeartIcon.svelte';
	import { draggable } from '../utils/draggable.js';
	import { bringToFront, setModalPosition, getModalState } from '../stores/modalManager.svelte.js';

	interface Props {
		onclose: () => void;
		onstarttour: () => void;
	}

	let { onclose, onstarttour }: Props = $props();
	
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
					<div class="section">
						<h3>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
							</svg>
							Quick Start
						</h3>
						<ul>
							<li><kbd>Enter</kbd> Play / Pause simulation</li>
							<li><kbd>B</kbd> Toggle brush/pan mode</li>
							<li><kbd>Click</kbd> Draw cells · <kbd>Right-click</kbd> Erase</li>
							<li><kbd>Scroll</kbd> Zoom · <kbd>Space</kbd> hold Pan · <kbd>F</kbd> Fit</li>
							<li><kbd>E</kbd> Edit rules · <kbd>I</kbd> Initialize grid</li>
							<li><kbd>R</kbd> Reinitialize · <kbd>D</kbd> Delete/Clear grid</li>
							<li><kbd>T</kbd> Toggle theme · <kbd>C</kbd> Cycle colors</li>
						</ul>
					</div>
				</div>
			</div>

			<div class="footer">
				<div class="author">
					Developed by <strong>Neo Mohsenvand</strong>
				</div>
				<div class="footer-buttons">
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

	kbd {
		display: inline-block;
		padding: 0.1rem 0.3rem;
		background: var(--ui-border, rgba(255, 255, 255, 0.1));
		border: 1px solid var(--ui-border-hover, rgba(255, 255, 255, 0.15));
		border-radius: 3px;
		font-family: 'SF Mono', Monaco, monospace;
		font-size: 0.6rem;
		color: var(--ui-text-hover, #ccc);
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

		/* Hide keyboard shortcuts section on mobile since touch doesn't use them */
		.column:last-child .section:has(kbd) {
			display: none;
		}
	}
</style>
