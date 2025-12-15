import type { PageServerLoad } from './$types';
import { highlight } from '$lib/gol/docs/shiki.server.js';

const code = `import { initWebGPU, Simulation } from '@games-of-life/webgpu';

const res = await initWebGPU(canvas);
if (!res.ok) throw new Error(res.error.message);

const sim = new Simulation(res.value, {
  width: 256,
  height: 256,
  rule: { birthMask: 0b1000, surviveMask: 0b1100, numStates: 2, neighborhood: 'moore' }
});

sim.randomize(0.22, true);

function frame() {
  sim.step();
  sim.render(canvas.width, canvas.height);
  requestAnimationFrame(frame);
}
frame();`;

export const load: PageServerLoad = async () => {
	return {
		snippetHtml: await highlight(code, 'ts')
	};
};


