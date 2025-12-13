import type { BoundaryId, NeighborhoodId } from '../spec/mappings.js';
import type { RuleSpec } from '../rules/rule-spec.js';
import type { VitalityMode } from '../vitality/vitality-spec.js';
import { maxNeighborsForNeighborhood } from '../rules/rule-strings.js';

export interface CpuStepConfig {
	width: number;
	height: number;
	rule: RuleSpec;
	boundary: BoundaryId;
	vitality: {
		mode: VitalityMode;
		threshold: number;
		ghostFactor: number;
		sigmoidSharpness: number;
		decayPower: number;
		curveSamples: readonly number[]; // 128 samples, 0..1 vitality
	};
}

function isWrappingX(boundary: BoundaryId): boolean {
	return (
		boundary === 'cylinderX' ||
		boundary === 'torus' ||
		boundary === 'mobiusX' ||
		boundary === 'kleinX' ||
		boundary === 'kleinY' ||
		boundary === 'projectivePlane'
	);
}
function isWrappingY(boundary: BoundaryId): boolean {
	return (
		boundary === 'cylinderY' ||
		boundary === 'torus' ||
		boundary === 'mobiusY' ||
		boundary === 'kleinX' ||
		boundary === 'kleinY' ||
		boundary === 'projectivePlane'
	);
}
function flipsOnWrapX(boundary: BoundaryId): boolean {
	return boundary === 'mobiusX' || boundary === 'kleinX' || boundary === 'projectivePlane';
}
function flipsOnWrapY(boundary: BoundaryId): boolean {
	return boundary === 'mobiusY' || boundary === 'kleinY' || boundary === 'projectivePlane';
}

/**
 * Matches the WGSL boundary transform behavior:
 * - supports multiple wraps (offset can exceed width/height)
 * - applies flips based on parity of boundary crossings
 */
function transformCoordinate(
	x: number,
	y: number,
	width: number,
	height: number,
	boundary: BoundaryId
): { x: number; y: number } | null {
	let fx = x;
	let fy = y;

	let xWraps = 0;
	let yWraps = 0;

	if (fx < 0 || fx >= width) {
		if (!isWrappingX(boundary)) return null;
		if (fx < 0) {
			xWraps = Math.floor((-fx - 1) / width) + 1;
			fx = ((fx % width) + width) % width;
		} else {
			xWraps = Math.floor(fx / width);
			fx = fx % width;
		}
	}

	if (fy < 0 || fy >= height) {
		if (!isWrappingY(boundary)) return null;
		if (fy < 0) {
			yWraps = Math.floor((-fy - 1) / height) + 1;
			fy = ((fy % height) + height) % height;
		} else {
			yWraps = Math.floor(fy / height);
			fy = fy % height;
		}
	}

	if (flipsOnWrapX(boundary) && (xWraps & 1) === 1) {
		fy = height - 1 - fy;
	}
	if (flipsOnWrapY(boundary) && (yWraps & 1) === 1) {
		fx = width - 1 - fx;
	}

	if (fx < 0 || fx >= width || fy < 0 || fy >= height) return null;
	return { x: fx | 0, y: fy | 0 };
}

function getCell(
	state: Uint32Array,
	x: number,
	y: number,
	cfg: CpuStepConfig
): number {
	const t = transformCoordinate(x, y, cfg.width, cfg.height, cfg.boundary);
	if (!t) return 0;
	return state[t.x + t.y * cfg.width] ?? 0;
}

function vitalityOfCell(cellState: number, numStates: number): number {
	if (cellState === 0) return 0;
	if (cellState === 1) return 1;
	// matches compute shader: (numStates - state) / (numStates - 1)
	return (numStates - cellState) / (numStates - 1);
}

function neighborContribution(cellState: number, cfg: CpuStepConfig): number {
	const mode = cfg.vitality.mode;
	if (mode === 'none') return cellState === 1 ? 1 : 0;

	const numStates = cfg.rule.numStates;
	const vitality = vitalityOfCell(cellState, numStates);

	switch (mode) {
		case 'threshold':
			return vitality >= cfg.vitality.threshold ? 1 : 0;
		case 'ghost':
			if (cellState === 1) return 1;
			if (cellState === 0) return 0;
			return vitality * cfg.vitality.ghostFactor;
		case 'sigmoid': {
			const x = (vitality - cfg.vitality.threshold) * cfg.vitality.sigmoidSharpness;
			return 1 / (1 + Math.exp(-x));
		}
		case 'decay':
			if (cellState === 1) return 1;
			if (cellState === 0) return 0;
			return Math.pow(vitality, cfg.vitality.decayPower) * cfg.vitality.ghostFactor;
		case 'curve': {
			if (cellState === 1) return 1;
			if (cellState === 0) return 0;
			const curve = cfg.vitality.curveSamples;
			const pos = vitality * 127;
			const lo = Math.floor(pos);
			const hi = Math.min(lo + 1, 127);
			const frac = pos - lo;
			const v0 = curve[lo] ?? 0;
			const v1 = curve[hi] ?? 0;
			return v0 + (v1 - v0) * frac;
		}
		default:
			return cellState === 1 ? 1 : 0;
	}
}

function neighborOffsetsMoore(): ReadonlyArray<[number, number]> {
	return [
		[-1, -1],
		[0, -1],
		[1, -1],
		[-1, 0],
		[1, 0],
		[-1, 1],
		[0, 1],
		[1, 1]
	];
}

function neighborOffsetsVonNeumann(): ReadonlyArray<[number, number]> {
	return [
		[0, -1],
		[0, 1],
		[-1, 0],
		[1, 0]
	];
}

function neighborOffsetsExtendedMoore(): ReadonlyArray<[number, number]> {
	const offsets: [number, number][] = [];
	for (let dy = -2; dy <= 2; dy++) {
		for (let dx = -2; dx <= 2; dx++) {
			if (dx === 0 && dy === 0) continue;
			offsets.push([dx, dy]);
		}
	}
	return offsets;
}

function neighborOffsetsHex(y: number): ReadonlyArray<[number, number]> {
	const isOdd = (y & 1) === 1;
	return isOdd
		? [
				[0, -1],
				[1, -1],
				[-1, 0],
				[1, 0],
				[0, 1],
				[1, 1]
			]
		: [
				[-1, -1],
				[0, -1],
				[-1, 0],
				[1, 0],
				[-1, 1],
				[0, 1]
			];
}

function neighborOffsetsExtendedHex(y: number): ReadonlyArray<[number, number]> {
	const isOdd = (y & 1) === 1;
	const offsets: [number, number][] = [];

	// Ring 1
	offsets.push(...neighborOffsetsHex(y));

	// Ring 2 (match tour.ts intent and WGSL structure)
	const isOddRowM1 = ((y - 1) & 1) === 1;
	if (isOddRowM1) offsets.push([0, -2], [1, -2]);
	else offsets.push([-1, -2], [0, -2]);

	if (isOdd) offsets.push([-1, -1], [2, -1]);
	else offsets.push([-2, -1], [1, -1]);

	offsets.push([-2, 0], [2, 0]);

	if (isOdd) offsets.push([-1, 1], [2, 1]);
	else offsets.push([-2, 1], [1, 1]);

	const isOddRowP1 = ((y + 1) & 1) === 1;
	if (isOddRowP1) offsets.push([0, 2], [1, 2]);
	else offsets.push([-1, 2], [0, 2]);

	return offsets;
}

function countNeighbors(
	state: Uint32Array,
	x: number,
	y: number,
	cfg: CpuStepConfig
): number {
	const nh: NeighborhoodId = cfg.rule.neighborhood;
	let offsets: ReadonlyArray<[number, number]>;
	switch (nh) {
		case 'vonNeumann':
			offsets = neighborOffsetsVonNeumann();
			break;
		case 'extendedMoore':
			offsets = neighborOffsetsExtendedMoore();
			break;
		case 'hexagonal':
			offsets = neighborOffsetsHex(y);
			break;
		case 'extendedHexagonal':
			offsets = neighborOffsetsExtendedHex(y);
			break;
		case 'moore':
		default:
			offsets = neighborOffsetsMoore();
	}

	let total = 0;
	for (const [dx, dy] of offsets) {
		total += neighborContribution(getCell(state, x + dx, y + dy, cfg), cfg);
	}

	// WGSL rounds to nearest int and clamps to maxNeighbors.
	const maxNeighbors = maxNeighborsForNeighborhood(nh);
	const clamped = Math.max(0, Math.min(maxNeighbors, total));
	return Math.trunc(clamped + 0.5);
}

/**
 * Step a BS/Generations CA on CPU.
 *
 * - `current` and `next` must be length width*height.
 * - Returns `next` for convenience.
 */
export function stepBsGenerationsCpu(
	current: Uint32Array,
	next: Uint32Array,
	cfg: CpuStepConfig
): Uint32Array {
	const { width, height } = cfg;
	const { birthMask, surviveMask, numStates } = cfg.rule;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const idx = x + y * width;
			const s = current[idx] ?? 0;
			const n = countNeighbors(current, x, y, cfg);

			let out = 0;
			if (numStates === 2) {
				if (s === 0) {
					// eslint-disable-next-line no-bitwise
					out = birthMask & (1 << n) ? 1 : 0;
				} else {
					// eslint-disable-next-line no-bitwise
					out = surviveMask & (1 << n) ? 1 : 0;
				}
			} else {
				if (s === 0) {
					// eslint-disable-next-line no-bitwise
					out = birthMask & (1 << n) ? 1 : 0;
				} else if (s === 1) {
					// eslint-disable-next-line no-bitwise
					out = surviveMask & (1 << n) ? 1 : 2;
				} else {
					out = s + 1;
					if (out >= numStates) out = 0;
				}
			}

			next[idx] = out;
		}
	}

	return next;
}


