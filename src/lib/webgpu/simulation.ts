/**
 * Cellular Automaton Simulation Controller
 * Manages WebGPU compute and render pipelines with double-buffering
 */

import type { WebGPUContext } from './context.js';
import type { CARule, NeighborhoodType } from '../utils/rules.js';
import { getDefaultRule } from '../utils/rules.js';

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
	wrapBoundary: boolean; // true = toroidal, false = fixed edges
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
			wrapBoundary: true // Default to toroidal wrapping
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
			size: 32,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});

		// Render params buffer (16 f32 values = 64 bytes)
		this.renderParamsBuffer = this.device.createBuffer({
			label: 'Render Params Buffer',
			size: 64,
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
			default: return 0; // moore
		}
	}

	private updateComputeParams(): void {
		const params = new Uint32Array([
			this.width,
			this.height,
			this.rule.birthMask,
			this.rule.surviveMask,
			this.rule.numStates,
			this.view.wrapBoundary ? 1 : 0,
			this.getNeighborhoodIndex(),
			0 // padding for 16-byte alignment
		]);
		this.device.queue.writeBuffer(this.computeParamsBuffer, 0, params);
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
			this.view.brushRadius
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
	 */
	paintBrush(centerX: number, centerY: number, radius: number, state: number): void {
		const r = Math.floor(radius);
		for (let dy = -r; dy <= r; dy++) {
			for (let dx = -r; dx <= r; dx++) {
				if (dx * dx + dy * dy <= radius * radius) {
					this.setCell(Math.floor(centerX) + dx, Math.floor(centerY) + dy, state);
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
	 */
	randomize(density = 0.25): void {
		const cellCount = this.width * this.height;
		const data = new Uint32Array(cellCount);
		let alive = 0;

		for (let i = 0; i < cellCount; i++) {
			const isAlive = Math.random() < density ? 1 : 0;
			data[i] = isAlive;
			if (isAlive) alive++;
		}

		this._aliveCells = alive;
		const currentBuffer = this.cellBuffers[this.stepCount % 2];
		this.device.queue.writeBuffer(currentBuffer, 0, data);
		this.pendingPaints.clear();
	}

	/**
	 * Continuous seeding - add random live cells to keep simulation active
	 * @param rate - Seeds per 1000 cells per call (0.01 - 1.0)
	 */
	continuousSeed(rate: number): void {
		// Calculate probability per cell based on rate
		// rate of 0.1 = 0.1 seeds per 1000 cells = 0.0001 probability per cell
		const probability = rate / 10000;
		
		// Randomly seed some cells
		const cellCount = this.width * this.height;
		for (let i = 0; i < cellCount; i++) {
			if (Math.random() < probability) {
				const x = i % this.width;
				const y = Math.floor(i / this.width);
				// Use pendingPaints to add new cells (only if dead)
				const key = y * this.width + x;
				if (!this.pendingPaints.has(key)) {
					this.pendingPaints.set(key, 1); // Set to alive
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
		const boundaryChanged = view.wrapBoundary !== undefined && view.wrapBoundary !== this.view.wrapBoundary;
		this.view = { ...this.view, ...view };
		
		// If boundary mode changed, update compute params
		if (boundaryChanged) {
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
	 * Convert screen coordinates to grid coordinates
	 */
	screenToGrid(
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
	 * Zoom at a specific point
	 */
	zoomAt(
		screenX: number,
		screenY: number,
		canvasWidth: number,
		canvasHeight: number,
		factor: number
	): void {
		// Get grid position before zoom
		const gridPos = this.screenToGrid(screenX, screenY, canvasWidth, canvasHeight);

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
		
		if (canvasWidth && canvasHeight) {
			const canvasAspect = canvasWidth / canvasHeight;
			const gridAspect = this.width / this.height;
			
			if (gridAspect >= canvasAspect) {
				// Grid is wider than canvas (relative to aspect) - fit to width
				zoom = this.width;
			} else {
				// Grid is taller than canvas (relative to aspect) - fit to height
				// zoom / canvasAspect = this.height => zoom = this.height * canvasAspect
				zoom = this.height * canvasAspect;
			}
			
			// Calculate cells visible in each dimension
			const cellsVisibleX = zoom;
			const cellsVisibleY = zoom / canvasAspect;
			
			// Center the grid: offset so grid is in the middle of visible area
			offsetX = (this.width - cellsVisibleX) / 2;
			offsetY = (this.height - cellsVisibleY) / 2;
		} else {
			// Fallback: assume grid matches canvas aspect, so zoom = width
			zoom = this.width;
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
			wrapBoundary: this.view.wrapBoundary
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

