<script lang="ts">
	import CodeBlock from '$lib/gol/components/CodeBlock.svelte';
	let { data } = $props();
</script>

<div class="doc">
	<header class="head">
		<div class="kicker">Quickstart</div>
		<h1>WebGPU: drive the Simulation yourself</h1>
		<p class="lead">
			If you want full control (custom scheduling, custom controls, multiple canvases), use
			<code>@games-of-life/webgpu</code> directly.
		</p>
	</header>

	<section class="section">
		<h2>Minimal loop</h2>
		<p>This is the “lowest-level” API: create a context, create a <code>Simulation</code>, then step+render.</p>
		<CodeBlock title="Minimal WebGPU usage" html={data.snippetHtml} />
	</section>
</div>

<style>
	.doc {
		max-width: 980px;
		margin: 0 auto;
		display: grid;
		gap: 1rem;
	}

	.head,
	.section {
		border: 1px solid rgba(255, 255, 255, 0.10);
		background: rgba(0, 0, 0, 0.24);
		border-radius: 18px;
		padding: 1.1rem 1.2rem;
		backdrop-filter: blur(14px);
	}

	.kicker {
		color: rgba(45, 212, 191, 0.95);
		font-weight: 900;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-size: 0.75rem;
	}

	h1 {
		margin: 0.45rem 0 0;
		letter-spacing: -0.03em;
		font-size: 1.45rem;
	}

	.lead,
	p {
		margin: 0.55rem 0 0;
		color: var(--color-text-muted);
		line-height: 1.55;
	}

	h2 {
		margin: 0;
		letter-spacing: -0.02em;
		font-size: 1.0rem;
	}

	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
		font-size: 0.9em;
		color: var(--color-text);
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		padding: 0.05rem 0.45rem;
	}
</style>


