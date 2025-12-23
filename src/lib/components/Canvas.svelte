<script lang="ts">
	import { onMount } from 'svelte';
	import { initWebGPU, type WebGPUContext, type WebGPUError } from '@games-of-life/webgpu';
	import { Simulation } from '@games-of-life/webgpu';
	import { getSimulationState, getUIState, GRID_SCALES, type GridScale, type SpectrumMode, type BrushShape, setSimulationRef, wasBrushEditorSnapshotTaken, markBrushEditorSnapshotTaken, markBrushEditorEdited } from '../stores/simulation.svelte.js';
	import { addSnapshotWithBefore, resetHistory } from '../stores/history.js';
	import { isTourActive } from '../utils/tour.js';
	import { isModalOpen } from '../stores/modalManager.svelte.js';
	import { brushShapeToIndex, spectrumModeToIndex } from '@games-of-life/core';
	import { initializeAudio, getAudioState, updateAudio, updateAudioSimulation } from '../stores/audio.svelte.js';

	const simState = getSimulationState();
	const uiState = getUIState();
	const audioState = getAudioState();
	
	// Convert spectrum mode string to number for shader
	function getSpectrumModeIndex(mode: SpectrumMode): number {
		return spectrumModeToIndex(mode);
	}
	
	// Convert neighbor shading mode string to number for shader
	function getNeighborShadingIndex(mode: string): number {
		if (mode === 'off') return 0;
		if (mode === 'alive') return 1;
		if (mode === 'vitality') return 2;
		return 0;
	}

	// Convert brush shape string to number for shader
	// Must match order in BRUSH_SHAPES and shader is_in_brush function
	function getBrushShapeIndex(shape: BrushShape): number {
		return brushShapeToIndex(shape);
	}

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
	let mouseInCanvas = $state(false);
	let gridMouseX = $state(0);
	let gridMouseY = $state(0);
	let lastMouseX = 0;
	let lastMouseY = 0;
	let drawingState = 1; // 1 = draw, 0 = erase
	let continuousDrawInterval: ReturnType<typeof setInterval> | null = null;
let strokeTracked = false;
let pendingStrokeBefore: Promise<Uint32Array> | null = null;
	function capturePreStroke() {
		if (!simulation) return;
		if (!pendingStrokeBefore) {
			// Start capture asynchronously; we'll await when finishing the stroke
			pendingStrokeBefore = simulation.getCellDataAsync().catch(() => null as unknown as Uint32Array);
		}
	}
	
	// Effective tool mode: pan if pan mode selected OR space is held
	const effectiveToolMode = $derived(simState.isSpaceHeld ? 'pan' : simState.toolMode);

	function ensureBrushEditorSnapshot() {
		if (isModalOpen('brushEditor') && simulation && !wasBrushEditorSnapshotTaken()) {
			simulation.snapshotUndo().catch(() => {});
			markBrushEditorSnapshotTaken();
		}
	}

	// Get brush configuration for painting
	function getBrushConfig() {
		return {
			shape: simState.brushShape,
			rotation: simState.brushRotation,
			density: simState.brushDensity,
			intensity: simState.brushIntensity,
			aspectRatio: simState.brushAspectRatio,
			// Text brush options
			text: simState.brushText,
			textFont: simState.brushTextFont,
			textBold: simState.brushTextBold,
			textItalic: simState.brushTextItalic
		};
	}

	// Touch state
	let touchMode: 'none' | 'draw' | 'pan' | 'pinch' = 'none';
	let lastTouchX = 0;
	let lastTouchY = 0;
	let lastPinchDistance = 0;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for long-press detection
	let touchStartTime = 0;

	// Animation
	let animationId: number | null = null;
	let lastFrameTime = 0;
	let simAccMs = 0;



	/**
	 * Get the actual visible viewport dimensions
	 * Uses visualViewport API on mobile for accurate dimensions that account for browser UI
	 */
	function getVisibleViewportSize(): { width: number; height: number } {
		// On mobile, visualViewport gives the actual visible area excluding browser UI
		if (window.visualViewport) {
			return {
				width: window.visualViewport.width,
				height: window.visualViewport.height
			};
		}
		// Fallback to container dimensions, then window
		if (container && container.clientWidth > 0 && container.clientHeight > 0) {
			return {
				width: container.clientWidth,
				height: container.clientHeight
			};
		}
		return {
			width: window.innerWidth,
			height: window.innerHeight
		};
	}

	/**
	 * Calculate grid dimensions from scale.
	 * Grids are now always square - seamless panning handles filling any screen aspect ratio.
	 * For hexagonal grids, we add extra rows to compensate for visual compression.
	 * IMPORTANT: Hex grid height must be EVEN for proper torus wrapping (row parity must match at boundaries).
	 */
	function calculateGridDimensions(scale: GridScale, _screenWidth: number, _screenHeight: number, isHexagonal: boolean = false): { width: number; height: number } {
		const scaleConfig = GRID_SCALES.find(s => s.name === scale) ?? GRID_SCALES[2]; // Default to medium
		const size = scaleConfig.baseCells;
		
		// For hexagonal grids, rows are visually compressed by sqrt(3)/2 ≈ 0.866
		// So we need ~15.5% more rows to fill the same visual height as width
		// This keeps the VISUAL aspect ratio close to square
		const HEX_HEIGHT_RATIO = 0.866025404; // sqrt(3)/2
		let height = isHexagonal ? Math.round(size / HEX_HEIGHT_RATIO) : size;
		
		// CRITICAL: For hex grids, height must be EVEN for proper torus boundary wrapping.
		// In odd-r hex layout, row parity determines neighbor offsets. When wrapping vertically,
		// row -1 (conceptually odd) must wrap to row height-1 (also odd) for correct neighbors.
		// This only works if height is even: row 0=even, row height-1=odd.
		if (isHexagonal && (height & 1) === 1) {
			height += 1; // Make it even
		}
		
		return { width: size, height };
	}

	onMount(() => {
		initializeWebGPU();

		// Handle resize
		const resizeObserver = new ResizeObserver(handleResize);
		resizeObserver.observe(container);

		// Orientation change is handled automatically:
		// - ResizeObserver updates canvas dimensions
		// - Seamless panning fills any viewport shape
		// - View (zoom, offset) stays the same, keeping center point stable
		// No special handling needed!

		// Add touch event listeners with { passive: false } to allow preventDefault
		canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
		canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
		canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
		canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

		return () => {
			resizeObserver.disconnect();
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
			setSimulationRef(null);
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
		
		// Calculate initial grid size based on actual visible viewport
		// Uses visualViewport API on mobile for accurate dimensions
		const viewport = getVisibleViewportSize();
		
		const isHex = simState.currentRule.neighborhood === 'hexagonal' || simState.currentRule.neighborhood === 'extendedHexagonal';
		const { width, height } = calculateGridDimensions(simState.gridScale, viewport.width, viewport.height, isHex);
		simState.gridWidth = width;
		simState.gridHeight = height;
		
		simulation = new Simulation(ctx, {
			width,
			height,
			rule: simState.currentRule
		});
		setSimulationRef(simulation);
		await resetHistory(simulation);

		// Initialize audio engine (won't start playing until user enables it)
		try {
			await initializeAudio(ctx.device, simulation);
		} catch (e) {
			console.warn('Audio initialization failed:', e);
		}

		// Apply the selected initialization method
		applyLastInitialization();
		
		// Use viewport dimensions since canvas may not be sized yet
		const dpr = window.devicePixelRatio || 1;
		const initialCanvasWidth = viewport.width * dpr;
		const initialCanvasHeight = viewport.height * dpr;
		
		// Set view to fit the grid (no zoom animation)
		simulation.resetView(initialCanvasWidth, initialCanvasHeight, false);
		
		// Start animation loop
		animationLoop(performance.now());
		
		// Start axis grow animation after a brief delay (only if axes are enabled)
		setTimeout(() => {
			if (simulation && simState.showAxes) {
				simulation.startAxisAnimation(true, 600); // Grow axes from center
			}
		}, 100);
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

		// Update view animation (smooth transitions for fit-to-screen, etc.)
		simulation.updateViewAnimation();
		
		// Check if axes visibility changed and trigger axis animation
		if (lastShowAxesState !== null && lastShowAxesState !== simState.showAxes) {
			simulation.startAxisAnimation(simState.showAxes, 400);
		}
		lastShowAxesState = simState.showAxes;
		
		// Update axis animation (grow/shrink from center)
		simulation.updateAxisAnimation();

		// Run simulation steps if playing
		if (simState.isPlaying) {
			const stepMs = 1000 / Math.max(1, simState.speed);

			// Accumulate time since last frame (clamped to avoid massive catch-up).
			if (lastFrameTime === 0) lastFrameTime = timestamp;
			let frameDt = timestamp - lastFrameTime;
			lastFrameTime = timestamp;
			frameDt = Math.min(frameDt, 50);
			simAccMs += frameDt;

			// Keep the UI smooth by giving stepping a time budget each frame.
			const frameStart = performance.now();
			const stepBudgetMs = 6;
			const hardMaxStepsPerFrame = 64;

			let stepsRan = 0;
			while (simAccMs >= stepMs && stepsRan < hardMaxStepsPerFrame) {
				if (simState.seedingEnabled && simState.seedingRate > 0) {
					simulation.continuousSeed(simState.seedingRate, simState.seedPattern, simState.seedAlive);
				}
				simulation.step();
				simAccMs -= stepMs;
				stepsRan++;

				if (performance.now() - frameStart > stepBudgetMs) break;
			}

			if (stepsRan > 0) simState.incrementGenerationBy(stepsRan);
		} else {
			// Prevent a giant catch-up when resuming play.
			lastFrameTime = 0;
			simAccMs = 0;
		}

		// Sync view state including brush preview
		// Hide brush during recording for clean video capture
		const brushEditorOpen = isModalOpen('brushEditor');
		const showBrush = !isRecording && ((mouseInCanvas && effectiveToolMode === 'brush' && !isPanning) || uiState.showBrushPopup || brushEditorOpen);
		// When brush popup/modal is open and mouse not in canvas, show brush at center of grid
		const brushPopupOrModalOpen = uiState.showBrushPopup || brushEditorOpen;
		const brushX = brushPopupOrModalOpen && !mouseInCanvas 
			? Math.floor(simState.gridWidth / 2) 
			: gridMouseX;
		const brushY = brushPopupOrModalOpen && !mouseInCanvas 
			? Math.floor(simState.gridHeight / 2) 
			: gridMouseY;
		
		// Update text bitmap when text brush is active
		if (simState.brushShape === 'text' && showBrush) {
			simulation.updateTextBitmap(
				simState.brushText,
				simState.brushTextFont,
				simState.brushTextBold,
				simState.brushTextItalic,
				simState.brushSize
			);
		}
		
		simulation.setView({
			showGrid: simState.showGrid,
			isLightTheme: simState.isLightTheme,
			aliveColor: simState.aliveColor,
			brushX: showBrush ? brushX : -1000,
			brushY: showBrush ? brushY : -1000,
			brushRadius: showBrush ? simState.brushSize : -1,
			brushShape: getBrushShapeIndex(simState.brushShape),
			brushRotation: (simState.brushRotation * Math.PI) / 180, // Convert degrees to radians
			brushAspectRatio: simState.brushAspectRatio,
			boundaryMode: simState.boundaryMode,
			spectrumMode: getSpectrumModeIndex(simState.spectrumMode),
			spectrumFrequency: simState.spectrumFrequency,
			neighborShading: getNeighborShadingIndex(simState.neighborShading),
			// Vitality influence settings
			vitalityMode: simState.vitalityMode,
			vitalityThreshold: simState.vitalityThreshold,
			vitalityGhostFactor: simState.vitalityGhostFactor,
			vitalitySigmoidSharpness: simState.vitalitySigmoidSharpness,
			vitalityDecayPower: simState.vitalityDecayPower,
			vitalityCurveSamples: simState.vitalityCurveSamples
		});

		// Always render
		simulation.render(canvasWidth, canvasHeight);
		
		// Also render to recording canvas if recording
		if (isRecording && recordingCanvas) {
			simulation.renderToRecordingCanvas();
		}

		// Update audio (throttled internally to ~30 Hz)
		if (audioState.isEnabled) {
			updateAudio(canvasWidth, canvasHeight);
		}

		// Update alive cells count (sync version for display)
		simState.aliveCells = simulation.countAliveCells();
	}

	// Track axes visibility changes to trigger axis animation
	let lastShowAxesState: boolean | null = null;

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
		// Ignore if typing in an input field
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
			return;
		}
		if (e.key === ' ') {
			// Space key temporarily activates pan mode
			e.preventDefault();
			simState.isSpaceHeld = true;
		}
	}

	function handleKeyUp(e: KeyboardEvent) {
		// Ignore if typing in an input field
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
			return;
		}
		if (e.key === ' ') {
			e.preventDefault();
			simState.isSpaceHeld = false;
		}
	}

	// Start continuous drawing interval
	function startContinuousDrawing() {
		if (continuousDrawInterval) return;
		
		continuousDrawInterval = setInterval(() => {
			if (!simulation || !isDrawing) return;
			simulation.paintBrush(gridMouseX, gridMouseY, simState.brushSize, drawingState, simState.brushType, getBrushConfig());
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
		
		// Disable drawing during tour
		if (isTourActive()) return;
		const brushEditorOpen = isModalOpen('brushEditor');
		
		// Mark that user has interacted (dismiss click hint)
		simState.hasInteracted = true;

		const rect = canvas.getBoundingClientRect();
		const x = (e.clientX - rect.left) * (canvasWidth / rect.width);
		const y = (e.clientY - rect.top) * (canvasHeight / rect.height);

		lastMouseX = e.clientX;
		lastMouseY = e.clientY;

		// Middle mouse button = always pan
		if (e.button === 1) {
			isPanning = true;
			e.preventDefault();
			return;
		}

		// Left click behavior depends on tool mode
		if (e.button === 0) {
			if (effectiveToolMode === 'pan') {
				isPanning = true;
				e.preventDefault();
				return;
			}
			// Brush mode - draw
			(async () => {
				if (brushEditorOpen) {
					ensureBrushEditorSnapshot();
					markBrushEditorEdited();
				} else {
					// Capture pre-stroke snapshot for precise undo (async, fire-and-forget)
					capturePreStroke();
					strokeTracked = true;
				}
			})();
			isDrawing = true;
			drawingState = simState.brushState;
			const gridPos = simulation.screenToGrid(x, y, canvasWidth, canvasHeight);
			gridMouseX = gridPos.x;
			gridMouseY = gridPos.y;
			simulation.paintBrush(gridPos.x, gridPos.y, simState.brushSize, drawingState, simState.brushType, getBrushConfig());
			
			// Start continuous drawing for hold-to-draw
			startContinuousDrawing();
			return;
		}
		
		// Right click = erase (always, regardless of mode)
		if (e.button === 2) {
			(async () => {
				if (brushEditorOpen) {
					ensureBrushEditorSnapshot();
					markBrushEditorEdited();
				} else {
					capturePreStroke();
					strokeTracked = true;
				}
			})();
			isDrawing = true;
			drawingState = 0;
			const gridPos = simulation.screenToGrid(x, y, canvasWidth, canvasHeight);
			gridMouseX = gridPos.x;
			gridMouseY = gridPos.y;
			simulation.paintBrush(gridPos.x, gridPos.y, simState.brushSize, drawingState, simState.brushType, getBrushConfig());
			
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
			simulation.paintBrush(gridPos.x, gridPos.y, simState.brushSize, drawingState, simState.brushType, getBrushConfig());
		}
	}

	async function handleMouseUp() {
		stopContinuousDrawing();
		const brushEditorOpen = isModalOpen('brushEditor');
		const wasDrawing = isDrawing;
		const wasStrokeTracked = strokeTracked;
		
		// Set these immediately to stop any further painting during async operations
		isDrawing = false;
		isPanning = false;
		strokeTracked = false;
		
		if (wasDrawing && simulation && !simState.isPlaying) {
			// After painting while paused, update the count
			simulation.countAliveCellsAsync().then(count => {
				simState.aliveCells = count;
			});
		}
		if (wasStrokeTracked && simulation && !brushEditorOpen) {
			// Await to ensure before snapshot resolves; then clear
			const before = pendingStrokeBefore ? await pendingStrokeBefore : null;
			await addSnapshotWithBefore(simulation, before, 'Stroke');
			pendingStrokeBefore = null;
		}
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

		// Smooth zoom factor - proportional to scroll amount but clamped
		// Trackpads send many small deltas, mice send fewer larger ones
		// Normalize to a comfortable range and use exponential for smooth feel
		const normalizedDelta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100);
		const zoomSpeed = 0.002; // Lower = smoother/slower
		const factor = Math.exp(normalizedDelta * zoomSpeed);
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
		
		// Disable drawing during tour
		if (isTourActive()) {
			e.preventDefault();
			return;
		}
		
		e.preventDefault();
		const brushEditorOpen = isModalOpen('brushEditor');
		
		// Mark that user has interacted (dismiss click hint)
		simState.hasInteracted = true;

		const touches = e.touches;
		touchStartTime = performance.now();

		if (touches.length === 1) {
			const touch = touches[0];
			const rect = canvas.getBoundingClientRect();
			const x = (touch.clientX - rect.left) * (canvasWidth / rect.width);
			const y = (touch.clientY - rect.top) * (canvasHeight / rect.height);
			
			lastTouchX = touch.clientX;
			lastTouchY = touch.clientY;

			// Single touch behavior depends on tool mode
			if (effectiveToolMode === 'pan') {
				// Pan mode - single touch pans
				touchMode = 'pan';
			} else {
				// Brush mode - single touch draws
				if (brushEditorOpen) {
					ensureBrushEditorSnapshot();
					markBrushEditorEdited();
				} else {
					capturePreStroke();
					strokeTracked = true;
				}
				touchMode = 'draw';
				const gridPos = simulation.screenToGrid(x, y, canvasWidth, canvasHeight);
				gridMouseX = gridPos.x;
				gridMouseY = gridPos.y;
				drawingState = simState.brushState; // Use current brush state for touch
				simulation.paintBrush(gridPos.x, gridPos.y, simState.brushSize, drawingState, simState.brushType, getBrushConfig());
				
				// Start continuous drawing for hold-to-draw on touch
				startContinuousDrawing();
			}
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
			// Single finger drawing (only in brush mode)
			const touch = touches[0];
			const x = (touch.clientX - rect.left) * (canvasWidth / rect.width);
			const y = (touch.clientY - rect.top) * (canvasHeight / rect.height);

			const gridPos = simulation.screenToGrid(x, y, canvasWidth, canvasHeight);
			gridMouseX = gridPos.x;
			gridMouseY = gridPos.y;
			simulation.paintBrush(gridPos.x, gridPos.y, simState.brushSize, simState.brushState, simState.brushType, getBrushConfig());
			
			lastTouchX = touch.clientX;
			lastTouchY = touch.clientY;
		} else if (touches.length === 1 && touchMode === 'pan') {
			// Single finger panning (in pan mode or after pinch)
			const touch = touches[0];
			const deltaX = touch.clientX - lastTouchX;
			const deltaY = touch.clientY - lastTouchY;
			simulation.pan(deltaX, deltaY, rect.width, rect.height);
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
		}
	}

	async function handleTouchEnd(e: TouchEvent) {
		if (!simulation) return;
		e.preventDefault();
		const brushEditorOpen = isModalOpen('brushEditor');

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
			if (strokeTracked && simulation && !brushEditorOpen) {
				const before = pendingStrokeBefore ? await pendingStrokeBefore : null;
				await addSnapshotWithBefore(simulation, before, 'Stroke');
				pendingStrokeBefore = null;
			}
			touchMode = 'none';
			lastPinchDistance = 0;
			strokeTracked = false;
		} else if (touches.length === 1 && (touchMode === 'pinch' || touchMode === 'draw')) {
			// Went from 2 to 1 finger - continue as pan (never accidentally draw after pinch)
			stopContinuousDrawing();
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

	// Re-initialize the grid using the last selected initialization settings
	export function reinitialize() {
		applyLastInitialization();
	}

	// Apply the last selected initialization method
	async function applyLastInitialization() {
		if (!simulation) return;
		await resetHistory(simulation);
		
		const pattern = simState.lastInitPattern;
		
		// Handle blank - just clear
		if (pattern === 'blank') {
			simulation.clear();
			simState.resetGeneration();
			simState.aliveCells = 0;
			return;
		}
		
		// Handle random types - use appropriate density
		if (pattern.startsWith('random')) {
			let density = 0.15;
			if (pattern === 'random-sparse') density = 0.15;
			else if (pattern === 'random-medium') density = 0.3;
			else if (pattern === 'random-dense') density = 0.5;
			simulation.randomize(density);
			simState.resetGeneration();
			simulation.countAliveCellsAsync().then(count => {
				simState.aliveCells = count;
			});
			return;
		}
		
		// For structured patterns, use the initialize function with tiling settings
		initialize(pattern, {
			tiled: simState.lastInitTiling,
			spacing: simState.lastInitSpacing
		});
	}

	export function initialize(type: string, options?: { density?: number; tiled?: boolean; spacing?: number }) {
		if (!simulation) return;
		
		// Clear first
		simulation.clear();
		simState.resetGeneration();
		
		// Handle blank - just clear, no randomization
		if (type === 'blank') {
			return;
		}
		
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


	export function updateRule() {
		if (!simulation || !ctx) return;
		
		const currentNeighborhood = simulation.getRule().neighborhood;
		const newNeighborhood = simState.currentRule.neighborhood;
		const wasHex = currentNeighborhood === 'hexagonal' || currentNeighborhood === 'extendedHexagonal';
		const isHex = newNeighborhood === 'hexagonal' || newNeighborhood === 'extendedHexagonal';
		const isHexChanged = wasHex !== isHex;
		
		if (isHexChanged) {
			// Neighborhood type changed between hex and non-hex, need to recreate grid
			// because hex grids need more rows to fill the same visual space
			const viewport = getVisibleViewportSize();
			const { width, height } = calculateGridDimensions(simState.gridScale, viewport.width, viewport.height, isHex);
			
			simState.gridWidth = width;
			simState.gridHeight = height;
			
			simulation.destroy();
			simulation = new Simulation(ctx, {
				width,
				height,
				rule: simState.currentRule
			});
			setSimulationRef(simulation);
			updateAudioSimulation(simulation);
			applyLastInitialization();
			
			// Reset view to fit the new grid (no animation since grid was recreated)
			simulation.resetView(canvasWidth, canvasHeight, false);
		} else {
			// Same neighborhood type, just update the rule
			simulation.setRule(simState.currentRule);
		}
	}

	export function getSimulation(): Simulation | null {
		return simulation;
	}

	function isMobileShareEnvironment() {
		if (typeof navigator === 'undefined') return false;
		const ua = navigator.userAgent || '';
		const isMobileUA = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
		const hasTouch = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints
			? (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints > 1
			: false;
		return isMobileUA || hasTouch;
	}

	// Video recording state
	let isRecording = $state(false);
	let mediaRecorder: MediaRecorder | null = null;
	let recordedChunks: Blob[] = [];
	let recordingCanvas: HTMLCanvasElement | null = null;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for recording feature
	let preRecordingAxisProgress = 0;

	export function getIsRecording() {
		return isRecording;
	}

	export function toggleRecording() {
		if (isRecording) {
			stopRecording();
		} else {
			startRecording();
		}
	}

	function startRecording() {
		if (!canvas || isRecording || !simulation) return;

		try {
			// Create offscreen canvas for recording the full grid
			recordingCanvas = simulation.initRecordingCanvas();
			
			// Capture stream from recording canvas at 60fps
			const stream = recordingCanvas.captureStream(60);
			
			// Prefer MP4 for better compatibility, fall back to high-quality WebM
			const mimeTypes = [
				'video/mp4;codecs=avc1.42E01E', // H.264 baseline
				'video/mp4',
				'video/webm;codecs=vp9',
				'video/webm;codecs=vp8',
				'video/webm'
			];
			
			let selectedMimeType = '';
			for (const mimeType of mimeTypes) {
				if (MediaRecorder.isTypeSupported(mimeType)) {
					selectedMimeType = mimeType;
					break;
				}
			}
			
			if (!selectedMimeType) {
				console.error('No supported video MIME type found');
				simulation.destroyRecordingCanvas();
				recordingCanvas = null;
				return;
			}

			// Store current axis progress (axes are hidden in recording canvas anyway)
			preRecordingAxisProgress = simulation.getViewState().axisProgress;

			recordedChunks = [];
			mediaRecorder = new MediaRecorder(stream, {
				mimeType: selectedMimeType,
				videoBitsPerSecond: 25000000 // 25 Mbps for high quality
			});

			mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					recordedChunks.push(event.data);
				}
			};

			mediaRecorder.onstop = () => {
				const blob = new Blob(recordedChunks, { type: selectedMimeType });
				const extension = selectedMimeType.includes('mp4') ? 'mp4' : 'webm';
				const filename = `cellular-automaton-${simState.gridWidth}x${simState.gridHeight}-gen${simState.generation}.${extension}`;
				
				saveRecording(blob, filename);
				recordedChunks = [];
				
				// Clean up recording canvas
				if (simulation) {
					simulation.destroyRecordingCanvas();
				}
				recordingCanvas = null;
			};

			mediaRecorder.start(100); // Collect data every 100ms
			isRecording = true;
		} catch (err) {
			console.error('Failed to start recording:', err);
			if (simulation) {
				simulation.destroyRecordingCanvas();
			}
			recordingCanvas = null;
		}
	}

	function stopRecording() {
		if (mediaRecorder && isRecording) {
			mediaRecorder.stop();
			isRecording = false;
			mediaRecorder = null;
			
			// Restore axis progress after recording
			if (simulation && simState.showAxes) {
				simulation.startAxisAnimation(true, 400);
			}
		}
	}

	async function saveRecording(blob: Blob, filename: string) {
		// Try using the Web Share API for mobile (if available and supports files)
		if (isMobileShareEnvironment() && navigator.share && navigator.canShare) {
			const file = new File([blob], filename, { type: blob.type });
			const shareData = { files: [file] };
			
			if (navigator.canShare(shareData)) {
				try {
					await navigator.share(shareData);
					return;
				} catch (err) {
					// User cancelled or share failed, fall through to download
					if ((err as Error).name === 'AbortError') return;
				}
			}
		}
		
		// Fallback to download
		const url = URL.createObjectURL(blob);
		triggerDownload(url, filename);
		// Clean up the object URL after a delay
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	export function screenshot() {
		if (!canvas) return;
		
		const filename = `cellular-automaton-gen${simState.generation}.png`;
		const dataUrl = canvas.toDataURL('image/png');
		
		// Try using the Web Share API for mobile (if available and supports files)
		if (isMobileShareEnvironment() && navigator.share && navigator.canShare) {
			canvas.toBlob(async (blob) => {
				if (!blob) return;
				
				const file = new File([blob], filename, { type: 'image/png' });
				const shareData = { files: [file] };
				
				if (navigator.canShare(shareData)) {
					try {
						await navigator.share(shareData);
						return;
					} catch (err) {
						// User cancelled or share failed, fall through to download
						if ((err as Error).name === 'AbortError') return;
					}
				}
				
				// Fallback to download
				triggerDownload(dataUrl, filename);
			}, 'image/png');
		} else {
			// Desktop or no share API - direct download
			triggerDownload(dataUrl, filename);
		}
	}
	
	function triggerDownload(dataUrl: string, filename: string) {
		const link = document.createElement('a');
		link.download = filename;
		link.href = dataUrl;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
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
		setSimulationRef(simulation);
		updateAudioSimulation(simulation);
		applyLastInitialization();
	}
	
	export function setScale(scale: GridScale) {
		if (!ctx || !simulation) return;
		
		// Calculate new dimensions based on visible viewport
		const viewport = getVisibleViewportSize();
		const isHex = simState.currentRule.neighborhood === 'hexagonal' || simState.currentRule.neighborhood === 'extendedHexagonal';
		const { width, height } = calculateGridDimensions(scale, viewport.width, viewport.height, isHex);
		
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
		setSimulationRef(simulation);
		updateAudioSimulation(simulation);
		applyLastInitialization();
		
		// Reset view to fit the new grid (no animation since grid was recreated)
		simulation.resetView(canvasWidth, canvasHeight, false);
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
		class:pan-ready={effectiveToolMode === 'pan' && !isPanning}
	></canvas>

	<!-- History / Branch toolbar -->
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
		animation: canvas-fade-in 0.8s ease-out forwards;
	}

	@keyframes canvas-fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
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
