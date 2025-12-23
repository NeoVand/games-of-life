<script lang="ts">
	import { getSimulationState } from '$lib/stores/simulation.svelte.js';
	import { fade, fly, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	const simState = getSimulationState();

	let currentStep = $state(0);
	let isApplying = $state(false);
	let isRevealed = $state(false);

	// Scenario Definitions
	type Scenario = {
		id: string;
		name: string;
		description: string;
		grid: number[][];
		tx: number;
		ty: number;
		neighbors: [number, number][];
		resultState: number; // 0 or 1
	};

	const neighbors: [number, number][] = [
		[1, 1], [2, 1], [3, 1],
		[1, 2],         [3, 2],
		[1, 3], [2, 3], [3, 3]
	];

	// Initial grids for the 3 scenarios
	const scenarios: Scenario[] = $state([
		{
			id: 'birth',
			name: 'Birth',
			description: 'Dead cell with exactly 3 neighbors.',
			grid: [
				[0, 0, 0, 0, 0],
				[0, 1, 0, 0, 0],
				[0, 1, 0, 1, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0]
			],
			tx: 2, ty: 2,
			neighbors,
			resultState: 1
		},
		{
			id: 'survival',
			name: 'Survival',
			description: 'Alive cell with 2 neighbors.',
			grid: [
				[0, 0, 0, 0, 0],
				[0, 1, 0, 0, 0],
				[0, 0, 1, 0, 0],
				[0, 0, 0, 1, 0],
				[0, 0, 0, 0, 0]
			],
			tx: 2, ty: 2,
			neighbors,
			resultState: 1
		},
		{
			id: 'death',
			name: 'Death',
			description: 'Alive cell with 1 neighbor.',
			grid: [
				[0, 0, 0, 0, 0],
				[0, 1, 0, 0, 0],
				[0, 0, 1, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0]
			],
			tx: 2, ty: 2,
			neighbors,
			resultState: 0
		}
	]);

	const accentColor = $derived.by(() => {
		const [r, g, b] = simState.aliveColor;
		return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
	});

	function getAliveCount(scenario: Scenario) {
		return scenario.neighbors.filter(([nx, ny]) => scenario.grid[ny][nx] === 1).length;
	}

	async function next() {
		if (currentStep < 4) {
			currentStep++;
		} else {
			applyRule();
		}
	}

	async function applyRule() {
		isApplying = true;
		await new Promise(r => setTimeout(r, 300));
		scenarios.forEach(s => {
			s.grid[s.ty][s.tx] = s.resultState;
		});
		await new Promise(r => setTimeout(r, 500));
		isApplying = false;
		isRevealed = true;
	}

	function reset() {
		currentStep = 0;
		isApplying = false;
		isRevealed = false;
		// Restore initial grids
		scenarios[0].grid = [[0,0,0,0,0],[0,1,0,0,0],[0,1,0,1,0],[0,0,0,0,0],[0,0,0,0,0]];
		scenarios[1].grid = [[0,0,0,0,0],[0,1,0,0,0],[0,0,1,0,0],[0,0,0,1,0],[0,0,0,0,0]];
		scenarios[2].grid = [[0,0,0,0,0],[0,1,0,0,0],[0,0,1,0,0],[0,0,0,0,0],[0,0,0,0,0]];
	}

	const stepInfo = [
		{
			title: "1. The Concept",
			text: "Cellular Automata operate on a grid where each cell's future state is determined by its immediate local neighbors."
		},
		{
			title: "2. The Neighborhood",
			text: "In the standard Moore neighborhood, each cell (bordered in white) looks at its 8 surrounding neighbors."
		},
		{
			title: "3. Local Sensing",
			text: "The first step is counting how many of those neighbors are currently alive. Notice the counts for each scenario below."
		},
		{
			title: "4. The Transition Rule",
			text: "The rule (e.g., B3/S23) acts like a lookup table: if 3 neighbors, a dead cell is born; if 2 or 3, an alive cell survives."
		},
		{
			title: "5. Parallel Application",
			text: "Every cell on the grid evaluates the rule at the same time. Let's apply it to see how these different configurations resolve."
		}
	];
</script>

<div class="ca-lab" style="--accent: {accentColor}">
	<div class="scenarios-grid">
		{#each scenarios as s, idx}
			<div class="scenario-card">
				<div class="grid-wrap">
					<div class="grid">
						{#each s.grid as row, y}
							{#each row as cell, x}
								<div 
									class="cell" 
									class:alive={cell === 1}
									class:target={!isRevealed && x === s.tx && y === s.ty}
									class:neighbor={!isRevealed && currentStep >= 1 && s.neighbors.some(([nx, ny]) => nx === x && ny === y)}
									class:highlight-neighbor={!isRevealed && currentStep >= 2 && s.neighbors.some(([nx, ny]) => nx === x && ny === y) && cell === 1}
									class:applying={isApplying && x === s.tx && y === s.ty}
								>
									{#if !isRevealed && x === s.tx && y === s.ty && currentStep >= 2 && !isApplying}
										<div class="count-badge" in:scale={{ duration: 300, easing: cubicOut }}>
											{getAliveCount(s)}
										</div>
									{/if}
								</div>
							{/each}
						{/each}
					</div>
				</div>
				<div class="scenario-info">
					<span class="badge" style="background: {idx === 0 ? 'rgba(74, 222, 128, 0.15)' : idx === 1 ? 'rgba(96, 165, 250, 0.15)' : 'rgba(248, 113, 113, 0.15)'}; color: {idx === 0 ? '#4ade80' : idx === 1 ? '#60a5fa' : '#f87171'}">
						{s.name}
					</span>
					<p>{s.description}</p>
				</div>
			</div>
		{/each}
	</div>

	<div class="control-panel">
		<div class="stepper-box">
			<div class="progress-bar">
				{#each Array(5) as _, i}
					<div class="progress-dot" class:active={i <= currentStep} class:completed={i < currentStep}></div>
				{/each}
			</div>
			
			<div class="text-wrap">
				{#key currentStep}
					<div class="step-content" in:fly={{ y: 8, duration: 400, delay: 100 }} out:fade={{ duration: 200 }}>
						<h4>{stepInfo[currentStep].title}</h4>
						<p>{stepInfo[currentStep].text}</p>
					</div>
				{/key}
			</div>

			<div class="actions">
				<button class="btn primary" onclick={next} disabled={isApplying}>
					{currentStep < 4 ? 'Next Step' : 'Apply to All'}
				</button>
				<button class="btn secondary" onclick={reset} disabled={isApplying}>Reset Tutorial</button>
			</div>
		</div>
	</div>
</div>

<style>
	.ca-lab {
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid var(--ui-border);
		border-radius: 32px;
		padding: 2.5rem;
		margin: 2rem 0;
		backdrop-filter: blur(20px);
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.4);
		display: grid;
		gap: 2.5rem;
	}

	.scenarios-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.5rem;
	}

	.scenario-card {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 20px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: center;
		overflow: hidden;
		min-width: 0;
	}

	.grid-wrap {
		max-width: 100%;
		overflow: hidden;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(28px, 36px));
		grid-template-rows: repeat(5, minmax(28px, 36px));
		gap: 4px;
		background: rgba(255, 255, 255, 0.02);
		padding: 8px;
		border-radius: 14px;
		border: 1px solid rgba(255, 255, 255, 0.05);
		max-width: 100%;
	}

	.cell {
		background: rgba(255, 255, 255, 0.02);
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.05);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1);
		position: relative;
	}

	.cell.alive {
		background: var(--accent);
		box-shadow: 0 0 15px var(--accent);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.cell.target {
		border: 2px solid #fff;
		z-index: 2;
	}

	.cell.neighbor {
		border-color: rgba(255, 255, 255, 0.2);
	}

	.cell.highlight-neighbor {
		background: rgba(255, 255, 255, 0.08);
		border-color: var(--accent);
	}

	.cell.applying {
		transform: scale(1.15);
		filter: brightness(1.5);
	}

	.count-badge {
		font-weight: 900;
		font-size: 1rem;
		color: #fff;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
	}

	.scenario-info {
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.badge {
		align-self: center;
		font-size: 0.65rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.2rem 0.6rem;
		border-radius: 100px;
	}

	.scenario-info p {
		margin: 0;
		font-size: 0.85rem;
		color: var(--color-text-muted);
		line-height: 1.4;
	}

	.stepper-box {
		max-width: 800px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		min-height: 160px;
	}

	.progress-bar {
		display: flex;
		gap: 0.5rem;
	}

	.progress-dot {
		flex: 1;
		height: 4px;
		border-radius: 2px;
		background: rgba(255, 255, 255, 0.05);
		transition: all 0.4s ease;
	}

	.progress-dot.active { background: var(--accent); }
	.progress-dot.completed { background: var(--accent); opacity: 0.3; }

	.text-wrap {
		position: relative;
		min-height: 80px;
		display: flex;
		align-items: center;
	}

	.step-content {
		position: absolute;
		width: 100%;
	}

	.step-content h4 {
		margin: 0 0 0.5rem;
		font-size: 1.3rem;
		color: var(--accent);
	}

	.step-content p {
		margin: 0;
		font-size: 1rem;
		line-height: 1.5;
		color: var(--color-text-muted);
	}

	.actions {
		display: flex;
		gap: 1rem;
		justify-content: center;
	}

	.btn {
		min-width: 140px;
		height: 44px;
		border-radius: 14px;
		font-weight: 800;
		cursor: pointer;
		border: 1px solid var(--ui-border);
		background: var(--btn-bg);
		color: var(--ui-text);
		transition: all 0.3s;
	}

	.btn:not(:disabled):hover {
		border-color: var(--ui-accent);
		background: var(--btn-bg-hover);
		color: var(--ui-text-hover);
		transform: translateY(-2px);
	}

	.btn.primary { background: var(--ui-accent); color: #000; border: none; }
	.btn:disabled { opacity: 0.4; }

	@media (max-width: 900px) {
		.scenarios-grid { grid-template-columns: 1fr; }
		.ca-lab { padding: 1.5rem; }
	}

	@media (max-width: 500px) {
		.grid {
			grid-template-columns: repeat(5, 24px);
			grid-template-rows: repeat(5, 24px);
			gap: 3px;
			padding: 6px;
		}
		.ca-lab { padding: 1rem; border-radius: 20px; }
		.stepper-box { min-height: auto; }
		.actions { flex-direction: column; gap: 0.5rem; }
		.btn { width: 100%; }
	}
</style>
