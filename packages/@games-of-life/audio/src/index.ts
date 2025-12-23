/**
 * @games-of-life/audio
 * 
 * Real-time audio sonification for cellular automata.
 * Uses WebGPU for spectral aggregation and AudioWorklet for synthesis.
 */

// Main engine
export { AudioEngine } from './engine/index.js';

// GPU pipeline (for advanced usage)
export { AudioPipeline, spectralAggregateWgsl } from './gpu/index.js';

// Synthesizer (for advanced usage)
export { AudioSynthesizer } from './synthesis/index.js';

// Types
export type {
	AudioConfig,
	AudioPreset,
	AudioEngineState,
	ViewportBounds,
	SpectralBin,
	MusicalScale,
	FrequencyMapping,
	TimbreMode,
} from './types.js';

// Constants
export {
	DEFAULT_AUDIO_CONFIG,
	AUDIO_CURVE_SAMPLES,
	SPECTRUM_BINS,
	ROOT_NOTES,
	AUDIO_PRESETS,
} from './types.js';

