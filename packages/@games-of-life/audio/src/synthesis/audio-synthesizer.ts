/**
 * Audio Synthesizer
 * 
 * Manages the Web Audio API context and AudioWorklet for spectral synthesis.
 * Receives spectrum data from the GPU pipeline and converts it to audio.
 */

import type { AudioConfig } from '../types.js';
import { SPECTRUM_BINS, DEFAULT_AUDIO_CONFIG } from '../types.js';

/**
 * Audio synthesizer using Web Audio API and AudioWorklet.
 * 
 * Flow:
 * 1. GPU pipeline computes spectrum data
 * 2. AudioSynthesizer receives spectrum via updateSpectrum()
 * 3. AudioWorklet converts spectrum to time-domain audio
 * 4. Output plays through speakers
 */
export class AudioSynthesizer {
	private audioContext: AudioContext | null = null;
	private workletNode: AudioWorkletNode | null = null;
	private gainNode: GainNode | null = null;
	private isInitialized = false;
	private isWorkletLoaded = false;
	private config: AudioConfig = { ...DEFAULT_AUDIO_CONFIG };
	private basePath: string = '';

	/**
	 * Initialize the audio context and load the AudioWorklet.
	 * Must be called from a user gesture (click/touch) for autoplay policy.
	 * @param basePath - Base path for assets (e.g., '/games-of-life' in production)
	 */
	async initialize(basePath: string = ''): Promise<void> {
		if (this.isInitialized) return;
		
		this.basePath = basePath;

		try {
			// Create audio context
			this.audioContext = new AudioContext({
				sampleRate: 44100,
				latencyHint: 'interactive',
			});

			// Load the AudioWorklet processor with correct base path
			const workletPath = `${basePath}/audio/spectral-processor.js`;
			await this.audioContext.audioWorklet.addModule(workletPath);
			this.isWorkletLoaded = true;

			// Create the worklet node
			this.workletNode = new AudioWorkletNode(this.audioContext, 'spectral-processor', {
				numberOfInputs: 0,
				numberOfOutputs: 1,
				outputChannelCount: [2], // Stereo
				processorOptions: {
					numBins: SPECTRUM_BINS,
					minFreq: this.config.minFreq,
					maxFreq: this.config.maxFreq,
				},
			});

			// Create gain node for master volume
			this.gainNode = this.audioContext.createGain();
			this.gainNode.gain.value = this.config.masterVolume;

			// Connect: worklet → gain → output
			this.workletNode.connect(this.gainNode);
			this.gainNode.connect(this.audioContext.destination);

			this.isInitialized = true;
			
			// Apply initial config
			this.applyConfig(this.config);
		} catch (error) {
			console.error('[AudioSynthesizer] Failed to initialize:', error);
			throw error;
		}
	}

	/**
	 * Resume audio context (required after user interaction).
	 */
	async resume(): Promise<void> {
		if (this.audioContext?.state === 'suspended') {
			await this.audioContext.resume();
		}
	}

	/**
	 * Suspend audio context (save CPU when audio is disabled).
	 */
	async suspend(): Promise<void> {
		if (this.audioContext?.state === 'running') {
			await this.audioContext.suspend();
		}
	}

	/**
	 * Check if audio is currently playing.
	 */
	isPlaying(): boolean {
		return this.audioContext?.state === 'running';
	}

	/**
	 * Update the spectrum data from GPU.
	 * @param spectrum - Float32Array with [amp, phase, panL, panR] × numBins
	 */
	updateSpectrum(spectrum: Float32Array): void {
		if (!this.workletNode || !this.isInitialized) return;

		// Send spectrum to AudioWorklet via message port
		this.workletNode.port.postMessage({ spectrum });
	}

	/**
	 * Send silence to the AudioWorklet.
	 * Use this when the simulation is paused to avoid repeating the last frame's sound.
	 */
	silence(): void {
		if (!this.workletNode || !this.isInitialized) return;

		// Send empty spectrum to fade out
		const emptySpectrum = new Float32Array(SPECTRUM_BINS * 4);
		this.workletNode.port.postMessage({ spectrum: emptySpectrum });
	}

	/**
	 * Update audio configuration.
	 */
	updateConfig(config: Partial<AudioConfig>): void {
		this.config = { ...this.config, ...config };
		
		if (this.isInitialized) {
			this.applyConfig(this.config);
		}
	}

	/**
	 * Apply configuration to audio nodes.
	 */
	private applyConfig(config: AudioConfig): void {
		if (!this.workletNode || !this.gainNode) return;

		// Update gain node
		if (this.gainNode.gain.value !== config.masterVolume) {
			this.gainNode.gain.setTargetAtTime(
				config.muted ? 0 : config.masterVolume,
				this.audioContext!.currentTime,
				0.05 // Smooth transition
			);
		}

		// Send config to worklet
		this.workletNode.port.postMessage({
			enabled: config.enabled && !config.muted,
			volume: config.masterVolume,
			softening: config.softening,
			minFreq: config.minFreq,
			maxFreq: config.maxFreq,
		});
	}

	/**
	 * Enable or disable audio output.
	 * Note: initialize() must be called with basePath before enabling.
	 */
	async setEnabled(enabled: boolean): Promise<void> {
		this.config.enabled = enabled;
		
		if (this.isInitialized) {
			if (enabled) {
				await this.resume();
			} else {
				await this.suspend();
			}
			this.applyConfig(this.config);
		}
	}

	/**
	 * Set mute state.
	 */
	setMuted(muted: boolean): void {
		this.config.muted = muted;
		this.applyConfig(this.config);
	}

	/**
	 * Set master volume (0-1).
	 */
	setVolume(volume: number): void {
		this.config.masterVolume = Math.max(0, Math.min(1, volume));
		this.applyConfig(this.config);
	}

	/**
	 * Get current configuration.
	 */
	getConfig(): AudioConfig {
		return { ...this.config };
	}

	/**
	 * Check if synthesizer is initialized.
	 */
	isReady(): boolean {
		return this.isInitialized;
	}

	/**
	 * Get audio context state.
	 */
	getState(): AudioContextState | null {
		return this.audioContext?.state ?? null;
	}

	/**
	 * Clean up audio resources.
	 */
	destroy(): void {
		if (this.workletNode) {
			this.workletNode.disconnect();
			this.workletNode = null;
		}

		if (this.gainNode) {
			this.gainNode.disconnect();
			this.gainNode = null;
		}

		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = null;
		}

		this.isInitialized = false;
		this.isWorkletLoaded = false;
	}
}

