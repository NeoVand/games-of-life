<script lang="ts">
	import { onMount } from 'svelte';
	import { initWebGPU, type WebGPUContext, type WebGPUError } from '../webgpu/context.js';
	import { Simulation } from '../webgpu/simulation.js';
	import { getSimulationState, GRID_SCALES, type GridScale } from '../stores/simulation.svelte.js';

	const simState = getSimulationState();

	let canvas: HTMLCanvasElement;
	let container: HTMLDivElement;
	let ctx: WebGPUContext | null = null;
	let simulation: Simulation | null = null;
	let error = $state<WebGPUError | null>(null);

	let canvasWidth = $state(0);
	let canvasHeight = $state(0);

	// Mouse state
	let isDrawing = $state(false);
	let isPanning = $state(false);
	let isShiftHeld = $state(false);
	let mouseInCanvas = $state(false);
	let gridMouseX = $state(0);
	let gridMouseY = $state(0);
	let lastMouseX = 0;
	let lastMouseY = 0;
	let drawingState = 1; // 1 = draw, 0 = erase
	let continuousDrawInterval: ReturnType<typeof setInterval> | null = null;

	// Touch state
	let touchMode: 'none' | 'draw' | 'pan' | 'pinch' = 'none';
	let lastTouchX = 0;
	let lastTouchY = 0;
	let lastPinchDistance = 0;
	let touchStartTime = 0;

	// Animation
	let animationId: number | null = null;
	let lastStepTime = 0;

	// Track orientation for transpose on change
	let lastOrientation: 'portrait' | 'landscape' | null = null;


	/**
	 * Calculate grid dimensions from scale and screen aspect ratio
	 * The baseCells value represents the shorter dimension
	 */
	function calculateGridDimensions(scale: GridScale, screenWidth: number, screenHeight: number): { width: number; height: number } {
		const scaleConfig = GRID_SCALES.find(s => s.name === scale) ?? GRID_SCALES[2]; // Default to medium
		const baseCells = scaleConfig.baseCells;
		
		const aspect = screenWidth / screenHeight;
		
		if (aspect >= 1) {
			// Landscape or square: height is the shorter dimension
			const height = baseCells;
			const width = Math.round(baseCells * aspect);
			return { width, height };
		} else {
			// Portrait: width is the shorter dimension
			const width = baseCells;
			const height = Math.round(baseCells / aspect);
			return { width, height };
		}
	}

	onMount(() => {
		initializeWebGPU();

		// Handle resize
		const resizeObserver = new ResizeObserver(handleResize);
		resizeObserver.observe(container);

		// Handle orientation change - transpose the grid
		function handleOrientationChange() {
			// Small delay to let browser update dimensions
			setTimeout(() => {
				if (!simulation || !ctx || !lastOrientation || !container) return;
				
				const containerWidth = container.clientWidth || window.innerWidth;
				const containerHeight = container.clientHeight || window.innerHeight;
				const currentOrientation = containerWidth >= containerHeight ? 'landscape' : 'portrait';
				
				// Only transpose if orientation actually changed
				if (currentOrientation !== lastOrientation) {
					transposeGrid();
					lastOrientation = currentOrientation;
				}
			}, 150);
		}
		
		window.addEventListener('orientationchange', handleOrientationChange);

		// Add touch event listeners with { passive: false } to allow preventDefault
		canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
		canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
		canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
		canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

		return () => {
			resizeObserver.disconnect();
			window.removeEventListener('orientationchange', handleOrientationChange);
			if (animationId !== null) {
				cancelAnimationFrame(animationId);
			}
			// Stop continuous drawing if active
			stopContinuousDrawing();
			// Remove touch event listeners
			canvas.removeEventListener('touchstart', handleTouchStart);
			canvas.removeEventListener('touchmove', handleTouchMove);
			canvas.removeEventListener('touchend', handleTouchEnd);
			canvas.removeEventListener('touchcancel', handleTouchEnd);
			simulation?.destroy();
		};
	});

	async function initializeWebGPU() {
		const result = await initWebGPU(canvas);

		if (!result.ok) {
			error = result.error;
			return;
		}

		ctx = result.value;
		
		// Calculate initial grid size based on CONTAINER dimensions (not window)
		// The container is the actual visible canvas area, excluding toolbar etc.
		const containerWidth = container.clientWidth || window.innerWidth;
		const containerHeight = container.clientHeight || window.innerHeight;
		
		// Remember current orientation
		lastOrientation = containerWidth >= containerHeight ? 'landscape' : 'portrait';
		
		const { width, height } = calculateGridDimensions(simState.gridScale, containerWidth, containerHeight);
		simState.gridWidth = width;
		simState.gridHeight = height;
		
		simulation = new Simulation(ctx, {
			width,
			height,
			rule: simState.currentRule
		});

		// Initial randomization for visual appeal
		simulation.randomize(0.15);
		
		// Note: We don't call resetView here because the grid was created with
		// dimensions matching the container aspect ratio. The initial view state
		// in Simulation constructor (zoom = min(width, height), offset = 0,0)
		// already shows the grid filling the canvas correctly.
		// Calling resetView would add unnecessary padding.

		// Start animation loop
		animationLoop(performance.now());
	}

	function handleResize(entries: ResizeObserverEntry[]) {
		const entry = entries[0];
		if (!entry) return;

		const { width, height } = entry.contentRect;
		const dpr = window.devicePixelRatio || 1;

		canvasWidth = Math.floor(width * dpr);
		canvasHeight = Math.floor(height * dpr);

		canvas.width = canvasWidth;
		canvas.height = canvasHeight;

		if (ctx) {
			ctx.context.configure({
				device: ctx.device,
				format: ctx.format,
				alphaMode: 'premultiplied'
			});
		}
	}

	function animationLoop(timestamp: number) {
		animationId = requestAnimationFrame(animationLoop);

		if (!simulation || canvasWidth === 0 || canvasHeight === 0) return;

		// Run simulation steps if playing
		if (simState.isPlaying) {
			const stepInterval = 1000 / simState.speed;
			if (timestamp - lastStepTime >= stepInterval) {
				simulation.step();
				simState.incrementGeneration();
				lastStepTime = timestamp;
			}
		}

		// Sync view state including brush preview
		const showBrush = mouseInCanvas && !isShiftHeld && !isPanning;
		simulation.setView({
			showGrid: simState.showGrid,
			isLightTheme: simState.isLightTheme,
			aliveColor: simState.aliveColor,
			brushX: showBrush ? gridMouseX : -1000,
			brushY: showBrush ? gridMouseY : -1000,
			brushRadius: showBrush ? simState.brushSize : -1,
			wrapBoundary: simState.wrapBoundary
		});

		// Always render
		simulation.render(canvasWidth, canvasHeight);

		// Update alive cells count (sync version for display)
		simState.aliveCells = simulation.countAliveCells();
	}

	// Track previous playing state to trigger count update when paused
	let wasPlaying = false;
	$effect(() => {
		if (wasPlaying && !simState.isPlaying && simulation) {
			// Just paused - get accurate count from GPU
			simulation.countAliveCellsAsync().then(count => {
				simState.aliveCells = count;
			});
		}
		wasPlaying = simState.isPlaying;
	});

	// Keyboard handlers for shift key
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Shift') {
			isShiftHeld = true;
		}
	}

	function handleKeyUp(e: KeyboardEvent) {
		if (e.key === 'Shift') {
			isShiftHeld = false;
			if (!isPanning) {
				// Reset cursor if not actively panning
			}
		}
	}

	// Start continuous drawing interval
	function startContinuousDrawing() {
		if (continuousDrawInterval) return;
		
		continuousDrawInterval = setInterval(() => {
			if (!simulation || !isDrawing) return;
			simulation.paintBrush(gridMouseX, gridMouseY, simState.brushSize, drawingState);
		}, 50); // Draw every 50ms (20 times per second)
	}

	// Stop continuous drawing interval
	function stopContinuousDrawing() {
		if (continuousDrawInterval) {
			clearInterval(continuousDrawInterval);
			continuousDrawInterval = null;
		}
	}

	// Mouse event handlers
	function handleMouseDown(e: MouseEvent) {
		if (!simulation) return;

		const rect = canvas.getBoundingClientRect();
		const x = (e.clientX - rect.left) * (canvasWidth / rect.width);
		const y = (e.clientY - rect.top) * (canvasHeight / rect.height);

		lastMouseX = e.clientX;
		lastMouseY = e.clientY;

		// Middle mouse button or shift+left = pan
		if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
			isPanning = true;
			e.preventDefault();
			return;
		}

		// Left click = draw, right click = erase
		if (e.button === 0 || e.button === 2) {
			isDrawing = true;
			drawingState = e.button === 0 ? simState.brushState : 0;
			const gridPos = simulation.screenToGrid(x, y, canvasWidth, canvasHeight);
			gridMouseX = gridPos.x;
			gridMouseY = gridPos.y;
			simulation.paintBrush(gridPos.x, gridPos.y, simState.brushSize, drawingState);
			
			// Start continuous drawing for hold-to-draw
			startContinuousDrawing();
		}
	}

	function handleMouseMove(e: MouseEvent) {
		if (!simulation) return;

		const rect = canvas.getBoundingClientRect();
		const x = (e.clientX - rect.left) * (canvasWidth / rect.width);
		const y = (e.clientY - rect.top) * (canvasHeight / rect.height);

		// Update grid mouse position for brush preview
		const gridPos = simulation.screenToGrid(x, y, canvasWidth, canvasHeight);
		gridMouseX = gridPos.x;
		gridMouseY = gridPos.y;

		if (isPanning) {
			const deltaX = e.clientX - lastMouseX;
			const deltaY = e.clientY - lastMouseY;
			simulation.pan(deltaX, deltaY, rect.width, rect.height);
			lastMouseX = e.clientX;
			lastMouseY = e.clientY;
			return;
		}

		if (isDrawing) {
			// Paint immediately on move (in addition to continuous interval)
			simulation.paintBrush(gridPos.x, gridPos.y, simState.brushSize, drawingState);
		}
	}

	function handleMouseUp() {
		stopContinuousDrawing();
		
		if (isDrawing && simulation && !simState.isPlaying) {
			// After painting while paused, update the count
			simulation.countAliveCellsAsync().then(count => {
				simState.aliveCells = count;
			});
		}
		isDrawing = false;
		isPanning = false;
	}

	function handleMouseEnter() {
		mouseInCanvas = true;
	}

	function handleMouseLeave() {
		mouseInCanvas = false;
		stopContinuousDrawing();
		isDrawing = false;
		isPanning = false;
	}

	function handleWheel(e: WheelEvent) {
		if (!simulation) return;
		e.preventDefault();

		const rect = canvas.getBoundingClientRect();
		const x = (e.clientX - rect.left) * (canvasWidth / rect.width);
		const y = (e.clientY - rect.top) * (canvasHeight / rect.height);

		// Zoom factor
		const factor = e.deltaY > 0 ? 1.1 : 0.9;
		simulation.zoomAt(x, y, canvasWidth, canvasHeight, factor);
	}

	function handleContextMenu(e: MouseEvent) {
		e.preventDefault();
	}

	// Touch event handlers
	function getTouchDistance(touches: TouchList): number {
		if (touches.length < 2) return 0;
		const dx = touches[0].clientX - touches[1].clientX;
		const dy = touches[0].clientY - touches[1].clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	function getTouchCenter(touches: TouchList): { x: number; y: number } {
		if (touches.length < 2) {
			return { x: touches[0].clientX, y: touches[0].clientY };
		}
		return {
			x: (touches[0].clientX + touches[1].clientX) / 2,
			y: (touches[0].clientY + touches[1].clientY) / 2
		};
	}

	function handleTouchStart(e: TouchEvent) {
		if (!simulation) return;
		e.preventDefault();

		const touches = e.touches;
		touchStartTime = performance.now();

		if (touches.length === 1) {
			// Single touch - start drawing
			touchMode = 'draw';
			const touch = touches[0];
			const rect = canvas.getBoundingClientRect();
			const x = (touch.clientX - rect.left) * (canvasWidth / rect.width);
			const y = (touch.clientY - rect.top) * (canvasHeight / rect.height);
			
			lastTouchX = touch.clientX;
			lastTouchY = touch.clientY;

			const gridPos = simulation.screenToGrid(x, y, canvasWidth, canvasHeight);
			gridMouseX = gridPos.x;
			gridMouseY = gridPos.y;
			drawingState = simState.brushState; // Use current brush state for touch
			simulation.paintBrush(gridPos.x, gridPos.y, simState.brushSize, drawingState);
			
			// Start continuous drawing for hold-to-draw on touch
			startContinuousDrawing();
		} else if (touches.length === 2) {
			// Two fingers - start pinch/pan, stop drawing
			stopContinuousDrawing();
			touchMode = 'pinch';
			lastPinchDistance = getTouchDistance(touches);
			const center = getTouchCenter(touches);
			lastTouchX = center.x;
			lastTouchY = center.y;
		}
	}

	function handleTouchMove(e: TouchEvent) {
		if (!simulation) return;
		e.preventDefault();

		const touches = e.touches;
		const rect = canvas.getBoundingClientRect();

		if (touches.length === 1 && touchMode === 'draw') {
			// Single finger drawing
			const touch = touches[0];
			const x = (touch.clientX - rect.left) * (canvasWidth / rect.width);
			const y = (touch.clientY - rect.top) * (canvasHeight / rect.height);

			const gridPos = simulation.screenToGrid(x, y, canvasWidth, canvasHeight);
			gridMouseX = gridPos.x;
			gridMouseY = gridPos.y;
			simulation.paintBrush(gridPos.x, gridPos.y, simState.brushSize, simState.brushState);
			
			lastTouchX = touch.clientX;
			lastTouchY = touch.clientY;
		} else if (touches.length === 2 && touchMode === 'pinch') {
			// Two finger pinch zoom and pan
			const currentDistance = getTouchDistance(touches);
			const center = getTouchCenter(touches);

			// Zoom
			if (lastPinchDistance > 0) {
				const zoomFactor = lastPinchDistance / currentDistance;
				const screenX = (center.x - rect.left) * (canvasWidth / rect.width);
				const screenY = (center.y - rect.top) * (canvasHeight / rect.height);
				simulation.zoomAt(screenX, screenY, canvasWidth, canvasHeight, zoomFactor);
			}

			// Pan
			const deltaX = center.x - lastTouchX;
			const deltaY = center.y - lastTouchY;
			simulation.pan(deltaX, deltaY, rect.width, rect.height);

			lastPinchDistance = currentDistance;
			lastTouchX = center.x;
			lastTouchY = center.y;
		} else if (touches.length === 1 && touchMode === 'pinch') {
			// Went from 2 fingers to 1 - switch to pan mode
			touchMode = 'pan';
			const touch = touches[0];
			lastTouchX = touch.clientX;
			lastTouchY = touch.clientY;
		} else if (touches.length === 1 && touchMode === 'pan') {
			// Single finger panning (after pinch)
			const touch = touches[0];
			const deltaX = touch.clientX - lastTouchX;
			const deltaY = touch.clientY - lastTouchY;
			simulation.pan(deltaX, deltaY, rect.width, rect.height);
			lastTouchX = touch.clientX;
			lastTouchY = touch.clientY;
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (!simulation) return;
		e.preventDefault();

		const touches = e.touches;

		if (touches.length === 0) {
			// All fingers lifted
			stopContinuousDrawing();
			if (touchMode === 'draw' && !simState.isPlaying) {
				// After drawing while paused, update the count
				simulation.countAliveCellsAsync().then(count => {
					simState.aliveCells = count;
				});
			}
			touchMode = 'none';
			lastPinchDistance = 0;
		} else if (touches.length === 1 && touchMode === 'pinch') {
			// Went from 2 to 1 finger - continue as pan
			touchMode = 'pan';
			const touch = touches[0];
			lastTouchX = touch.clientX;
			lastTouchY = touch.clientY;
		}
	}

	// Expose simulation methods
	export function clear() {
		if (!simulation) return;
		simulation.clear();
		simState.resetGeneration();
		simState.aliveCells = 0;
	}

	export function randomize(density: number = 0.15) {
		if (!simulation) return;
		simulation.randomize(density);
		simState.resetGeneration();
		// Randomize already sets _aliveCells, but do async count for accuracy
		simulation.countAliveCellsAsync().then(count => {
			simState.aliveCells = count;
		});
	}

	export function initialize(type: string, options?: { density?: number; tiled?: boolean; spacing?: number }) {
		if (!simulation) return;
		
		// Clear first
		simulation.clear();
		simState.resetGeneration();
		
		// Handle random types
		if (type.startsWith('random')) {
			const d = options?.density ?? 0.15;
			simulation.randomize(d);
			return;
		}

		// Define patterns (relative to center)
		const patterns: Record<string, [number, number][]> = {
			// Conway's Life patterns
			'glider': [[0, -1], [1, 0], [-1, 1], [0, 1], [1, 1]],
			'lwss': [[-2, -1], [-2, 1], [-1, -2], [0, -2], [1, -2], [2, -2], [2, -1], [2, 0], [1, 1]],
			'r-pentomino': [[0, -1], [1, -1], [-1, 0], [0, 0], [0, 1]],
			'acorn': [[-3, 0], [-2, 0], [-2, -2], [0, -1], [1, 0], [2, 0], [3, 0]],
			'diehard': [[-3, 0], [-2, 0], [-2, 1], [2, 1], [3, -1], [3, 1], [4, 1]],
			'blinker': [[-1, 0], [0, 0], [1, 0]],
			'toad': [[-1, 0], [0, 0], [1, 0], [0, 1], [1, 1], [2, 1]],
			'beacon': [[-1, -1], [0, -1], [-1, 0], [1, 1], [2, 0], [2, 1]],
			'block': [[0, 0], [1, 0], [0, 1], [1, 1]],
			'beehive': [[-1, 0], [0, -1], [1, -1], [2, 0], [1, 1], [0, 1]],
			'loaf': [[0, -1], [1, -1], [-1, 0], [2, 0], [0, 1], [2, 1], [1, 2]],
			'boat': [[0, 0], [1, 0], [0, 1], [2, 1], [1, 2]],
			'pulsar': [
				[-6, -4], [-6, -3], [-6, -2], [-4, -6], [-3, -6], [-2, -6],
				[-6, 2], [-6, 3], [-6, 4], [-4, 6], [-3, 6], [-2, 6],
				[6, -4], [6, -3], [6, -2], [4, -6], [3, -6], [2, -6],
				[6, 2], [6, 3], [6, 4], [4, 6], [3, 6], [2, 6],
				[-1, -4], [-1, -3], [-1, -2], [1, -4], [1, -3], [1, -2],
				[-1, 2], [-1, 3], [-1, 4], [1, 2], [1, 3], [1, 4],
				[-4, -1], [-3, -1], [-2, -1], [-4, 1], [-3, 1], [-2, 1],
				[4, -1], [3, -1], [2, -1], [4, 1], [3, 1], [2, 1]
			],
			'pentadecathlon': [
				[-4, 0], [-3, -1], [-3, 1], [-2, 0], [-1, 0], [0, 0], [1, 0],
				[2, 0], [3, -1], [3, 1], [4, 0]
			],
			'glider-gun': [
				[-18, 0], [-18, 1], [-17, 0], [-17, 1],
				[-8, 0], [-8, 1], [-8, 2], [-7, -1], [-7, 3], [-6, -2], [-6, 4],
				[-5, -2], [-5, 4], [-4, 1], [-3, -1], [-3, 3], [-2, 0], [-2, 1], [-2, 2],
				[-1, 1],
				[2, -2], [2, -1], [2, 0], [3, -2], [3, -1], [3, 0], [4, -3], [4, 1],
				[6, -4], [6, -3], [6, 1], [6, 2],
				[16, -2], [16, -1], [17, -2], [17, -1]
			],
			// HighLife patterns
			'replicator': [[0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]],
			// Day & Night patterns
			'dn-glider': [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [1, 2]],
			'dn-blinker': [[-1, 0], [0, 0], [1, 0]],
			'dn-ship': [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
			// Brian's Brain patterns
			'bb-glider': [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]]
		};

		const pattern = patterns[type];
		if (!pattern) return;

		const gridW = simState.gridWidth;
		const gridH = simState.gridHeight;
		let aliveCells = 0;

		if (options?.tiled && options.spacing) {
			// Tile the pattern across the grid
			// spacing is the actual cell distance on the grid
			const spacing = options.spacing;
			
			for (let ty = Math.floor(spacing / 2); ty < gridH; ty += spacing) {
				for (let tx = Math.floor(spacing / 2); tx < gridW; tx += spacing) {
					for (const [dx, dy] of pattern) {
						const x = tx + dx;
						const y = ty + dy;
						if (x >= 0 && x < gridW && y >= 0 && y < gridH) {
							simulation.setCell(x, y, 1);
							aliveCells++;
						}
					}
				}
			}
		} else {
			// Single pattern in center
			const cx = Math.floor(gridW / 2);
			const cy = Math.floor(gridH / 2);
			for (const [dx, dy] of pattern) {
				const x = cx + dx;
				const y = cy + dy;
				if (x >= 0 && x < gridW && y >= 0 && y < gridH) {
					simulation.setCell(x, y, 1);
					aliveCells++;
				}
			}
		}

		// Update the alive cells count
		simulation.updateAliveCellsCount(aliveCells);
		
		// Also do an async count to ensure accuracy after GPU operations settle
		simulation.countAliveCellsAsync().then(count => {
			simState.aliveCells = count;
		});
	}

	export function stepOnce() {
		if (!simulation) return;
		simulation.step();
		simState.incrementGeneration();
		// Update alive cells count after step
		simulation.countAliveCellsAsync().then(count => {
			simState.aliveCells = count;
		});
	}

	export function resetView() {
		simulation?.resetView(canvasWidth, canvasHeight);
	}

	/**
	 * Transpose the grid (swap width and height, rotate cell positions)
	 * Used when device orientation changes
	 */
	async function transposeGrid() {
		if (!simulation || !ctx) return;
		
		const { width: oldWidth, height: oldHeight } = simulation.getDimensions();
		
		// Get current cell data
		const oldData = await simulation.getCellDataAsync();
		
		// Create transposed data (swap x and y)
		const newWidth = oldHeight;
		const newHeight = oldWidth;
		const newData = new Uint32Array(newWidth * newHeight);
		
		for (let y = 0; y < oldHeight; y++) {
			for (let x = 0; x < oldWidth; x++) {
				const oldIndex = x + y * oldWidth;
				// Transpose: new position is (y, x) instead of (x, y)
				const newIndex = y + x * newWidth;
				newData[newIndex] = oldData[oldIndex];
			}
		}
		
		// Update store dimensions
		simState.gridWidth = newWidth;
		simState.gridHeight = newHeight;
		
		// Recreate simulation with new dimensions
		const currentRule = simulation.getRule();
		const currentView = simulation.getView();
		simulation.destroy();
		
		simulation = new Simulation(ctx, {
			width: newWidth,
			height: newHeight,
			rule: currentRule
		});
		
		// Load the transposed data
		simulation.setCellData(newData);
		
		// Restore view settings
		simulation.setView({
			showGrid: currentView.showGrid,
			isLightTheme: currentView.isLightTheme,
			aliveColor: currentView.aliveColor,
			wrapBoundary: currentView.wrapBoundary
		});
		
		// Use current actual canvas dimensions for reset view
		// The canvas dimensions should have been updated by the resize observer
		const dpr = window.devicePixelRatio || 1;
		const actualWidth = Math.floor(container.clientWidth * dpr);
		const actualHeight = Math.floor(container.clientHeight * dpr);
		simulation.resetView(actualWidth, actualHeight);
	}

	export function updateRule() {
		simulation?.setRule(simState.currentRule);
	}

	export function getSimulation(): Simulation | null {
		return simulation;
	}

	export function screenshot() {
		if (!canvas) return;
		
		// Create a link and trigger download
		const link = document.createElement('a');
		link.download = `cellular-automaton-gen${simState.generation}.png`;
		link.href = canvas.toDataURL('image/png');
		link.click();
	}

	export function resize(width: number, height: number) {
		if (!ctx || !simulation) return;
		
		// Update store
		simState.gridWidth = width;
		simState.gridHeight = height;
		
		// Recreate simulation with new size
		simulation.destroy();
		simulation = new Simulation(ctx, {
			width,
			height,
			rule: simState.currentRule
		});
		simulation.randomize(0.15);
		simState.resetGeneration();
		
		// Update alive cells count
		simulation.countAliveCellsAsync().then(count => {
			simState.aliveCells = count;
		});
	}
	
	export function setScale(scale: GridScale) {
		if (!ctx || !simulation) return;
		
		// Calculate new dimensions based on container size (not window)
		const containerWidth = container.clientWidth || window.innerWidth;
		const containerHeight = container.clientHeight || window.innerHeight;
		const { width, height } = calculateGridDimensions(scale, containerWidth, containerHeight);
		
		// Update store
		simState.gridScale = scale;
		simState.gridWidth = width;
		simState.gridHeight = height;
		
		// Recreate simulation with new size
		simulation.destroy();
		simulation = new Simulation(ctx, {
			width,
			height,
			rule: simState.currentRule
		});
		simulation.randomize(0.15);
		simState.resetGeneration();
		
		// Reset view to fit the new grid
		simulation.resetView(canvasWidth, canvasHeight);
		
		// Update alive cells count
		simulation.countAliveCellsAsync().then(count => {
			simState.aliveCells = count;
		});
	}
</script>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<div class="canvas-container" bind:this={container}>
	{#if error}
		<div class="error">
			<div class="error-icon">⚠️</div>
			<h2>WebGPU Not Available</h2>
			<p>{error.message}</p>
			<p class="hint">
				Try using a recent version of Chrome, Edge, Safari, or Firefox.
			</p>
		</div>
	{/if}
	<canvas
		bind:this={canvas}
		onmousedown={handleMouseDown}
		onmousemove={handleMouseMove}
		onmouseup={handleMouseUp}
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
		onwheel={handleWheel}
		oncontextmenu={handleContextMenu}
		class:hidden={!!error}
		class:panning={isPanning}
		class:pan-ready={isShiftHeld && !isPanning}
	></canvas>
</div>

<style>
	.canvas-container {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: #0d0d12;
	}

	canvas {
		width: 100%;
		height: 100%;
		display: block;
		cursor: crosshair;
		touch-action: none; /* Prevent default touch behaviors */
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
	}

	canvas.pan-ready {
		cursor: grab;
	}

	canvas.panning {
		cursor: grabbing;
	}

	canvas.hidden {
		display: none;
	}

	.error {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: #e0e0e0;
		text-align: center;
		padding: 2rem;
	}

	.error-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}

	.error h2 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 1rem;
		color: #ff6b6b;
	}

	.error p {
		margin: 0.5rem 0;
		max-width: 500px;
		line-height: 1.6;
	}

	.error .hint {
		color: #888;
		font-size: 0.9rem;
	}
</style>
