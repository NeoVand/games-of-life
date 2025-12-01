import { driver, type DriveStep, type Config } from 'driver.js';

// Tour state management
const TOUR_COMPLETED_KEY = 'games-of-life-tour-completed';

// Mini simulation state for welcome preview
let miniSimInterval: number | null = null;
let miniSimCanvas: HTMLCanvasElement | null = null;
let miniSimCtx: CanvasRenderingContext2D | null = null;
let miniSimGrid: Uint8Array | null = null;
let miniSimGeneration = 0;
const MINI_SIM_SIZE = 40;
const MINI_SIM_CELL_SIZE = 3;

// Star Wars rule: B2/S345/C4 with continuous seeding to keep it alive
const TOUR_RULE = {
	birthMask: 0b000000100,   // B2
	surviveMask: 0b000111000, // S345
	numStates: 4
};

// Seeding rate: probability per cell per frame of spawning a new cell
const SEED_RATE = 0.002; // ~0.2% chance per dead cell per frame

function initMiniSim(accentColor: string): void {
	miniSimGrid = new Uint8Array(MINI_SIM_SIZE * MINI_SIM_SIZE);
	miniSimGeneration = 0;
	
	// Star Wars needs ~35% density and continuous activity
	// Seed with random cells at optimal density
	for (let i = 0; i < miniSimGrid.length; i++) {
		miniSimGrid[i] = Math.random() < 0.35 ? 1 : 0;
	}
}

// Continuous seeding - each dead cell has a small chance to become alive each frame
function continuousSeed(): void {
	if (!miniSimGrid) return;
	
	// Each dead cell has SEED_RATE probability of becoming alive
	// This creates natural, distributed seeding without discrete bursts
	for (let i = 0; i < miniSimGrid.length; i++) {
		if (miniSimGrid[i] === 0 && Math.random() < SEED_RATE) {
			miniSimGrid[i] = 1;
		}
	}
}

function stepMiniSim(): void {
	if (!miniSimGrid) return;
	
	miniSimGeneration++;
	
	// Continuous seeding - natural, distributed new cells each frame
	continuousSeed();
	
	const newGrid = new Uint8Array(MINI_SIM_SIZE * MINI_SIM_SIZE);
	const { birthMask, surviveMask, numStates } = TOUR_RULE;
	
	for (let y = 0; y < MINI_SIM_SIZE; y++) {
		for (let x = 0; x < MINI_SIM_SIZE; x++) {
			let neighbors = 0;
			
			// Count alive neighbors (state === 1)
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (dx === 0 && dy === 0) continue;
					const nx = (x + dx + MINI_SIM_SIZE) % MINI_SIM_SIZE;
					const ny = (y + dy + MINI_SIM_SIZE) % MINI_SIM_SIZE;
					if (miniSimGrid[ny * MINI_SIM_SIZE + nx] === 1) {
						neighbors++;
					}
				}
			}
			
			const idx = y * MINI_SIM_SIZE + x;
			const state = miniSimGrid[idx];
			
			// Generations rule logic
			if (state === 0) {
				// Dead cell - check birth
				if ((birthMask & (1 << neighbors)) !== 0) {
					newGrid[idx] = 1; // Born
				}
			} else if (state === 1) {
				// Alive cell - check survival
				if ((surviveMask & (1 << neighbors)) !== 0) {
					newGrid[idx] = 1; // Survives
				} else {
					newGrid[idx] = numStates > 2 ? 2 : 0; // Start dying or die
				}
			} else {
				// Dying cell - continue decay
				newGrid[idx] = state < numStates - 1 ? state + 1 : 0;
			}
		}
	}
	
	miniSimGrid = newGrid;
}

// Parse accent color to RGB
function parseColor(color: string): [number, number, number] {
	// Handle rgb() format
	const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
	if (rgbMatch) {
		return [parseInt(rgbMatch[1]) / 255, parseInt(rgbMatch[2]) / 255, parseInt(rgbMatch[3]) / 255];
	}
	// Handle hex format
	const hex = color.replace('#', '');
	if (hex.length === 6) {
		return [
			parseInt(hex.slice(0, 2), 16) / 255,
			parseInt(hex.slice(2, 4), 16) / 255,
			parseInt(hex.slice(4, 6), 16) / 255
		];
	}
	return [0.2, 0.9, 0.95]; // Default cyan
}

// HSL conversion for color interpolation (matches main shader)
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h = 0;
	if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
	else if (max === g) h = (b - r) / d + 2;
	else h = (r - g) / d + 4;
	return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	if (s === 0) return [l, l, l];
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const hue2rgb = (t: number) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1/6) return p + (q - p) * 6 * t;
		if (t < 1/2) return q;
		if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
		return p;
	};
	return [hue2rgb(h + 1/3), hue2rgb(h), hue2rgb(h - 1/3)];
}

function getStateColor(state: number, numStates: number, accentRgb: [number, number, number], isLight: boolean): string {
	if (state === 0) return 'transparent';
	if (state === 1) {
		return `rgb(${Math.round(accentRgb[0] * 255)}, ${Math.round(accentRgb[1] * 255)}, ${Math.round(accentRgb[2] * 255)})`;
	}
	
	// Dying states - shift hue and fade
	const progress = (state - 1) / (numStates - 1);
	const [h, s, l] = rgbToHsl(accentRgb[0], accentRgb[1], accentRgb[2]);
	
	const hueShift = progress * 0.25;
	const newHue = (h + hueShift) % 1;
	const newSat = s * (1 - progress * 0.5);
	const targetL = isLight ? 0.85 : 0.15;
	const newLight = l + (targetL - l) * progress * 0.7;
	
	const [r, g, b] = hslToRgb(newHue, newSat, newLight);
	return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

function renderMiniSim(accentColor: string, isLight: boolean): void {
	if (!miniSimCanvas || !miniSimCtx || !miniSimGrid) return;
	
	const ctx = miniSimCtx;
	const cellSize = MINI_SIM_CELL_SIZE;
	const accentRgb = parseColor(accentColor);
	const { numStates } = TOUR_RULE;
	
	// Disable image smoothing for crisp pixels
	ctx.imageSmoothingEnabled = false;
	
	// Clear with background
	ctx.fillStyle = isLight ? '#e8e8ec' : '#0a0a0f';
	ctx.fillRect(0, 0, miniSimCanvas.width, miniSimCanvas.height);
	
	// Draw cells with state-based coloring - use integer coordinates for sharpness
	for (let y = 0; y < MINI_SIM_SIZE; y++) {
		for (let x = 0; x < MINI_SIM_SIZE; x++) {
			const state = miniSimGrid[y * MINI_SIM_SIZE + x];
			if (state > 0) {
				ctx.fillStyle = getStateColor(state, numStates, accentRgb, isLight);
				// Use Math.floor and integer sizes for pixel-perfect rendering
				ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
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
		
		// Run simulation at ~20fps for smooth animation
		miniSimInterval = window.setInterval(() => {
			stepMiniSim();
			renderMiniSim(accentColor, isLight);
		}, 50);
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
					? 'This is where cells live and evolve. Tap to draw cells, pinch to zoom, and drag with two fingers to pan around.'
					: 'This is where cells live and evolve. Click to draw, right-click to erase, scroll to zoom, and Shift+drag to pan.',
				side: 'over',
				align: 'center'
			}
		},
		// 3. Play/Pause (first button)
		{
			element: '#tour-play-btn',
			popover: {
				title: titleWithIcon(icons.play, 'Play / Pause'),
				description: mobile
					? 'Start or stop the simulation. Watch cells evolve according to the current rule.'
					: 'Start or stop the simulation (Space). Watch cells evolve according to the current rule.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 4. Step
		{
			element: '#tour-step-btn',
			popover: {
				title: titleWithIcon(icons.play, 'Step Forward'),
				description: mobile
					? 'Advance the simulation one generation at a time. Great for studying patterns frame by frame.'
					: 'Advance by one generation (S). Great for studying patterns frame by frame.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 5. Speed control
		{
			element: '#tour-speed-btn',
			popover: {
				title: titleWithIcon(icons.clock, 'Speed Control'),
				description: mobile
					? 'Tap to adjust simulation speed from 1 to 120 fps.'
					: 'Adjust simulation speed (< > keys). Click to open a slider.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 6. Rules editor
		{
			element: '#tour-rules-btn',
			popover: {
				title: titleWithIcon(icons.rules, 'Rule Editor'),
				description: mobile
					? 'Change the rules! Choose from 50+ presets like Star Wars, Day & Night, or create your own with different neighborhoods.'
					: 'Change the rules (E)! Choose from 50+ presets, search by name, filter by category, or create your own with different neighborhoods.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 7. Brush tool
		{
			element: '#tour-brush-btn',
			popover: {
				title: titleWithIcon(icons.brush, 'Brush Tool'),
				description: mobile
					? 'Tap to switch between draw and erase modes, and adjust brush size.'
					: 'Adjust brush size ([ ] keys) and switch between draw and erase modes.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 8. Clear
		{
			element: '#tour-clear-btn',
			popover: {
				title: titleWithIcon(icons.trash, 'Clear Grid'),
				description: mobile
					? 'Wipe the canvas clean and start fresh.'
					: 'Wipe the canvas clean (D). Start fresh with a blank grid.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 9. Initialize
		{
			element: '#tour-init-btn',
			popover: {
				title: titleWithIcon(icons.refresh, 'Initialize'),
				description: mobile
					? 'Load patterns like gliders, spaceships, and oscillators. Enable auto-seeding to keep the simulation alive.'
					: 'Load patterns (I) like gliders, spaceships, and oscillators. Enable auto-seeding to keep the simulation alive forever.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 10. Fit to screen
		{
			element: '#tour-fit-btn',
			popover: {
				title: titleWithIcon(icons.canvas, 'Fit to Screen'),
				description: mobile
					? 'Reset the view to show the entire grid centered on screen.'
					: 'Reset the view (F) to show the entire grid centered on screen.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 11. Screenshot
		{
			element: '#tour-screenshot-btn',
			popover: {
				title: titleWithIcon(icons.camera, 'Screenshot'),
				description: 'Capture and save the current canvas as a PNG image.',
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
					: 'View all keyboard shortcuts (?) and tips. Restart this tour anytime from here.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 13. Settings
		{
			element: '#tour-settings-btn',
			popover: {
				title: titleWithIcon(icons.settings, 'Settings'),
				description: mobile
					? 'Switch between dark/light themes, choose colors, adjust grid size, and set edge wrapping.'
					: 'Switch themes (T), cycle colors (C), adjust grid size, and set edge wrapping behavior.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 14. About
		{
			element: '#tour-about-btn',
			popover: {
				title: titleWithIcon(icons.heart, 'About'),
				description: 'Learn more about Games of Life, see quick start tips, and access the source code.',
				side: popoverSide,
				align: 'center'
			}
		},
		// 15. Final step
		{
			popover: {
				title: titleWithIcon(icons.check, 'Ready to Explore!'),
				description: mobile
					? 'You\'re all set! Tap Play to watch cells come alive. Try different rules for amazing patterns!'
					: 'You\'re all set! Press Space to play. Try pressing C to cycle colors and T to toggle themes!',
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
			border-radius: 6px !important;
			border: 1px solid ${borderColor} !important;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important;
			image-rendering: pixelated !important;
			image-rendering: crisp-edges !important;
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

