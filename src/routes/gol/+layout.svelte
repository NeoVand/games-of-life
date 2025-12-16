<script lang="ts">
	import { page } from '$app/stores';
	import { GOL_NAV } from '$lib/gol/docs/nav.js';
	import { base } from '$app/paths';

	let { children } = $props();
	let query = $state('');

	const flatItems = $derived.by(() => GOL_NAV.flatMap((s) => s.items.map((i) => ({ ...i, section: s.title }))));
	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		return flatItems.filter((i) => (i.title + ' ' + i.section).toLowerCase().includes(q)).slice(0, 8);
	});

	function clearSearch() {
		query = '';
	}
</script>

<div class="gol-shell">
	<aside class="sidebar">
		<div class="brand">
			<div class="brand-title">GoL Library</div>
			<div class="brand-sub">Games of Life</div>
		</div>

		<div class="search">
			<input
				class="search-input"
				placeholder="Search docs…"
				bind:value={query}
				aria-label="Search GoL documentation"
			/>
			{#if query.trim().length > 0}
				<button type="button" class="search-clear" onclick={clearSearch} aria-label="Clear search">✕</button>
			{/if}
			{#if filtered.length > 0}
				<div class="search-results">
					{#each filtered as item (item.href)}
						<a class="search-item" href={`${base}${item.href}`} onclick={clearSearch}>
							<div class="search-item-title">{item.title}</div>
							<div class="search-item-sub">{item.section}</div>
						</a>
					{/each}
				</div>
			{/if}
		</div>

		<nav class="nav">
			{#each GOL_NAV as section (section.title)}
				<div class="nav-section">
					<div class="nav-section-title">{section.title}</div>
					{#each section.items as item (item.href)}
						<a
							class="nav-item"
							class:active={$page.url.pathname === `${base}${item.href}`}
							href={`${base}${item.href}`}
						>
							{item.title}
						</a>
					{/each}
				</div>
			{/each}
		</nav>
	</aside>

	<div class="main">
		<header class="topbar">
			<a class="topbar-back" href={`${base}/`}>← Back to app</a>
			<div class="topbar-spacer"></div>
			<a class="topbar-link" href="https://github.com/NeoVand/games-of-life" target="_blank" rel="noopener noreferrer">GitHub</a>
		</header>

		<main class="content">
			{@render children()}
		</main>
	</div>
</div>

<style>
	.gol-shell {
		position: fixed;
		inset: 0;
		display: grid;
		grid-template-columns: 300px 1fr;
		background:
			radial-gradient(1200px 600px at 20% -10%, rgba(45, 212, 191, 0.10), transparent 55%),
			radial-gradient(900px 500px at 90% 10%, rgba(96, 165, 250, 0.08), transparent 55%),
			var(--color-bg);
	}

	.sidebar {
		border-right: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(0, 0, 0, 0.20);
		backdrop-filter: blur(18px);
		padding: 1rem 0.9rem;
		overflow: auto;
	}

	.brand {
		padding: 0.2rem 0.2rem 0.8rem;
	}

	.brand-title {
		font-weight: 900;
		letter-spacing: -0.03em;
		font-size: 1.05rem;
		color: var(--color-text);
	}

	.brand-sub {
		margin-top: 0.15rem;
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}

	.search {
		position: relative;
		padding: 0.2rem 0.2rem 0.7rem;
	}

	.search-input {
		width: 100%;
		padding: 0.55rem 2.0rem 0.55rem 0.65rem;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.10);
		background: rgba(0, 0, 0, 0.22);
		color: var(--color-text);
		outline: none;
		font-size: 0.9rem;
	}

	.search-input:focus {
		border-color: rgba(45, 212, 191, 0.35);
		box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.12);
	}

	.search-clear {
		position: absolute;
		right: 0.6rem;
		top: 0.55rem;
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.10);
		background: rgba(255, 255, 255, 0.04);
		color: var(--color-text);
		cursor: pointer;
	}

	.search-results {
		margin-top: 0.5rem;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(0, 0, 0, 0.35);
		overflow: hidden;
	}

	.search-item {
		display: grid;
		gap: 0.1rem;
		padding: 0.6rem 0.65rem;
		text-decoration: none;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.search-item:last-child {
		border-bottom: none;
	}

	.search-item-title {
		color: var(--color-text);
		font-weight: 700;
		font-size: 0.9rem;
		letter-spacing: -0.01em;
	}

	.search-item-sub {
		color: var(--color-text-muted);
		font-size: 0.78rem;
	}

	.nav {
		padding: 0.1rem 0.2rem 1rem;
	}

	.nav-section + .nav-section {
		margin-top: 0.9rem;
	}

	.nav-section-title {
		font-size: 0.72rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-weight: 700;
		margin: 0 0 0.35rem;
	}

	.nav-item {
		display: block;
		padding: 0.5rem 0.6rem;
		border-radius: 10px;
		text-decoration: none;
		color: var(--color-text);
		border: 1px solid transparent;
	}

	.nav-item:hover {
		background: rgba(255, 255, 255, 0.04);
		border-color: rgba(255, 255, 255, 0.08);
	}

	.nav-item.active {
		background: rgba(45, 212, 191, 0.10);
		border-color: rgba(45, 212, 191, 0.25);
		color: var(--color-text);
	}

	.main {
		display: grid;
		grid-template-rows: auto 1fr;
		overflow: hidden;
	}

	.topbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1.0rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(0, 0, 0, 0.18);
		backdrop-filter: blur(18px);
	}

	.topbar-back,
	.topbar-link {
		color: var(--color-text);
		text-decoration: none;
		font-weight: 700;
		font-size: 0.9rem;
		padding: 0.4rem 0.55rem;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.10);
		background: rgba(255, 255, 255, 0.03);
	}

	.topbar-back:hover,
	.topbar-link:hover {
		border-color: rgba(45, 212, 191, 0.35);
		background: rgba(45, 212, 191, 0.10);
	}

	.topbar-spacer {
		flex: 1;
	}

	.content {
		overflow: auto;
		padding: 1.1rem 1.2rem 2rem;
	}

	@media (max-width: 920px) {
		.gol-shell {
			grid-template-columns: 1fr;
		}
		.sidebar {
			display: none;
		}
	}
</style>


