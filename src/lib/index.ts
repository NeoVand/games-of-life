// Cellular Automaton Library Exports

// WebGPU
export { initWebGPU, isWebGPUSupported, createBuffer, createEmptyBuffer } from './webgpu/context.js';
export { Simulation, createSimulation } from './webgpu/simulation.js';
export type { WebGPUContext, WebGPUError } from './webgpu/context.js';
export type { SimulationConfig, ViewState } from './webgpu/simulation.js';

// Rules
export {
	parseRule,
	ruleToString,
	getRuleByName,
	getDefaultRule,
	isValidRuleString,
	RULE_PRESETS
} from './utils/rules.js';
export type { CARule } from './utils/rules.js';

// Stores
export { getSimulationState, getUIState } from './stores/simulation.svelte.js';
