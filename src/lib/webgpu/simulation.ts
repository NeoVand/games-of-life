/**
 * Cellular Automaton Simulation Controller
 * Manages WebGPU compute and render pipelines with double-buffering
 */

import type { WebGPUContext } from './context.js';
import type { CARule } from '../utils/rules.js';
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

		// Initialize view centered on grid
		this.view = {
			offsetX: 0,
			offsetY: 0,
			zoom: Math.min(config.width, config.height),
			showGrid: true
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
		this.cellBuffers = [
			this.device.createBuffer({
				label: 'Cell State Buffer A',
				size: cellBufferSize,
				usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
			}),
			this.device.createBuffer({
				label: 'Cell State Buffer B',
				size: cellBufferSize,
				usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
			})
		];

		// Compute params buffer (6 u32 values, padded to 32 bytes)
		this.computeParamsBuffer = this.device.createBuffer({
			label: 'Compute Params Buffer',
			size: 32,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});

		// Render params buffer (12 f32 values = 48 bytes)
		this.renderParamsBuffer = this.device.createBuffer({
			label: 'Render Params Buffer',
			size: 48,
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

	private updateComputeParams(): void {
		const params = new Uint32Array([
			this.width,
			this.height,
			this.rule.birthMask,
			this.rule.surviveMask,
			this.rule.numStates,
			0 // padding
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
			0, // padding
			0,
			0
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
	}

	/**
	 * Randomize the grid
	 */
	randomize(density = 0.25): void {
		const cellCount = this.width * this.height;
		const data = new Uint32Array(cellCount);

		for (let i = 0; i < cellCount; i++) {
			data[i] = Math.random() < density ? 1 : 0;
		}

		const currentBuffer = this.cellBuffers[this.stepCount % 2];
		this.device.queue.writeBuffer(currentBuffer, 0, data);
		this.pendingPaints.clear();
	}

	/**
	 * Update the rule
	 */
	setRule(rule: CARule): void {
		this.rule = rule;
		this.updateComputeParams();
	}

	/**
	 * Get current rule
	 */
	getRule(): CARule {
		return this.rule;
	}

	/**
	 * Update view state
	 */
	setView(view: Partial<ViewState>): void {
		this.view = { ...this.view, ...view };
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

		// Apply zoom
		const newZoom = Math.max(10, Math.min(this.width, this.view.zoom * factor));

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
	 * Reset view to show entire grid
	 */
	resetView(): void {
		this.view = {
			offsetX: 0,
			offsetY: 0,
			zoom: Math.min(this.width, this.height),
			showGrid: this.view.showGrid
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

