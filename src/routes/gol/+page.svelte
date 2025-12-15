<script lang="ts">
	import { goto } from '$app/navigation';

	function handleGoGallery() {
		goto('/gol/demos/gallery');
	}
</script>

<div class="doc">
	<header class="hero">
		<div class="kicker">GoL Library</div>
		<h1>Embed WebGPU cellular automata anywhere.</h1>
		<p class="lead">
			GoL (Games of Life) is a set of packages that power this app: a framework-agnostic WebGPU runtime, a small
			core spec layer, and a Svelte wrapper.
		</p>

		<div class="cta">
			<a class="btn primary" href="/gol/quickstart/svelte">Quickstart (Svelte)</a>
			<button class="btn" type="button" onclick={handleGoGallery}>See the 9 demo sims</button>
		</div>
	</header>

	<section class="grid">
		<div class="card">
			<h2>Packages</h2>
			<ul>
				<li><code>@games-of-life/core</code> — specs, rule parsing, vitality curve sampling, CPU stepper</li>
				<li><code>@games-of-life/webgpu</code> — WebGPU Simulation + shaders (framework-agnostic)</li>
				<li><code>@games-of-life/svelte</code> — <code>&lt;LifeCanvas /&gt;</code> (drop-in embedding)</li>
			</ul>
		</div>

		<div class="card">
			<h2>What you’ll learn here</h2>
			<ul>
				<li>How to mount a canvas in 10 lines (Svelte quickstart)</li>
				<li>How rules work: B/S masks, <code>numStates</code>, and neighborhood</li>
				<li>How to render square + hex grids with consistent controls</li>
			</ul>
		</div>
	</section>
</div>

<style>
	.doc {
		max-width: 980px;
		margin: 0 auto;
	}

	.hero {
		border: 1px solid rgba(255, 255, 255, 0.10);
		background: rgba(0, 0, 0, 0.28);
		border-radius: 18px;
		padding: 1.2rem 1.2rem 1.1rem;
		backdrop-filter: blur(14px);
	}

	.kicker {
		color: rgba(45, 212, 191, 0.95);
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-size: 0.75rem;
	}

	h1 {
		margin: 0.45rem 0 0;
		letter-spacing: -0.03em;
		font-size: 1.6rem;
	}

	.lead {
		margin: 0.55rem 0 0;
		color: var(--color-text-muted);
		line-height: 1.55;
	}

	.cta {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-top: 0.9rem;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.06);
		color: var(--color-text);
		padding: 0.55rem 0.8rem;
		font-weight: 800;
		text-decoration: none;
		cursor: pointer;
	}

	.btn:hover {
		border-color: rgba(45, 212, 191, 0.35);
		background: rgba(45, 212, 191, 0.10);
	}

	.btn.primary {
		border-color: rgba(45, 212, 191, 0.35);
		background: rgba(45, 212, 191, 0.14);
	}

	.grid {
		margin-top: 1rem;
		display: grid;
		grid-template-columns: repeat(12, 1fr);
		gap: 1rem;
	}

	.card {
		grid-column: span 6;
		border: 1px solid rgba(255, 255, 255, 0.10);
		background: rgba(0, 0, 0, 0.22);
		border-radius: 18px;
		padding: 1rem;
		backdrop-filter: blur(14px);
	}

	.card h2 {
		margin: 0 0 0.55rem;
		font-size: 1.0rem;
		letter-spacing: -0.02em;
	}

	ul {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--color-text-muted);
		line-height: 1.55;
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

	@media (max-width: 920px) {
		.card {
			grid-column: span 12;
		}
	}
</style>


