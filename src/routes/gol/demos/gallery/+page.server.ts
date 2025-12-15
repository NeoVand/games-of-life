import type { PageServerLoad } from './$types';
import { highlight } from '$lib/gol/docs/shiki.server.js';

const svelteDemo = `<script lang="ts">
  import { LifeCanvas } from '@games-of-life/svelte';
  import { GALLERY_RULES } from '$lib/sims/gallery-rules.js';

  const rule = GALLERY_RULES.find((r) => r.name === "Conway's Life")!;
</script>

<LifeCanvas
  width={460}
  height={320}
  gridWidth={192}
  gridHeight={128}
  {rule}
  seed={{ kind: 'random', density: 0.22, includeSpectrum: true }}
/>`;

export const load: PageServerLoad = async () => {
	return {
		svelteDemoHtml: await highlight(svelteDemo, 'svelte')
	};
};


