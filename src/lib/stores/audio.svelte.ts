/**
 * Audio State Store
 * 
 * Manages reactive state for the audio sonification system.
 * Uses Svelte 5 runes for reactivity.
 */

import type { AudioConfig, AudioEngineState } from '@games-of-life/audio';
import { DEFAULT_AUDIO_CONFIG, AudioEngine, AUDIO_PRESETS } from '@games-of-life/audio';
import type { Simulation } from '@games-of-life/webgpu';

// Audio engine instance (singleton)
let audioEngine: AudioEngine | null = null;

// Reactive state
let isEnabled = $state(false);
let isInitialized = $state(false);
let isPlaying = $state(false);
let masterVolume = $state(DEFAULT_AUDIO_CONFIG.masterVolume);
let isMuted = $state(false);

// Current configuration (simplified for Phase 1)
let config = $state<AudioConfig>({ ...DEFAULT_AUDIO_CONFIG });

// Current preset index for cycling
let currentPresetIndex = $state(0);

/**
 * Initialize the audio engine.
 * Must be called after WebGPU is ready.
 */
export async function initializeAudio(device: GPUDevice, simulation: Simulation): Promise<void> {
	if (audioEngine) {
		audioEngine.destroy();
	}

	audioEngine = new AudioEngine();
	await audioEngine.initialize(device, simulation);
	isInitialized = true;

	// Sync state
	config = audioEngine.getConfig();
	masterVolume = config.masterVolume;
	isMuted = config.muted;
}

/**
 * Toggle audio on/off.
 * First call must be from a user gesture (click/touch).
 */
export async function toggleAudio(): Promise<boolean> {
	if (!audioEngine) return false;

	const newState = await audioEngine.toggle();
	isEnabled = newState;
	isPlaying = audioEngine.getState().isPlaying;
	return newState;
}

/**
 * Enable audio.
 */
export async function enableAudio(): Promise<void> {
	if (!audioEngine) return;

	await audioEngine.setEnabled(true);
	isEnabled = true;
	isPlaying = audioEngine.getState().isPlaying;
}

/**
 * Disable audio.
 */
export async function disableAudio(): Promise<void> {
	if (!audioEngine) return;

	await audioEngine.setEnabled(false);
	isEnabled = false;
	isPlaying = false;
}

/**
 * Update audio each frame (call from render loop).
 */
export async function updateAudio(
	canvasWidth: number,
	canvasHeight: number
): Promise<void> {
	if (!audioEngine || !isEnabled) return;

	await audioEngine.update(canvasWidth, canvasHeight);
}

/**
 * Set master volume (0-1).
 */
export function setVolume(volume: number): void {
	masterVolume = Math.max(0, Math.min(1, volume));
	audioEngine?.setVolume(masterVolume);
}

/**
 * Toggle mute.
 */
export function toggleMute(): void {
	isMuted = !isMuted;
	audioEngine?.setMuted(isMuted);
}

/**
 * Update frequency range.
 */
export function setFrequencyRange(minFreq: number, maxFreq: number): void {
	config = { ...config, minFreq, maxFreq };
	audioEngine?.updateConfig({ minFreq, maxFreq });
}

/**
 * Update softening level.
 */
export function setSoftening(softening: number): void {
	const value = Math.max(0, Math.min(1, softening));
	config = { ...config, softening: value };
	audioEngine?.updateConfig({ softening: value });
}

/**
 * Update musical scale.
 */
export function setScale(scale: AudioConfig['scale']): void {
	config = { ...config, scale };
	audioEngine?.updateConfig({ scale });
}

/**
 * Cycle through audio presets.
 * Returns the name of the new preset.
 */
export function cycleAudioPreset(): string {
	currentPresetIndex = (currentPresetIndex + 1) % AUDIO_PRESETS.length;
	const preset = AUDIO_PRESETS[currentPresetIndex];
	
	// Apply preset config
	config = { ...config, ...preset.config };
	if (preset.config.masterVolume !== undefined) {
		masterVolume = preset.config.masterVolume;
	}
	audioEngine?.updateConfig(preset.config);
	
	return preset.name;
}

/**
 * Get the current preset name.
 */
export function getCurrentPresetName(): string {
	return AUDIO_PRESETS[currentPresetIndex].name;
}

/**
 * Apply a partial config update.
 */
export function updateAudioConfig(updates: Partial<AudioConfig>): void {
	config = { ...config, ...updates };
	if (updates.masterVolume !== undefined) {
		masterVolume = updates.masterVolume;
	}
	if (updates.muted !== undefined) {
		isMuted = updates.muted;
	}
	audioEngine?.updateConfig(updates);
}

/**
 * Get the audio engine instance (for advanced usage).
 */
export function getAudioEngine(): AudioEngine | null {
	return audioEngine;
}

/**
 * Update the simulation reference in the audio engine.
 * Call this when the simulation is recreated.
 */
export function updateAudioSimulation(simulation: Simulation): void {
	if (audioEngine) {
		audioEngine.setSimulation(simulation);
	}
}

/**
 * Clean up audio resources.
 */
export function destroyAudio(): void {
	audioEngine?.destroy();
	audioEngine = null;
	isInitialized = false;
	isEnabled = false;
	isPlaying = false;
}

/**
 * Get the audio state store.
 */
export function getAudioState() {
	return {
		get isEnabled() {
			return isEnabled;
		},
		set isEnabled(value: boolean) {
			isEnabled = value;
		},

		get isInitialized() {
			return isInitialized;
		},

		get isPlaying() {
			return isPlaying;
		},

		get masterVolume() {
			return masterVolume;
		},
		set masterVolume(value: number) {
			setVolume(value);
		},

		get isMuted() {
			return isMuted;
		},
		set isMuted(value: boolean) {
			isMuted = value;
			audioEngine?.setMuted(value);
		},

		get config() {
			return config;
		},

		// Actions
		toggle: toggleAudio,
		enable: enableAudio,
		disable: disableAudio,
		update: updateAudio,
	};
}

