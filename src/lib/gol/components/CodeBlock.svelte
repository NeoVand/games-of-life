<script lang="ts">
	interface Props {
		title?: string;
		html: string;
	}

	let { title, html }: Props = $props();

	async function handleCopy() {
		// naive but reliable: strip tags and decode a couple common entities
		const text = html
			.replace(/<[^>]*>/g, '')
			.replaceAll('&lt;', '<')
			.replaceAll('&gt;', '>')
			.replaceAll('&amp;', '&');
		await navigator.clipboard.writeText(text.trim());
	}
</script>

<div class="code">
	<div class="code-head">
		<div class="code-title">{title ?? 'Example'}</div>
		<button class="code-copy" type="button" onclick={handleCopy}>Copy</button>
	</div>

	<div class="code-body">
		{@html html}
	</div>
</div>

<style>
	.code {
		border: 1px solid rgba(255, 255, 255, 0.10);
		border-radius: 14px;
		background: rgba(0, 0, 0, 0.28);
		overflow: hidden;
	}

	.code-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.65rem 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(0, 0, 0, 0.18);
	}

	.code-title {
		font-weight: 800;
		font-size: 0.85rem;
		color: var(--color-text);
		letter-spacing: -0.01em;
	}

	.code-copy {
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.10);
		background: rgba(255, 255, 255, 0.06);
		color: var(--color-text);
		padding: 0.4rem 0.65rem;
		font-weight: 800;
		cursor: pointer;
	}

	.code-copy:hover {
		border-color: rgba(45, 212, 191, 0.35);
		background: rgba(45, 212, 191, 0.10);
	}

	.code-body :global(pre) {
		margin: 0;
		padding: 0.85rem 0.9rem;
		overflow: auto;
		background: transparent !important;
	}

	.code-body :global(code) {
		font-size: 0.88rem;
	}
</style>


