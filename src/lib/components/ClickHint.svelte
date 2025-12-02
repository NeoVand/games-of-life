<script lang="ts">
	import { getSimulationState } from '../stores/simulation.svelte.js';
	import { hasTourBeenCompleted } from '../utils/tour.js';
	
	const simState = getSimulationState();
	
	// Detect if touch device
	const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
	const hintText = isTouchDevice ? 'touch here' : 'click here';
	
	// Only show hint if tour is completed and user hasn't interacted yet
	const shouldShow = $derived(!simState.hasInteracted && hasTourBeenCompleted());
</script>

{#if shouldShow}
	<div class="click-hint" class:light={simState.isLightTheme}>
		<span class="hint-text">{hintText}</span>
		<svg class="hint-arrow" viewBox="0 0 50 70" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
			<!-- Curved line going down -->
			<path class="arrow-line" d="M25 5 Q 28 30, 30 50 Q 31 58, 30 65" />
			<!-- Arrowhead -->
			<path class="arrow-head" d="M24 58 L30 65 L36 58" />
		</svg>
	</div>
{/if}

<style>
	.click-hint {
		position: fixed;
		top: 50%;
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
		font-family: 'Caveat', 'Comic Sans MS', cursive;
		font-size: 1.6rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.75);
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		letter-spacing: 0.02em;
	}
	
	.light .hint-text {
		color: rgba(60, 60, 70, 0.75);
		text-shadow: 0 2px 8px rgba(255, 255, 255, 0.5);
	}
	
	.hint-arrow {
		width: 50px;
		height: 70px;
		color: rgba(255, 255, 255, 0.65);
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
	}
	
	.light .hint-arrow {
		color: rgba(60, 60, 70, 0.65);
		filter: drop-shadow(0 2px 4px rgba(255, 255, 255, 0.3));
	}
	
	/* Draw animation for the arrow line */
	.arrow-line {
		stroke-dasharray: 80;
		stroke-dashoffset: 80;
		animation: drawLine 0.6s ease-out 0.5s forwards;
	}
	
	@keyframes drawLine {
		to {
			stroke-dashoffset: 0;
		}
	}
	
	/* Arrowhead appears after line is drawn */
	.arrow-head {
		opacity: 0;
		animation: showHead 0.2s ease-out 1.1s forwards;
	}
	
	@keyframes showHead {
		to {
			opacity: 1;
		}
	}
</style>

