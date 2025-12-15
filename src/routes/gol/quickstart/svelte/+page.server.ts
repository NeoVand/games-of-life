import type { PageServerLoad } from './$types';
import { highlight } from '$lib/gol/docs/shiki.server.js';

const code = `<script lang="ts">
  import { LifeCanvas } from '@games-of-life/svelte';
</script>

<LifeCanvas
  width={220}
  height={220}
  gridWidth={128}
  gridHeight={128}
  rule={{ birthMask: 0b1000, surviveMask: 0b1100, numStates: 2, neighborhood: 'moore' }}
  seed={{ kind: 'random', density: 0.22, includeSpectrum: true }}
  speed={12}
/>`;

export const load: PageServerLoad = async () => {
	return {
		snippetHtml: await highlight(code, 'svelte')
	};
};


