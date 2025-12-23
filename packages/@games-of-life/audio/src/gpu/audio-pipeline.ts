/**
 * Audio Pipeline
 * 
 * Manages the WebGPU compute pipeline for spectral aggregation.
 * Converts cell states to frequency spectrum data.
 */

import type { CurvePoint } from '@games-of-life/core';
import { sampleVitalityCurve } from '@games-of-life/core';
import type { AudioConfig, ViewportBounds } from '../types.js';
import { SPECTRUM_BINS, AUDIO_CURVE_SAMPLES } from '../types.js';
import { spectralAggregateWgsl } from './spectral-aggregate.js';

/** Fixed-point scale factor (must match shader) */
const FP_SCALE = 65536.0;

/** Size of the params uniform buffer (must match shader struct) */
const PARAMS_SIZE = 64; // 16 values × 4 bytes, aligned to 16

/** Size of spectrum output buffer (4 floats per bin) */
const SPECTRUM_BUFFER_SIZE = SPECTRUM_BINS * 4 * 4; // bins × 4 values × 4 bytes

/** Size of each curve buffer */
const CURVE_BUFFER_SIZE = AUDIO_CURVE_SAMPLES * 4; // 128 × 4 bytes

/**
 * GPU-based audio aggregation pipeline.
 * 
 * This class manages the WebGPU resources for spectral aggregation:
 * - Compute pipeline for cell-to-spectrum conversion
 * - Buffers for curves, params, and output spectrum
 * - Triple-buffered readback for smooth GPU→CPU transfer
 */
export class AudioPipeline {
	private device: GPUDevice;
	private pipeline: GPUComputePipeline | null = null;
	private bindGroupLayout: GPUBindGroupLayout | null = null;
	private bindGroup: GPUBindGroup | null = null;

	// Buffers
	private paramsBuffer: GPUBuffer | null = null;
	private spectrumBuffer: GPUBuffer | null = null;
	private readbackBuffers: GPUBuffer[] = [];
	private curveBuffers: GPUBuffer[] = []; // 5 curves

	// Triple-buffering state
	private writeIndex = 0;  // Index of buffer to write to next
	private readIndex = 0;   // Index of buffer to read from next
	private bufferInUse: boolean[] = [false, false, false]; // Track mapped buffers
	private lastReadResult: Float32Array | null = null; // Cache last successful read

	// Cell buffer reference (from Simulation)
	private cellBuffer: GPUBuffer | null = null;

	constructor(device: GPUDevice) {
		this.device = device;
	}

	/**
	 * Initialize the audio pipeline.
	 */
	async initialize(): Promise<void> {
		await this.createPipeline();
		this.createBuffers();
	}

	/**
	 * Set the cell buffer from the Simulation.
	 */
	setCellBuffer(buffer: GPUBuffer): void {
		this.cellBuffer = buffer;
		// Recreate bind group with new cell buffer
		if (this.bindGroupLayout && this.paramsBuffer) {
			this.createBindGroup();
		}
	}

	/**
	 * Update curve data from AudioConfig.
	 */
	updateCurves(config: AudioConfig): void {
		if (this.curveBuffers.length < 5) return;

		const curves = [
			config.pitchCurve,
			config.amplitudeCurve,
			config.timbreCurve,
			config.spatialCurve,
			config.waveCurve,
		];

		for (let i = 0; i < 5; i++) {
			const samples = this.sampleCurve(curves[i]);
			this.device.queue.writeBuffer(this.curveBuffers[i], 0, samples.buffer as ArrayBuffer);
		}
	}

	/**
	 * Sample a curve into 128 float values.
	 */
	private sampleCurve(points: CurvePoint[]): Float32Array {
		// Reuse the vitality curve sampler from core
		const samples = sampleVitalityCurve(points);
		const result = new Float32Array(AUDIO_CURVE_SAMPLES);
		for (let i = 0; i < samples.length && i < AUDIO_CURVE_SAMPLES; i++) {
			result[i] = samples[i];
		}
		return result;
	}

	/**
	 * Run the spectral aggregation compute pass.
	 * 
	 * @param viewport - The visible cell bounds
	 * @param gridWidth - Total grid width
	 * @param gridHeight - Total grid height
	 * @param numStates - Number of cell states (for vitality calculation)
	 * @param masterVolume - Master volume (0-1)
	 */
	aggregate(
		commandEncoder: GPUCommandEncoder,
		viewport: ViewportBounds,
		gridWidth: number,
		gridHeight: number,
		numStates: number,
		masterVolume: number
	): void {
		if (!this.pipeline || !this.bindGroup || !this.spectrumBuffer) return;

		// Clear spectrum buffer before aggregation
		commandEncoder.clearBuffer(this.spectrumBuffer);

		// Update params
		this.updateParams(viewport, gridWidth, gridHeight, numStates, masterVolume);

		// Dispatch compute
		const computePass = commandEncoder.beginComputePass();
		computePass.setPipeline(this.pipeline);
		computePass.setBindGroup(0, this.bindGroup);

		// Dispatch one thread per viewport cell
		const workgroupsX = Math.ceil(viewport.width / 16);
		const workgroupsY = Math.ceil(viewport.height / 16);
		computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
		computePass.end();

		// Find a readback buffer that's not currently mapped
		let targetIndex = this.writeIndex;
		for (let i = 0; i < 3; i++) {
			const idx = (this.writeIndex + i) % 3;
			if (!this.bufferInUse[idx] && this.readbackBuffers[idx]?.mapState === 'unmapped') {
				targetIndex = idx;
				break;
			}
		}

		// Copy spectrum to readback buffer (only if not in use)
		const readbackBuffer = this.readbackBuffers[targetIndex];
		if (readbackBuffer && !this.bufferInUse[targetIndex] && readbackBuffer.mapState === 'unmapped') {
			commandEncoder.copyBufferToBuffer(
				this.spectrumBuffer, 0,
				readbackBuffer, 0,
				SPECTRUM_BUFFER_SIZE
			);
			this.writeIndex = (targetIndex + 1) % 3;
		}
	}

	// Store last viewport size for normalization
	private lastViewportCellCount = 1;

	/**
	 * Read spectrum data from GPU asynchronously.
	 * Returns the previous frame's data (triple-buffered for smoothness).
	 * Normalizes values to prevent clipping from accumulation.
	 */
	async readSpectrum(): Promise<Float32Array | null> {
		// Find a buffer that's ready to read (not in use, not mapped, not the write target)
		let foundIndex = -1;
		for (let i = 0; i < 3; i++) {
			const idx = (this.readIndex + i) % 3;
			// Skip the buffer we're currently writing to
			if (idx === this.writeIndex) continue;
			// Skip buffers that are in use or already mapped
			if (this.bufferInUse[idx]) continue;
			const buffer = this.readbackBuffers[idx];
			if (buffer && buffer.mapState === 'unmapped') {
				foundIndex = idx;
				break;
			}
		}

		// If no buffer is ready, return cached result
		if (foundIndex === -1) {
			return this.lastReadResult;
		}

		const buffer = this.readbackBuffers[foundIndex];
		this.bufferInUse[foundIndex] = true;

		try {
			await buffer.mapAsync(GPUMapMode.READ);
			const data = new Int32Array(buffer.getMappedRange());
			
			// Convert from fixed-point to float with normalization
			// Normalize by expected cell count to prevent accumulation clipping
			// Use sqrt for perceptual scaling (loudness is logarithmic)
			const normFactor = Math.sqrt(Math.max(1, this.lastViewportCellCount)) * FP_SCALE;
			
			const result = new Float32Array(SPECTRUM_BINS * 4);
			for (let i = 0; i < data.length; i++) {
				// Divide by normalization factor to keep values in reasonable range
				result[i] = data[i] / normFactor;
			}
			
			buffer.unmap();
			this.bufferInUse[foundIndex] = false;
			this.readIndex = (foundIndex + 1) % 3;
			this.lastReadResult = result;
			return result;
		} catch {
			this.bufferInUse[foundIndex] = false;
			return this.lastReadResult;
		}
	}

	/**
	 * Set the viewport cell count for normalization.
	 */
	setViewportCellCount(count: number): void {
		this.lastViewportCellCount = Math.max(1, count);
	}

	/**
	 * Create the compute pipeline.
	 */
	private async createPipeline(): Promise<void> {
		const shaderModule = this.device.createShaderModule({
			label: 'Audio Spectral Aggregation Shader',
			code: spectralAggregateWgsl,
		});

		this.bindGroupLayout = this.device.createBindGroupLayout({
			label: 'Audio Pipeline Bind Group Layout',
			entries: [
				{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
				{ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
				{ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
				{ binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
				{ binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
				{ binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
				{ binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
				{ binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
			],
		});

		this.pipeline = this.device.createComputePipeline({
			label: 'Audio Spectral Aggregation Pipeline',
			layout: this.device.createPipelineLayout({
				bindGroupLayouts: [this.bindGroupLayout],
			}),
			compute: {
				module: shaderModule,
				entryPoint: 'main',
			},
		});
	}

	/**
	 * Create GPU buffers.
	 */
	private createBuffers(): void {
		// Params buffer
		this.paramsBuffer = this.device.createBuffer({
			label: 'Audio Params Buffer',
			size: PARAMS_SIZE,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		// Spectrum output buffer (read-write storage, COPY_DST for clearing)
		this.spectrumBuffer = this.device.createBuffer({
			label: 'Audio Spectrum Buffer',
			size: SPECTRUM_BUFFER_SIZE,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
		});

		// Triple-buffered readback
		for (let i = 0; i < 3; i++) {
			this.readbackBuffers.push(this.device.createBuffer({
				label: `Audio Readback Buffer ${i}`,
				size: SPECTRUM_BUFFER_SIZE,
				usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
			}));
		}

		// Curve buffers (5 curves)
		const curveNames = ['Pitch', 'Amplitude', 'Timbre', 'Spatial', 'Wave'];
		for (const name of curveNames) {
			this.curveBuffers.push(this.device.createBuffer({
				label: `Audio ${name} Curve Buffer`,
				size: CURVE_BUFFER_SIZE,
				usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
			}));
		}
	}

	/**
	 * Create the bind group (call after setting cell buffer).
	 */
	private createBindGroup(): void {
		if (!this.bindGroupLayout || !this.paramsBuffer || !this.cellBuffer || !this.spectrumBuffer) {
			return;
		}

		this.bindGroup = this.device.createBindGroup({
			label: 'Audio Pipeline Bind Group',
			layout: this.bindGroupLayout,
			entries: [
				{ binding: 0, resource: { buffer: this.paramsBuffer } },
				{ binding: 1, resource: { buffer: this.cellBuffer } },
				{ binding: 2, resource: { buffer: this.curveBuffers[0] } }, // pitch
				{ binding: 3, resource: { buffer: this.curveBuffers[1] } }, // amplitude
				{ binding: 4, resource: { buffer: this.curveBuffers[2] } }, // timbre
				{ binding: 5, resource: { buffer: this.curveBuffers[3] } }, // spatial
				{ binding: 6, resource: { buffer: this.curveBuffers[4] } }, // wave
				{ binding: 7, resource: { buffer: this.spectrumBuffer } },
			],
		});
	}

	/**
	 * Update the params uniform buffer.
	 */
	private updateParams(
		viewport: ViewportBounds,
		gridWidth: number,
		gridHeight: number,
		numStates: number,
		masterVolume: number
	): void {
		if (!this.paramsBuffer) return;

		const data = new ArrayBuffer(PARAMS_SIZE);
		const view = new DataView(data);

		// Viewport bounds
		view.setFloat32(0, viewport.minX, true);
		view.setFloat32(4, viewport.minY, true);
		view.setFloat32(8, viewport.width, true);
		view.setFloat32(12, viewport.height, true);

		// Grid dimensions
		view.setUint32(16, gridWidth, true);
		view.setUint32(20, gridHeight, true);
		view.setUint32(24, numStates, true);

		// Spectrum params
		view.setUint32(28, SPECTRUM_BINS, true);
		view.setFloat32(32, 80, true);    // min_freq
		view.setFloat32(36, 2000, true);  // max_freq
		view.setFloat32(40, masterVolume, true);
		view.setUint32(44, 0, true); // padding

		this.device.queue.writeBuffer(this.paramsBuffer, 0, data);
	}

	/**
	 * Clean up GPU resources.
	 */
	destroy(): void {
		this.paramsBuffer?.destroy();
		this.spectrumBuffer?.destroy();
		for (const buffer of this.readbackBuffers) {
			buffer.destroy();
		}
		for (const buffer of this.curveBuffers) {
			buffer.destroy();
		}
		this.pipeline = null;
		this.bindGroup = null;
	}
}

