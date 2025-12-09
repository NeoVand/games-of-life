/**
 * Cellular Automaton Simulation Controller
 * Manages WebGPU compute and render pipelines with double-buffering
 */

import type { WebGPUContext } from './context.js';
import type { CARule, NeighborhoodType, VitalityMode } from '../utils/rules.js';
import { getDefaultRule } from '../utils/rules.js';
import { SEED_PATTERNS, SEED_PATTERNS_HEX, type SeedPatternId, type BoundaryMode, boundaryModeToIndex } from '../stores/simulation.svelte.js';

// Import shaders as raw text
import computeShaderCode from './shaders/life-compute.wgsl?raw';
import renderShaderCode from './shaders/life-render.wgsl?raw';

export interface SimulationConfig {
	width: number;
	height: number;
	rule: CARule;
}

export interface ViewState {
	offsetX: number;
	offsetY: number;
	zoom: number;
	showGrid: boolean;
	isLightTheme: boolean;
	aliveColor: [number, number, number]; // RGB 0-1
	brushX: number;      // Brush center in grid coordinates
	brushY: number;
	brushRadius: number; // Brush radius in cells (-1 to hide)
	brushShape: number;  // 0-17: circle, square, diamond, hexagon, ring, triangle, line, cross, star, heart, spiral, flower, burst, gear, wave, checker, dots, scatter
	brushRotation: number; // Rotation in radians
	brushAspectRatio: number; // Width/height ratio (1.0 = square)
	boundaryMode: BoundaryMode; // Topological boundary condition
	spectrumMode: number; // 0=hueShift, 1=rainbow, 2=warm, 3=cool, 4=monochrome, 5=fire
	spectrumFrequency: number; // How many times to repeat spectrum (1.0 = normal)
	neighborShading: number; // 0=off, 1=count alive, 2=sum vitality
	axisProgress: number; // 0-1: animation progress for axis lines (0 = dot only, 1 = full lines)
	// Vitality influence settings
	vitalityMode: VitalityMode; // How dying cells affect neighbor counting
	vitalityThreshold: number;  // For 'threshold'/'sigmoid' mode: 0.0-1.0
	vitalityGhostFactor: number; // For 'ghost'/'decay' mode: 0.0-1.0
	vitalitySigmoidSharpness: number; // For 'sigmoid' mode: 1.0-20.0
	vitalityDecayPower: number; // For 'decay' mode: 0.5-3.0
}

export class Simulation {
	private device: GPUDevice;
	private context: GPUCanvasContext;
	private format: GPUTextureFormat;

	// Grid dimensions
	private width: number;
	private height: number;

	// Current rule
	private rule: CARule;

	// View state
	private view: ViewState;

	// Compute pipeline
	private computePipeline!: GPUComputePipeline;
	private computeBindGroupLayout!: GPUBindGroupLayout;
	private computeBindGroups!: [GPUBindGroup, GPUBindGroup];

	// Render pipeline
	private renderPipeline!: GPURenderPipeline;
	private renderBindGroupLayout!: GPUBindGroupLayout;
	private renderBindGroups!: [GPUBindGroup, GPUBindGroup];

	// Buffers
	private cellBuffers!: [GPUBuffer, GPUBuffer];
	private computeParamsBuffer!: GPUBuffer;
	private renderParamsBuffer!: GPUBuffer;
	private readbackBuffer!: GPUBuffer;
	private textBitmapBuffer!: GPUBuffer;

	// Text bitmap state
	private textBitmapWidth = 0;
	private textBitmapHeight = 0;
	private textBitmapData: Uint8Array | null = null; // CPU copy for painting
	private currentTextSettings = { text: '', font: '', bold: false, italic: false, size: 0 };

	// Offscreen canvas for grid recording
	private recordingCanvas: OffscreenCanvas | null = null;
	private recordingContext: GPUCanvasContext | null = null;

	// Double-buffer step counter
	private stepCount = 0;

	// Pending paint operations
	private pendingPaints: Map<number, number> = new Map();
	private undoBuffer: Uint32Array | null = null;

	constructor(ctx: WebGPUContext, config: SimulationConfig) {
		this.device = ctx.device;
		this.context = ctx.context;
		this.format = ctx.format;
		this.width = config.width;
		this.height = config.height;
		this.rule = config.rule;

		// Initialize view to show entire grid filling the canvas
		// zoom = cells visible across canvas width
		// For grid to fill canvas exactly:
		// - If grid aspect >= canvas aspect: zoom = grid_width (fit to width)
		// - If grid aspect < canvas aspect: zoom = grid_height * canvas_aspect (fit to height)
		// Since we create the grid with the same aspect ratio as the canvas,
		// zoom should equal grid_width to fill horizontally
		this.view = {
			offsetX: 0,
			offsetY: 0,
			zoom: config.width, // Grid width = cells visible across canvas width = perfect fit
			showGrid: true,
			isLightTheme: false,
			aliveColor: [0.2, 0.9, 0.95], // Default cyan
			brushX: -1000,
			brushY: -1000,
			brushRadius: -1, // Hidden by default
			brushShape: 0, // Circle by default
			brushRotation: 0,
			brushAspectRatio: 1.0,
			boundaryMode: 'torus', // Default to toroidal wrapping
			spectrumMode: 0, // Default to hue shift
			spectrumFrequency: 1.0, // Default to single spectrum span
			neighborShading: 1, // Default to count alive
			axisProgress: 0, // Start at 0 for entrance animation
			// Vitality defaults (standard behavior)
			vitalityMode: 'none',
			vitalityThreshold: 1.0,
			vitalityGhostFactor: 0.0,
			vitalitySigmoidSharpness: 10.0,
			vitalityDecayPower: 1.0
		};

		this.initializePipelines();
		this.initializeBuffers();
		this.createBindGroups();
	}

	private initializePipelines(): void {
		// Compute pipeline
		const computeShaderModule = this.device.createShaderModule({
			label: 'CA Compute Shader',
			code: computeShaderCode
		});

		this.computeBindGroupLayout = this.device.createBindGroupLayout({
			label: 'Compute Bind Group Layout',
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: 'uniform' }
				},
				{
					binding: 1,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: 'read-only-storage' }
				},
				{
					binding: 2,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: 'storage' }
				}
			]
		});

		this.computePipeline = this.device.createComputePipeline({
			label: 'CA Compute Pipeline',
			layout: this.device.createPipelineLayout({
				bindGroupLayouts: [this.computeBindGroupLayout]
			}),
			compute: {
				module: computeShaderModule,
				entryPoint: 'main'
			}
		});

		// Render pipeline
		const renderShaderModule = this.device.createShaderModule({
			label: 'CA Render Shader',
			code: renderShaderCode
		});

		this.renderBindGroupLayout = this.device.createBindGroupLayout({
			label: 'Render Bind Group Layout',
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: 'uniform' }
				},
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT,
					buffer: { type: 'read-only-storage' }
				},
				{
					binding: 2,
					visibility: GPUShaderStage.FRAGMENT,
					buffer: { type: 'read-only-storage' }
				}
			]
		});

		this.renderPipeline = this.device.createRenderPipeline({
			label: 'CA Render Pipeline',
			layout: this.device.createPipelineLayout({
				bindGroupLayouts: [this.renderBindGroupLayout]
			}),
			vertex: {
				module: renderShaderModule,
				entryPoint: 'vertex_main'
			},
			fragment: {
				module: renderShaderModule,
				entryPoint: 'fragment_main',
				targets: [{ format: this.format }]
			},
			primitive: {
				topology: 'triangle-list'
			}
		});
	}

	private initializeBuffers(): void {
		const cellCount = this.width * this.height;
		const cellBufferSize = cellCount * 4; // u32 per cell

		// Create two cell state buffers for ping-pong
		// COPY_SRC allows reading back data for alive cell counting
		this.cellBuffers = [
			this.device.createBuffer({
				label: 'Cell State Buffer A',
				size: cellBufferSize,
				usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
			}),
			this.device.createBuffer({
				label: 'Cell State Buffer B',
				size: cellBufferSize,
				usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
			})
		];

		// Staging buffer for reading back cell data
		this.readbackBuffer = this.device.createBuffer({
			label: 'Readback Buffer',
			size: cellBufferSize,
			usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
		});

		// Compute params buffer (6 u32 values, padded to 32 bytes)
		this.computeParamsBuffer = this.device.createBuffer({
			label: 'Compute Params Buffer',
			size: 64, // 16 values: 8 u32 + 5 vitality params + 3 padding
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});

		// Render params buffer (27 f32 values = 108 bytes, aligned to 112 for 16-byte alignment)
		this.renderParamsBuffer = this.device.createBuffer({
			label: 'Render Params Buffer',
			size: 128, // Increased to fit text bitmap dimensions
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});

		// Text bitmap buffer - starts with a minimal size, updated when text changes
		// Max size: 256x64 = 16384 bytes (should be enough for any reasonable text)
		this.textBitmapBuffer = this.device.createBuffer({
			label: 'Text Bitmap Buffer',
			size: 2048 * 512, // Much larger: 2048 wide x 512 tall for large brush sizes
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
		});

		// Initialize with current rule
		this.updateComputeParams();
	}

	private createBindGroups(): void {
		// Create bind groups for both ping-pong directions
		this.computeBindGroups = [
			this.device.createBindGroup({
				label: 'Compute Bind Group A->B',
				layout: this.computeBindGroupLayout,
				entries: [
					{ binding: 0, resource: { buffer: this.computeParamsBuffer } },
					{ binding: 1, resource: { buffer: this.cellBuffers[0] } },
					{ binding: 2, resource: { buffer: this.cellBuffers[1] } }
				]
			}),
			this.device.createBindGroup({
				label: 'Compute Bind Group B->A',
				layout: this.computeBindGroupLayout,
				entries: [
					{ binding: 0, resource: { buffer: this.computeParamsBuffer } },
					{ binding: 1, resource: { buffer: this.cellBuffers[1] } },
					{ binding: 2, resource: { buffer: this.cellBuffers[0] } }
				]
			})
		];

		this.renderBindGroups = [
			this.device.createBindGroup({
				label: 'Render Bind Group A',
				layout: this.renderBindGroupLayout,
				entries: [
					{ binding: 0, resource: { buffer: this.renderParamsBuffer } },
					{ binding: 1, resource: { buffer: this.cellBuffers[0] } },
					{ binding: 2, resource: { buffer: this.textBitmapBuffer } }
				]
			}),
			this.device.createBindGroup({
				label: 'Render Bind Group B',
				layout: this.renderBindGroupLayout,
				entries: [
					{ binding: 0, resource: { buffer: this.renderParamsBuffer } },
					{ binding: 1, resource: { buffer: this.cellBuffers[1] } },
					{ binding: 2, resource: { buffer: this.textBitmapBuffer } }
				]
			})
		];
	}

	private getNeighborhoodIndex(): number {
		const nh = this.rule.neighborhood ?? 'moore';
		switch (nh) {
			case 'vonNeumann': return 1;
			case 'extendedMoore': return 2;
			case 'hexagonal': return 3;
			case 'extendedHexagonal': return 4;
			default: return 0; // moore
		}
	}

	private getVitalityModeIndex(): number {
		switch (this.view.vitalityMode) {
			case 'none': return 0;
			case 'threshold': return 1;
			case 'ghost': return 2;
			case 'sigmoid': return 3;
			case 'decay': return 4;
			default: return 0;
		}
	}

	private updateComputeParams(): void {
		// Use ArrayBuffer with DataView for mixed types
		const buffer = new ArrayBuffer(64);
		const view = new DataView(buffer);
		
		// First 7 u32 values (offsets 0-24)
		view.setUint32(0, this.width, true);
		view.setUint32(4, this.height, true);
		view.setUint32(8, this.rule.birthMask, true);
		view.setUint32(12, this.rule.surviveMask, true);
		view.setUint32(16, this.rule.numStates, true);
		view.setUint32(20, boundaryModeToIndex(this.view.boundaryMode), true);
		view.setUint32(24, this.getNeighborhoodIndex(), true);
		
		// Vitality mode (offset 28)
		view.setUint32(28, this.getVitalityModeIndex(), true);
		
		// Vitality float params (offsets 32-48)
		view.setFloat32(32, this.view.vitalityThreshold, true);
		view.setFloat32(36, this.view.vitalityGhostFactor, true);
		view.setFloat32(40, this.view.vitalitySigmoidSharpness, true);
		view.setFloat32(44, this.view.vitalityDecayPower, true);
		
		// Padding (offsets 48-64)
		view.setUint32(48, 0, true);
		view.setUint32(52, 0, true);
		view.setUint32(56, 0, true);
		view.setUint32(60, 0, true);
		
		this.device.queue.writeBuffer(this.computeParamsBuffer, 0, buffer);
	}

	private updateRenderParams(canvasWidth: number, canvasHeight: number): void {
		const params = new Float32Array([
			this.width,
			this.height,
			canvasWidth,
			canvasHeight,
			this.view.offsetX,
			this.view.offsetY,
			this.view.zoom,
			this.rule.numStates,
			this.view.showGrid ? 1.0 : 0.0,
			this.view.isLightTheme ? 1.0 : 0.0,
			this.view.aliveColor[0],
			this.view.aliveColor[1],
			this.view.aliveColor[2],
			this.view.brushX,
			this.view.brushY,
			this.view.brushRadius,
			this.getNeighborhoodIndex(), // neighborhood type for rendering
			this.view.spectrumMode, // spectrum mode for color transitions
			this.view.spectrumFrequency, // how many times to repeat the spectrum
			this.view.neighborShading, // neighbor shading mode: 0=off, 1=alive, 2=vitality
			boundaryModeToIndex(this.view.boundaryMode), // boundary mode for seamless panning
			this.view.brushShape, // 0-16: see ViewState for shape list
			this.view.brushRotation, // rotation in radians
			this.view.brushAspectRatio, // aspect ratio
			this.view.axisProgress, // axis animation progress (0 = center dot, 1 = full lines)
			this.textBitmapWidth, // text bitmap width in cells
			this.textBitmapHeight // text bitmap height in cells
		]);
		this.device.queue.writeBuffer(this.renderParamsBuffer, 0, params);
	}

	/**
	 * Update the text bitmap for text brush preview
	 */
	updateTextBitmap(text: string, font: string, bold: boolean, italic: boolean, brushSize: number): void {
		// Check if we need to regenerate
		const settingsKey = `${text}|${font}|${bold}|${italic}|${brushSize}`;
		const currentKey = `${this.currentTextSettings.text}|${this.currentTextSettings.font}|${this.currentTextSettings.bold}|${this.currentTextSettings.italic}|${this.currentTextSettings.size}`;
		if (settingsKey === currentKey) return;

		this.currentTextSettings = { text, font, bold, italic, size: brushSize };

		if (!text) {
			this.textBitmapWidth = 0;
			this.textBitmapHeight = 0;
			return;
		}

		// Create a canvas to rasterize text
		const textCanvas = document.createElement('canvas');
		const textCtx = textCanvas.getContext('2d');
		if (!textCtx) return;

		// Calculate font size based on brush radius - must match paintBrush exactly
		const fontSize = Math.max(16, Math.floor(brushSize * 2));
		const fontFamily = font === 'pixel' ? '"Press Start 2P", monospace' : font;
		const fontStyle = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
		textCtx.font = fontStyle;

		// Measure text
		const metrics = textCtx.measureText(text);
		const textWidth = Math.ceil(metrics.width);
		const textHeight = Math.ceil(fontSize * 1.2);

		// Set canvas size (add padding) - no artificial limits
		textCanvas.width = Math.min(2048, textWidth + 4);
		textCanvas.height = Math.min(512, textHeight + 4);

		// Re-apply font after resize
		textCtx.font = fontStyle;
		textCtx.fillStyle = 'white';
		textCtx.textBaseline = 'middle';
		textCtx.fillText(text, 2, textCanvas.height / 2);

		// Get pixel data and create bitmap
		const imageData = textCtx.getImageData(0, 0, textCanvas.width, textCanvas.height);
		const pixels = imageData.data;

		// Create bitmap - simple byte array (1 byte per pixel)
		const bitmapWidth = textCanvas.width;
		const bitmapHeight = textCanvas.height;
		const totalPixels = bitmapWidth * bitmapHeight;
		
		// Create CPU copy for painting (simple byte array)
		const cpuBitmap = new Uint8Array(totalPixels);
		for (let i = 0; i < totalPixels; i++) {
			cpuBitmap[i] = pixels[i * 4 + 3] > 127 ? 1 : 0;
		}
		
		// Pack into Uint32Array for GPU (4 bytes = 1 u32)
		const numWords = Math.ceil(totalPixels / 4);
		const gpuBitmap = new Uint32Array(numWords);
		for (let y = 0; y < bitmapHeight; y++) {
			for (let x = 0; x < bitmapWidth; x++) {
				const linearIndex = y * bitmapWidth + x;
				if (cpuBitmap[linearIndex]) {
					const wordIndex = Math.floor(linearIndex / 4);
					const byteOffset = linearIndex % 4;
					gpuBitmap[wordIndex] |= (1 << (byteOffset * 8));
				}
			}
		}

		// Store dimensions, CPU copy, and upload to GPU
		this.textBitmapWidth = bitmapWidth;
		this.textBitmapHeight = bitmapHeight;
		this.textBitmapData = cpuBitmap;
		this.device.queue.writeBuffer(this.textBitmapBuffer, 0, gpuBitmap);
	}

	/**
	 * Apply pending paint operations
	 */
	private applyPaints(): void {
		if (this.pendingPaints.size === 0) return;

		const currentBuffer = this.cellBuffers[this.stepCount % 2];

		// Batch paint operations
		for (const [index, state] of this.pendingPaints) {
			const data = new Uint32Array([state]);
			this.device.queue.writeBuffer(currentBuffer, index * 4, data);
		}

		this.pendingPaints.clear();
	}

	/**
	 * Run one simulation step
	 */
	step(): void {
		this.applyPaints();

		const commandEncoder = this.device.createCommandEncoder();

		// Compute pass
		const computePass = commandEncoder.beginComputePass();
		computePass.setPipeline(this.computePipeline);
		computePass.setBindGroup(0, this.computeBindGroups[this.stepCount % 2]);
		computePass.dispatchWorkgroups(Math.ceil(this.width / 8), Math.ceil(this.height / 8));
		computePass.end();

		this.device.queue.submit([commandEncoder.finish()]);

		this.stepCount++;
	}

	/**
	 * Render the current state
	 */
	render(canvasWidth: number, canvasHeight: number): void {
		this.applyPaints();
		this.updateRenderParams(canvasWidth, canvasHeight);

		const commandEncoder = this.device.createCommandEncoder();

		const renderPass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.context.getCurrentTexture().createView(),
					loadOp: 'clear',
					storeOp: 'store',
					clearValue: { r: 0.05, g: 0.05, b: 0.08, a: 1.0 }
				}
			]
		});

		renderPass.setPipeline(this.renderPipeline);
		renderPass.setBindGroup(0, this.renderBindGroups[this.stepCount % 2]);
		renderPass.draw(3); // Full-screen triangle
		renderPass.end();

		this.device.queue.submit([commandEncoder.finish()]);
	}

	/**
	 * Initialize offscreen canvas for recording the full grid
	 */
	initRecordingCanvas(): HTMLCanvasElement {
		// Create a regular canvas (OffscreenCanvas doesn't support captureStream)
		const canvas = document.createElement('canvas');
		canvas.width = this.width;
		canvas.height = this.height;
		
		// Configure WebGPU context for the offscreen canvas
		const context = canvas.getContext('webgpu');
		if (!context) {
			throw new Error('Failed to get WebGPU context for recording canvas');
		}
		
		context.configure({
			device: this.device,
			format: this.format,
			alphaMode: 'opaque'
		});
		
		this.recordingCanvas = canvas as unknown as OffscreenCanvas;
		this.recordingContext = context;
		
		return canvas;
	}

	/**
	 * Render the full grid to the recording canvas (1:1 scale, no pan, no UI elements)
	 */
	renderToRecordingCanvas(): void {
		if (!this.recordingContext) return;
		
		this.applyPaints();
		
		// Create params for full grid view (1:1 scale, centered, no brush, no grid lines)
		const params = new Float32Array([
			this.width,
			this.height,
			this.width,  // canvas width = grid width
			this.height, // canvas height = grid height
			0, // offsetX = 0 (centered)
			0, // offsetY = 0 (centered)
			this.width, // zoom = grid width (1:1 scale)
			this.rule.numStates,
			0, // show_grid = false (no grid lines for clean recording)
			this.view.isLightTheme ? 1.0 : 0.0,
			this.view.aliveColor[0],
			this.view.aliveColor[1],
			this.view.aliveColor[2],
			-1000, // brush_x (hidden)
			-1000, // brush_y (hidden)
			-1, // brush_radius (hidden)
			this.getNeighborhoodIndex(),
			this.view.spectrumMode,
			this.view.spectrumFrequency,
			this.view.neighborShading,
			boundaryModeToIndex(this.view.boundaryMode),
			0, // brush_shape
			0, // brush_rotation
			1.0, // brush_aspect
			0, // axis_progress (no axes)
			0, // text_bitmap_width
			0  // text_bitmap_height
		]);
		this.device.queue.writeBuffer(this.renderParamsBuffer, 0, params);

		const commandEncoder = this.device.createCommandEncoder();

		const renderPass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.recordingContext.getCurrentTexture().createView(),
					loadOp: 'clear',
					storeOp: 'store',
					clearValue: { r: 0.05, g: 0.05, b: 0.08, a: 1.0 }
				}
			]
		});

		renderPass.setPipeline(this.renderPipeline);
		renderPass.setBindGroup(0, this.renderBindGroups[this.stepCount % 2]);
		renderPass.draw(3);
		renderPass.end();

		this.device.queue.submit([commandEncoder.finish()]);
	}

	/**
	 * Clean up recording canvas resources
	 */
	destroyRecordingCanvas(): void {
		if (this.recordingContext) {
			this.recordingContext.unconfigure();
			this.recordingContext = null;
		}
		this.recordingCanvas = null;
	}

	/**
	 * Transform coordinates based on boundary mode.
	 * Returns null if the coordinate is out of bounds for non-wrapping modes.
	 * For wrapping modes, returns the transformed (wrapped/flipped) coordinates.
	 * This logic must match the render shader's get_cell_state function exactly.
	 */
	private transformCoordinate(x: number, y: number): { x: number; y: number } | null {
		const mode = this.view.boundaryMode;
		const w = this.width;
		const h = this.height;
		
		// Determine which boundaries wrap and flip based on mode
		// Modes: cylinderX, torus, mobiusX, kleinX, kleinY, projectivePlane
		const wrapsX = mode === 'cylinderX' || mode === 'torus' || mode === 'mobiusX' || 
		               mode === 'kleinX' || mode === 'kleinY' || mode === 'projectivePlane';
		const wrapsY = mode === 'cylinderY' || mode === 'torus' || mode === 'mobiusY' || 
		               mode === 'kleinX' || mode === 'kleinY' || mode === 'projectivePlane';
		const flipsX = mode === 'mobiusX' || mode === 'kleinX' || mode === 'projectivePlane';
		const flipsY = mode === 'mobiusY' || mode === 'kleinY' || mode === 'projectivePlane';
		
		let fx = x;
		let fy = y;
		
		// Count how many times we cross each boundary (for proper flipping)
		let xWraps = 0;
		let yWraps = 0;
		
		// Handle X coordinate
		if (fx < 0 || fx >= w) {
			if (!wrapsX) {
				return null; // No wrap - out of bounds
			}
			// Count wraps and normalize
			if (fx < 0) {
				xWraps = Math.floor((-fx - 1) / w) + 1;
				fx = ((fx % w) + w) % w;
			} else {
				xWraps = Math.floor(fx / w);
				fx = fx % w;
			}
		}
		
		// Handle Y coordinate
		if (fy < 0 || fy >= h) {
			if (!wrapsY) {
				return null; // No wrap - out of bounds
			}
			// Count wraps and normalize
			if (fy < 0) {
				yWraps = Math.floor((-fy - 1) / h) + 1;
				fy = ((fy % h) + h) % h;
			} else {
				yWraps = Math.floor(fy / h);
				fy = fy % h;
			}
		}
		
		// Apply flips based on number of boundary crossings
		// Odd number of X-wraps with flip mode -> flip Y
		if (flipsX && (xWraps & 1) === 1) {
			fy = h - 1 - fy;
		}
		// Odd number of Y-wraps with flip mode -> flip X
		if (flipsY && (yWraps & 1) === 1) {
			fx = w - 1 - fx;
		}
		
		// Final bounds check (should always pass, but safety first)
		if (fx < 0 || fx >= w || fy < 0 || fy >= h) {
			return null;
		}
		
		return { x: Math.floor(fx), y: Math.floor(fy) };
	}

	/**
	 * Set a single cell state with boundary-aware coordinate transformation.
	 * Handles wrapping/flipping for all boundary modes.
	 */
	setCell(x: number, y: number, state: number): void {
		// First try direct coordinates (most common case)
		if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
			const index = Math.floor(x) + Math.floor(y) * this.width;
			this.pendingPaints.set(index, state);
			return;
		}
		
		// Out of bounds - try to transform based on boundary mode
		const transformed = this.transformCoordinate(Math.floor(x), Math.floor(y));
		if (transformed) {
			const index = transformed.x + transformed.y * this.width;
			this.pendingPaints.set(index, state);
		}
	}

	/**
	 * Paint cells in a brush area with advanced brush configuration
	 * @param centerX - Center X position in grid coordinates
	 * @param centerY - Center Y position in grid coordinates
	 * @param radius - Brush radius in cells
	 * @param state - Target state (1 = alive, 0 = dead/erase)
	 * @param brushType - Fill type: 'solid', 'gradient', 'noise', 'spray'
	 * @param config - Optional advanced brush configuration
	 */
	paintBrush(
		centerX: number, 
		centerY: number, 
		radius: number, 
		state: number, 
		brushType: string = 'solid',
		config?: {
			shape?: string;
			falloff?: string;
			rotation?: number;
			density?: number;
			intensity?: number;
			aspectRatio?: number;
			softness?: number;
			// Text brush options
			text?: string;
			textFont?: string;
			textBold?: boolean;
			textItalic?: boolean;
		}
	): void {
		const HEX_HEIGHT_RATIO = 0.866025404; // sqrt(3)/2
		const isHex = this.rule.neighborhood === 'hexagonal' || this.rule.neighborhood === 'extendedHexagonal';
		const numStates = this.rule.numStates;
		
		// Extract config with defaults
		const shape = config?.shape ?? 'circle';
		const rotation = ((config?.rotation ?? 0) * Math.PI) / 180;
		const density = config?.density ?? 0.5;
		const intensity = config?.intensity ?? 1.0;
		const aspectRatio = config?.aspectRatio ?? 1.0;
		
		const cos = Math.cos(rotation);
		const sin = Math.sin(rotation);
		
		// Check if a cell is within the brush shape
		const isInBrush = (dx: number, dy: number, r: number): { inside: boolean; dist: number } => {
			// Apply rotation
			const rx = dx * cos + dy * sin;
			const ry = -dx * sin + dy * cos;
			
			// Apply aspect ratio
			const ax = rx / aspectRatio;
			const ay = ry;
			
			let dist: number;
			let inside = false;
			
			switch (shape) {
				case 'square':
					dist = Math.max(Math.abs(ax), Math.abs(ay)) / r;
					inside = dist <= 1;
					break;
				case 'diamond':
					dist = (Math.abs(ax) + Math.abs(ay)) / r;
					inside = dist <= 1;
					break;
				case 'hexagon': {
					const hx = Math.abs(ax);
					const hy = Math.abs(ay);
					dist = Math.max(hx, hy * 0.866 + hx * 0.5) / r;
					inside = dist <= 1;
					break;
				}
				case 'ring':
					dist = Math.sqrt(ax * ax + ay * ay) / r;
					inside = dist >= 0.6 && dist <= 1;
					break;
				case 'triangle': {
					const triH = r * 0.866;
					const ty = ay + triH * 0.5;
					if (ty >= 0 && ty <= triH * 1.5) {
						const halfWidth = (triH * 1.5 - ty) * 0.577;
						inside = Math.abs(ax) <= halfWidth;
						dist = inside ? Math.max(Math.abs(ax) / r, ty / (triH * 1.5)) : 2;
					}
					break;
				}
				case 'line':
					dist = Math.abs(ay) / (r * 0.15);
					inside = Math.abs(ax) <= r && dist <= 1;
					if (inside) dist = Math.max(Math.abs(ax) / r, Math.abs(ay) / (r * 0.15));
					break;
				case 'cross': {
					const armRatio = 0.25;
					const inVertical = Math.abs(ax) <= r * armRatio && Math.abs(ay) <= r;
					const inHorizontal = Math.abs(ay) <= r * armRatio && Math.abs(ax) <= r;
					inside = inVertical || inHorizontal;
					dist = inside ? Math.max(Math.abs(ax), Math.abs(ay)) / r : 2;
					break;
				}
				case 'star': {
					const angle = Math.atan2(ay, ax);
					const starR = Math.sqrt(ax * ax + ay * ay);
					const starFactor = 0.5 + 0.5 * Math.cos(5 * angle);
					const effectiveR = r * (0.4 + 0.6 * starFactor);
					dist = starR / effectiveR;
					inside = dist <= 1;
					break;
				}
				case 'heart': {
					// Heart SDF - matches shader implementation
					const scale = 0.8;
					const px = Math.abs(ax / (r * scale));
					const py = -ay / (r * scale) + 0.35;
					
					if (py + px > 1.0) {
						// Upper outer region - distance to circle arc
						const dx = px - 0.25;
						const dy = py - 0.75;
						const d = Math.sqrt(dx * dx + dy * dy) - 0.3536;
						inside = d <= 0;
					} else {
						// Lower region
						const d1 = Math.sqrt(px * px + py * py);
						const d2_proj = Math.max(px + py, 0) * 0.5;
						const d2x = px - d2_proj;
						const d2y = py - d2_proj;
						const d2 = Math.sqrt(d2x * d2x + d2y * d2y);
						const d = Math.min(d1, d2);
						const s = Math.sign(px - py);
						inside = d * s <= 0;
					}
					dist = inside ? Math.sqrt((ax / r) ** 2 + (ay / r) ** 2) : 2;
					break;
				}
				case 'spiral': {
					const sr = Math.sqrt(ax * ax + ay * ay);
					const normalizedR = sr / r;
					if (normalizedR > 1) {
						inside = false;
						dist = normalizedR;
						break;
					}
					const sangle = Math.atan2(ay, ax); // -PI to PI
					const spiralArms = 3;
					const spiralWidth = 0.18;
					const armSpacing = 2 * Math.PI / spiralArms;
					const targetAngle = normalizedR * 2 * Math.PI * spiralArms;
					
					// Find angular distance to nearest spiral arm (same as shader)
					let angleDiff = sangle - targetAngle;
					// Wrap to -PI to PI range
					angleDiff = angleDiff - Math.floor((angleDiff + Math.PI) / (2 * Math.PI)) * 2 * Math.PI;
					// Wrap to arm spacing
					angleDiff = angleDiff - Math.floor((angleDiff + armSpacing * 0.5) / armSpacing) * armSpacing;
					
					inside = Math.abs(angleDiff) < spiralWidth * (0.5 + normalizedR);
					dist = normalizedR;
					break;
				}
				case 'flower': {
					// 6-petal flower
					const fangle = Math.atan2(ay, ax);
					const fr = Math.sqrt(ax * ax + ay * ay);
					const petalFactor = 0.5 + 0.5 * Math.cos(6 * fangle);
					const effectiveR = r * (0.3 + 0.7 * petalFactor);
					dist = fr / effectiveR;
					inside = dist <= 1;
					break;
				}
				case 'burst': {
					// Starburst with many rays
					const bangle = Math.atan2(ay, ax);
					const br = Math.sqrt(ax * ax + ay * ay);
					const rays = 12;
					const rayFactor = Math.abs(Math.cos(rays * bangle));
					const effectiveR = r * (0.3 + 0.7 * rayFactor);
					dist = br / effectiveR;
					inside = dist <= 1;
					break;
				}
				case 'wave': {
					// Sine wave band
					const waveFreq = 3;
					const waveAmp = r * 0.3;
					const centerY = Math.sin(ax / r * Math.PI * waveFreq) * waveAmp;
					const bandWidth = r * 0.25;
					dist = Math.abs(ax) / r;
					inside = Math.abs(ax) <= r && Math.abs(ay - centerY) <= bandWidth;
					break;
				}
			case 'dots': {
					// Grid of circular dots
					const dotSpacing = r / 2.5;
					const dotRadius = dotSpacing * 0.35;
					const nearestX = Math.round(ax / dotSpacing) * dotSpacing;
					const nearestY = Math.round(ay / dotSpacing) * dotSpacing;
					const dotDist = Math.sqrt((ax - nearestX) ** 2 + (ay - nearestY) ** 2);
					dist = Math.sqrt(ax * ax + ay * ay) / r;
					inside = dist <= 1 && dotDist <= dotRadius;
					break;
				}
				case 'scatter':
					dist = Math.sqrt(ax * ax + ay * ay) / r;
					inside = dist <= 1 && Math.random() < density;
					break;
				case 'circle':
				default:
					dist = Math.sqrt(ax * ax + ay * ay) / r;
					inside = dist <= 1;
			}
			
			return { inside, dist };
		};
		
		// Get alpha based on distance (simpler now - just intensity)
		const getAlpha = (dist: number): number => {
			return intensity;
		};
		
		// Simple hash function for noise
		const hash = (x: number, y: number): number => {
			const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
			return n - Math.floor(n);
		};
		
		// Value noise function (coherent random)
		const valueNoise = (x: number, y: number, scale: number): number => {
			const sx = x / scale;
			const sy = y / scale;
			const x0 = Math.floor(sx);
			const y0 = Math.floor(sy);
			const fx = sx - x0;
			const fy = sy - y0;
			
			// Smooth interpolation
			const u = fx * fx * (3 - 2 * fx);
			const v = fy * fy * (3 - 2 * fy);
			
			// Corner values
			const n00 = hash(x0, y0);
			const n10 = hash(x0 + 1, y0);
			const n01 = hash(x0, y0 + 1);
			const n11 = hash(x0 + 1, y0 + 1);
			
			// Bilinear interpolation
			return n00 * (1 - u) * (1 - v) +
				   n10 * u * (1 - v) +
				   n01 * (1 - u) * v +
				   n11 * u * v;
		};
		
		// Get the cell state to paint based on brush type and alpha
		// Returns -1 to indicate "don't change this cell" (for additive behavior)
		const getCellState = (alpha: number, cellX: number, cellY: number, dist: number): number => {
			if (state === 0) return 0; // Erase mode always returns 0
			if (alpha <= 0) return -1; // Don't paint if no alpha
			
			switch (brushType) {
				case 'gradient': {
					// Gradient: density decreases dramatically from center to edge
					// This creates a visible "fading" effect, not just slightly fewer cells
					
					// Use squared distance for more dramatic center-heavy distribution
					const distSq = dist * dist;
					// Combine with alpha (from falloff) for additional control
					const gradientFactor = alpha * (1 - distSq);
					
					if (numStates <= 2) {
						// For 2-state rules: dense center, very sparse edges
						// Apply cubic falloff for dramatic visual difference
						const prob = gradientFactor * gradientFactor; // square again for more dramatic effect
						if (prob < 0.05) return -1; // Don't paint at very low probability
						return Math.random() < prob ? 1 : -1;
					}
					
					// For multi-state: paint different vitality states based on distance
					// Center = fully alive (state 1), edges = more dying states
					if (gradientFactor < 0.1) return -1; // Don't paint at very edge
					
					if (gradientFactor > 0.8) {
						// Center core: fully alive
						return 1;
					} else if (gradientFactor > 0.5) {
						// Inner ring: mostly alive with some dying
						return Math.random() < 0.7 ? 1 : 2;
					} else {
						// Outer ring: dying states, sparser
						if (Math.random() > gradientFactor * 2) return -1; // Skip some cells
						const stateRange = numStates - 2;
						const dyingState = 2 + Math.floor((1 - gradientFactor) * stateRange * 0.6);
						return Math.min(dyingState, numStates - 1);
					}
				}
				case 'noise': {
					// Coherent noise pattern - creates organic clusters
					const noiseScale = Math.max(4, radius / 3);
					const n1 = valueNoise(cellX, cellY, noiseScale);
					const n2 = valueNoise(cellX * 2.3 + 100, cellY * 1.9 + 50, noiseScale * 0.6);
					const noise = (n1 * 0.6 + n2 * 0.4); // Multi-octave noise
					
					// Combine noise with alpha for smooth edges
					const combined = noise * alpha;
					if (combined < 0.25) return -1;
					
					if (numStates > 2) {
						// Multi-state: noise affects vitality
						if (combined > 0.6) return 1;
						const dyingState = 2 + Math.floor((1 - combined) * (numStates - 2) * 0.7);
						return Math.min(dyingState, numStates - 1);
					}
					return 1;
				}
				case 'spray': {
					// Sparse scattered dots - density controls coverage
					const sparsity = Math.pow(1 - density, 2);
					const threshold = sparsity * 0.92 + 0.05;
					if (Math.random() > threshold) {
						// Use alpha to determine if this dot gets painted
						return Math.random() < alpha ? 1 : -1;
					}
					return -1;
				}
				case 'solid':
				default:
					// Solid fill respects falloff - probabilistic at edges
					// This makes falloff actually do something!
					if (alpha >= 0.95) return 1; // Full strength at center
					// Probabilistic fill based on alpha (from falloff)
					return Math.random() < alpha ? 1 : -1;
			}
		};
		
		const brushCenterX = Math.floor(centerX);
		const brushCenterY = Math.floor(centerY);
		
		// Special handling for text brush - use SAME logic as shader
		if (shape === 'text') {
			// Ensure bitmap is up-to-date with current settings
			const text = config?.text || 'LIFE';
			const font = config?.textFont || 'monospace';
			const bold = config?.textBold || false;
			const italic = config?.textItalic || false;
			this.updateTextBitmap(text, font, bold, italic, radius);
			
			const bw = this.textBitmapWidth;
			const bh = this.textBitmapHeight;
			const bitmap = this.textBitmapData;
			
			if (!bitmap || bw === 0 || bh === 0) {
				return;
			}
			
			// Scale: maps grid cell offsets to bitmap pixel offsets
			// Hex grids multiply dx/dy by 2.0 in shader, so we need different scales:
			// - Square grid: scale = (radius * 2) / bh (matches shader directly)
			// - Hex grid: scale = radius / bh (because shader doubles dx/dy for hex)
			const scale = isHex ? (radius / bh) : ((radius * 2) / bh);
			const halfWidth = bw * 0.5;
			const halfHeight = bh * 0.5;
			
			// Calculate extent in grid cells
			const gridHalfWidth = Math.ceil(halfWidth * scale) + 1;
			const gridHalfHeight = Math.ceil(halfHeight * scale) + 1;
			
			// Iterate over grid cells like the shader does
			for (let dy = -gridHalfHeight; dy <= gridHalfHeight; dy++) {
				for (let dx = -gridHalfWidth; dx <= gridHalfWidth; dx++) {
					// Apply rotation (same as shader)
					const rx = dx * cos + dy * sin;
					const ry = -dx * sin + dy * cos;
					
					// Map to bitmap coords (EXACT same formula as shader)
					const bx = (rx / scale) + halfWidth;
					const by = (ry / scale) + halfHeight;
					
					// Check bounds
					if (bx < 0 || bx >= bw || by < 0 || by >= bh) {
						continue;
					}
					
					// Sample the bitmap
					const ix = Math.floor(bx);
					const iy = Math.floor(by);
					const pixelIndex = iy * bw + ix;
					
					if (bitmap[pixelIndex] > 0) {
						const cellX = brushCenterX + dx;
						const cellY = brushCenterY + dy;
						this.setCell(cellX, cellY, state);
					}
				}
			}
			return;
		}
		
		if (isHex) {
			// For hexagonal grids, use visual distance
			const isOddBrush = (brushCenterY & 1) === 1;
			const brushVisualX = brushCenterX + 0.5 + (isOddBrush ? 0.5 : 0);
			const brushVisualY = (brushCenterY + 0.5) * HEX_HEIGHT_RATIO;
			
			// Visual radius
			const visualRadius = radius * 0.5;
			
			// Search a larger area to account for hex layout
			const searchRadius = Math.ceil(radius / HEX_HEIGHT_RATIO) + 1;
			
			for (let dy = -searchRadius; dy <= searchRadius; dy++) {
				for (let dx = -searchRadius; dx <= searchRadius; dx++) {
					const cellX = brushCenterX + dx;
					const cellY = brushCenterY + dy;
					
					// Get visual center of this cell
					const isOdd = (cellY & 1) === 1;
					const cellVisualX = cellX + 0.5 + (isOdd ? 0.5 : 0);
					const cellVisualY = (cellY + 0.5) * HEX_HEIGHT_RATIO;
					
					// Calculate visual distance from brush center
					const vdx = cellVisualX - brushVisualX;
					const vdy = cellVisualY - brushVisualY;
					
					const result = isInBrush(vdx, vdy, visualRadius);
					if (result.inside) {
						const alpha = getAlpha(result.dist);
						const cellState = getCellState(alpha, cellX, cellY, result.dist);
						// -1 means "don't change this cell" (for probabilistic/additive brushes)
						if (cellState >= 0) {
							this.setCell(cellX, cellY, cellState);
						}
					}
				}
			}
		} else {
			// Square grids: simple grid coordinates
			const r = Math.ceil(radius * Math.max(1, aspectRatio));
			
			for (let dy = -r; dy <= r; dy++) {
				for (let dx = -r; dx <= r; dx++) {
					const cellX = brushCenterX + dx;
					const cellY = brushCenterY + dy;
					const result = isInBrush(dx, dy, radius);
					if (result.inside) {
						const alpha = getAlpha(result.dist);
						const cellState = getCellState(alpha, cellX, cellY, result.dist);
						// -1 means "don't change this cell" (for probabilistic/additive brushes)
						if (cellState >= 0) {
							this.setCell(cellX, cellY, cellState);
						}
					}
				}
			}
		}
	}

	/**
	 * Clear the entire grid
	 */
	clear(): void {
		const cellCount = this.width * this.height;
		const zeros = new Uint32Array(cellCount);

		this.device.queue.writeBuffer(this.cellBuffers[0], 0, zeros);
		this.device.queue.writeBuffer(this.cellBuffers[1], 0, zeros);
		this.pendingPaints.clear();
		this._aliveCells = 0;
	}

	/**
	 * Randomize the grid
	 * @param density - Probability of a cell being non-dead (0-1)
	 * @param includeSpectrum - If true and numStates > 2, include dying states in the random distribution
	 */
	randomize(density = 0.25, includeSpectrum = true): void {
		const cellCount = this.width * this.height;
		const data = new Uint32Array(cellCount);
		let alive = 0;
		const numStates = this.rule.numStates;

		for (let i = 0; i < cellCount; i++) {
			if (Math.random() < density) {
				if (includeSpectrum && numStates > 2) {
					// For multi-state rules, distribute across all states
					// Higher probability for alive (1) and early dying states
					// State 1 = alive, States 2 to numStates-1 = dying
					const rand = Math.random();
					if (rand < 0.5) {
						// 50% chance of being fully alive
						data[i] = 1;
						alive++;
					} else {
						// 50% chance of being in a dying state (2 to numStates-1)
						// Weighted towards earlier dying states (more colorful)
						const dyingStates = numStates - 2; // Number of dying states
						const weightedRand = Math.pow(Math.random(), 1.5); // Bias towards lower values
						const dyingState = 2 + Math.floor(weightedRand * dyingStates);
						data[i] = Math.min(dyingState, numStates - 1);
					}
				} else {
					// Simple alive/dead for 2-state rules
					data[i] = 1;
					alive++;
				}
			} else {
				data[i] = 0;
			}
		}

		this._aliveCells = alive;
		const currentBuffer = this.cellBuffers[this.stepCount % 2];
		this.device.queue.writeBuffer(currentBuffer, 0, data);
		this.pendingPaints.clear();
	}

	/**
	 * Continuous seeding - add random cells to keep simulation active
	 * @param rate - Seeds per frame as percentage (0.01 - 1.0, where 0.1 = 10%)
	 * @param patternId - The seed pattern to use (default: 'pixel')
	 * @param alive - true to add alive cells, false to add dead cells (erase)
	 */
	continuousSeed(rate: number, patternId: SeedPatternId = 'pixel', alive: boolean = true): void {
		// Get the pattern from either square or hex patterns
		const pattern = SEED_PATTERNS.find(p => p.id === patternId) 
			?? SEED_PATTERNS_HEX.find(p => p.id === patternId)
			?? SEED_PATTERNS[0];
		
		// Calculate how many seeds to place based on rate and grid size
		// rate of 0.1 (10%) on a 256x256 grid = ~6.5 seeds per frame
		// rate of 1.0 (100%) on a 256x256 grid = ~65 seeds per frame
		const cellCount = this.width * this.height;
		const seedsPerFrame = (rate * cellCount) / 1000;
		
		// Adjust for pattern size - larger patterns need fewer placements
		const patternSize = pattern.cells.length;
		const adjustedSeeds = seedsPerFrame / Math.sqrt(patternSize);
		
		// The state to set: 1 for alive, 0 for dead
		const seedState = alive ? 1 : 0;
		
		// Place seeds at random locations
		const numSeeds = Math.ceil(adjustedSeeds);
		for (let s = 0; s < numSeeds; s++) {
			// Only place this seed with probability based on fractional part
			if (s >= adjustedSeeds && Math.random() > (adjustedSeeds % 1)) continue;
			
			const centerX = Math.floor(Math.random() * this.width);
			const centerY = Math.floor(Math.random() * this.height);
			
			// Place the pattern centered at this location
			for (const [dx, dy] of pattern.cells) {
				const x = (centerX + dx + this.width) % this.width;
				const y = (centerY + dy + this.height) % this.height;
				const key = y * this.width + x;
				if (!this.pendingPaints.has(key)) {
					this.pendingPaints.set(key, seedState);
				}
			}
		}
	}

	/**
	 * Update the rule
	 */
	setRule(rule: CARule): void {
		this.rule = rule;
		this.updateComputeParams();
	}

	/**
	 * Alive cells count - tracked during operations
	 */
	private _aliveCells = 0;
	private _isCountingCells = false;

	countAliveCells(): number {
		return this._aliveCells;
	}

	/**
	 * Update alive cells count (call after bulk setCell operations)
	 */
	updateAliveCellsCount(count: number): void {
		this._aliveCells = count;
	}

	/**
	 * Async method to read back cell data from GPU and count alive cells
	 * Call this when paused to get accurate count
	 */
	async countAliveCellsAsync(): Promise<number> {
		if (this._isCountingCells) return this._aliveCells;
		this._isCountingCells = true;

		try {
			const currentBuffer = this.cellBuffers[this.stepCount % 2];
			const bufferSize = this.width * this.height * 4;

			// Copy current cell buffer to readback buffer
			const commandEncoder = this.device.createCommandEncoder();
			commandEncoder.copyBufferToBuffer(currentBuffer, 0, this.readbackBuffer, 0, bufferSize);
			this.device.queue.submit([commandEncoder.finish()]);

			// Map the readback buffer and count alive cells
			await this.readbackBuffer.mapAsync(GPUMapMode.READ);
			const data = new Uint32Array(this.readbackBuffer.getMappedRange());
			
			let count = 0;
			for (let i = 0; i < data.length; i++) {
				if (data[i] === 1) count++;
			}
			
			this.readbackBuffer.unmap();
			this._aliveCells = count;
			return count;
		} finally {
			this._isCountingCells = false;
		}
	}

	/**
	 * Get current rule
	 */
	getRule(): CARule {
		return this.rule;
	}

	/**
	 * Get grid dimensions
	 */
	getDimensions(): { width: number; height: number } {
		return { width: this.width, height: this.height };
	}

	/**
	 * Read back all cell data from GPU (async)
	 */
	async getCellDataAsync(): Promise<Uint32Array> {
		const currentBuffer = this.cellBuffers[this.stepCount % 2];
		const bufferSize = this.width * this.height * 4;

		const commandEncoder = this.device.createCommandEncoder();
		commandEncoder.copyBufferToBuffer(currentBuffer, 0, this.readbackBuffer, 0, bufferSize);
		this.device.queue.submit([commandEncoder.finish()]);

		await this.readbackBuffer.mapAsync(GPUMapMode.READ);
		const data = new Uint32Array(this.readbackBuffer.getMappedRange().slice(0));
		this.readbackBuffer.unmap();
		
		return data;
	}

	/**
	 * Write cell data to GPU
	 */
	setCellData(data: Uint32Array): void {
		const currentBuffer = this.cellBuffers[this.stepCount % 2];
		this.device.queue.writeBuffer(currentBuffer, 0, data);
		this.pendingPaints.clear();
		
		// Update alive count
		let count = 0;
		for (let i = 0; i < data.length; i++) {
			if (data[i] === 1) count++;
		}
		this._aliveCells = count;
	}

	/**
	 * Snapshot current grid for undo (one level)
	 */
	async snapshotUndo(): Promise<void> {
		this.undoBuffer = await this.getCellDataAsync();
	}

	/**
	 * Clear undo buffer
	 */
	clearUndo(): void {
		this.undoBuffer = null;
	}

	/**
	 * Undo to last snapshot (if any)
	 */
	async undoLast(): Promise<boolean> {
		if (!this.undoBuffer) return false;
		this.setCellData(this.undoBuffer);
		this.undoBuffer = null;
		return true;
	}

	/**
	 * Update view state
	 */
	setView(view: Partial<ViewState>): void {
		const boundaryChanged = view.boundaryMode !== undefined && view.boundaryMode !== this.view.boundaryMode;
		const vitalityChanged = (view.vitalityMode !== undefined && view.vitalityMode !== this.view.vitalityMode) ||
			(view.vitalityThreshold !== undefined && view.vitalityThreshold !== this.view.vitalityThreshold) ||
			(view.vitalityGhostFactor !== undefined && view.vitalityGhostFactor !== this.view.vitalityGhostFactor) ||
			(view.vitalitySigmoidSharpness !== undefined && view.vitalitySigmoidSharpness !== this.view.vitalitySigmoidSharpness) ||
			(view.vitalityDecayPower !== undefined && view.vitalityDecayPower !== this.view.vitalityDecayPower);
		
		this.view = { ...this.view, ...view };
		
		// If boundary mode or vitality settings changed, update compute params
		if (boundaryChanged || vitalityChanged) {
			this.updateComputeParams();
		}
	}

	/**
	 * Get current view state
	 */
	getView(): ViewState {
		return { ...this.view };
	}

	/**
	 * Convert screen coordinates to continuous grid coordinates
	 * Used for zoom/pan operations
	 */
	screenToGridContinuous(
		screenX: number,
		screenY: number,
		canvasWidth: number,
		canvasHeight: number
	): { x: number; y: number } {
		const aspect = canvasWidth / canvasHeight;
		const cellsVisibleX = this.view.zoom;
		const cellsVisibleY = this.view.zoom / aspect;

		const gridX = (screenX / canvasWidth) * cellsVisibleX + this.view.offsetX;
		const gridY = (screenY / canvasHeight) * cellsVisibleY + this.view.offsetY;

		return { x: gridX, y: gridY };
	}

	/**
	 * Convert screen coordinates to cell coordinates
	 * For hexagonal grids, returns the hex cell coordinates
	 * For square grids, returns floored grid coordinates
	 */
	screenToGrid(
		screenX: number,
		screenY: number,
		canvasWidth: number,
		canvasHeight: number
	): { x: number; y: number } {
		const { x: gridX, y: gridY } = this.screenToGridContinuous(screenX, screenY, canvasWidth, canvasHeight);

		// For hexagonal grids, convert to hex cell coordinates
		if (this.rule.neighborhood === 'hexagonal' || this.rule.neighborhood === 'extendedHexagonal') {
			return this.screenToHexCell(gridX, gridY);
		}

		return { x: gridX, y: gridY };
	}

	/**
	 * Convert continuous grid coordinates to hexagonal cell coordinates
	 * Uses "odd-r" offset coordinates where odd rows are shifted right
	 */
	private screenToHexCell(gridX: number, gridY: number): { x: number; y: number } {
		const HEX_HEIGHT_RATIO = 0.866025404; // sqrt(3)/2

		// Scale y to account for compressed row height
		const scaledY = gridY / HEX_HEIGHT_RATIO;
		const row = Math.floor(scaledY);
		const rowFrac = scaledY - row;

		// Determine if this is an odd row (shifted right by 0.5)
		const isOdd = (row & 1) === 1;

		// Adjust x for row offset
		let adjustedX = gridX;
		if (isOdd) {
			adjustedX = gridX - 0.5;
		}

		const col = Math.floor(adjustedX);
		const colFrac = adjustedX - col;

		// Check if we're in the "corner" regions where the pixel might belong to an adjacent hex
		if (rowFrac < 0.333) {
			// Left corner check
			if (colFrac < 0.5) {
				const boundaryY = 0.333 - colFrac * 0.666;
				if (rowFrac < boundaryY) {
					// We're in the hex above-left
					if (isOdd) {
						return { x: col, y: row - 1 };
					} else {
						return { x: col - 1, y: row - 1 };
					}
				}
			} else {
				// Right corner check
				const boundaryY = (colFrac - 0.5) * 0.666;
				if (rowFrac < boundaryY) {
					// We're in the hex above-right
					if (isOdd) {
						return { x: col + 1, y: row - 1 };
					} else {
						return { x: col, y: row - 1 };
					}
				}
			}
		}

		return { x: col, y: row };
	}

	/**
	 * Zoom at a specific point
	 */
	zoomAt(
		screenX: number,
		screenY: number,
		canvasWidth: number,
		canvasHeight: number,
		factor: number
	): void {
		// Get continuous grid position before zoom (not cell coordinates)
		const gridPos = this.screenToGridContinuous(screenX, screenY, canvasWidth, canvasHeight);

		// Apply zoom - allow zooming out to 2x the grid size for padding
		const maxZoom = Math.max(this.width, this.height) * 2;
		const newZoom = Math.max(10, Math.min(maxZoom, this.view.zoom * factor));

		// Calculate new offset to keep gridPos at the same screen position
		const aspect = canvasWidth / canvasHeight;
		const newCellsVisibleX = newZoom;
		const newCellsVisibleY = newZoom / aspect;

		const newOffsetX = gridPos.x - (screenX / canvasWidth) * newCellsVisibleX;
		const newOffsetY = gridPos.y - (screenY / canvasHeight) * newCellsVisibleY;

		this.view.zoom = newZoom;
		this.view.offsetX = newOffsetX;
		this.view.offsetY = newOffsetY;
		
		// Normalize offset for wrapping boundary modes
		this.normalizeOffset();
	}

	/**
	 * Pan the view
	 */
	pan(deltaX: number, deltaY: number, canvasWidth: number, canvasHeight: number): void {
		const aspect = canvasWidth / canvasHeight;
		const cellsVisibleX = this.view.zoom;
		const cellsVisibleY = this.view.zoom / aspect;

		this.view.offsetX -= (deltaX / canvasWidth) * cellsVisibleX;
		this.view.offsetY -= (deltaY / canvasHeight) * cellsVisibleY;
		
		// Normalize offset for wrapping boundary modes to prevent precision issues
		this.normalizeOffset();
	}

	/**
	 * Normalize view offset to prevent floating-point precision issues.
	 * Only normalizes when offset gets very large (100x grid size) to avoid visible jumps.
	 * The shader handles wrapping correctly for any offset value.
	 */
	private normalizeOffset(): void {
		const mode = this.view.boundaryMode;
		
		// Check if boundary mode wraps horizontally
		// Modes: cylinderX, torus, mobiusX, kleinX, kleinY, projectivePlane
		const wrapsX = mode === 'cylinderX' || mode === 'torus' || mode === 'mobiusX' || 
		               mode === 'kleinX' || mode === 'kleinY' || mode === 'projectivePlane';
		// Check if boundary mode wraps vertically
		// Modes: cylinderY, torus, mobiusY, kleinX, kleinY, projectivePlane
		const wrapsY = mode === 'cylinderY' || mode === 'torus' || mode === 'mobiusY' || 
		               mode === 'kleinX' || mode === 'kleinY' || mode === 'projectivePlane';
		
		// Only normalize when offset gets extremely large to prevent precision issues
		// A threshold of 100x grid size allows smooth panning without visible jumps
		// while still preventing floating-point precision degradation
		const threshold = 100;
		
		if (wrapsX && Math.abs(this.view.offsetX) > this.width * threshold) {
			this.view.offsetX = ((this.view.offsetX % this.width) + this.width) % this.width;
		}
		
		if (wrapsY && Math.abs(this.view.offsetY) > this.height * threshold) {
			this.view.offsetY = ((this.view.offsetY % this.height) + this.height) % this.height;
		}
	}

	// Animation state for smooth view transitions
	private viewAnimation: {
		active: boolean;
		startTime: number;
		duration: number;
		startZoom: number;
		startOffsetX: number;
		startOffsetY: number;
		targetZoom: number;
		targetOffsetX: number;
		targetOffsetY: number;
	} | null = null;

	// Animation state for axis grow/shrink animation
	private axisAnimation: {
		active: boolean;
		startTime: number;
		duration: number;
		startProgress: number;
		targetProgress: number;
	} | null = null;

	/**
	 * Calculate the target view state for fitting the entire grid
	 */
	private calculateFitView(canvasWidth?: number, canvasHeight?: number): { zoom: number; offsetX: number; offsetY: number } {
		// For hexagonal grids, the visual coordinate system is different
		const HEX_HEIGHT_RATIO = 0.866025404; // sqrt(3)/2
		const isHex = this.rule.neighborhood === 'hexagonal' || this.rule.neighborhood === 'extendedHexagonal';
		
		// Calculate effective grid dimensions in visual coordinates
		const effectiveGridWidth = isHex ? this.width + 0.5 : this.width;
		const effectiveGridHeight = isHex ? (this.height + 0.5) * HEX_HEIGHT_RATIO : this.height;
		
		let zoom: number;
		let offsetX = 0;
		let offsetY = 0;
		
		if (canvasWidth && canvasHeight) {
			const canvasAspect = canvasWidth / canvasHeight;
			const gridAspect = effectiveGridWidth / effectiveGridHeight;
			
			// Fit ENTIRE grid into canvas (no clipping)
			if (gridAspect >= canvasAspect) {
				zoom = effectiveGridWidth;
			} else {
				zoom = effectiveGridHeight * canvasAspect;
			}
			
			// Calculate how many cells are visible in each dimension
			const cellsVisibleX = zoom;
			const cellsVisibleY = zoom / canvasAspect;
			
			// Center the grid both horizontally and vertically
			offsetX = (effectiveGridWidth - cellsVisibleX) / 2;
			offsetY = (effectiveGridHeight - cellsVisibleY) / 2;
		} else {
			zoom = effectiveGridWidth;
		}
		
		return { zoom, offsetX, offsetY };
	}

	/**
	 * Smooth ease-out cubic function for natural deceleration
	 */
	private easeOutCubic(t: number): number {
		return 1 - Math.pow(1 - t, 3);
	}

	/**
	 * Update view animation - call this in the render loop
	 */
	updateViewAnimation(): void {
		if (!this.viewAnimation || !this.viewAnimation.active) return;
		
		const elapsed = performance.now() - this.viewAnimation.startTime;
		const progress = Math.min(elapsed / this.viewAnimation.duration, 1);
		const eased = this.easeOutCubic(progress);
		
		// Interpolate zoom (use logarithmic interpolation for smoother zoom)
		const logStartZoom = Math.log(this.viewAnimation.startZoom);
		const logTargetZoom = Math.log(this.viewAnimation.targetZoom);
		this.view.zoom = Math.exp(logStartZoom + (logTargetZoom - logStartZoom) * eased);
		
		// Interpolate offset linearly
		this.view.offsetX = this.viewAnimation.startOffsetX + 
			(this.viewAnimation.targetOffsetX - this.viewAnimation.startOffsetX) * eased;
		this.view.offsetY = this.viewAnimation.startOffsetY + 
			(this.viewAnimation.targetOffsetY - this.viewAnimation.startOffsetY) * eased;
		
		// Animation complete
		if (progress >= 1) {
			this.view.zoom = this.viewAnimation.targetZoom;
			this.view.offsetX = this.viewAnimation.targetOffsetX;
			this.view.offsetY = this.viewAnimation.targetOffsetY;
			this.viewAnimation.active = false;
		}
	}

	/**
	 * Check if view animation is currently active
	 */
	isAnimating(): boolean {
		return this.viewAnimation?.active ?? false;
	}

	/**
	 * Start axis animation (grow from center or shrink to center)
	 * @param show - true to grow axes outward, false to shrink to center
	 * @param duration - Animation duration in ms (default: 400)
	 */
	startAxisAnimation(show: boolean, duration: number = 400): void {
		this.axisAnimation = {
			active: true,
			startTime: performance.now(),
			duration,
			startProgress: this.view.axisProgress,
			targetProgress: show ? 1.0 : 0.0
		};
	}

	/**
	 * Update axis animation each frame
	 */
	updateAxisAnimation(): void {
		if (!this.axisAnimation || !this.axisAnimation.active) return;
		
		const elapsed = performance.now() - this.axisAnimation.startTime;
		const progress = Math.min(elapsed / this.axisAnimation.duration, 1);
		const eased = this.easeOutCubic(progress);
		
		// Interpolate axis progress
		this.view.axisProgress = this.axisAnimation.startProgress + 
			(this.axisAnimation.targetProgress - this.axisAnimation.startProgress) * eased;
		
		// Animation complete
		if (progress >= 1) {
			this.view.axisProgress = this.axisAnimation.targetProgress;
			this.axisAnimation.active = false;
		}
	}

	/**
	 * Reset view to show entire grid with smooth animation.
	 * The grid is centered both horizontally and vertically.
	 * @param canvasWidth - Canvas width in pixels
	 * @param canvasHeight - Canvas height in pixels  
	 * @param animate - Whether to animate the transition (default: true)
	 * @param duration - Animation duration in ms (default: 300)
	 */
	resetView(canvasWidth?: number, canvasHeight?: number, animate: boolean = true, duration: number = 300): void {
		const target = this.calculateFitView(canvasWidth, canvasHeight);
		
		// Check if we're already at the target (within small tolerance)
		const zoomDiff = Math.abs(this.view.zoom - target.zoom) / target.zoom;
		const offsetXDiff = Math.abs(this.view.offsetX - target.offsetX);
		const offsetYDiff = Math.abs(this.view.offsetY - target.offsetY);
		const isAlreadyAtTarget = zoomDiff < 0.001 && offsetXDiff < 0.5 && offsetYDiff < 0.5;
		
		if (isAlreadyAtTarget) {
			// Snap to exact target and skip animation
			this.view.zoom = target.zoom;
			this.view.offsetX = target.offsetX;
			this.view.offsetY = target.offsetY;
			this.viewAnimation = null;
			return;
		}
		
		if (animate && duration > 0) {
			// Start smooth animation
			this.viewAnimation = {
				active: true,
				startTime: performance.now(),
				duration,
				startZoom: this.view.zoom,
				startOffsetX: this.view.offsetX,
				startOffsetY: this.view.offsetY,
				targetZoom: target.zoom,
				targetOffsetX: target.offsetX,
				targetOffsetY: target.offsetY
			};
		} else {
			// Instant transition
			this.view.zoom = target.zoom;
			this.view.offsetX = target.offsetX;
			this.view.offsetY = target.offsetY;
			this.viewAnimation = null;
		}
	}

	/**
	 * Get grid dimensions
	 */
	getSize(): { width: number; height: number } {
		return { width: this.width, height: this.height };
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.cellBuffers[0].destroy();
		this.cellBuffers[1].destroy();
		this.computeParamsBuffer.destroy();
		this.renderParamsBuffer.destroy();
		this.readbackBuffer.destroy();
	}
}

/**
 * Create a new simulation with default settings
 */
export function createSimulation(
	ctx: WebGPUContext,
	width = 512,
	height = 512
): Simulation {
	return new Simulation(ctx, {
		width,
		height,
		rule: getDefaultRule()
	});
}

