/**
 * Audio Sonification Types
 * 
 * Type definitions for the audio synthesis system.
 * Uses curve-based abstractions matching the vitality influence pattern.
 */

import type { CurvePoint } from '@games-of-life/core';

/** Number of samples in audio curves (matches vitality curve) */
export const AUDIO_CURVE_SAMPLES = 128;

/** Number of frequency bins in the spectrum */
export const SPECTRUM_BINS = 256;


/**
 * Audio configuration state.
 * All curves use the same CurvePoint format as vitality influence.
 */
export interface AudioConfig {
	// Master controls
	enabled: boolean;
	masterVolume: number;    // 0-1
	muted: boolean;

	// Curves (each is array of {x, y} points)
	pitchCurve: CurvePoint[];       // Y-position → frequency bin
	amplitudeCurve: CurvePoint[];   // Vitality → loudness
	timbreCurve: CurvePoint[];      // Neighbors → harmonic richness
	spatialCurve: CurvePoint[];     // X-position → stereo pan
	waveCurve: CurvePoint[];        // Vitality → waveform complexity

	// Quick controls
	softening: number;      // 0-1, smoothing amount

	// Frequency range
	minFreq: number;        // Hz (default 80)
	maxFreq: number;        // Hz (default 2000)
}

/**
 * Preset definition for saved audio configurations.
 */
export interface AudioPreset {
	id: string;
	name: string;
	description: string;
	config: Partial<AudioConfig>;
}

/**
 * Audio frequency mapping mode - how cell positions map to frequencies.
 */
export type FrequencyMapping = 
	| 'linear'      // Linear Y → frequency
	| 'logarithmic' // Logarithmic mapping (more bass frequencies)
	| 'inverted'    // High cells = low frequencies
	| 'center-out'  // Center = bass, edges = treble
	| 'edges-in';   // Edges = bass, center = treble

/**
 * Audio timbre mode - the character of the sound.
 */
export type TimbreMode =
	| 'pure'        // Sine waves only (pure, clean)
	| 'warm'        // Slight harmonics (warm, analog feel)
	| 'bright'      // More high harmonics (bright, present)
	| 'organ'       // Organ-like tones
	| 'bell';       // Bell-like metallic tones

/**
 * Built-in audio presets.
 */
export const AUDIO_PRESETS: AudioPreset[] = [
	{
		id: 'ambient',
		name: 'Ambient',
		description: 'Soft, dreamy pad-like tones',
		config: {
			masterVolume: 0.6,
			softening: 0.8,
			minFreq: 80,
			maxFreq: 800,
		}
	},
	{
		id: 'crystalline',
		name: 'Crystalline',
		description: 'High, sparkly bell-like tones',
		config: {
			masterVolume: 0.4,
			softening: 0.3,
			minFreq: 400,
			maxFreq: 4000,
		}
	},
	{
		id: 'deep',
		name: 'Deep',
		description: 'Low, rumbling bass frequencies',
		config: {
			masterVolume: 0.7,
			softening: 0.9,
			minFreq: 40,
			maxFreq: 300,
		}
	},
	{
		id: 'choir',
		name: 'Choir',
		description: 'Mid-range vocal-like tones',
		config: {
			masterVolume: 0.5,
			softening: 0.6,
			minFreq: 200,
			maxFreq: 1200,
		}
	},
	{
		id: 'cosmic',
		name: 'Cosmic',
		description: 'Wide frequency range, space-like',
		config: {
			masterVolume: 0.5,
			softening: 0.5,
			minFreq: 60,
			maxFreq: 2500,
		}
	},
	{
		id: 'meditative',
		name: 'Meditative',
		description: 'Calm, centered tones',
		config: {
			masterVolume: 0.4,
			softening: 0.95,
			minFreq: 100,
			maxFreq: 600,
		}
	},
];

/**
 * Spectral bin data from GPU aggregation.
 * Packed as 4 floats per bin for efficient transfer.
 */
export interface SpectralBin {
	amplitude: number;      // Total energy at this frequency
	phase: number;          // Combined phase offset
	panLeft: number;        // Left channel contribution
	panRight: number;       // Right channel contribution
}

/**
 * Viewport bounds for audio processing.
 * Cells within this region contribute to the sound.
 */
export interface ViewportBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
}

/**
 * Audio engine state for reactive binding.
 */
export interface AudioEngineState {
	isInitialized: boolean;
	isPlaying: boolean;
	currentVolume: number;
	activeBins: number;     // How many frequency bins have energy
	peakLevel: number;      // Current peak audio level
}

/**
 * Default audio configuration.
 * Designed for pleasant ambient drone sound.
 */
export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
	enabled: false,
	masterVolume: 0.5,
	muted: false,

	// Linear pitch curve: low Y = low freq, high Y = high freq
	pitchCurve: [
		{ x: 0, y: 0.1 },
		{ x: 1, y: 0.8 }
	],

	// Amplitude curve: dead cells silent, alive cells loud
	amplitudeCurve: [
		{ x: 0, y: 0 },      // Dead = silent
		{ x: 0.5, y: 0.3 },  // Half-alive = moderate
		{ x: 1, y: 0.7 }     // Fully alive = louder
	],

	// Timbre: isolated cells dark, clustered cells bright
	timbreCurve: [
		{ x: 0, y: 0.1 },    // No neighbors = dark
		{ x: 0.5, y: 0.4 },
		{ x: 1, y: 0.8 }     // Many neighbors = bright
	],

	// Spatial: left-to-right stereo image
	spatialCurve: [
		{ x: 0, y: 0.2 },    // Left side → mostly left
		{ x: 0.5, y: 0.5 },  // Center → center
		{ x: 1, y: 0.8 }     // Right side → mostly right
	],

	// Wave: dying cells pure, alive cells rich
	waveCurve: [
		{ x: 0, y: 0 },      // Dead = sine (pure)
		{ x: 1, y: 0.4 }     // Alive = slightly complex
	],

	softening: 0.6,
	minFreq: 80,
	maxFreq: 1500,
};

