<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		onclose: () => void;
		children: Snippet;
	}

	let { title, onclose, children }: Props = $props();

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onclose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onclose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="modal-backdrop" onclick={handleBackdropClick} role="dialog" aria-modal="true">
	<div class="modal">
		<div class="modal-header">
			<h2>{title}</h2>
			<button class="close-btn" onclick={onclose} aria-label="Close">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</div>
		<div class="modal-content">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: transparent;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal {
		background: rgba(12, 12, 18, 0.72);
		backdrop-filter: blur(16px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		max-width: 620px;
		width: 100%;
		max-height: 85vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.35);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid #2a2a3a;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: #e0e0e0;
	}

	.close-btn {
		background: none;
		border: none;
		color: #888;
		cursor: pointer;
		padding: 0.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.2s;
	}

	.close-btn:hover {
		color: #fff;
	}

	.close-btn svg {
		width: 20px;
		height: 20px;
	}

	.modal-content {
		padding: 1.25rem;
		overflow-y: auto;
	}

	/* Mobile adjustments */
	@media (max-width: 768px) {
		.modal-backdrop {
			padding: 0.5rem;
		}

		.modal {
			max-height: 90vh;
			border-radius: 10px;
		}

		.modal-header {
			padding: 0.75rem 1rem;
		}

		.modal-header h2 {
			font-size: 1rem;
		}

		.modal-content {
			padding: 1rem;
		}
	}
</style>

