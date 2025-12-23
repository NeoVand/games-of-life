/**
 * Audio Engine
 * 
 * Main controller for audio sonification.
 * Coordinates the GPU pipeline with the audio synthesizer.
 */

import type { Simulation } from '@games-of-life/webgpu';
import type { AudioConfig, ViewportBounds, AudioEngineState } from '../types.js';
import { DEFAULT_AUDIO_CONFIG, SPECTRUM_BINS } from '../types.js';
import { AudioPipeline } from '../gpu/audio-pipeline.js';
import { AudioSynthesizer } from '../synthesis/audio-synthesizer.js';

/**
 * Main audio engine that coordinates GPU and audio output.
 * 
 * Usage:
 * ```typescript
 * const engine = new AudioEngine();
 * await engine.initialize(device, simulation);
 * engine.setEnabled(true);
 * 
 * // In render loop:
 * engine.update(commandEncoder, canvasWidth, canvasHeight);
 * ```
 */
export class AudioEngine {
	private device: GPUDevice | null = null;
	private simulation: Simulation | null = null;
	private pipeline: AudioPipeline | null = null;
	private synthesizer: AudioSynthesizer | null = null;
	private config: AudioConfig = { ...DEFAULT_AUDIO_CONFIG };
	private isInitialized = false;
	
	// Throttle spectrum updates (audio runs at lower rate than video)
	private lastUpdateTime = 0;
	private updateIntervalMs = 33; // ~30 Hz

	/**
	 * Initialize the audio engine.
	 * 
	 * @param device - WebGPU device
	 * @param simulation - Simulation instance (for cell buffer and viewport)
	 */
	async initialize(device: GPUDevice, simulation: Simulation): Promise<void> {
		if (this.isInitialized) return;

		this.device = device;
		this.simulation = simulation;

		// Create GPU pipeline
		this.pipeline = new AudioPipeline(device);
		await this.pipeline.initialize();

		// Create synthesizer (but don't start audio yet - needs user gesture)
		this.synthesizer = new AudioSynthesizer();

		// Apply initial config
		this.pipeline.updateCurves(this.config);

		this.isInitialized = true;
	}

	/**
	 * Update audio each frame.
	 * Call this in the render loop.
	 * Creates its own command encoder for the audio compute pass.
	 * 
	 * @param canvasWidth - Canvas width for viewport calculation
	 * @param canvasHeight - Canvas height for viewport calculation
	 */
	async update(
		canvasWidth: number,
		canvasHeight: number
	): Promise<void> {
		if (!this.isInitialized || !this.config.enabled) return;
		if (!this.pipeline || !this.simulation || !this.device) return;

		const now = performance.now();
		const elapsed = now - this.lastUpdateTime;

		// Throttle updates to ~30 Hz (audio doesn't need 60+ fps)
		if (elapsed < this.updateIntervalMs) return;
		this.lastUpdateTime = now;

		// Get the current cell buffer from the simulation
		const cellBuffer = this.simulation.getCurrentCellBuffer();
		this.pipeline.setCellBuffer(cellBuffer);

		// Get viewport bounds and grid dimensions from simulation
		const viewport = this.getViewportBounds(canvasWidth, canvasHeight);
		const dims = this.simulation.getDimensions();
		const rule = this.simulation.getRule();
		const numStates = rule.numStates;
		
		// Set viewport cell count for normalization (prevents amplitude clipping)
		const viewportCellCount = viewport.width * viewport.height;
		this.pipeline.setViewportCellCount(viewportCellCount);
		
		// Create command encoder for audio compute pass
		const commandEncoder = this.device.createCommandEncoder({
			label: 'Audio Spectral Aggregation'
		});
		
		// Run GPU spectral aggregation
		this.pipeline.aggregate(
			commandEncoder,
			viewport,
			dims.width,
			dims.height,
			numStates,
			this.config.masterVolume
		);
		
		// Submit the audio compute pass
		this.device.queue.submit([commandEncoder.finish()]);

		// Read spectrum from previous frame (async, triple-buffered)
		const spectrum = await this.pipeline.readSpectrum();
		if (spectrum && this.synthesizer?.isReady()) {
			this.synthesizer.updateSpectrum(spectrum);
		}
	}

	/**
	 * Calculate viewport cell bounds from simulation view state.
	 */
	private getViewportBounds(canvasWidth: number, canvasHeight: number): ViewportBounds {
		if (!this.simulation) {
			return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
		}

		const view = this.simulation.getViewState();
		const dims = this.simulation.getDimensions();
		const aspect = canvasWidth / canvasHeight;

		const cellsVisibleX = view.zoom;
		const cellsVisibleY = view.zoom / aspect;

		const minX = Math.max(0, Math.floor(view.offsetX));
		const minY = Math.max(0, Math.floor(view.offsetY));
		const maxX = Math.min(dims.width, Math.ceil(view.offsetX + cellsVisibleX));
		const maxY = Math.min(dims.height, Math.ceil(view.offsetY + cellsVisibleY));

		return {
			minX,
			minY,
			maxX,
			maxY,
			width: maxX - minX,
			height: maxY - minY,
		};
	}

	/**
	 * Enable or disable audio.
	 * First enable after initialization should be from a user gesture.
	 */
	async setEnabled(enabled: boolean): Promise<void> {
		this.config.enabled = enabled;

		if (enabled && this.synthesizer) {
			await this.synthesizer.setEnabled(true);
		} else if (!enabled && this.synthesizer) {
			await this.synthesizer.setEnabled(false);
		}
	}

	/**
	 * Toggle audio on/off.
	 */
	async toggle(): Promise<boolean> {
		const newState = !this.config.enabled;
		await this.setEnabled(newState);
		return newState;
	}

	/**
	 * Update audio configuration.
	 */
	updateConfig(config: Partial<AudioConfig>): void {
		this.config = { ...this.config, ...config };

		if (this.pipeline) {
			this.pipeline.updateCurves(this.config);
		}

		if (this.synthesizer) {
			this.synthesizer.updateConfig(this.config);
		}
	}

	/**
	 * Get current configuration.
	 */
	getConfig(): AudioConfig {
		return { ...this.config };
	}

	/**
	 * Get current engine state for UI binding.
	 */
	getState(): AudioEngineState {
		return {
			isInitialized: this.isInitialized,
			isPlaying: this.synthesizer?.isPlaying() ?? false,
			currentVolume: this.config.masterVolume,
			activeBins: 0, // TODO: Calculate from spectrum
			peakLevel: 0,  // TODO: Calculate from spectrum
		};
	}

	/**
	 * Check if engine is initialized.
	 */
	isReady(): boolean {
		return this.isInitialized;
	}

	/**
	 * Update the simulation reference.
	 * Call this when the simulation is recreated.
	 */
	setSimulation(simulation: Simulation): void {
		this.simulation = simulation;
	}

	/**
	 * Check if audio is currently enabled.
	 */
	isEnabled(): boolean {
		return this.config.enabled;
	}

	/**
	 * Set master volume (0-1).
	 */
	setVolume(volume: number): void {
		this.config.masterVolume = Math.max(0, Math.min(1, volume));
		this.synthesizer?.setVolume(this.config.masterVolume);
	}

	/**
	 * Set mute state.
	 */
	setMuted(muted: boolean): void {
		this.config.muted = muted;
		this.synthesizer?.setMuted(muted);
	}

	/**
	 * Clean up all resources.
	 */
	destroy(): void {
		this.pipeline?.destroy();
		this.synthesizer?.destroy();
		this.pipeline = null;
		this.synthesizer = null;
		this.simulation = null;
		this.device = null;
		this.isInitialized = false;
	}
}

