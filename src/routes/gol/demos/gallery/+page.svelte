<script lang="ts">
	import DemoCard from '$lib/gol/components/DemoCard.svelte';
	import CodeBlock from '$lib/gol/components/CodeBlock.svelte';
	import { GALLERY_RULES } from '$lib/sims/gallery-rules.js';

	let { data } = $props();

	const byName = (name: string) => GALLERY_RULES.find((r) => r.name === name)!;
</script>

<div class="doc">
	<header class="head">
		<div class="kicker">Demos</div>
		<h1>Gallery: 9 sims that teach GoL</h1>
		<p class="lead">
			This page is intentionally structured as a tutorial: each sim is picked to teach one core concept of GoL (rules,
			states, neighborhoods, and what “NEO” means in practice).
		</p>
	</header>

	<section class="section">
		<h2>Use the same demos in your app</h2>
		<p>
			The Tour gallery and this docs page share the exact same 9 rules via <code>$lib/sims/gallery-rules.ts</code>.
		</p>
		<CodeBlock title="Mount one of the gallery sims" html={data.svelteDemoHtml} />
	</section>

	<section class="group">
		<h2>Foundations (square / Moore)</h2>
		<p class="hint">Goal: understand B/S masks and what <code>numStates</code> changes.</p>

		<DemoCard
			title="1) Conway’s Life"
			teach="Binary rules: a cell is dead or alive. This teaches the B/S mask idea."
			rule={byName("Conway's Life")}
			defaultSpeed={16}
			defaultDensity={0.22}
		/>
		<DemoCard
			title="2) Star Wars"
			teach="Generations: dying states create trails. This is still B/S, but with numStates > 2."
			rule={byName('Star Wars')}
			defaultSpeed={18}
			defaultDensity={0.30}
		/>
		<DemoCard
			title="3) Brian’s Brain"
			teach="A classic 3‑state rule. Great for seeing discrete state transitions and wavefronts."
			rule={byName("Brian's Brain")}
			defaultSpeed={18}
			defaultDensity={0.16}
		/>
	</section>

	<section class="group">
		<h2>Hex + vitality (NEO)</h2>
		<p class="hint">
			Goal: see that neighborhood choice affects both the kernel and rendering (hex), and that vitality curves can
			shape “memory”.
		</p>

		<DemoCard
			title="4) Hex2 Neo Diagonal Growth"
			teach="Extended hex neighborhood + vitality curve. Watch structure propagate directionally."
			rule={byName('Hex2 Neo Diagonal Growth')}
			defaultSpeed={14}
			defaultDensity={0.22}
		/>
		<DemoCard
			title="5) Hex Neo Mandala 1"
			teach="Hex neighborhood + generations + vitality. A calmer, symmetric pattern language."
			rule={byName('Hex Neo Mandala 1')}
			defaultSpeed={12}
			defaultDensity={0.20}
		/>
		<DemoCard
			title="6) Hex Neo Slime Mold"
			teach="Hex neighborhood without vitality curves — a good contrast demo."
			rule={byName('Hex Neo Slime Mold')}
			defaultSpeed={16}
			defaultDensity={0.20}
		/>
	</section>

	<section class="group">
		<h2>Extended Moore (Ext24) + big state spaces</h2>
		<p class="hint">
			Goal: see how larger neighborhoods and many decay states produce smooth “material” dynamics.
		</p>

		<DemoCard
			title="7) Ext24 Neo Waves"
			teach="Extended Moore neighborhood. Good for motion and stable macroscopic waves."
			rule={byName('Ext24 Neo Waves')}
			defaultSpeed={16}
			defaultDensity={0.20}
		/>
		<DemoCard
			title="8) Ext24 Neo Coral"
			teach="Many states (256) + vitality curve. This demonstrates long-lived structure and soft boundaries."
			rule={byName('Ext24 Neo Coral')}
			defaultSpeed={14}
			defaultDensity={0.18}
		/>
		<DemoCard
			title="9) Hex2 Neo Brain 2"
			teach="Extended hex neighborhood + many states. This is sensitive — speed and seeding matter."
			rule={byName('Hex2 Neo Brain 2')}
			defaultSpeed={14}
			defaultDensity={0.20}
		/>
	</section>
</div>

<style>
	.doc {
		max-width: 980px;
		margin: 0 auto;
		display: grid;
		gap: 1rem;
	}

	.head {
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

	.section {
		border: 1px solid rgba(255, 255, 255, 0.10);
		background: rgba(0, 0, 0, 0.20);
		border-radius: 18px;
		padding: 1.0rem 1.2rem;
		backdrop-filter: blur(14px);
	}

	.group {
		display: grid;
		gap: 0.9rem;
	}

	h2 {
		margin: 0;
		letter-spacing: -0.02em;
		font-size: 1.05rem;
	}

	p {
		margin: 0.35rem 0 0;
		color: var(--color-text-muted);
		line-height: 1.55;
	}

	.hint {
		margin-top: -0.1rem;
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


