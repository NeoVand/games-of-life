<div class="doc">
	<header class="head">
		<div class="kicker">Concepts</div>
		<h1>Rendering: spectrum, shading, theme</h1>
		<p class="lead">
			Rendering in GoL is parameterized: spectrum mode + frequency, neighbor shading, and theme colors. The same
			settings drive both the main canvas and embedded docs canvases.
		</p>
	</header>

	<section class="section">
		<h2>What to know (for now)</h2>
		<ul>
			<li><strong>Spectrum mode</strong> selects a color mapping strategy for dying states.</li>
			<li><strong>Neighbor shading</strong> can emphasize local structure (alive count or vitality sum).</li>
			<li><strong>Theme + aliveColor</strong> affect backgrounds, grid lines, and accents.</li>
		</ul>
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

	.lead {
		margin: 0.55rem 0 0;
		color: var(--color-text-muted);
		line-height: 1.55;
	}

	h2 {
		margin: 0 0 0.65rem;
		letter-spacing: -0.02em;
		font-size: 1.0rem;
	}

	ul {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--color-text-muted);
		line-height: 1.55;
	}

	strong {
		color: var(--color-text);
	}
</style>


