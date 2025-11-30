import { driver, type DriveStep, type Config } from 'driver.js';

// Tour state management
const TOUR_COMPLETED_KEY = 'games-of-life-tour-completed';

// Mini simulation state for welcome preview
let miniSimInterval: number | null = null;
let miniSimCanvas: HTMLCanvasElement | null = null;
let miniSimCtx: CanvasRenderingContext2D | null = null;
let miniSimGrid: Uint8Array | null = null;
const MINI_SIM_SIZE = 32;
const MINI_SIM_CELL_SIZE = 4;

function initMiniSim(accentColor: string): void {
	// Create grid with a glider gun pattern
	miniSimGrid = new Uint8Array(MINI_SIM_SIZE * MINI_SIM_SIZE);
	
	// Seed with random cells and a glider
	for (let i = 0; i < miniSimGrid.length; i++) {
		miniSimGrid[i] = Math.random() < 0.15 ? 1 : 0;
	}
	
	// Add a glider in the corner
	const glider = [
		[0, 1, 0],
		[0, 0, 1],
		[1, 1, 1]
	];
	for (let y = 0; y < 3; y++) {
		for (let x = 0; x < 3; x++) {
			miniSimGrid[(y + 2) * MINI_SIM_SIZE + (x + 2)] = glider[y][x];
		}
	}
}

function stepMiniSim(): void {
	if (!miniSimGrid) return;
	
	const newGrid = new Uint8Array(MINI_SIM_SIZE * MINI_SIM_SIZE);
	
	for (let y = 0; y < MINI_SIM_SIZE; y++) {
		for (let x = 0; x < MINI_SIM_SIZE; x++) {
			let neighbors = 0;
			
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (dx === 0 && dy === 0) continue;
					const nx = (x + dx + MINI_SIM_SIZE) % MINI_SIM_SIZE;
					const ny = (y + dy + MINI_SIM_SIZE) % MINI_SIM_SIZE;
					neighbors += miniSimGrid[ny * MINI_SIM_SIZE + nx];
				}
			}
			
			const idx = y * MINI_SIM_SIZE + x;
			const alive = miniSimGrid[idx];
			
			// Conway's Game of Life rules
			if (alive && (neighbors === 2 || neighbors === 3)) {
				newGrid[idx] = 1;
			} else if (!alive && neighbors === 3) {
				newGrid[idx] = 1;
			}
		}
	}
	
	miniSimGrid = newGrid;
}

function renderMiniSim(accentColor: string, isLight: boolean): void {
	if (!miniSimCanvas || !miniSimCtx || !miniSimGrid) return;
	
	const ctx = miniSimCtx;
	const cellSize = MINI_SIM_CELL_SIZE;
	
	// Clear with background
	ctx.fillStyle = isLight ? '#e8e8ec' : '#0a0a0f';
	ctx.fillRect(0, 0, miniSimCanvas.width, miniSimCanvas.height);
	
	// Draw grid lines (subtle)
	ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.03)';
	ctx.lineWidth = 0.5;
	for (let i = 0; i <= MINI_SIM_SIZE; i++) {
		ctx.beginPath();
		ctx.moveTo(i * cellSize, 0);
		ctx.lineTo(i * cellSize, miniSimCanvas.height);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(0, i * cellSize);
		ctx.lineTo(miniSimCanvas.width, i * cellSize);
		ctx.stroke();
	}
	
	// Draw cells
	ctx.fillStyle = accentColor;
	for (let y = 0; y < MINI_SIM_SIZE; y++) {
		for (let x = 0; x < MINI_SIM_SIZE; x++) {
			if (miniSimGrid[y * MINI_SIM_SIZE + x]) {
				ctx.fillRect(x * cellSize + 0.5, y * cellSize + 0.5, cellSize - 1, cellSize - 1);
			}
		}
	}
}

function startMiniSim(accentColor: string, isLight: boolean): void {
	stopMiniSim();
	
	// Find the canvas in the popover
	setTimeout(() => {
		miniSimCanvas = document.getElementById('tour-mini-sim') as HTMLCanvasElement;
		if (!miniSimCanvas) return;
		
		miniSimCtx = miniSimCanvas.getContext('2d');
		if (!miniSimCtx) return;
		
		initMiniSim(accentColor);
		renderMiniSim(accentColor, isLight);
		
		// Run simulation
		miniSimInterval = window.setInterval(() => {
			stepMiniSim();
			renderMiniSim(accentColor, isLight);
		}, 150);
	}, 100);
}

function stopMiniSim(): void {
	if (miniSimInterval !== null) {
		clearInterval(miniSimInterval);
		miniSimInterval = null;
	}
	miniSimCanvas = null;
	miniSimCtx = null;
	miniSimGrid = null;
}

export function hasTourBeenCompleted(): boolean {
	if (typeof localStorage === 'undefined') return true;
	return localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
}

export function markTourCompleted(): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
}

export function resetTourStatus(): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.removeItem(TOUR_COMPLETED_KEY);
}

// Get CSS color from CSS variable
function getCSSVariable(name: string): string {
	if (typeof document === 'undefined') return '#2dd4bf';
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#2dd4bf';
}

// Detect if on mobile
function isMobile(): boolean {
	if (typeof window === 'undefined') return false;
	return window.innerWidth <= 768 || ('ontouchstart' in window);
}

// SVG Icons matching the app's iconography
const icons = {
	// Classic pixelated heart - outline + animated filled interior (matches HeartIcon.svelte)
	heart: `<svg viewBox="0 0 16 16" class="tour-icon tour-icon-heart">
		<style>
			.heart-layer-1 { animation: heart-wave 1.8s ease-in-out infinite 0s; }
			.heart-layer-2 { animation: heart-wave 1.8s ease-in-out infinite 0.15s; }
			.heart-layer-3 { animation: heart-wave 1.8s ease-in-out infinite 0.3s; }
			.heart-layer-4 { animation: heart-wave 1.8s ease-in-out infinite 0.45s; }
			@keyframes heart-wave {
				0%, 100% { opacity: 0.2; }
				40%, 60% { opacity: 0.55; }
			}
		</style>
		<!-- Outline -->
		<rect class="heart-bright" x="3" y="2" width="3" height="1"/>
		<rect class="heart-bright" x="10" y="2" width="3" height="1"/>
		<rect class="heart-bright" x="2" y="3" width="1" height="1"/>
		<rect class="heart-bright" x="6" y="3" width="1" height="1"/>
		<rect class="heart-bright" x="9" y="3" width="1" height="1"/>
		<rect class="heart-bright" x="13" y="3" width="1" height="1"/>
		<rect class="heart-bright" x="2" y="4" width="1" height="1"/>
		<rect class="heart-bright" x="7" y="4" width="2" height="1"/>
		<rect class="heart-bright" x="13" y="4" width="1" height="1"/>
		<rect class="heart-bright" x="2" y="5" width="1" height="2"/>
		<rect class="heart-bright" x="13" y="5" width="1" height="2"/>
		<rect class="heart-bright" x="3" y="7" width="1" height="1"/>
		<rect class="heart-bright" x="12" y="7" width="1" height="1"/>
		<rect class="heart-bright" x="4" y="8" width="1" height="1"/>
		<rect class="heart-bright" x="11" y="8" width="1" height="1"/>
		<rect class="heart-bright" x="5" y="9" width="1" height="1"/>
		<rect class="heart-bright" x="10" y="9" width="1" height="1"/>
		<rect class="heart-bright" x="6" y="10" width="1" height="1"/>
		<rect class="heart-bright" x="9" y="10" width="1" height="1"/>
		<rect class="heart-bright" x="7" y="11" width="2" height="1"/>
		<!-- Inner fill with animation layers -->
		<rect class="heart-dim heart-layer-1" x="3" y="3" width="3" height="1"/>
		<rect class="heart-dim heart-layer-1" x="10" y="3" width="3" height="1"/>
		<rect class="heart-dim heart-layer-1" x="3" y="4" width="4" height="1"/>
		<rect class="heart-dim heart-layer-1" x="9" y="4" width="4" height="1"/>
		<rect class="heart-dim heart-layer-2" x="3" y="5" width="10" height="1"/>
		<rect class="heart-dim heart-layer-2" x="3" y="6" width="10" height="1"/>
		<rect class="heart-dim heart-layer-3" x="4" y="7" width="8" height="1"/>
		<rect class="heart-dim heart-layer-3" x="5" y="8" width="6" height="1"/>
		<rect class="heart-dim heart-layer-4" x="6" y="9" width="4" height="1"/>
		<rect class="heart-dim heart-layer-4" x="7" y="10" width="2" height="1"/>
	</svg>`,
	// Play icon
	play: `<svg viewBox="0 0 24 24" fill="currentColor" class="tour-icon">
		<path d="M8 5.14v14l11-7-11-7z"/>
	</svg>`,
	// Clock/speed icon
	clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<circle cx="12" cy="12" r="10"/>
		<path d="M12 6v6l4 2"/>
	</svg>`,
	// Brush icon
	brush: `<svg viewBox="0 0 24 24" fill="currentColor" class="tour-icon">
		<circle cx="12" cy="12" r="6"/>
	</svg>`,
	// Initialize/refresh icon
	refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
	</svg>`,
	// Rules/grid icon
	rules: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<rect x="4" y="4" width="16" height="16" rx="1"/>
		<line x1="4" y1="9.33" x2="20" y2="9.33"/>
		<line x1="4" y1="14.66" x2="20" y2="14.66"/>
		<line x1="9.33" y1="4" x2="9.33" y2="20"/>
		<line x1="14.66" y1="4" x2="14.66" y2="20"/>
		<rect x="10.33" y="5" width="3.33" height="3.33" fill="currentColor" stroke="none"/>
		<rect x="15.66" y="10.33" width="3.33" height="3.33" fill="currentColor" stroke="none"/>
	</svg>`,
	// Settings/tuner icon
	settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<line x1="4" y1="6" x2="20" y2="6"/>
		<line x1="4" y1="12" x2="20" y2="12"/>
		<line x1="4" y1="18" x2="20" y2="18"/>
		<circle cx="8" cy="6" r="2" fill="currentColor"/>
		<circle cx="16" cy="12" r="2" fill="currentColor"/>
		<circle cx="10" cy="18" r="2" fill="currentColor"/>
	</svg>`,
	// Help icon
	help: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<circle cx="12" cy="12" r="10"/>
		<path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
		<circle cx="12" cy="17" r="0.5" fill="currentColor"/>
	</svg>`,
	// Canvas/grid icon
	canvas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<rect x="3" y="3" width="18" height="18" rx="2"/>
		<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
	</svg>`,
	// Checkmark/done icon
	check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<path d="M20 6L9 17l-5-5"/>
	</svg>`,
	// Trash/clear icon
	trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
	</svg>`,
	// Camera/screenshot icon
	camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2v11z"/>
		<circle cx="12" cy="13" r="4"/>
	</svg>`
};

// Helper to create title with icon
function titleWithIcon(icon: string, text: string): string {
	return `<span class="tour-title-wrapper">${icon}<span>${text}</span></span>`;
}

// Create welcome content with mini simulation
function getWelcomeContent(): string {
	const canvasSize = MINI_SIM_SIZE * MINI_SIM_CELL_SIZE;
	return `
		<div class="tour-welcome-content">
			<canvas id="tour-mini-sim" width="${canvasSize}" height="${canvasSize}" class="tour-mini-canvas"></canvas>
			<p>A cellular automaton simulator powered by WebGPU. Let me show you around.</p>
		</div>
	`;
}

// Tour step definitions - buttons in order from left to right (desktop) or top to bottom (mobile)
function getTourSteps(): DriveStep[] {
	const mobile = isMobile();
	const popoverSide = mobile ? 'left' : 'bottom';
	
	const steps: DriveStep[] = [
		// 1. Welcome step (no element)
		{
			popover: {
				title: titleWithIcon(icons.heart, 'Welcome to Games of Life'),
				description: getWelcomeContent(),
				side: 'over',
				align: 'center'
			}
		},
		// 2. Canvas interaction
		{
			element: 'canvas',
			popover: {
				title: titleWithIcon(icons.canvas, 'The Canvas'),
				description: mobile 
					? 'This is where cells live and evolve. Tap to draw, pinch to zoom, and use two fingers to pan.'
					: 'This is where cells live and evolve. Click to draw, scroll to zoom, and Shift+drag to pan.',
				side: 'over',
				align: 'center'
			}
		},
		// 3. Play/Pause (first button)
		{
			element: '#tour-play-btn',
			popover: {
				title: titleWithIcon(icons.play, 'Play / Pause'),
				description: 'Start or stop the simulation. Watch cells evolve according to the rules of life.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 4. Step
		{
			element: '#tour-step-btn',
			popover: {
				title: titleWithIcon(icons.play, 'Step Forward'),
				description: 'Advance the simulation by one generation. Great for studying patterns frame by frame.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 5. Speed control
		{
			element: '#tour-speed-btn',
			popover: {
				title: titleWithIcon(icons.clock, 'Speed Control'),
				description: 'Adjust how fast the simulation runs. Click to open a slider.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 6. Rules editor
		{
			element: '#tour-rules-btn',
			popover: {
				title: titleWithIcon(icons.rules, 'Rule Editor'),
				description: 'Change the rules of life. Try presets like HighLife, Day & Night, or create your own.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 7. Brush tool
		{
			element: '#tour-brush-btn',
			popover: {
				title: titleWithIcon(icons.brush, 'Brush Tool'),
				description: 'Adjust brush size and switch between draw and erase modes to create patterns.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 8. Clear
		{
			element: '#tour-clear-btn',
			popover: {
				title: titleWithIcon(icons.trash, 'Clear Grid'),
				description: 'Wipe the canvas clean and start fresh.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 9. Initialize
		{
			element: '#tour-init-btn',
			popover: {
				title: titleWithIcon(icons.refresh, 'Initialize'),
				description: 'Load preset patterns like gliders, oscillators, or fill with random cells.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 10. Fit to screen
		{
			element: '#tour-fit-btn',
			popover: {
				title: titleWithIcon(icons.canvas, 'Fit to Screen'),
				description: 'Reset the view to show the entire grid centered on screen.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 11. Screenshot
		{
			element: '#tour-screenshot-btn',
			popover: {
				title: titleWithIcon(icons.camera, 'Screenshot'),
				description: 'Save the current canvas as an image file.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 12. Help button
		{
			element: '#tour-help-btn',
			popover: {
				title: titleWithIcon(icons.help, 'Help'),
				description: mobile 
					? 'View touch controls and tips. Restart this tour anytime from here.'
					: 'View keyboard shortcuts and tips. Restart this tour anytime from here.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 13. Settings
		{
			element: '#tour-settings-btn',
			popover: {
				title: titleWithIcon(icons.settings, 'Settings'),
				description: 'Customize colors, switch themes, adjust grid size, and set boundary behavior.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 14. About
		{
			element: '#tour-about-btn',
			popover: {
				title: titleWithIcon(icons.heart, 'About'),
				description: 'Learn more about Games of Life and access the GitHub repository.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 15. Final step
		{
			popover: {
				title: titleWithIcon(icons.check, 'Ready to Explore!'),
				description: 'You\'re all set. Press Play to watch cells come alive!',
				side: 'over',
				align: 'center'
			}
		}
	];
	
	return steps;
}

// Create and configure the driver instance
export function createTour(options?: { 
	onComplete?: () => void;
	onSkip?: () => void;
	accentColor?: string;
	isLightTheme?: boolean;
}): ReturnType<typeof driver> {
	const accentColor = options?.accentColor || getCSSVariable('--ui-accent');
	const isLight = options?.isLightTheme ?? false;
	
	// Create driver instance first so we can reference it in callbacks
	let driverObj: ReturnType<typeof driver>;
	
	const config: Config = {
		showProgress: true,
		animate: true,
		smoothScroll: true,
		allowClose: true,
		overlayClickNext: false,
		stagePadding: 2,
		stageRadius: 6,
		popoverClass: `gol-tour-popover ${isLight ? 'light-theme' : 'dark-theme'}`,
		overlayColor: isLight ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.7)',
		steps: getTourSteps(),
		nextBtnText: 'Next',
		prevBtnText: 'Back',
		doneBtnText: 'Done',
		onPopoverRender: (popover, opts) => {
			// Start mini sim on welcome step (step 0)
			if (opts.state.activeIndex === 0) {
				startMiniSim(accentColor, isLight);
			} else {
				stopMiniSim();
			}
		},
		onDestroyed: () => {
			stopMiniSim();
			markTourCompleted();
			options?.onComplete?.();
		},
		onCloseClick: () => {
			// Close the tour when X is clicked
			stopMiniSim();
			markTourCompleted();
			options?.onSkip?.();
			driverObj.destroy();
		}
	};
	
	driverObj = driver(config);
	return driverObj;
}

// Start the tour
export function startTour(options?: Parameters<typeof createTour>[0]): void {
	const driverObj = createTour(options);
	driverObj.drive();
}

// Generate CSS for the tour (to be injected)
export function getTourStyles(accentColor: string, isLightTheme: boolean): string {
	const bgColor = isLightTheme ? 'rgba(255, 255, 255, 0.95)' : 'rgba(16, 16, 24, 0.95)';
	const textColor = isLightTheme ? '#1a1a1a' : '#e0e0e0';
	const mutedColor = isLightTheme ? '#666' : '#999';
	const borderColor = isLightTheme ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';
	
	return `
		.driver-popover.gol-tour-popover {
			background: ${bgColor} !important;
			backdrop-filter: blur(12px) !important;
			border: 1px solid ${borderColor} !important;
			border-radius: 12px !important;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
			max-width: 320px !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-title {
			color: ${textColor} !important;
			font-size: 1rem !important;
			font-weight: 600 !important;
			margin-bottom: 0.5rem !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-description {
			color: ${mutedColor} !important;
			font-size: 0.85rem !important;
			line-height: 1.5 !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-progress-text {
			color: ${mutedColor} !important;
			font-size: 0.7rem !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-navigation-btns {
			gap: 0.5rem !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-prev-btn,
		.driver-popover.gol-tour-popover .driver-popover-next-btn {
			background: ${accentColor} !important;
			color: ${isLightTheme ? '#fff' : '#0a0a0f'} !important;
			border: none !important;
			border-radius: 6px !important;
			padding: 0.5rem 1rem !important;
			font-size: 0.8rem !important;
			font-weight: 500 !important;
			cursor: pointer !important;
			transition: filter 0.15s !important;
			box-shadow: none !important;
			text-shadow: none !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-prev-btn:hover,
		.driver-popover.gol-tour-popover .driver-popover-next-btn:hover {
			filter: brightness(1.1) !important;
			box-shadow: none !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-prev-btn {
			background: transparent !important;
			color: ${mutedColor} !important;
			border: 1px solid ${borderColor} !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-prev-btn:hover {
			color: ${textColor} !important;
			border-color: ${accentColor} !important;
		}
		
		.driver-popover.gol-tour-popover button {
			box-shadow: none !important;
			text-shadow: none !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-close-btn {
			color: ${mutedColor} !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-close-btn:hover {
			color: ${textColor} !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-arrow-side-left {
			border-left-color: ${bgColor} !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-arrow-side-right {
			border-right-color: ${bgColor} !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-arrow-side-top {
			border-top-color: ${bgColor} !important;
		}
		
		.driver-popover.gol-tour-popover .driver-popover-arrow-side-bottom {
			border-bottom-color: ${bgColor} !important;
		}
		
		/* Tour icon styling */
		.tour-title-wrapper {
			display: flex !important;
			align-items: center !important;
			gap: 0.5rem !important;
		}
		
		.tour-icon {
			width: 20px !important;
			height: 20px !important;
			flex-shrink: 0 !important;
			color: ${accentColor} !important;
		}
		
		.tour-icon-heart {
			width: 22px !important;
			height: 22px !important;
		}
		
		.tour-icon-heart .heart-bright {
			fill: ${accentColor} !important;
		}
		
		.tour-icon-heart .heart-dim {
			fill: ${accentColor} !important;
			opacity: 0.4 !important;
		}
		
		/* Welcome mini canvas */
		.tour-welcome-content {
			display: flex !important;
			flex-direction: column !important;
			align-items: center !important;
			gap: 0.75rem !important;
		}
		
		.tour-welcome-content p {
			margin: 0 !important;
			text-align: center !important;
			color: ${mutedColor} !important;
			font-size: 0.85rem !important;
			line-height: 1.5 !important;
		}
		
		.tour-mini-canvas {
			border-radius: 8px !important;
			border: 1px solid ${borderColor} !important;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important;
		}
		
		/* Mobile adjustments */
		@media (max-width: 768px) {
			.driver-popover.gol-tour-popover {
				max-width: 280px !important;
			}
			
			.driver-popover.gol-tour-popover .driver-popover-title {
				font-size: 0.95rem !important;
			}
			
			.driver-popover.gol-tour-popover .driver-popover-description {
				font-size: 0.8rem !important;
			}
			
			.tour-icon {
				width: 18px !important;
				height: 18px !important;
			}
			
			.tour-icon-heart {
				width: 20px !important;
				height: 20px !important;
			}
		}
	`;
}

