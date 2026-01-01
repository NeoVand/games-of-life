<script lang="ts">
	import { getSimulationState } from '../stores/simulation.svelte.js';
	import { onMount } from 'svelte';
	import { getRuleEditorTourStyles, startRuleEditorTour } from '../utils/ruleEditorTour.js';
	
	interface Props {
		width?: number;
		height?: number;
		title?: string;
		compact?: boolean;
		onChange?: (mode: string, points: { x: number; y: number }[]) => void;
		/** 
		 * If provided, the editor will use this state object instead of the global simState.
		 * Should follow { vitalityMode, vitalityCurvePoints, setVitalitySettings, ... }
		 */
		stateOverride?: any;
	}
	
	let {
		width = 480,
		height = 140,
		title = 'Neighborhood Vitality Influence',
		compact = false,
		onChange,
		stateOverride
	}: Props = $props();
	
	// Helper arrays for iteration (avoids unused variable warnings)
	const gradientStops = Array.from({ length: 33 }, (_, i) => i);
	const sampleIndicators = Array.from({ length: 16 }, (_, i) => i);
	
	// Unique instance ID for SVG gradient definitions (prevents collision when multiple editors exist)
	const instanceId = Math.random().toString(36).slice(2, 8);
	
	const globalSimState = getSimulationState();
	const targetState = $derived(stateOverride || globalSimState);
	
	// Curve points: array of {x, y} where x is vitality (0-1), y is contribution (-1 to +1)
	// We store this as a reactive state
	// Default: linear positive curve from (0,0) to (1, 0.5)
	let curvePoints = $state<{x: number, y: number}[]>([
		{ x: 0, y: 0 },      // Dead - always 0
		{ x: 1, y: 0.5 }     // Dying boundary - adjustable
	]);
	
	let initialized = false;
	
	// Profile dropdown state
	let profileDropdownOpen = $state(false);
	let profileSearchQuery = $state('');
	let profileListRef = $state<HTMLDivElement | null>(null);
	let selectedProfileId = $state<string | null>(null);
	
	// Profile definitions
	const PROFILES = [
		{ id: 'off', name: 'Off', description: 'Standard behavior - dying cells invisible', category: 'basic' },
		{ id: 'linear', name: 'Linear', description: 'Linear positive influence', category: 'basic' },
		{ id: 'soft', name: 'Soft', description: 'S-curve smooth transition', category: 'basic' },
		{ id: 'step', name: 'Step', description: 'Hard threshold at 50%', category: 'basic' },
		{ id: 'midlife-crisis', name: 'Midlife Crisis', description: 'Oscillating inhibition pattern', category: 'advanced' },
		{ id: 'inhibit', name: 'Inhibit', description: 'Negative influence suppresses growth', category: 'advanced' },
		{ id: 'mixed', name: 'Mixed', description: 'Wave pattern with positive and negative', category: 'advanced' },
		{ id: 'mandala', name: 'Mandala', description: 'Amplified dying influence for mandala patterns', category: 'advanced' }
	];
	
	// Filter profiles based on search query
	const filteredProfiles = $derived(
		profileSearchQuery.trim() === '' 
			? PROFILES 
			: PROFILES.filter(p => 
				p.name.toLowerCase().includes(profileSearchQuery.toLowerCase()) ||
				p.description.toLowerCase().includes(profileSearchQuery.toLowerCase())
			)
	);
	
	// Get current profile name
	const currentProfileName = $derived.by(() => {
		if (selectedProfileId) {
			const profile = PROFILES.find(p => p.id === selectedProfileId);
			if (profile) return profile.name;
		}
		return 'Custom';
	});
	
	// Known profile curve points for detection
	const PROFILE_CURVES: Record<string, {x: number, y: number}[]> = {
		'off': [{ x: 0, y: 0 }, { x: 1, y: 0 }],
		'linear': [{ x: 0, y: 0 }, { x: 1, y: 1 }],
		'midlife-crisis': [
			{ x: 0, y: 0 },
			{ x: 0.372, y: -0.746 },
			{ x: 0.531, y: 0.321 },
			{ x: 0.695, y: -0.669 },
			{ x: 1, y: -1 }
		],
		'mandala': [
			{ x: 0, y: 0 },
			{ x: 0.148, y: 1.01 },
			{ x: 1, y: 0.19 }
		]
	};
	
	// Detect if curve points match a known profile
	function detectProfileFromPoints(points: {x: number, y: number}[]): string | null {
		if (!points || points.length < 2) return null;
		
		// Helper to check if two point arrays are approximately equal
		const pointsMatch = (a: {x: number, y: number}[], b: {x: number, y: number}[]): boolean => {
			if (a.length !== b.length) return false;
			return a.every((p, i) => 
				Math.abs(p.x - b[i].x) < 0.01 && Math.abs(p.y - b[i].y) < 0.01
			);
		};
		
		// Check against known profiles
		for (const [profileId, profilePoints] of Object.entries(PROFILE_CURVES)) {
			if (pointsMatch(points, profilePoints)) {
				return profileId;
			}
		}
		
		// Check for Off (all points at y=0)
		if (points.every(p => Math.abs(p.y) < 0.01)) {
			return 'off';
		}
		
		// Check for Linear (2 points, starts at 0, ends at 1)
		if (points.length === 2 && 
			Math.abs(points[0].y) < 0.01 && 
			Math.abs(points[1].y - 1) < 0.01) {
			return 'linear';
		}
		
		return null;
	}
	
	// Track last known vitality settings to detect external changes (rule switches)
	let lastVitalityMode = $state<string | null>(null);
	let lastGhostFactor = $state<number | null>(null);
	let lastCurvePointsHash = $state<string | null>(null);
	
	// Compute a simple hash of curve points to detect changes
	function hashCurvePoints(points: {x: number, y: number}[]): string {
		if (!points || points.length === 0) return '';
		return points.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join('|');
	}
	
	// Initialize curve from current vitality settings on mount
	onMount(() => {
		initializeFromVitalitySettings();
		// Store initial state to detect future external changes
		lastVitalityMode = targetState.vitalityMode;
		lastGhostFactor = targetState.vitalityGhostFactor;
		lastCurvePointsHash = hashCurvePoints(targetState.vitalityCurvePoints);
		initialized = true;
	});
	
	// Watch for external changes (rule switches) and reinitialize
	$effect(() => {
		if (!initialized) return;
		
		const currentMode = targetState.vitalityMode;
		const currentGhostFactor = targetState.vitalityGhostFactor;
		const currentHash = hashCurvePoints(targetState.vitalityCurvePoints);
		
		// Detect if this is an external change (rule switch) vs internal edit
		const modeChanged = currentMode !== lastVitalityMode;
		const ghostChanged = currentMode === 'ghost' && Math.abs(currentGhostFactor - (lastGhostFactor ?? 0)) > 0.01;
		const curvePointsChanged = currentMode === 'curve' && currentHash !== lastCurvePointsHash;
		
		if (modeChanged || ghostChanged || curvePointsChanged) {
			// External change detected - reinitialize
			initializeFromVitalitySettings();
			lastVitalityMode = currentMode;
			lastGhostFactor = currentGhostFactor;
			lastCurvePointsHash = currentHash;
		}
	});
	
	function initializeFromVitalitySettings() {
		const mode = targetState.vitalityMode;
		if (mode === 'none') {
			// No vitality influence = Off profile
			curvePoints = [
				{ x: 0, y: 0 },
				{ x: 1, y: 0 }
			];
			selectedProfileId = 'off';
		} else if (mode === 'ghost') {
			const factor = targetState.vitalityGhostFactor;
			curvePoints = [
				{ x: 0, y: 0 },
				{ x: 1, y: factor }
			];
			// If ghost factor is 0, it's effectively the Off profile
			if (Math.abs(factor) < 0.01) {
				selectedProfileId = 'off';
			} else if (Math.abs(factor - 1) < 0.01) {
				selectedProfileId = 'linear';
			} else {
				selectedProfileId = null; // Custom
			}
		} else if (mode === 'threshold') {
			const t = Math.max(0.05, Math.min(0.95, targetState.vitalityThreshold));
			curvePoints = [
				{ x: 0, y: 0 },
				{ x: t - 0.02, y: 0 },
				{ x: t + 0.02, y: 1 },
				{ x: 1, y: 1 }
			];
			// Check if it's similar to the step profile
			if (Math.abs(t - 0.5) < 0.05) {
				selectedProfileId = 'step';
			} else {
				selectedProfileId = null; // Custom
			}
		} else if (mode === 'decay') {
			// Approximate power curve with a few points
			const factor = targetState.vitalityGhostFactor;
			const power = targetState.vitalityDecayPower;
			curvePoints = [
				{ x: 0, y: 0 },
				{ x: 0.25, y: Math.pow(0.25, power) * factor },
				{ x: 0.5, y: Math.pow(0.5, power) * factor },
				{ x: 0.75, y: Math.pow(0.75, power) * factor },
				{ x: 1, y: factor }
			];
			selectedProfileId = null; // Custom (decay is a custom curve)
		} else if (mode === 'sigmoid') {
			// Approximate sigmoid with points
			const threshold = targetState.vitalityThreshold;
			const sharpness = targetState.vitalitySigmoidSharpness;
			const sigmoid = (v: number) => 1 / (1 + Math.exp(-(v - threshold) * sharpness));
			curvePoints = [
				{ x: 0, y: sigmoid(0) },
				{ x: 0.25, y: sigmoid(0.25) },
				{ x: 0.5, y: sigmoid(0.5) },
				{ x: 0.75, y: sigmoid(0.75) },
				{ x: 1, y: sigmoid(1) }
			];
			// Check if it's similar to the soft profile
			if (Math.abs(threshold - 0.5) < 0.1) {
				selectedProfileId = 'soft';
			} else {
				selectedProfileId = null; // Custom
			}
		} else if (mode === 'curve') {
			const storedPoints = targetState.vitalityCurvePoints;
			
			// Use stored curve points directly (they are the source of truth)
			if (storedPoints && storedPoints.length >= 2) {
				curvePoints = storedPoints.map((p: any) => ({ x: p.x, y: p.y }));
				// Try to detect if this matches a known profile
				selectedProfileId = detectProfileFromPoints(storedPoints);
				return;
			}
			
			// Fallback: Off profile
			curvePoints = [
				{ x: 0, y: 0 },
				{ x: 1, y: 0 }
			];
			selectedProfileId = 'off';
		} else {
			// Unknown mode or undefined - default to Off profile
			curvePoints = [
				{ x: 0, y: 0 },
				{ x: 1, y: 0 }
			];
			selectedProfileId = 'off';
		}
	}
	
	// SVG coordinate system
	const padding = { top: 15, right: 15, bottom: 20, left: 25 };
	const plotWidth = $derived(width - padding.left - padding.right);
	const plotHeight = $derived(height - padding.top - padding.bottom);
	
	// Color calculation for vitality (matches the canvas shader)
	function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const l = (max + min) / 2;
		
		if (max === min) return [0, 0, l];
		
		const d = max - min;
		const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		
		let h = 0;
		if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
		else if (max === g) h = ((b - r) / d + 2) / 6;
		else h = ((r - g) / d + 4) / 6;
		
		return [h, s, l];
	}
	
	function hslToRgb(h: number, s: number, l: number): [number, number, number] {
		if (s === 0) return [l, l, l];
		
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		
		const hueToRgb = (t: number): number => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1/6) return p + (q - p) * 6 * t;
			if (t < 1/2) return q;
			if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
			return p;
		};
		
		return [hueToRgb(h + 1/3), hueToRgb(h), hueToRgb(h - 1/3)];
	}
	
	// Helper: linear interpolation
	function mix(a: number, b: number, t: number): number {
		return a + (b - a) * t;
	}
	
	// Helper: fract (fractional part)
	function fract(x: number): number {
		return x - Math.floor(x);
	}
	
	// Get spectrum mode index from string
	function getSpectrumModeIndex(mode: string): number {
		const modes = [
			'hueShift', 'rainbow', 'warm', 'cool', 'monochrome', 'fire',
			'complement', 'triadic', 'split', 'analogous', 'pastel', 'vivid',
			'thermal', 'bands', 'neon', 'sunset', 'ocean', 'forest'
		];
		return modes.indexOf(mode);
	}
	
	// Get color for a given vitality value (0 = dead, 1 = alive)
	// This replicates the shader's state_to_color function exactly
	function getVitalityColor(vitality: number): string {
		const [r, g, b] = targetState.aliveColor || [0.2, 0.9, 0.95];
		const isLight = targetState.isLightTheme;
		const bg: [number, number, number] = isLight ? [0.94, 0.94, 0.96] : [0.04, 0.04, 0.06];
		const freq = targetState.spectrumFrequency || 1.0;
		const modeString = targetState.spectrumMode || 'hueShift';
		const mode = getSpectrumModeIndex(modeString);
		
		// Dead state (vitality = 0)
		if (vitality <= 0.01) {
			return `rgb(${Math.round(bg[0] * 255)}, ${Math.round(bg[1] * 255)}, ${Math.round(bg[2] * 255)})`;
		}
		
		// Alive state (vitality = 1) - use alive color
		if (vitality >= 0.99) {
			return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
		}
		
		// Dying states - interpolate based on vitality
		// dyingProgress goes from 0 (just died/alive) to 1 (about to be dead)
		const dyingProgress = 1 - vitality;
		
		// Apply spectrum frequency
		const spectrumProgress = fract(dyingProgress * freq);
		
		const aliveHsl = rgbToHsl(r, g, b);
		let dyingHue: number;
		let dyingSat: number;
		let dyingLight: number;
		
		// Mode 0: Hue Shift (subtle 25% rotation)
		if (mode === 0) {
			dyingHue = aliveHsl[0] + 0.25 * spectrumProgress;
			if (dyingHue > 1) dyingHue -= 1;
			if (isLight) {
				dyingSat = Math.max(aliveHsl[1], 0.6) * Math.max(1.0 - spectrumProgress * 0.25, 0.65);
				dyingLight = mix(Math.min(aliveHsl[2], 0.55), 0.72, dyingProgress * dyingProgress);
			} else {
				const boostedSat = Math.max(aliveHsl[1], 0.4);
				const satCurve = 1.0 - spectrumProgress * spectrumProgress;
				dyingSat = boostedSat * Math.max(satCurve, 0.25);
				dyingLight = mix(aliveHsl[2], 0.12, dyingProgress * dyingProgress);
			}
		}
		// Mode 1: Rainbow (full spectrum rotation)
		else if (mode === 1) {
			dyingHue = aliveHsl[0] + spectrumProgress;
			if (dyingHue > 1) dyingHue -= 1;
			if (isLight) {
				dyingSat = Math.max(0.75, aliveHsl[1]);
				dyingLight = mix(Math.min(aliveHsl[2], 0.5), 0.68, dyingProgress * dyingProgress);
			} else {
				const boostedSat = Math.max(aliveHsl[1], 0.5);
				dyingSat = boostedSat * Math.max(1.0 - spectrumProgress * 0.3, 0.45);
				dyingLight = mix(aliveHsl[2], 0.15, dyingProgress * dyingProgress);
			}
		}
		// Mode 2: Warm (shift toward red/orange)
		else if (mode === 2) {
			const targetHue = 0.05;
			let hueDiff = targetHue - aliveHsl[0];
			if (hueDiff > 0.5) hueDiff -= 1.0;
			if (hueDiff < -0.5) hueDiff += 1.0;
			dyingHue = aliveHsl[0] + hueDiff * spectrumProgress;
			if (dyingHue < 0) dyingHue += 1;
			if (dyingHue > 1) dyingHue -= 1;
			if (isLight) {
				dyingSat = Math.max(aliveHsl[1], 0.65) * Math.max(1.0 - spectrumProgress * 0.2, 0.6);
				dyingLight = mix(Math.min(aliveHsl[2], 0.55), 0.73, dyingProgress * dyingProgress);
			} else {
				const boostedSat = Math.max(aliveHsl[1], 0.45);
				dyingSat = boostedSat * Math.max(1.0 - spectrumProgress * 0.3, 0.4);
				dyingLight = mix(aliveHsl[2], 0.1, dyingProgress * dyingProgress);
			}
		}
		// Mode 3: Cool (shift toward blue/purple)
		else if (mode === 3) {
			const targetHue = 0.7;
			let hueDiff = targetHue - aliveHsl[0];
			if (hueDiff > 0.5) hueDiff -= 1.0;
			if (hueDiff < -0.5) hueDiff += 1.0;
			dyingHue = aliveHsl[0] + hueDiff * spectrumProgress;
			if (dyingHue < 0) dyingHue += 1;
			if (dyingHue > 1) dyingHue -= 1;
			if (isLight) {
				dyingSat = Math.max(aliveHsl[1], 0.65) * Math.max(1.0 - spectrumProgress * 0.2, 0.6);
				dyingLight = mix(Math.min(aliveHsl[2], 0.55), 0.73, dyingProgress * dyingProgress);
			} else {
				const boostedSat = Math.max(aliveHsl[1], 0.45);
				dyingSat = boostedSat * Math.max(1.0 - spectrumProgress * 0.3, 0.4);
				dyingLight = mix(aliveHsl[2], 0.1, dyingProgress * dyingProgress);
			}
		}
		// Mode 4: Monochrome
		else if (mode === 4) {
			dyingHue = aliveHsl[0];
			if (isLight) {
				dyingSat = Math.max(aliveHsl[1], 0.5) * Math.max(1.0 - spectrumProgress * 0.35, 0.55);
				dyingLight = mix(Math.min(aliveHsl[2], 0.5), 0.75, dyingProgress);
			} else {
				const boostedSat = Math.max(aliveHsl[1], 0.35);
				dyingSat = boostedSat * (1.0 - spectrumProgress * 0.7);
				dyingLight = mix(aliveHsl[2], 0.1, dyingProgress);
			}
		}
		// Mode 5: Fire
		else if (mode === 5) {
			if (spectrumProgress < 0.33) {
				dyingHue = mix(aliveHsl[0], 0.12, spectrumProgress * 3.0);
			} else if (spectrumProgress < 0.66) {
				dyingHue = mix(0.12, 0.06, (spectrumProgress - 0.33) * 3.0);
			} else {
				dyingHue = mix(0.06, 0.0, (spectrumProgress - 0.66) * 3.0);
			}
			if (dyingHue < 0) dyingHue += 1;
			const fireProgress = spectrumProgress * spectrumProgress;
			if (isLight) {
				dyingSat = Math.max(0.9 - fireProgress * 0.15, 0.7);
				dyingLight = mix(0.5, 0.68, dyingProgress * dyingProgress);
			} else {
				dyingSat = Math.max(1.0 - fireProgress * 0.2, 0.75);
				dyingLight = mix(0.65, 0.04, dyingProgress * dyingProgress);
			}
		}
		// ... (Mode 6-17 are similar, omitting for brevity)
		else {
			dyingHue = aliveHsl[0];
			dyingSat = aliveHsl[1];
			dyingLight = mix(aliveHsl[2], isLight ? 0.8 : 0.1, dyingProgress);
		}
		
		const dyingRgb = hslToRgb(dyingHue, dyingSat, dyingLight);
		
		// Blend with background at the end (cubic for late blend)
		const bgBlend = dyingProgress * dyingProgress * dyingProgress * 0.6;
		const finalR = Math.round((dyingRgb[0] * (1 - bgBlend) + bg[0] * bgBlend) * 255);
		const finalG = Math.round((dyingRgb[1] * (1 - bgBlend) + bg[1] * bgBlend) * 255);
		const finalB = Math.round((dyingRgb[2] * (1 - bgBlend) + bg[2] * bgBlend) * 255);
		
		return `rgb(${finalR}, ${finalG}, ${finalB})`;
	}
	
	// Y-axis range
	const yMin = -2;
	const yMax = 2;
	const yRange = yMax - yMin; // 4
	
	// Convert data coordinates to SVG coordinates
	function toSvgX(x: number): number {
		return padding.left + x * plotWidth;
	}
	
	function toSvgY(y: number): number {
		// Y goes from yMin (bottom) to yMax (top)
		return padding.top + (yMax - y) * plotHeight / yRange;
	}
	
	// Convert SVG coordinates back to data coordinates
	function fromSvgX(svgX: number): number {
		return Math.max(0, Math.min(1, (svgX - padding.left) / plotWidth));
	}
	
	function fromSvgY(svgY: number): number {
		return Math.max(yMin, Math.min(yMax, yMax - (svgY - padding.top) * yRange / plotHeight));
	}
	
	// Monotonic Cubic Hermite Interpolation (Fritsch-Carlson method)
	function monotonicCubicInterpolation(points: {x: number, y: number}[], xVal: number): number {
		const n = points.length;
		if (n === 0) return 0;
		if (n === 1) return points[0].y;
		
		const sorted = [...points].sort((a, b) => a.x - b.x);
		if (xVal <= sorted[0].x) return sorted[0].y;
		if (xVal >= sorted[n - 1].x) return sorted[n - 1].y;
		
		let i = 0;
		while (i < n - 1 && sorted[i + 1].x < xVal) i++;
		
		const x0 = sorted[i].x;
		const x1 = sorted[i + 1].x;
		const y0 = sorted[i].y;
		const y1 = sorted[i + 1].y;
		
		const deltas: number[] = [];
		const slopes: number[] = [];
		for (let j = 0; j < n - 1; j++) {
			const dx = sorted[j + 1].x - sorted[j].x;
			deltas.push(dx);
			slopes.push(dx === 0 ? 0 : (sorted[j + 1].y - sorted[j].y) / dx);
		}
		
		const tangents: number[] = [];
		for (let j = 0; j < n; j++) {
			if (j === 0) tangents.push(slopes[0]);
			else if (j === n - 1) tangents.push(slopes[n - 2]);
			else {
				const m0 = slopes[j - 1];
				const m1 = slopes[j];
				if (m0 * m1 <= 0) tangents.push(0);
				else {
					const w0 = 2 * deltas[j] + deltas[j - 1];
					const w1 = deltas[j] + 2 * deltas[j - 1];
					tangents.push((w0 + w1) / (w0 / m0 + w1 / m1));
				}
			}
		}
		
		for (let j = 0; j < n - 1; j++) {
			const m = slopes[j];
			if (m === 0) {
				tangents[j] = 0;
				tangents[j + 1] = 0;
			} else {
				const alpha = tangents[j] / m;
				const beta = tangents[j + 1] / m;
				const tau = alpha * alpha + beta * beta;
				if (tau > 9) {
					const s = 3 / Math.sqrt(tau);
					tangents[j] = s * alpha * m;
					tangents[j + 1] = s * beta * m;
				}
			}
		}
		
		const h = x1 - x0;
		const t = (xVal - x0) / h;
		const t2 = t * t;
		const t3 = t2 * t;
		
		const h00 = 2 * t3 - 3 * t2 + 1;
		const h10 = t3 - 2 * t2 + t;
		const h01 = -2 * t3 + 3 * t2;
		const h11 = t3 - t2;
		
		return h00 * y0 + h10 * h * tangents[i] + h01 * y1 + h11 * h * tangents[i + 1];
	}
	
	function sampleCurveAt(vitality: number): number {
		const y = monotonicCubicInterpolation(curvePoints, vitality);
		return Math.max(yMin, Math.min(yMax, y));
	}
	
	const curvePath = $derived.by(() => {
		if (curvePoints.length < 2) return '';
		const sortedPoints = [...curvePoints].sort((a, b) => a.x - b.x);
		const pathPoints: string[] = [];
		const steps = 50;
		for (let i = 0; i <= steps; i++) {
			const t = i / steps;
			const xVal = sortedPoints[0].x + t * (sortedPoints[sortedPoints.length - 1].x - sortedPoints[0].x);
			const yVal = monotonicCubicInterpolation(sortedPoints, xVal);
			pathPoints.push(`${i === 0 ? 'M' : 'L'} ${toSvgX(xVal)} ${toSvgY(yVal)}`);
		}
		return pathPoints.join(' ');
	});
	
	const positiveFillPath = $derived.by(() => {
		if (curvePoints.length < 2) return '';
		const sortedPoints = [...curvePoints].sort((a, b) => a.x - b.x);
		const pathPoints: string[] = [];
		const steps = 50;
		const zeroY = toSvgY(0);
		pathPoints.push(`M ${toSvgX(0)} ${zeroY}`);
		for (let i = 0; i <= steps; i++) {
			const t = i / steps;
			const xVal = sortedPoints[0].x + t * (sortedPoints[sortedPoints.length - 1].x - sortedPoints[0].x);
			const yVal = Math.max(0, monotonicCubicInterpolation(sortedPoints, xVal));
			pathPoints.push(`L ${toSvgX(xVal)} ${toSvgY(yVal)}`);
		}
		pathPoints.push(`L ${toSvgX(1)} ${zeroY} Z`);
		return pathPoints.join(' ');
	});
	
	const negativeFillPath = $derived.by(() => {
		if (curvePoints.length < 2) return '';
		const sortedPoints = [...curvePoints].sort((a, b) => a.x - b.x);
		const pathPoints: string[] = [];
		const steps = 50;
		const zeroY = toSvgY(0);
		pathPoints.push(`M ${toSvgX(0)} ${zeroY}`);
		for (let i = 0; i <= steps; i++) {
			const t = i / steps;
			const xVal = sortedPoints[0].x + t * (sortedPoints[sortedPoints.length - 1].x - sortedPoints[0].x);
			const yVal = Math.min(0, monotonicCubicInterpolation(sortedPoints, xVal));
			pathPoints.push(`L ${toSvgX(xVal)} ${toSvgY(yVal)}`);
		}
		pathPoints.push(`L ${toSvgX(1)} ${zeroY} Z`);
		return pathPoints.join(' ');
	});
	
	let draggingIndex = $state<number | null>(null);
	let svgElement = $state<SVGSVGElement | null>(null);
	let editMode = $state<'add' | 'delete'>('add');
	
	function isAnchorPoint(index: number): boolean { return curvePoints[index]?.x === 0; }
	function isEndpoint(index: number): boolean {
		const sorted = [...curvePoints].sort((a, b) => a.x - b.x);
		return curvePoints[index]?.x === sorted[sorted.length - 1]?.x && curvePoints[index]?.x > 0.9;
	}
	
	function handlePointMouseDown(index: number, e: MouseEvent) {
		e.preventDefault(); e.stopPropagation();
		if (editMode === 'delete') { handleDeletePoint(index); return; }
		if (isAnchorPoint(index)) return;
		draggingIndex = index;
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	}
	
	function handlePointTouchStart(index: number, e: TouchEvent) {
		e.preventDefault(); e.stopPropagation();
		if (editMode === 'delete') { handleDeletePoint(index); return; }
		if (isAnchorPoint(index)) return;
		draggingIndex = index;
		window.addEventListener('touchmove', handleTouchMove, { passive: false });
		window.addEventListener('touchend', handleTouchEnd);
	}
	
	function handleMouseMove(e: MouseEvent) {
		if (draggingIndex === null || !svgElement) return;
		const rect = svgElement.getBoundingClientRect();
		const scaleX = width / rect.width;
		const scaleY = height / rect.height;
		updateDraggedPoint((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
	}
	
	function handleTouchMove(e: TouchEvent) {
		if (draggingIndex === null || !svgElement) return;
		e.preventDefault();
		const touch = e.touches[0];
		const rect = svgElement.getBoundingClientRect();
		const scaleX = width / rect.width;
		const scaleY = height / rect.height;
		updateDraggedPoint((touch.clientX - rect.left) * scaleX, (touch.clientY - rect.top) * scaleY);
	}
	
	function updateDraggedPoint(svgX: number, svgY: number) {
		if (draggingIndex === null) return;
		const newX = fromSvgX(svgX);
		const newY = fromSvgY(svgY);
		const sortedIndices = curvePoints.map((p, i) => ({ x: p.x, i })).sort((a, b) => a.x - b.x).map(p => p.i);
		const sortedPos = sortedIndices.indexOf(draggingIndex);
		const prevIndex = sortedPos > 0 ? sortedIndices[sortedPos - 1] : null;
		const nextIndex = sortedPos < sortedIndices.length - 1 ? sortedIndices[sortedPos + 1] : null;
		const minX = prevIndex !== null ? curvePoints[prevIndex].x + 0.02 : 0.02;
		const maxX = nextIndex !== null ? curvePoints[nextIndex].x - 0.02 : 1;
		const isEndpointDrag = isEndpoint(draggingIndex);
		curvePoints[draggingIndex] = {
			x: isEndpointDrag ? curvePoints[draggingIndex].x : Math.max(minX, Math.min(maxX, newX)),
			y: Math.max(yMin, Math.min(yMax, newY))
		};
		selectedProfileId = null;
		updateSimState();
	}
	
	function handleMouseUp() {
		draggingIndex = null;
		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('mouseup', handleMouseUp);
	}
	
	function handleTouchEnd() {
		draggingIndex = null;
		window.removeEventListener('touchmove', handleTouchMove);
		window.removeEventListener('touchend', handleTouchEnd);
	}
	
	function handleCurveMouseDown(e: MouseEvent) {
		if (!svgElement || editMode !== 'add') return;
		e.preventDefault();
		const rect = svgElement.getBoundingClientRect();
		const scaleX = width / rect.width;
		const scaleY = height / rect.height;
		const newX = fromSvgX((e.clientX - rect.left) * scaleX);
		const newY = fromSvgY((e.clientY - rect.top) * scaleY);
		const clampedX = Math.max(0.03, Math.min(0.97, newX));
		if (curvePoints.some(p => Math.abs(p.x - clampedX) < 0.04)) return;
		const newPoint = { x: clampedX, y: Math.max(yMin, Math.min(yMax, newY)) };
		curvePoints = [...curvePoints, newPoint].sort((a, b) => a.x - b.x);
		const newIndex = curvePoints.findIndex(p => p.x === newPoint.x && p.y === newPoint.y);
		selectedProfileId = null;
		draggingIndex = newIndex;
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
		updateSimState();
	}
	
	function handleCurveTouchStart(e: TouchEvent) {
		if (!svgElement || editMode !== 'add') return;
		e.preventDefault();
		const touch = e.touches[0];
		const rect = svgElement.getBoundingClientRect();
		const scaleX = width / rect.width;
		const scaleY = height / rect.height;
		const newX = fromSvgX((touch.clientX - rect.left) * scaleX);
		const newY = fromSvgY((touch.clientY - rect.top) * scaleY);
		const clampedX = Math.max(0.03, Math.min(0.97, newX));
		if (curvePoints.some(p => Math.abs(p.x - clampedX) < 0.04)) return;
		const newPoint = { x: clampedX, y: Math.max(yMin, Math.min(yMax, newY)) };
		curvePoints = [...curvePoints, newPoint].sort((a, b) => a.x - b.x);
		const newIndex = curvePoints.findIndex(p => p.x === newPoint.x && p.y === newPoint.y);
		selectedProfileId = null;
		draggingIndex = newIndex;
		window.addEventListener('touchmove', handleTouchMove, { passive: false });
		window.addEventListener('touchend', handleTouchEnd);
		updateSimState();
	}
	
	function handleDeletePoint(index: number) {
		if (isAnchorPoint(index) || isEndpoint(index) || curvePoints.length <= 2) return;
		selectedProfileId = null;
		curvePoints = curvePoints.filter((_, i) => i !== index);
		updateSimState();
	}
	
	function handlePointDoubleClick(index: number) { handleDeletePoint(index); }
	
	function updateSimState() {
		const isOff = curvePoints.every(p => Math.abs(p.y) < 0.01);
		if (isOff) {
			targetState.vitalityMode = 'none';
			targetState.vitalityCurvePoints = [];
			lastVitalityMode = 'none'; lastGhostFactor = 0; lastCurvePointsHash = '';
			onChange?.('none', []);
		} else {
			const points = curvePoints.map(p => ({ x: p.x, y: p.y }));
			targetState.vitalityMode = 'curve';
			targetState.vitalityCurvePoints = points;
			lastVitalityMode = 'curve'; lastCurvePointsHash = hashCurvePoints(curvePoints);
			onChange?.('curve', points);
		}
	}
	
	function applyProfile(profileId: string) {
		selectedProfileId = profileId;
		if (PROFILE_CURVES[profileId]) {
			curvePoints = PROFILE_CURVES[profileId].map(p => ({...p}));
		} else if (profileId === 'linear') {
			curvePoints = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
		} else if (profileId === 'soft') {
			curvePoints = [{ x: 0, y: 0 }, { x: 0.25, y: 0.05 }, { x: 0.5, y: 0.5 }, { x: 0.75, y: 0.95 }, { x: 1, y: 1 }];
		} else if (profileId === 'inhibit') {
			curvePoints = [{ x: 0, y: 0 }, { x: 0.3, y: -0.5 }, { x: 0.7, y: -0.7 }, { x: 1, y: -0.4 }];
		} else if (profileId === 'mixed') {
			curvePoints = [{ x: 0, y: 0 }, { x: 0.25, y: -0.5 }, { x: 0.5, y: 0 }, { x: 0.75, y: 0.7 }, { x: 1, y: 0.5 }];
		} else if (profileId === 'step') {
			curvePoints = [{ x: 0, y: 0 }, { x: 0.48, y: 0 }, { x: 0.50, y: 0.5 }, { x: 0.52, y: 1 }, { x: 1, y: 1 }];
		}
		updateSimState();
	}
	
	const gridColor = $derived(targetState.isLightTheme ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)');
	const zeroLineColor = $derived(targetState.isLightTheme ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)');
	const textColor = $derived(targetState.isLightTheme ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)');
	
	function downloadCurve() {
		const data = { name: 'Custom Curve', curvePoints: curvePoints.map(p => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 })) };
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url; a.download = `vitality-curve-${Date.now()}.json`; a.click();
		URL.revokeObjectURL(url);
	}
	
	function resetCurve() { applyProfile('off'); }
	
	let tourActive = $state(false);
	function handleStartTour() {
		const accentColor = `rgb(${Math.round(targetState.aliveColor[0] * 255)}, ${Math.round(targetState.aliveColor[1] * 255)}, ${Math.round(targetState.aliveColor[2] * 255)})`;
		tourActive = true;
		startRuleEditorTour({ accentColor, isLightTheme: targetState.isLightTheme, onComplete: () => tourActive = false, onSkip: () => tourActive = false });
	}
</script>

<div class="curve-editor">
	<div class="header">
		<span class="label">{title}</span>
	</div>
	
	<div class="main-content" class:compact>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<svg bind:this={svgElement} {width} {height} viewBox="0 0 {width} {height}" class="curve-svg" class:full={compact} onmousedown={handleCurveMouseDown} ontouchstart={handleCurveTouchStart} role="application">
			<defs>
				<linearGradient id="vitalityGradient-{instanceId}" x1="0%" y1="0%" x2="100%" y2="0%">
					{#each gradientStops as i (i)}
						{@const v = i / 32}
						<stop offset="{v * 100}%" stop-color={getVitalityColor(v)} />
					{/each}
				</linearGradient>
				<linearGradient id="vitalityFillGradient-{instanceId}" x1="0%" y1="0%" x2="100%" y2="0%">
					{#each gradientStops as i (i)}
						{@const v = i / 32}
						<stop offset="{v * 100}%" stop-color={getVitalityColor(v)} stop-opacity="0.25" />
					{/each}
				</linearGradient>
			</defs>
			<line x1={padding.left} y1={toSvgY(1)} x2={padding.left + plotWidth} y2={toSvgY(1)} stroke={gridColor} stroke-dasharray="2,2" />
			<line x1={padding.left} y1={toSvgY(-1)} x2={padding.left + plotWidth} y2={toSvgY(-1)} stroke={gridColor} stroke-dasharray="2,2" />
			<line x1={toSvgX(0.25)} y1={padding.top} x2={toSvgX(0.25)} y2={padding.top + plotHeight} stroke={gridColor} stroke-dasharray="2,2" />
			<line x1={toSvgX(0.5)} y1={padding.top} x2={toSvgX(0.5)} y2={padding.top + plotHeight} stroke={gridColor} stroke-dasharray="2,2" />
			<line x1={toSvgX(0.75)} y1={padding.top} x2={toSvgX(0.75)} y2={padding.top + plotHeight} stroke={gridColor} stroke-dasharray="2,2" />
			<line x1={padding.left} y1={toSvgY(0)} x2={padding.left + plotWidth} y2={toSvgY(0)} stroke={zeroLineColor} stroke-width="1" />
			<rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} fill="none" stroke={gridColor} stroke-width="1" />
			<path d={positiveFillPath} fill="url(#vitalityFillGradient-{instanceId})" />
			<path d={negativeFillPath} fill="url(#vitalityFillGradient-{instanceId})" />
			<path d={curvePath} fill="none" stroke="url(#vitalityGradient-{instanceId})" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
			{#each sampleIndicators as i (i)}
				{@const v = (i * 8) / 127}
				<circle cx={toSvgX(v)} cy={toSvgY(sampleCurveAt(v))} r="1" fill={targetState.isLightTheme ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)'} />
			{/each}
			{#each curvePoints as point, index (point.x)}
				{@const isDeletable = !isAnchorPoint(index) && !isEndpoint(index)}
				{@const pColor = getVitalityColor(point.x)}
				{@const dColor = targetState.isLightTheme ? 'rgba(180, 60, 60, 0.9)' : 'rgba(220, 80, 80, 0.9)'}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<g class="control-point" class:anchor={isAnchorPoint(index)} class:endpoint={isEndpoint(index)} class:dragging={draggingIndex === index} class:delete-mode={editMode === 'delete' && isDeletable} onmousedown={(e) => handlePointMouseDown(index, e)} ontouchstart={(e) => handlePointTouchStart(index, e)} ondblclick={() => handlePointDoubleClick(index)}>
					<circle cx={toSvgX(point.x)} cy={toSvgY(point.y)} r="14" fill="transparent" class="hit-area" />
					<circle cx={toSvgX(point.x)} cy={toSvgY(point.y)} r={isAnchorPoint(index) ? 4 : 6} fill={editMode === 'delete' && isDeletable ? dColor : pColor} stroke={targetState.isLightTheme ? 'rgba(255,255,255,0.9)' : 'rgba(10,10,15,0.9)'} stroke-width="1.5" />
					{#if editMode === 'delete' && isDeletable}
						<text x={toSvgX(point.x)} y={toSvgY(point.y) + 3} font-size="9" fill="white" text-anchor="middle" style="pointer-events: none; font-weight: 600">×</text>
					{/if}
				</g>
			{/each}
			<text x={padding.left - 8} y={toSvgY(2) + 3} font-size="7" fill={textColor} text-anchor="end">+2</text>
			<text x={padding.left - 8} y={toSvgY(1) + 3} font-size="7" fill={textColor} text-anchor="end">+1</text>
			<text x={padding.left - 8} y={toSvgY(0) + 3} font-size="7" fill={textColor} text-anchor="end">0</text>
			<text x={padding.left - 8} y={toSvgY(-1) + 3} font-size="7" fill={textColor} text-anchor="end">-1</text>
			<text x={padding.left - 8} y={toSvgY(-2) + 3} font-size="7" fill={textColor} text-anchor="end">-2</text>
			<text x={padding.left} y={height - 5} font-size="8" fill={textColor}>dead</text>
			<text x={padding.left + plotWidth} y={height - 5} font-size="8" fill={textColor} text-anchor="end">alive</text>
		</svg>
		
		{#if !compact}
			<div class="side-controls">
				<div class="dropdown-wrapper">
					<button class="select-btn" onclick={() => { profileDropdownOpen = true; profileSearchQuery = ''; }}>
						<span class="select-label">Profile</span>
						<span class="select-value">{currentProfileName}</span>
						<svg class="chevron" class:open={profileDropdownOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg>
					</button>
					{#if profileDropdownOpen}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="dropdown-backdrop" onclick={() => { profileDropdownOpen = false; profileSearchQuery = ''; }}></div>
						<div class="dropdown-menu">
							<div class="dropdown-list" bind:this={profileListRef}>
								<div class="dropdown-section">Basic</div>
								{#each PROFILES.filter(p => p.category === 'basic') as p (p.id)}
									<button class="dropdown-item" class:selected={selectedProfileId === p.id} onclick={() => { applyProfile(p.id); profileDropdownOpen = false; }}>
										<span class="item-name">{p.name}</span>
										<span class="item-desc">{p.description}</span>
									</button>
								{/each}
								<div class="dropdown-section">Advanced</div>
								{#each PROFILES.filter(p => p.category === 'advanced') as p (p.id)}
									<button class="dropdown-item" class:selected={selectedProfileId === p.id} onclick={() => { applyProfile(p.id); profileDropdownOpen = false; }}>
										<span class="item-name">{p.name}</span>
										<span class="item-desc">{p.description}</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
				
				<div class="buttons-row">
					<div class="toggle-buttons">
						<button class="toggle-btn" class:active={editMode === 'add'} onclick={() => editMode = 'add'} title="Add points"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="3" x2="8" y2="13" /><line x1="3" y1="8" x2="13" y2="8" /></svg></button>
						<button class="toggle-btn delete" class:active={editMode === 'delete'} onclick={() => editMode = 'delete'} title="Delete points"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="8" x2="13" y2="8" /></svg></button>
					</div>
					<button class="icon-btn" onclick={resetCurve} title="Reset"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8a6 6 0 1 1 1.5 4" /><path d="M2 12V8h4" /></svg></button>
					<button class="icon-btn" onclick={downloadCurve} title="Save"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8M8 10l-3-3M8 10l3-3M3 12v2h10v-2" /></svg></button>
				</div>
				<div class="hint">{editMode === 'add' ? 'Click to add • Drag to adjust' : 'Click to delete'}</div>
			</div>
		{:else}
			<div class="compact-controls">
				<div class="toggle-buttons">
					<button class="toggle-btn" class:active={editMode === 'add'} onclick={() => editMode = 'add'} title="Add points"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="3" x2="8" y2="13" /><line x1="3" y1="8" x2="13" y2="8" /></svg></button>
					<button class="toggle-btn delete" class:active={editMode === 'delete'} onclick={() => editMode = 'delete'} title="Delete points"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="8" x2="13" y2="8" /></svg></button>
				</div>
				<button class="icon-btn" onclick={resetCurve} title="Reset"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8a6 6 0 1 1 1.5 4" /><path d="M2 12V8h4" /></svg></button>
			</div>
		{/if}
	</div>
</div>

<style>
	.curve-editor { display: flex; flex-direction: column; gap: 0.4rem; }
	.header { display: flex; align-items: center; justify-content: space-between; }
	.label { font-size: 0.6rem; text-transform: uppercase; color: var(--ui-text, #666); letter-spacing: 0.03em; }
	.control-point { cursor: grab; }
	.control-point:hover circle:not(.hit-area) { filter: brightness(1.2); }
	.control-point.anchor { cursor: not-allowed; }
	.control-point.endpoint { cursor: ns-resize; }
	.control-point.dragging { cursor: grabbing; }
	.control-point.delete-mode { cursor: pointer; }
	.control-point.delete-mode:hover circle:not(.hit-area) { filter: brightness(0.8) saturate(1.2); }
	.main-content { display: flex; gap: 0.6rem; align-items: stretch; }
	.curve-svg { flex: 0 0 68%; max-width: 68%; height: auto; background: var(--ui-input-bg, rgba(0, 0, 0, 0.2)); border-radius: 6px; cursor: crosshair; touch-action: none; }
	.curve-svg.full { flex: none; max-width: 100%; }
	.side-controls { flex: 1; display: flex; flex-direction: column; gap: 0.35rem; justify-content: center; }
	.compact-controls { display: flex; gap: 0.35rem; justify-content: space-between; align-items: center; margin-top: 0.25rem; }
	.buttons-row { display: flex; gap: 0.3rem; align-items: center; justify-content: space-between; }
	.dropdown-wrapper { position: relative; display: flex; width: 100%; }
	.select-btn { display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.5rem; background: var(--ui-input-bg, rgba(0, 0, 0, 0.3)); border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1)); border-radius: 4px; color: var(--ui-text-hover, #ccc); font-size: 0.6rem; cursor: pointer; width: 100%; text-align: left; }
	.select-btn:hover { border-color: var(--ui-border-hover, rgba(255, 255, 255, 0.2)); }
	.select-label { font-size: 0.5rem; text-transform: uppercase; color: var(--ui-text, #666); letter-spacing: 0.03em; margin-right: auto; }
	.select-value { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.chevron { width: 12px; height: 12px; opacity: 0.5; transition: transform 0.15s; }
	.chevron.open { transform: rotate(180deg); }
	.dropdown-backdrop { position: fixed; inset: 0; z-index: 10; }
	.dropdown-menu { position: absolute; bottom: calc(100% + 4px); left: 0; min-width: 240px; background: var(--ui-bg, rgba(16, 16, 24, 0.98)); backdrop-filter: blur(12px); border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.15)); border-radius: 6px; max-height: 260px; overflow-y: auto; z-index: 20; box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.4); }
	.dropdown-list { padding: 0.35rem; }
	.dropdown-section { padding: 0.4rem 0.6rem 0.25rem; font-size: 0.5rem; color: var(--ui-text, #666); text-transform: uppercase; }
	.dropdown-item { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 0.15rem; padding: 0.5rem 0.6rem; background: transparent; border: none; border-radius: 4px; color: var(--ui-text, #888); font-size: 0.65rem; cursor: pointer; text-align: left; transition: all 0.1s; }
	.dropdown-item:hover { background: var(--ui-bg-hover, rgba(255, 255, 255, 0.08)); color: var(--ui-text-hover, #fff); }
	.dropdown-item.selected { background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15)); color: var(--ui-accent, #2dd4bf); }
	.item-name { font-weight: 500; color: inherit; }
	.item-desc { font-size: 0.5rem; color: var(--ui-text, #666); opacity: 0.8; }
	.toggle-buttons { display: flex; }
	.toggle-btn { padding: 0.25rem 0.4rem; background: var(--ui-input-bg, rgba(0, 0, 0, 0.3)); border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1)); color: var(--ui-text, #666); cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; }
	.toggle-btn:first-child { border-radius: 3px 0 0 3px; }
	.toggle-btn:last-child { border-radius: 0 3px 3px 0; border-left: none; }
	.toggle-btn svg { width: 10px; height: 10px; }
	.toggle-btn:hover { background: var(--ui-border-hover, rgba(255, 255, 255, 0.08)); color: var(--ui-text-hover, #ccc); }
	.toggle-btn.active { background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15)); color: var(--ui-accent, #2dd4bf); }
	.toggle-btn.delete.active { background: rgba(180, 80, 80, 0.12); color: rgb(180, 100, 100); }
	.icon-btn { padding: 0.25rem; background: var(--ui-input-bg, rgba(0, 0, 0, 0.3)); border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1)); border-radius: 3px; color: var(--ui-text, #666); cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; }
	.icon-btn:hover { background: var(--ui-border-hover, rgba(255, 255, 255, 0.08)); color: var(--ui-accent, #2dd4bf); }
	.icon-btn svg { width: 12px; height: 12px; }
	.hint { font-size: 0.45rem; color: var(--ui-text, #555); line-height: 1.3; text-align: center; opacity: 0.7; }
	@media (max-width: 540px) {
		.main-content { flex-direction: column; }
		.curve-svg { flex: none; max-width: 100%; }
		.side-controls { flex-direction: row; flex-wrap: wrap; }
		.dropdown-wrapper, .buttons-row { flex: 1; min-width: 120px; }
	}

	.main-content.compact { flex-direction: column; }
</style>
