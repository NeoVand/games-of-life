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
	boundaryMode: BoundaryMode; // Topological boundary condition
	spectrumMode: number; // 0=hueShift, 1=rainbow, 2=warm, 3=cool, 4=monochrome, 5=fire
	spectrumFrequency: number; // How many times to repeat spectrum (1.0 = normal)
	neighborShading: number; // 0=off, 1=count alive, 2=sum vitality
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

	// Double-buffer step counter
	private stepCount = 0;

	// Pending paint operations
	private pendingPaints: Map<number, number> = new Map();

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
			boundaryMode: 'torus', // Default to toroidal wrapping
			spectrumMode: 0, // Default to hue shift
			spectrumFrequency: 1.0, // Default to single spectrum span
			neighborShading: 1, // Default to count alive
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

		// Render params buffer (24 f32 values = 96 bytes, aligned to 16)
		this.renderParamsBuffer = this.device.createBuffer({
			label: 'Render Params Buffer',
			size: 96,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
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
					{ binding: 1, resource: { buffer: this.cellBuffers[0] } }
				]
			}),
			this.device.createBindGroup({
				label: 'Render Bind Group B',
				layout: this.renderBindGroupLayout,
				entries: [
					{ binding: 0, resource: { buffer: this.renderParamsBuffer } },
					{ binding: 1, resource: { buffer: this.cellBuffers[1] } }
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
			0.0, // padding1
			0.0, // padding2
			0.0  // padding3
		]);
		this.device.queue.writeBuffer(this.renderParamsBuffer, 0, params);
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
	 * Set a single cell state
	 */
	setCell(x: number, y: number, state: number): void {
		if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
		const index = x + y * this.width;
		this.pendingPaints.set(index, state);
	}

	/**
	 * Paint cells in a brush area
	 * brushType: 'solid' = all cells at given state, 'gradient' = random states
	 */
	paintBrush(centerX: number, centerY: number, radius: number, state: number, brushType: string = 'solid'): void {
		const HEX_HEIGHT_RATIO = 0.866025404; // sqrt(3)/2
		const isHex = this.rule.neighborhood === 'hexagonal' || this.rule.neighborhood === 'extendedHexagonal';
		const numStates = this.rule.numStates;
		
		if (isHex) {
			// For hexagonal grids, we need to check visual distance
			// using hex center positions
			const brushCenterX = Math.floor(centerX);
			const brushCenterY = Math.floor(centerY);
			
			// Get visual center of brush cell
			const isOddBrush = (brushCenterY & 1) === 1;
			const brushVisualX = brushCenterX + 0.5 + (isOddBrush ? 0.5 : 0);
			const brushVisualY = (brushCenterY + 0.5) * HEX_HEIGHT_RATIO;
			
			// Visual radius (half because hex centers are spaced by 1 in X)
			const visualRadius = radius * 0.5;
			const visualRadiusSq = visualRadius * visualRadius;
			
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
					
					// Calculate visual distance
					const vdx = cellVisualX - brushVisualX;
					const vdy = cellVisualY - brushVisualY;
					const distSq = vdx * vdx + vdy * vdy;
					
					if (distSq <= visualRadiusSq) {
						if (brushType === 'gradient' && state > 0) {
							// Random state from 1 to numStates (alive states only)
							const randomState = Math.floor(Math.random() * numStates) + 1;
							// Clamp to valid range (1 = alive, 2+ = dying states)
							const cellState = Math.min(randomState, numStates);
							this.setCell(cellX, cellY, cellState);
						} else {
							this.setCell(cellX, cellY, state);
						}
					}
				}
			}
		} else {
			// Square grids: simple Euclidean distance in cell coordinates
			const r = Math.floor(radius);
			const brushCenterX = Math.floor(centerX);
			const brushCenterY = Math.floor(centerY);
			
			for (let dy = -r; dy <= r; dy++) {
				for (let dx = -r; dx <= r; dx++) {
					if (dx * dx + dy * dy <= radius * radius) {
						if (brushType === 'gradient' && state > 0) {
							// Random state from 1 to numStates
							const randomState = Math.floor(Math.random() * numStates) + 1;
							const cellState = Math.min(randomState, numStates);
							this.setCell(brushCenterX + dx, brushCenterY + dy, cellState);
						} else {
							this.setCell(brushCenterX + dx, brushCenterY + dy, state);
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
	 * Normalize view offset to stay within one grid period for wrapping boundary modes.
	 * This prevents floating-point precision issues during very long pans.
	 */
	private normalizeOffset(): void {
		const mode = this.view.boundaryMode;
		
		// Check if boundary mode wraps horizontally
		const wrapsX = mode === 'cylinder_h' || mode === 'torus' || mode === 'mobius_h' || 
		               mode === 'klein_h' || mode === 'klein_v' || mode === 'projective';
		// Check if boundary mode wraps vertically
		const wrapsY = mode === 'cylinder_v' || mode === 'torus' || mode === 'mobius_v' || 
		               mode === 'klein_h' || mode === 'klein_v' || mode === 'projective';
		
		// Normalize X offset to [0, width) for wrapping modes
		if (wrapsX) {
			this.view.offsetX = ((this.view.offsetX % this.width) + this.width) % this.width;
		}
		
		// Normalize Y offset to [0, height) for wrapping modes
		if (wrapsY) {
			this.view.offsetY = ((this.view.offsetY % this.height) + this.height) % this.height;
		}
	}

	/**
	 * Reset view to show entire grid, fitting it to the canvas
	 * @param canvasWidth - Canvas width in pixels (optional, uses stored value if not provided)
	 * @param canvasHeight - Canvas height in pixels (optional, uses stored value if not provided)
	 */
	resetView(canvasWidth?: number, canvasHeight?: number): void {
		// Calculate zoom to fit entire grid in view (no padding)
		// zoom = cells visible across the canvas width
		// We need to ensure both dimensions fit
		
		let zoom: number;
		let offsetX = 0;
		let offsetY = 0;
		
		// For hexagonal grids, the visual coordinate system is different:
		// - X: columns with odd rows offset by 0.5
		// - Y: rows * sqrt(3)/2 (rows are closer together)
		// Reference: https://www.redblobgames.com/grids/hexagons/
		const HEX_HEIGHT_RATIO = 0.866025404; // sqrt(3)/2
		const isHex = this.rule.neighborhood === 'hexagonal' || this.rule.neighborhood === 'extendedHexagonal';
		
		// Calculate effective grid dimensions in visual coordinates
		// For hex grids: the visual height is compressed because hex rows overlap
		const effectiveGridWidth = isHex ? this.width + 0.5 : this.width;
		const effectiveGridHeight = isHex ? (this.height + 0.5) * HEX_HEIGHT_RATIO : this.height;
		
		if (canvasWidth && canvasHeight) {
			const canvasAspect = canvasWidth / canvasHeight;
			const gridAspect = effectiveGridWidth / effectiveGridHeight;
			
			if (gridAspect >= canvasAspect) {
				// Grid is wider than canvas (relative to aspect) - fit to width
				zoom = effectiveGridWidth;
			} else {
				// Grid is taller than canvas (relative to aspect) - fit to height
				zoom = effectiveGridHeight * canvasAspect;
			}
			
			// Calculate cells visible in each dimension
			const cellsVisibleX = zoom;
			const cellsVisibleY = zoom / canvasAspect;
			
			// Center the grid: offset so grid is in the middle of visible area
			offsetX = (effectiveGridWidth - cellsVisibleX) / 2;
			offsetY = (effectiveGridHeight - cellsVisibleY) / 2;
		} else {
			// Fallback: assume grid matches canvas aspect, so zoom = width
			zoom = effectiveGridWidth;
		}
		
		this.view = {
			offsetX,
			offsetY,
			zoom,
			showGrid: this.view.showGrid,
			isLightTheme: this.view.isLightTheme,
			aliveColor: this.view.aliveColor,
			brushX: this.view.brushX,
			brushY: this.view.brushY,
			brushRadius: this.view.brushRadius,
			boundaryMode: this.view.boundaryMode,
			spectrumMode: this.view.spectrumMode,
			neighborShading: this.view.neighborShading
		};
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

