<script lang="ts">
	import { getSimulationState } from '../stores/simulation.svelte.js';
	import { onMount } from 'svelte';
	
	interface Props {
		width?: number;
		height?: number;
	}
	
	let { width = 480, height = 140 }: Props = $props();
	
	const simState = getSimulationState();
	
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
		{ id: 'mixed', name: 'Mixed', description: 'Wave pattern with positive and negative', category: 'advanced' }
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
		]
	};
	
	// Detect if current samples match a known profile
	function detectProfile(samples: number[]): string | null {
		// Check for Midlife Crisis (has distinctive oscillating pattern ending at -1)
		if (samples.length >= 128 && Math.abs(samples[127] - (-1)) < 0.01) {
			// Check a few key points
			if (samples[47] !== undefined && Math.abs(samples[47] - (-0.746)) < 0.02) {
				return 'midlife-crisis';
			}
		}
		// Check for Off (all zeros)
		if (samples.every(s => Math.abs(s) < 0.01)) {
			return 'off';
		}
		// Check for Linear (ramps from 0 to 1)
		if (samples.length >= 128 && Math.abs(samples[127] - 1) < 0.02 && Math.abs(samples[64] - 0.5) < 0.05) {
			return 'linear';
		}
		return null;
	}
	
	// Track last known vitality settings to detect external changes (rule switches)
	let lastVitalityMode = $state<string | null>(null);
	let lastGhostFactor = $state<number | null>(null);
	let lastCurveSamplesHash = $state<string | null>(null);
	
	// Compute a simple hash of curve samples to detect changes
	function hashSamples(samples: number[]): string {
		// Just use first, middle, and last few samples for a quick fingerprint
		if (!samples || samples.length < 128) return '';
		return `${samples[0].toFixed(3)}_${samples[32].toFixed(3)}_${samples[64].toFixed(3)}_${samples[96].toFixed(3)}_${samples[127].toFixed(3)}`;
	}
	
	// Initialize curve from current vitality settings on mount
	onMount(() => {
		initializeFromVitalitySettings();
		// Store initial state to detect future external changes
		lastVitalityMode = simState.vitalityMode;
		lastGhostFactor = simState.vitalityGhostFactor;
		lastCurveSamplesHash = hashSamples(simState.vitalityCurveSamples);
		initialized = true;
	});
	
	// Watch for external changes (rule switches) and reinitialize
	$effect(() => {
		if (!initialized) return;
		
		const currentMode = simState.vitalityMode;
		const currentGhostFactor = simState.vitalityGhostFactor;
		const currentHash = hashSamples(simState.vitalityCurveSamples);
		
		// Detect if this is an external change (rule switch) vs internal edit
		const modeChanged = currentMode !== lastVitalityMode;
		const ghostChanged = currentMode === 'ghost' && Math.abs(currentGhostFactor - (lastGhostFactor ?? 0)) > 0.01;
		const curveSamplesChanged = currentMode === 'curve' && currentHash !== lastCurveSamplesHash;
		
		if (modeChanged || ghostChanged || curveSamplesChanged) {
			// External change detected - reinitialize
			initializeFromVitalitySettings();
			lastVitalityMode = currentMode;
			lastGhostFactor = currentGhostFactor;
			lastCurveSamplesHash = currentHash;
		}
	});
	
	function initializeFromVitalitySettings() {
		const mode = simState.vitalityMode;
		if (mode === 'none') {
			// No vitality influence = Off profile
			curvePoints = [
				{ x: 0, y: 0 },
				{ x: 1, y: 0 }
			];
			selectedProfileId = 'off';
		} else if (mode === 'ghost') {
			const factor = simState.vitalityGhostFactor;
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
			const t = Math.max(0.05, Math.min(0.95, simState.vitalityThreshold));
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
			const factor = simState.vitalityGhostFactor;
			const power = simState.vitalityDecayPower;
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
			const threshold = simState.vitalityThreshold;
			const sharpness = simState.vitalitySigmoidSharpness;
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
			// Initialize from stored curve samples (128 samples)
			const samples = simState.vitalityCurveSamples;
			
			// First, try to detect if this matches a known profile
			const detectedProfile = detectProfile(samples);
			if (detectedProfile) {
				selectedProfileId = detectedProfile;
				// Use the canonical curve points for known profiles
				if (PROFILE_CURVES[detectedProfile]) {
					curvePoints = [...PROFILE_CURVES[detectedProfile]];
					return;
				}
			}
			
			// Otherwise, reconstruct curve points from samples
			curvePoints = [
				{ x: 0, y: samples[0] ?? 0 }
			];
			// Add intermediate points where there are significant changes (check every 8th sample for 128 samples)
			for (let i = 8; i < 120; i += 8) {
				const y = samples[i] ?? 0;
				const prevY = samples[i - 8] ?? 0;
				const nextY = samples[i + 8] ?? 0;
				// Add point if it's a local extremum or significant change
				const isExtremum = (y > prevY && y > nextY) || (y < prevY && y < nextY);
				const isSignificant = Math.abs(y - prevY) > 0.15 || Math.abs(y - nextY) > 0.15;
				if (isExtremum || isSignificant) {
					curvePoints.push({ x: i / 127, y });
				}
			}
			curvePoints.push({ x: 1, y: samples[127] ?? 0 });
			
			// Ensure we have at least 2 points
			if (curvePoints.length < 2) {
				curvePoints = [
					{ x: 0, y: samples[0] ?? 0 },
					{ x: 1, y: samples[127] ?? 0 }
				];
			}
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
		const [r, g, b] = simState.aliveColor;
		const isLight = simState.isLightTheme;
		const bg: [number, number, number] = isLight ? [0.94, 0.94, 0.96] : [0.04, 0.04, 0.06];
		const freq = simState.spectrumFrequency;
		const mode = getSpectrumModeIndex(simState.spectrumMode);
		
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
				dyingLight = mix(Math.min(aliveHsl[2], 0.55), 0.7, dyingProgress * dyingProgress);
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
				dyingLight = mix(Math.min(aliveHsl[2], 0.55), 0.7, dyingProgress * dyingProgress);
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
		// Mode 6: Complement
		else if (mode === 6) {
			const complementHue = fract(aliveHsl[0] + 0.5);
			dyingHue = mix(aliveHsl[0], complementHue, spectrumProgress);
			if (dyingHue > 1) dyingHue -= 1;
			const satCurve = 1.0 - Math.abs(spectrumProgress - 0.5) * 1.5;
			if (isLight) {
				dyingSat = Math.max(aliveHsl[1], 0.7) * Math.max(satCurve, 0.6);
				dyingLight = mix(Math.min(aliveHsl[2], 0.55), 0.68, dyingProgress * dyingProgress);
			} else {
				dyingSat = Math.max(aliveHsl[1], 0.5) * Math.max(satCurve, 0.4);
				dyingLight = mix(aliveHsl[2], 0.12, dyingProgress * dyingProgress);
			}
		}
		// Mode 7: Triadic
		else if (mode === 7) {
			const triadic1 = fract(aliveHsl[0] + 0.333);
			const triadic2 = fract(aliveHsl[0] + 0.666);
			if (spectrumProgress < 0.5) {
				dyingHue = mix(aliveHsl[0], triadic1, spectrumProgress * 2.0);
			} else {
				dyingHue = mix(triadic1, triadic2, (spectrumProgress - 0.5) * 2.0);
			}
			if (dyingHue > 1) dyingHue -= 1;
			if (isLight) {
				dyingSat = Math.max(aliveHsl[1], 0.7) * Math.max(1.0 - spectrumProgress * 0.2, 0.65);
				dyingLight = mix(Math.min(aliveHsl[2], 0.5), 0.65, dyingProgress * dyingProgress);
			} else {
				dyingSat = Math.max(aliveHsl[1], 0.55) * Math.max(1.0 - spectrumProgress * 0.25, 0.5);
				dyingLight = mix(aliveHsl[2], 0.12, dyingProgress * dyingProgress);
			}
		}
		// Mode 8: Split
		else if (mode === 8) {
			const split1 = fract(aliveHsl[0] + 0.417);
			const split2 = fract(aliveHsl[0] + 0.583);
			const phase = Math.sin(spectrumProgress * Math.PI * 2.0) * 0.5 + 0.5;
			dyingHue = mix(split1, split2, phase);
			if (isLight) {
				dyingSat = Math.max(aliveHsl[1], 0.7) * Math.max(1.0 - spectrumProgress * 0.25, 0.6);
				dyingLight = mix(Math.min(aliveHsl[2], 0.52), 0.68, dyingProgress * dyingProgress);
			} else {
				dyingSat = Math.max(aliveHsl[1], 0.5) * Math.max(1.0 - spectrumProgress * 0.3, 0.45);
				dyingLight = mix(aliveHsl[2], 0.12, dyingProgress * dyingProgress);
			}
		}
		// Mode 9: Analogous
		else if (mode === 9) {
			const wave = Math.sin(spectrumProgress * Math.PI * 3.0);
			dyingHue = aliveHsl[0] + wave * 0.083;
			if (dyingHue < 0) dyingHue += 1;
			if (dyingHue > 1) dyingHue -= 1;
			if (isLight) {
				dyingSat = Math.max(aliveHsl[1], 0.65) * Math.max(1.0 - spectrumProgress * 0.25, 0.6);
				dyingLight = mix(Math.min(aliveHsl[2], 0.55), 0.7, dyingProgress * dyingProgress);
			} else {
				dyingSat = Math.max(aliveHsl[1], 0.45) * Math.max(1.0 - spectrumProgress * 0.35, 0.4);
				dyingLight = mix(aliveHsl[2], 0.12, dyingProgress * dyingProgress);
			}
		}
		// Mode 10: Pastel
		else if (mode === 10) {
			dyingHue = aliveHsl[0] + spectrumProgress * 0.15;
			if (dyingHue > 1) dyingHue -= 1;
			if (isLight) {
				dyingSat = Math.max(aliveHsl[1] * 0.6, 0.35) * (1.0 - spectrumProgress * 0.3);
				dyingLight = mix(Math.min(aliveHsl[2], 0.55), 0.72, dyingProgress);
			} else {
				dyingSat = Math.max(aliveHsl[1] * 0.6, 0.25) * (1.0 - spectrumProgress * 0.4);
				dyingLight = mix(Math.max(aliveHsl[2], 0.5), 0.2, dyingProgress);
			}
		}
		// Mode 11: Vivid
		else if (mode === 11) {
			const numBands = 8.0;
			const band = Math.floor(spectrumProgress * numBands);
			dyingHue = aliveHsl[0] + (band / numBands) * 0.4;
			if (dyingHue > 1) dyingHue -= 1;
			const bandVar = fract(band * 0.37);
			if (isLight) {
				dyingSat = Math.min(1.0, Math.max(aliveHsl[1], 0.8) + 0.15 * bandVar);
				dyingLight = mix(0.45, 0.65, dyingProgress * dyingProgress);
			} else {
				dyingSat = Math.min(1.0, Math.max(aliveHsl[1], 0.75) + 0.15 * bandVar);
				dyingLight = mix(0.55, 0.1, dyingProgress * dyingProgress);
			}
		}
		// Mode 12: Thermal
		else if (mode === 12) {
			const numBands = 12.0;
			const band = Math.floor(spectrumProgress * numBands);
			const bandT = band / (numBands - 1.0);
			const isWarmStart = aliveHsl[0] < 0.17 || aliveHsl[0] > 0.83;
			if (isWarmStart) {
				dyingHue = mix(aliveHsl[0], 0.75, bandT);
			} else {
				dyingHue = mix(aliveHsl[0], 0.0, bandT);
			}
			if (dyingHue < 0) dyingHue += 1;
			if (dyingHue > 1) dyingHue -= 1;
			dyingSat = (band % 2 < 1) ? 0.7 : 0.9;
			const fade = dyingProgress * dyingProgress;
			dyingLight = isLight ? mix(0.48, 0.7, fade) : mix(0.55, 0.12, fade);
		}
		// Mode 13: Bands
		else if (mode === 13) {
			const numBands = 10.0;
			const band = Math.floor(spectrumProgress * numBands);
			dyingHue = aliveHsl[0] + (band / numBands) * 0.6;
			if (dyingHue > 1) dyingHue -= 1;
			dyingSat = (band % 2 < 1) ? Math.max(aliveHsl[1], 0.55) : Math.max(aliveHsl[1], 0.75);
			const stripe = band % 2 < 1;
			if (isLight) {
				dyingLight = stripe ? 0.55 : 0.45;
				dyingLight = mix(dyingLight, 0.7, dyingProgress * dyingProgress);
			} else {
				dyingLight = stripe ? 0.4 : 0.52;
				dyingLight = mix(dyingLight, 0.1, dyingProgress * dyingProgress);
			}
		}
		// Mode 14: Neon
		else if (mode === 14) {
			const numBands = 9.0;
			const band = Math.floor(spectrumProgress * numBands);
			const colorIdx = band % 3;
			if (colorIdx < 1) {
				dyingHue = aliveHsl[0];
			} else if (colorIdx < 2) {
				dyingHue = fract(aliveHsl[0] + 0.333);
			} else {
				dyingHue = fract(aliveHsl[0] + 0.666);
			}
			dyingSat = 1.0;
			if (isLight) {
				dyingLight = 0.42 + (band % 3) * 0.04;
				dyingLight = mix(dyingLight, 0.65, dyingProgress * dyingProgress);
			} else {
				dyingLight = 0.52 + (band % 3) * 0.05;
				dyingLight = mix(dyingLight, 0.08, dyingProgress * dyingProgress);
			}
		}
		// Mode 15: Sunset
		else if (mode === 15) {
			const numBands = 12.0;
			const band = Math.floor(spectrumProgress * numBands);
			const bandT = band / (numBands - 1.0);
			const warmHue = mix(aliveHsl[0], 0.08, 0.5);
			const coolHue = 0.6;
			dyingHue = mix(warmHue, coolHue, bandT);
			if (dyingHue < 0) dyingHue += 1;
			dyingSat = (band % 2 < 1) ? 0.65 : 0.85;
			dyingLight = isLight ? mix(0.48, 0.68, dyingProgress * dyingProgress) : mix(0.55, 0.1, dyingProgress * dyingProgress);
		}
		// Mode 16: Ocean
		else if (mode === 16) {
			const numBands = 10.0;
			const band = Math.floor(spectrumProgress * numBands);
			const bandT = band / (numBands - 1.0);
			const baseOcean = mix(0.5, 0.66, bandT);
			dyingHue = mix(aliveHsl[0], baseOcean, 0.3 + spectrumProgress * 0.7);
			const wave = Math.sin(bandT * Math.PI * 2.0) * 0.15;
			if (isLight) {
				dyingSat = Math.max(0.65, aliveHsl[1] * 0.9) + wave;
				dyingLight = mix(0.45, 0.65, dyingProgress * dyingProgress);
			} else {
				dyingSat = Math.max(0.6, aliveHsl[1] * 0.9) + wave;
				dyingLight = mix(0.5, 0.08, dyingProgress * dyingProgress);
			}
		}
		// Mode 17: Forest (default)
		else {
			const numBands = 10.0;
			const band = Math.floor(spectrumProgress * numBands);
			const bandT = band / (numBands - 1.0);
			const forestHue = mix(0.33, 0.08, bandT);
			dyingHue = mix(aliveHsl[0], forestHue, 0.4 + spectrumProgress * 0.6);
			if (dyingHue < 0) dyingHue += 1;
			if (isLight) {
				dyingSat = mix(Math.max(aliveHsl[1], 0.6), 0.45, bandT);
				dyingLight = mix(0.42, 0.62, dyingProgress * dyingProgress);
			} else {
				dyingSat = mix(Math.max(aliveHsl[1], 0.6), 0.4, bandT);
				dyingLight = mix(0.45, 0.1, dyingProgress * dyingProgress);
			}
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
	// This ensures the curve never overshoots and is always a proper function
	function monotonicCubicInterpolation(points: {x: number, y: number}[], xVal: number): number {
		const n = points.length;
		if (n === 0) return 0;
		if (n === 1) return points[0].y;
		
		// Ensure points are sorted by x
		const sorted = [...points].sort((a, b) => a.x - b.x);
		
		// Handle out of bounds
		if (xVal <= sorted[0].x) return sorted[0].y;
		if (xVal >= sorted[n - 1].x) return sorted[n - 1].y;
		
		// Find the segment containing xVal
		let i = 0;
		while (i < n - 1 && sorted[i + 1].x < xVal) i++;
		
		const x0 = sorted[i].x;
		const x1 = sorted[i + 1].x;
		const y0 = sorted[i].y;
		const y1 = sorted[i + 1].y;
		
		// Calculate secant slopes for all segments
		const deltas: number[] = [];
		const slopes: number[] = [];
		for (let j = 0; j < n - 1; j++) {
			const dx = sorted[j + 1].x - sorted[j].x;
			deltas.push(dx);
			slopes.push(dx === 0 ? 0 : (sorted[j + 1].y - sorted[j].y) / dx);
		}
		
		// Calculate tangents at each point using Fritsch-Carlson method
		const tangents: number[] = [];
		for (let j = 0; j < n; j++) {
			if (j === 0) {
				tangents.push(slopes[0]);
			} else if (j === n - 1) {
				tangents.push(slopes[n - 2]);
			} else {
				// Average of adjacent slopes, but check for sign changes
				const m0 = slopes[j - 1];
				const m1 = slopes[j];
				if (m0 * m1 <= 0) {
					// Sign change or zero - use zero tangent to prevent overshoot
					tangents.push(0);
				} else {
					// Harmonic mean weighted by segment lengths for smoother curves
					const w0 = 2 * deltas[j] + deltas[j - 1];
					const w1 = deltas[j] + 2 * deltas[j - 1];
					tangents.push((w0 + w1) / (w0 / m0 + w1 / m1));
				}
			}
		}
		
		// Constrain tangents to ensure monotonicity (Fritsch-Carlson constraint)
		for (let j = 0; j < n - 1; j++) {
			const m = slopes[j];
			if (m === 0) {
				tangents[j] = 0;
				tangents[j + 1] = 0;
			} else {
				const alpha = tangents[j] / m;
				const beta = tangents[j + 1] / m;
				// Check if we need to constrain
				const tau = alpha * alpha + beta * beta;
				if (tau > 9) {
					const s = 3 / Math.sqrt(tau);
					tangents[j] = s * alpha * m;
					tangents[j + 1] = s * beta * m;
				}
			}
		}
		
		// Hermite interpolation within the segment
		const h = x1 - x0;
		const t = (xVal - x0) / h;
		const t2 = t * t;
		const t3 = t2 * t;
		
		// Hermite basis functions
		const h00 = 2 * t3 - 3 * t2 + 1;
		const h10 = t3 - 2 * t2 + t;
		const h01 = -2 * t3 + 3 * t2;
		const h11 = t3 - t2;
		
		return h00 * y0 + h10 * h * tangents[i] + h01 * y1 + h11 * h * tangents[i + 1];
	}
	
	// Legacy function for compatibility - now just wraps the monotonic interpolation
	function catmullRomSpline(points: {x: number, y: number}[], t: number, _tension: number = 0.5): {x: number, y: number} {
		const sorted = [...points].sort((a, b) => a.x - b.x);
		if (sorted.length < 2) return sorted[0] || { x: 0, y: 0 };
		
		// Map t (0-1) to x range
		const xMin = sorted[0].x;
		const xMax = sorted[sorted.length - 1].x;
		const xVal = xMin + t * (xMax - xMin);
		
		return {
			x: xVal,
			y: monotonicCubicInterpolation(sorted, xVal)
		};
	}
	
	// Generate smooth curve path
	const curvePath = $derived.by(() => {
		if (curvePoints.length < 2) return '';
		
		const sortedPoints = [...curvePoints].sort((a, b) => a.x - b.x);
		const pathPoints: string[] = [];
		const steps = 50;
		
		for (let i = 0; i <= steps; i++) {
			const t = i / steps;
			const point = catmullRomSpline(sortedPoints, t, 0.5);
			const svgX = toSvgX(point.x);
			const svgY = toSvgY(point.y);
			pathPoints.push(`${i === 0 ? 'M' : 'L'} ${svgX} ${svgY}`);
		}
		
		return pathPoints.join(' ');
	});
	
	// Generate fill paths for positive/negative regions
	const positiveFillPath = $derived.by(() => {
		if (curvePoints.length < 2) return '';
		
		const sortedPoints = [...curvePoints].sort((a, b) => a.x - b.x);
		const pathPoints: string[] = [];
		const steps = 50;
		const zeroY = toSvgY(0);
		
		// Start at the left on the zero line
		pathPoints.push(`M ${toSvgX(0)} ${zeroY}`);
		
		// Follow the curve (only the parts above zero)
		for (let i = 0; i <= steps; i++) {
			const t = i / steps;
			const point = catmullRomSpline(sortedPoints, t, 0.5);
			const clampedY = Math.max(0, point.y); // Only positive part
			const svgX = toSvgX(point.x);
			const svgY = toSvgY(clampedY);
			pathPoints.push(`L ${svgX} ${svgY}`);
		}
		
		// Close back to zero line
		pathPoints.push(`L ${toSvgX(1)} ${zeroY}`);
		pathPoints.push('Z');
		
		return pathPoints.join(' ');
	});
	
	const negativeFillPath = $derived.by(() => {
		if (curvePoints.length < 2) return '';
		
		const sortedPoints = [...curvePoints].sort((a, b) => a.x - b.x);
		const pathPoints: string[] = [];
		const steps = 50;
		const zeroY = toSvgY(0);
		
		// Start at the left on the zero line
		pathPoints.push(`M ${toSvgX(0)} ${zeroY}`);
		
		// Follow the curve (only the parts below zero)
		for (let i = 0; i <= steps; i++) {
			const t = i / steps;
			const point = catmullRomSpline(sortedPoints, t, 0.5);
			const clampedY = Math.min(0, point.y); // Only negative part
			const svgX = toSvgX(point.x);
			const svgY = toSvgY(clampedY);
			pathPoints.push(`L ${svgX} ${svgY}`);
		}
		
		// Close back to zero line
		pathPoints.push(`L ${toSvgX(1)} ${zeroY}`);
		pathPoints.push('Z');
		
		return pathPoints.join(' ');
	});
	
	// Dragging state
	let draggingIndex = $state<number | null>(null);
	let svgElement = $state<SVGSVGElement | null>(null);
	
	// Edit mode: 'add' to add points on click, 'delete' to delete points on click
	let editMode = $state<'add' | 'delete'>('add');
	
	// Check if a point is the anchor point at x=0 (should not be movable/deletable)
	function isAnchorPoint(index: number): boolean {
		return curvePoints[index]?.x === 0;
	}
	
	// Check if a point is the endpoint at x=1 (can move vertically only)
	function isEndpoint(index: number): boolean {
		const sorted = [...curvePoints].sort((a, b) => a.x - b.x);
		return curvePoints[index]?.x === sorted[sorted.length - 1]?.x && curvePoints[index]?.x > 0.9;
	}
	
	function handlePointMouseDown(index: number, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		
		// In delete mode, delete the point instead of dragging
		if (editMode === 'delete') {
			handleDeletePoint(index);
			return;
		}
		
		// Don't allow dragging the anchor point at x=0
		if (isAnchorPoint(index)) return;
		
		draggingIndex = index;
		
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	}
	
	function handlePointTouchStart(index: number, e: TouchEvent) {
		e.preventDefault();
		e.stopPropagation();
		
		// In delete mode, delete the point instead of dragging
		if (editMode === 'delete') {
			handleDeletePoint(index);
			return;
		}
		
		// Don't allow dragging the anchor point at x=0
		if (isAnchorPoint(index)) return;
		
		draggingIndex = index;
		
		window.addEventListener('touchmove', handleTouchMove, { passive: false });
		window.addEventListener('touchend', handleTouchEnd);
	}
	
	function handleMouseMove(e: MouseEvent) {
		if (draggingIndex === null || !svgElement) return;
		
		const rect = svgElement.getBoundingClientRect();
		// Scale from screen coordinates to SVG viewBox coordinates
		const scaleX = width / rect.width;
		const scaleY = height / rect.height;
		const svgX = (e.clientX - rect.left) * scaleX;
		const svgY = (e.clientY - rect.top) * scaleY;
		
		updateDraggedPoint(svgX, svgY);
	}
	
	function handleTouchMove(e: TouchEvent) {
		if (draggingIndex === null || !svgElement) return;
		e.preventDefault();
		
		const touch = e.touches[0];
		const rect = svgElement.getBoundingClientRect();
		// Scale from screen coordinates to SVG viewBox coordinates
		const scaleX = width / rect.width;
		const scaleY = height / rect.height;
		const svgX = (touch.clientX - rect.left) * scaleX;
		const svgY = (touch.clientY - rect.top) * scaleY;
		
		updateDraggedPoint(svgX, svgY);
	}
	
	function updateDraggedPoint(svgX: number, svgY: number) {
		if (draggingIndex === null) return;
		
		const newX = fromSvgX(svgX);
		const newY = fromSvgY(svgY);
		
		// Get sorted points to find neighbors
		const sortedIndices = curvePoints
			.map((p, i) => ({ x: p.x, i }))
			.sort((a, b) => a.x - b.x)
			.map(p => p.i);
		
		const sortedPos = sortedIndices.indexOf(draggingIndex);
		const prevIndex = sortedPos > 0 ? sortedIndices[sortedPos - 1] : null;
		const nextIndex = sortedPos < sortedIndices.length - 1 ? sortedIndices[sortedPos + 1] : null;
		
		// Constrain X to be between neighbors (with small margin)
		const minX = prevIndex !== null ? curvePoints[prevIndex].x + 0.02 : 0.02;
		const maxX = nextIndex !== null ? curvePoints[nextIndex].x - 0.02 : 1;
		
		// Check if this is the rightmost point (endpoint)
		const isEndpointDrag = isEndpoint(draggingIndex);
		
		curvePoints[draggingIndex] = {
			x: isEndpointDrag ? curvePoints[draggingIndex].x : Math.max(minX, Math.min(maxX, newX)),
			y: Math.max(yMin, Math.min(yMax, newY))
		};
		
		// Manual edit clears the selected profile
		selectedProfileId = null;
		
		// Update the simulation state
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
	
	// Add new point on curve mousedown (only in add mode) and immediately start dragging
	function handleCurveMouseDown(e: MouseEvent) {
		if (!svgElement) return;
		if (editMode !== 'add') return;
		
		e.preventDefault();
		
		const rect = svgElement.getBoundingClientRect();
		// Scale from screen coordinates to SVG viewBox coordinates
		const scaleX = width / rect.width;
		const scaleY = height / rect.height;
		const svgX = (e.clientX - rect.left) * scaleX;
		const svgY = (e.clientY - rect.top) * scaleY;
		
		const newX = fromSvgX(svgX);
		const newY = fromSvgY(svgY);
		
		// Clamp to valid range (not at the anchor point)
		const clampedX = Math.max(0.03, Math.min(0.97, newX));
		
		// Don't add points too close to existing ones
		const minDistance = 0.04;
		const tooClose = curvePoints.some(p => Math.abs(p.x - clampedX) < minDistance);
		if (tooClose) return;
		
		// Add the new point and sort
		const newPoint = { x: clampedX, y: Math.max(yMin, Math.min(yMax, newY)) };
		curvePoints = [...curvePoints, newPoint].sort((a, b) => a.x - b.x);
		
		// Find the index of the newly added point
		const newIndex = curvePoints.findIndex(p => p.x === newPoint.x && p.y === newPoint.y);
		
		// Manual edit clears the selected profile
		selectedProfileId = null;
		
		// Start dragging the new point immediately
		draggingIndex = newIndex;
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
		
		updateSimState();
	}
	
	// Handle touch start on curve to add new point
	function handleCurveTouchStart(e: TouchEvent) {
		if (!svgElement) return;
		if (editMode !== 'add') return;
		
		e.preventDefault();
		
		const touch = e.touches[0];
		const rect = svgElement.getBoundingClientRect();
		// Scale from screen coordinates to SVG viewBox coordinates
		const scaleX = width / rect.width;
		const scaleY = height / rect.height;
		const svgX = (touch.clientX - rect.left) * scaleX;
		const svgY = (touch.clientY - rect.top) * scaleY;
		
		const newX = fromSvgX(svgX);
		const newY = fromSvgY(svgY);
		
		// Clamp to valid range (not at the anchor point)
		const clampedX = Math.max(0.03, Math.min(0.97, newX));
		
		// Don't add points too close to existing ones
		const minDistance = 0.04;
		const tooClose = curvePoints.some(p => Math.abs(p.x - clampedX) < minDistance);
		if (tooClose) return;
		
		// Add the new point and sort
		const newPoint = { x: clampedX, y: Math.max(yMin, Math.min(yMax, newY)) };
		curvePoints = [...curvePoints, newPoint].sort((a, b) => a.x - b.x);
		
		// Find the index of the newly added point
		const newIndex = curvePoints.findIndex(p => p.x === newPoint.x && p.y === newPoint.y);
		
		// Manual edit clears the selected profile
		selectedProfileId = null;
		
		// Start dragging the new point immediately
		draggingIndex = newIndex;
		window.addEventListener('touchmove', handleTouchMove, { passive: false });
		window.addEventListener('touchend', handleTouchEnd);
		
		updateSimState();
	}
	
	// Delete a point
	function handleDeletePoint(index: number) {
		// Don't remove the anchor point (x=0), endpoint, or if we only have 2 points
		if (isAnchorPoint(index)) return;
		if (isEndpoint(index)) return;
		if (curvePoints.length <= 2) return;
		
		// Manual edit clears the selected profile
		selectedProfileId = null;
		
		curvePoints = curvePoints.filter((_, i) => i !== index);
		updateSimState();
	}
	
	// Double-click to remove a point (alternative to delete mode)
	function handlePointDoubleClick(index: number) {
		handleDeletePoint(index);
	}
	
	// Sample the curve at a given vitality value (0-1)
	function sampleCurveAt(vitality: number): number {
		// Use monotonic cubic interpolation - directly evaluates Y at any X
		// This is guaranteed to be a proper function (single Y for each X)
		const y = monotonicCubicInterpolation(curvePoints, vitality);
		return Math.max(yMin, Math.min(yMax, y));
	}
	
	// Update simulation state from curve by sampling at 128 fixed points
	function updateSimState() {
		// Sample the curve at 128 evenly spaced vitality values (0/127, 1/127, ..., 127/127)
		const samples: number[] = [];
		for (let i = 0; i < 128; i++) {
			const vitality = i / 127; // 0 to 1
			samples.push(sampleCurveAt(vitality));
		}
		
		// Check if curve is essentially "off" (all samples near zero)
		const isOff = samples.every(s => Math.abs(s) < 0.01);
		
		if (isOff) {
			simState.vitalityMode = 'none';
			// Update tracking variables to prevent false external change detection
			lastVitalityMode = 'none';
			lastGhostFactor = 0;
			lastCurveSamplesHash = '';
		} else {
			// Use curve mode with the sampled values
			simState.vitalityMode = 'curve';
			simState.vitalityCurveSamples = samples;
			// Update tracking variables to prevent false external change detection
			lastVitalityMode = 'curve';
			lastCurveSamplesHash = hashSamples(samples);
		}
	}
	
	// Apply a profile
	function applyProfile(profileId: string) {
		selectedProfileId = profileId;
		switch (profileId) {
			case 'off':
				// Dying cells are invisible (standard CA behavior)
				curvePoints = [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 }
				];
				break;
			case 'linear':
				// Linear ramp - recently died cells count almost fully
				curvePoints = [
					{ x: 0, y: 0 },
					{ x: 1, y: 1 }
				];
				break;
			case 'soft':
				// S-curve - smooth transition, most influence from recent deaths
				curvePoints = [
					{ x: 0, y: 0 },
					{ x: 0.25, y: 0.05 },
					{ x: 0.5, y: 0.5 },
					{ x: 0.75, y: 0.95 },
					{ x: 1, y: 1 }
				];
				break;
			case 'inhibit':
				// Negative influence - dying cells suppress births nearby
				curvePoints = [
					{ x: 0, y: 0 },
					{ x: 0.3, y: -0.5 },
					{ x: 0.7, y: -0.7 },
					{ x: 1, y: -0.4 }
				];
				break;
			case 'mixed':
				// Wave pattern - early death inhibits, recent death excites
				curvePoints = [
					{ x: 0, y: 0 },
					{ x: 0.25, y: -0.5 },
					{ x: 0.5, y: 0 },
					{ x: 0.75, y: 0.7 },
					{ x: 1, y: 0.5 }
				];
				break;
			case 'step':
				// Hard threshold at 50% - binary counting for older dying cells
				curvePoints = [
					{ x: 0, y: 0 },
					{ x: 0.48, y: 0 },
					{ x: 0.50, y: 0.5 },
					{ x: 0.52, y: 1 },
					{ x: 1, y: 1 }
				];
				break;
			case 'midlife-crisis':
				// Oscillating inhibition - dying cells create complex interference
				curvePoints = [
					{ x: 0, y: 0 },
					{ x: 0.372, y: -0.746 },
					{ x: 0.531, y: 0.321 },
					{ x: 0.695, y: -0.669 },
					{ x: 1, y: -1 }
				];
				break;
		}
		updateSimState();
	}
	
	// When curve is manually edited, clear the selected profile
	function onCurveModified() {
		selectedProfileId = null;
	}
	
	// Get accent color (alive color)
	const accentColor = $derived.by(() => {
		const [r, g, b] = simState.aliveColor;
		return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
	});
	
	// Theme-aware colors - subtle and elegant
	const gridColor = $derived(simState.isLightTheme ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)');
	const zeroLineColor = $derived(simState.isLightTheme ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)');
	const textColor = $derived(simState.isLightTheme ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)');
	
	// Download curve as JSON
	function downloadCurve() {
		const data = {
			name: 'Custom Curve',
			points: curvePoints.map(p => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 })),
			samples: simState.vitalityCurveSamples.map(s => Math.round(s * 1000) / 1000)
		};
		const json = JSON.stringify(data, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `vitality-curve-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}
	
	// Reset curve to "Off" profile (flat line at 0)
	function resetCurve() {
		applyProfile('off');
	}
</script>

<div class="curve-editor">
	<div class="header">
		<span class="label">Neighborhood Vitality Influence</span>
	</div>
	
	<div class="main-content">
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<svg 
			bind:this={svgElement}
			{width} 
			{height} 
			viewBox="0 0 {width} {height}"
			class="curve-svg"
			onmousedown={handleCurveMouseDown}
			ontouchstart={handleCurveTouchStart}
			role="application"
			aria-label="Memory influence curve editor"
		>
		<!-- Gradient definitions for curve and fill areas -->
		<defs>
			<!-- Full opacity gradient for the curve stroke -->
			<linearGradient id="vitalityGradient" x1="0%" y1="0%" x2="100%" y2="0%">
				{#each Array(33) as _, i}
					{@const vitality = i / 32}
					<stop offset="{vitality * 100}%" stop-color={getVitalityColor(vitality)} />
				{/each}
			</linearGradient>
			<!-- Semi-transparent gradient for fill areas -->
			<linearGradient id="vitalityFillGradient" x1="0%" y1="0%" x2="100%" y2="0%">
				{#each Array(33) as _, i}
					{@const vitality = i / 32}
					<stop offset="{vitality * 100}%" stop-color={getVitalityColor(vitality)} stop-opacity="0.25" />
				{/each}
			</linearGradient>
		</defs>
		
		<!-- Grid lines - horizontal at ±1 and ±2 -->
		<line x1={padding.left} y1={toSvgY(1)} x2={padding.left + plotWidth} y2={toSvgY(1)} stroke={gridColor} stroke-dasharray="2,2" />
		<line x1={padding.left} y1={toSvgY(-1)} x2={padding.left + plotWidth} y2={toSvgY(-1)} stroke={gridColor} stroke-dasharray="2,2" />
		<!-- Vertical grid lines -->
		<line x1={toSvgX(0.25)} y1={padding.top} x2={toSvgX(0.25)} y2={padding.top + plotHeight} stroke={gridColor} stroke-dasharray="2,2" />
		<line x1={toSvgX(0.5)} y1={padding.top} x2={toSvgX(0.5)} y2={padding.top + plotHeight} stroke={gridColor} stroke-dasharray="2,2" />
		<line x1={toSvgX(0.75)} y1={padding.top} x2={toSvgX(0.75)} y2={padding.top + plotHeight} stroke={gridColor} stroke-dasharray="2,2" />
		
		<!-- Zero line (neutral) - more prominent -->
		<line 
			x1={padding.left} 
			y1={toSvgY(0)} 
			x2={padding.left + plotWidth} 
			y2={toSvgY(0)} 
			stroke={zeroLineColor}
			stroke-width="1"
		/>
		
		<!-- Border -->
		<rect 
			x={padding.left} 
			y={padding.top} 
			width={plotWidth} 
			height={plotHeight}
			fill="none"
			stroke={gridColor}
			stroke-width="1"
		/>
		
		<!-- Positive fill area with vitality gradient -->
		<path d={positiveFillPath} fill="url(#vitalityFillGradient)" />
		
		<!-- Negative fill area with vitality gradient -->
		<path d={negativeFillPath} fill="url(#vitalityFillGradient)" />
		
		<!-- The curve with vitality color gradient -->
		<path 
			d={curvePath} 
			fill="none" 
			stroke="url(#vitalityGradient)"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		
		<!-- Sample point indicators (subtle, show sampling resolution) -->
		{#each Array(16) as _, i}
			{@const vitality = (i * 8) / 127}
			{@const sampleY = sampleCurveAt(vitality)}
			<circle 
				cx={toSvgX(vitality)}
				cy={toSvgY(sampleY)}
				r="1"
				fill={simState.isLightTheme ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)'}
			/>
		{/each}
		
		<!-- Control points -->
		{#each curvePoints as point, index (point.x)}
			{@const isDeletable = !isAnchorPoint(index) && !isEndpoint(index)}
			{@const pointColor = getVitalityColor(point.x)}
			{@const deleteColor = simState.isLightTheme ? 'rgba(180, 60, 60, 0.9)' : 'rgba(220, 80, 80, 0.9)'}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<g 
				class="control-point"
				class:anchor={isAnchorPoint(index)}
				class:endpoint={isEndpoint(index)}
				class:dragging={draggingIndex === index}
				class:delete-mode={editMode === 'delete' && isDeletable}
				onmousedown={(e) => handlePointMouseDown(index, e)}
				ontouchstart={(e) => handlePointTouchStart(index, e)}
				ondblclick={() => handlePointDoubleClick(index)}
			>
				<!-- Larger hit area -->
				<circle 
					cx={toSvgX(point.x)}
					cy={toSvgY(point.y)}
					r="14"
					fill="transparent"
					class="hit-area"
				/>
				<!-- Visible point with vitality-based color -->
				<circle 
					cx={toSvgX(point.x)}
					cy={toSvgY(point.y)}
					r={isAnchorPoint(index) ? 4 : 6}
					fill={editMode === 'delete' && isDeletable ? deleteColor : pointColor}
					stroke={simState.isLightTheme ? 'rgba(255,255,255,0.9)' : 'rgba(10,10,15,0.9)'}
					stroke-width="1.5"
				/>
				<!-- Delete indicator -->
				{#if editMode === 'delete' && isDeletable}
					<text
						x={toSvgX(point.x)}
						y={toSvgY(point.y) + 3}
						font-size="9"
						fill="white"
						text-anchor="middle"
						style="pointer-events: none; font-weight: 600"
					>×</text>
				{/if}
			</g>
		{/each}
		
		<!-- Axis labels -->
		<text x={padding.left - 8} y={toSvgY(2) + 3} font-size="7" fill={textColor} text-anchor="end">+2</text>
		<text x={padding.left - 8} y={toSvgY(1) + 3} font-size="7" fill={textColor} text-anchor="end">+1</text>
		<text x={padding.left - 8} y={toSvgY(0) + 3} font-size="7" fill={textColor} text-anchor="end">0</text>
		<text x={padding.left - 8} y={toSvgY(-1) + 3} font-size="7" fill={textColor} text-anchor="end">-1</text>
		<text x={padding.left - 8} y={toSvgY(-2) + 3} font-size="7" fill={textColor} text-anchor="end">-2</text>
		
		<text x={padding.left} y={height - 5} font-size="8" fill={textColor}>dead</text>
		<text x={padding.left + plotWidth} y={height - 5} font-size="8" fill={textColor} text-anchor="end">alive</text>
	</svg>
	
	<div class="side-controls">
		<!-- Row 1: Profile dropdown -->
		<div class="dropdown-wrapper">
			<button class="select-btn" onclick={() => { profileDropdownOpen = true; profileSearchQuery = ''; }}>
				<span class="select-label">Profile</span>
				<span class="select-value">{currentProfileName}</span>
				<svg class="chevron" class:open={profileDropdownOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg>
			</button>
			{#if profileDropdownOpen}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="dropdown-backdrop" onclick={() => { profileDropdownOpen = false; profileSearchQuery = ''; }} onkeydown={() => {}}></div>
				<div class="dropdown-menu" role="listbox" tabindex="-1" onkeydown={(e) => {
					if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
						profileSearchQuery += e.key;
						e.preventDefault();
					} else if (e.key === 'Backspace') {
						profileSearchQuery = profileSearchQuery.slice(0, -1);
						e.preventDefault();
					} else if (e.key === 'Escape') {
						profileDropdownOpen = false;
						profileSearchQuery = '';
					}
				}}>
					{#if profileSearchQuery}
						<div class="search-indicator">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
							<span>{profileSearchQuery}</span>
							<button class="clear-search" onclick={() => profileSearchQuery = ''}>×</button>
						</div>
					{/if}
					<div class="dropdown-list" bind:this={profileListRef}>
						{#if filteredProfiles.filter(p => p.category === 'basic').length > 0}
							<div class="dropdown-section">Basic</div>
							{#each filteredProfiles.filter(p => p.category === 'basic') as profile}
								<button class="dropdown-item" class:selected={selectedProfileId === profile.id} onclick={() => { applyProfile(profile.id); profileDropdownOpen = false; profileSearchQuery = ''; }}>
									<span class="item-name">{profile.name}</span>
									<span class="item-desc">{profile.description}</span>
								</button>
							{/each}
						{/if}
						{#if filteredProfiles.filter(p => p.category === 'advanced').length > 0}
							<div class="dropdown-section">Advanced</div>
							{#each filteredProfiles.filter(p => p.category === 'advanced') as profile}
								<button class="dropdown-item" class:selected={selectedProfileId === profile.id} onclick={() => { applyProfile(profile.id); profileDropdownOpen = false; profileSearchQuery = ''; }}>
									<span class="item-name">{profile.name}</span>
									<span class="item-desc">{profile.description}</span>
								</button>
							{/each}
						{/if}
						{#if filteredProfiles.length === 0}
							<div class="no-results">No profiles match "{profileSearchQuery}"</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
		
		<!-- Row 2: Mode toggle + Reset + Download -->
		<div class="buttons-row">
			<div class="toggle-buttons">
				<button 
					class="toggle-btn"
					class:active={editMode === 'add'}
					onclick={() => editMode = 'add'}
					title="Click on curve to add points"
				>
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="8" y1="3" x2="8" y2="13" />
						<line x1="3" y1="8" x2="13" y2="8" />
					</svg>
				</button>
				<button 
					class="toggle-btn delete"
					class:active={editMode === 'delete'}
					onclick={() => editMode = 'delete'}
					title="Click on points to delete them"
				>
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="3" y1="8" x2="13" y2="8" />
					</svg>
				</button>
			</div>
			
			<button 
				class="icon-btn"
				onclick={resetCurve}
				title="Reset curve to Off"
				aria-label="Reset curve"
			>
				<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M2 8a6 6 0 1 1 1.5 4" />
					<path d="M2 12V8h4" />
				</svg>
			</button>
			
			<button 
				class="icon-btn"
				onclick={downloadCurve}
				title="Download curve as JSON"
				aria-label="Download curve"
			>
				<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M8 2v8M8 10l-3-3M8 10l3-3M3 12v2h10v-2" />
				</svg>
			</button>
		</div>
		
		<!-- Row 3: Hint -->
		<div class="hint">
			{#if editMode === 'add'}
				Click curve to add points • Drag to adjust
			{:else}
				Click points to delete
			{/if}
		</div>
	</div>
	</div>
</div>

<style>
	.curve-editor {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	
	.label {
		font-size: 0.6rem;
		text-transform: uppercase;
		color: var(--ui-text, #666);
		letter-spacing: 0.03em;
	}
	
	.control-point {
		cursor: grab;
	}
	
	.control-point:hover circle:not(.hit-area) {
		filter: brightness(1.2);
	}
	
	.control-point.anchor {
		cursor: not-allowed;
	}
	
	.control-point.endpoint {
		cursor: ns-resize;
	}
	
	.control-point.dragging {
		cursor: grabbing;
	}
	
	.control-point.delete-mode {
		cursor: pointer;
	}
	
	.control-point.delete-mode:hover circle:not(.hit-area) {
		filter: brightness(0.8) saturate(1.2);
	}
	
	.main-content {
		display: flex;
		gap: 0.6rem;
		align-items: stretch;
	}
	
	.curve-svg {
		flex: 0 0 68%;
		max-width: 68%;
		height: auto;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.2));
		border-radius: 6px;
		cursor: crosshair;
		touch-action: none;
	}
	
	.side-controls {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		justify-content: center;
	}
	
	.buttons-row {
		display: flex;
		gap: 0.3rem;
		align-items: center;
		justify-content: space-between;
	}
	
	/* Dropdown styles matching RuleEditor */
	.dropdown-wrapper {
		position: relative;
		display: flex;
		width: 100%;
	}
	
	.select-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.5rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 4px;
		color: var(--ui-text-hover, #ccc);
		font-size: 0.6rem;
		cursor: pointer;
		width: 100%;
		text-align: left;
	}
	
	.select-btn:hover {
		border-color: var(--ui-border-hover, rgba(255, 255, 255, 0.2));
	}
	
	.select-label {
		font-size: 0.5rem;
		text-transform: uppercase;
		color: var(--ui-text, #666);
		letter-spacing: 0.03em;
	}
	
	.select-value {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	
	.chevron {
		width: 12px;
		height: 12px;
		opacity: 0.5;
		transition: transform 0.15s;
	}
	
	.chevron.open {
		transform: rotate(180deg);
	}
	
	.dropdown-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10;
	}
	
	.dropdown-menu {
		position: absolute;
		bottom: calc(100% + 4px);
		left: 0;
		min-width: 100%;
		min-width: 240px;
		max-width: 280px;
		background: var(--ui-bg, rgba(16, 16, 24, 0.98));
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.15));
		border-radius: 6px;
		max-height: 260px;
		overflow-y: auto;
		z-index: 20;
		box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.4);
	}
	
	/* Theme-aware scrollbar for dropdowns */
	.dropdown-menu::-webkit-scrollbar {
		width: 6px;
	}
	
	.dropdown-menu::-webkit-scrollbar-track {
		background: transparent;
	}
	
	.dropdown-menu::-webkit-scrollbar-thumb {
		background: var(--ui-border, rgba(255, 255, 255, 0.2));
		border-radius: 3px;
	}
	
	.dropdown-menu::-webkit-scrollbar-thumb:hover {
		background: var(--ui-text, rgba(255, 255, 255, 0.3));
	}
	
	.dropdown-list {
		padding: 0.35rem;
	}
	
	.dropdown-section {
		padding: 0.4rem 0.6rem 0.25rem;
		font-size: 0.5rem;
		color: var(--ui-text, #666);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	
	.dropdown-item {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
		padding: 0.5rem 0.6rem;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: var(--ui-text, #888);
		font-size: 0.65rem;
		cursor: pointer;
		text-align: left;
		transition: all 0.1s;
	}
	
	.dropdown-item:hover {
		background: var(--ui-bg-hover, rgba(255, 255, 255, 0.08));
		color: var(--ui-text-hover, #fff);
	}
	
	.dropdown-item.selected {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		color: var(--ui-accent, #2dd4bf);
	}
	
	.item-name {
		font-weight: 500;
		color: inherit;
	}
	
	.item-desc {
		font-size: 0.5rem;
		color: var(--ui-text, #666);
		opacity: 0.8;
	}
	
	.dropdown-item:hover .item-desc {
		color: var(--ui-text, #999);
	}
	
	.dropdown-item.selected .item-desc {
		color: var(--ui-accent, #2dd4bf);
		opacity: 0.6;
	}
	
	.search-indicator {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		font-size: 0.6rem;
		color: var(--ui-accent, #2dd4bf);
	}
	
	.search-indicator svg {
		width: 12px;
		height: 12px;
		opacity: 0.6;
	}
	
	.clear-search {
		margin-left: auto;
		padding: 0 0.3rem;
		background: transparent;
		border: none;
		color: var(--ui-text, #666);
		cursor: pointer;
		font-size: 0.8rem;
	}
	
	.clear-search:hover {
		color: var(--ui-text-hover, #fff);
	}
	
	.no-results {
		padding: 0.5rem;
		text-align: center;
		font-size: 0.55rem;
		color: var(--ui-text, #666);
	}
	
	.toggle-buttons {
		display: flex;
	}
	
	.toggle-btn {
		padding: 0.25rem 0.4rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		color: var(--ui-text, #666);
		cursor: pointer;
		transition: all 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.toggle-btn:first-child {
		border-radius: 3px 0 0 3px;
	}
	
	.toggle-btn:last-child {
		border-radius: 0 3px 3px 0;
		border-left: none;
	}
	
	.toggle-btn svg {
		width: 10px;
		height: 10px;
	}
	
	.toggle-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		color: var(--ui-text-hover, #ccc);
	}
	
	.toggle-btn.active {
		background: var(--ui-accent-bg, rgba(45, 212, 191, 0.15));
		color: var(--ui-accent, #2dd4bf);
	}
	
	.toggle-btn.delete.active {
		background: rgba(180, 80, 80, 0.12);
		color: rgb(180, 100, 100);
	}
	
	.icon-btn {
		padding: 0.25rem;
		background: var(--ui-input-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.1));
		border-radius: 3px;
		color: var(--ui-text, #666);
		cursor: pointer;
		transition: all 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.icon-btn:hover {
		background: var(--ui-border-hover, rgba(255, 255, 255, 0.08));
		color: var(--ui-accent, #2dd4bf);
	}
	
	.icon-btn svg {
		width: 12px;
		height: 12px;
	}
	
	.hint {
		font-size: 0.45rem;
		color: var(--ui-text, #555);
		line-height: 1.3;
		text-align: center;
		opacity: 0.7;
	}
	
	/* Mobile responsiveness */
	@media (max-width: 540px) {
		.curve-editor {
			gap: 0.3rem;
		}
		
		.main-content {
			flex-direction: column;
			gap: 0.4rem;
		}
		
		.curve-svg {
			flex: none;
			max-width: 100%;
		}
		
		.side-controls {
			flex-direction: row;
			flex-wrap: wrap;
			gap: 0.3rem;
		}
		
		.dropdown-wrapper {
			flex: 1;
			min-width: 120px;
		}
		
		.buttons-row {
			flex: 1;
			min-width: 100px;
		}
		
		.hint {
			width: 100%;
			font-size: 0.4rem;
		}
	}
</style>

