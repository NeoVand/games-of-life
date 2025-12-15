import type { PageServerLoad } from './$types';
import { highlight } from '$lib/gol/docs/shiki.server.js';

const ruleSpec = `import type { RuleSpec } from '@games-of-life/core';

const rule: RuleSpec = {
  birthMask: 0b0000_1000,    // B3
  surviveMask: 0b0000_1100,  // S23
  numStates: 2,
  neighborhood: 'moore'
};`;

export const load: PageServerLoad = async () => {
	return {
		ruleSpecHtml: await highlight(ruleSpec, 'ts')
	};
};


