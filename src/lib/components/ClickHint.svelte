<script lang="ts">
	import { onMount } from 'svelte';
	import { getSimulationState } from '../stores/simulation.svelte.js';
	import { hasTourBeenCompleted, onTourCompleted } from '../utils/tour.js';
	
	const simState = getSimulationState();
	
	// Detect if touch device
	const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
	const hintText = isTouchDevice ? 'Tap Here' : 'Click Here';
	
	// Track tour completion reactively
	let tourCompleted = $state(false);
	
	onMount(() => {
		// Check initial state
		tourCompleted = hasTourBeenCompleted();
		
		// Subscribe to tour completion
		const unsubscribe = onTourCompleted(() => {
			tourCompleted = true;
		});
		
		return unsubscribe;
	});
	
	// Only show hint if tour is completed and user hasn't interacted yet
	const shouldShow = $derived(!simState.hasInteracted && tourCompleted);
</script>

{#if shouldShow}
	{@const [r, g, b] = simState.aliveColor}
	{@const accentColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`}
	<div class="click-hint" class:light={simState.isLightTheme} style="--accent: {accentColor};">
		<span class="hint-text">{hintText}</span>
		<svg class="hint-arrow" viewBox="0 0 50 50" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
			<!-- Curved line going down, centered -->
			<path class="arrow-line" d="M25 5 Q 26 20, 25 35 Q 25 42, 25 48" />
			<!-- Arrowhead centered at bottom -->
			<path class="arrow-head" d="M21 38 L25 48 L29 38" />
		</svg>
	</div>
{/if}

<style>
	.click-hint {
		position: fixed;
		top: calc(50% - 12px);
		left: 50%;
		transform: translate(-50%, -100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0;
		pointer-events: none;
		z-index: 100;
		opacity: 0;
		animation: fadeIn 0.4s ease-out 0.3s forwards;
	}
	
	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	
	.hint-text {
		font-family: 'Shadows Into Light', cursive;
		font-size: 1.4rem;
		font-weight: 300;
		color: var(--accent, rgba(255, 255, 255, 0.75));
		opacity: 0.85;
		text-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
		letter-spacing: 0.03em;
	}
	
	.light .hint-text {
		text-shadow: 0 2px 8px rgba(255, 255, 255, 0.5);
	}
	
	.hint-arrow {
		width: 50px;
		height: 50px;
		color: var(--accent, rgba(255, 255, 255, 0.65));
		opacity: 0.75;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
	}
	
	.light .hint-arrow {
		filter: drop-shadow(0 2px 4px rgba(255, 255, 255, 0.3));
	}
	
	/* Draw animation for the arrow line */
	.arrow-line {
		stroke-dasharray: 55;
		stroke-dashoffset: 55;
		animation: drawLine 0.5s ease-out 0.5s forwards;
	}
	
	@keyframes drawLine {
		to {
			stroke-dashoffset: 0;
		}
	}
	
	/* Arrowhead appears after line is drawn */
	.arrow-head {
		opacity: 0;
		animation: showHead 0.2s ease-out 1s forwards;
	}
	
	@keyframes showHead {
		to {
			opacity: 1;
		}
	}
</style>

