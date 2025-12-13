import type { CurvePoint } from './vitality-spec.js';

export const VITALITY_CURVE_SAMPLES = 128;

function clamp(n: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, n));
}

/**
 * Monotonic cubic Hermite interpolation (Fritsch–Carlson).
 * Ensures the curve does not overshoot between points.
 */
function monotonicCubicInterpolation(points: CurvePoint[], xVal: number): number {
	const n = points.length;
	if (n === 0) return 0;
	if (n === 1) return points[0]!.y;

	const sorted = [...points].sort((a, b) => a.x - b.x);
	if (xVal <= sorted[0]!.x) return sorted[0]!.y;
	if (xVal >= sorted[n - 1]!.x) return sorted[n - 1]!.y;

	let i = 0;
	while (i < n - 1 && sorted[i + 1]!.x < xVal) i++;

	const deltas: number[] = [];
	const slopes: number[] = [];
	for (let j = 0; j < n - 1; j++) {
		const dx = sorted[j + 1]!.x - sorted[j]!.x;
		deltas.push(dx);
		slopes.push(dx === 0 ? 0 : (sorted[j + 1]!.y - sorted[j]!.y) / dx);
	}

	const tangents: number[] = [];
	for (let j = 0; j < n; j++) {
		if (j === 0) tangents.push(slopes[0]!);
		else if (j === n - 1) tangents.push(slopes[n - 2]!);
		else {
			const m0 = slopes[j - 1]!;
			const m1 = slopes[j]!;
			if (m0 * m1 <= 0) tangents.push(0);
			else {
				const w0 = 2 * deltas[j]! + deltas[j - 1]!;
				const w1 = deltas[j]! + 2 * deltas[j - 1]!;
				tangents.push((w0 + w1) / (w0 / m0 + w1 / m1));
			}
		}
	}

	for (let j = 0; j < n - 1; j++) {
		const dk = slopes[j]!;
		if (dk === 0) {
			tangents[j] = 0;
			tangents[j + 1] = 0;
		} else {
			const alpha = tangents[j]! / dk;
			const beta = tangents[j + 1]! / dk;
			const tau = alpha * alpha + beta * beta;
			if (tau > 9) {
				const scale = 3 / Math.sqrt(tau);
				tangents[j] = scale * alpha * dk;
				tangents[j + 1] = scale * beta * dk;
			}
		}
	}

	const x0 = sorted[i]!.x;
	const x1 = sorted[i + 1]!.x;
	const y0 = sorted[i]!.y;
	const y1 = sorted[i + 1]!.y;
	const h = x1 - x0;
	const t = (xVal - x0) / h;
	const t2 = t * t;
	const t3 = t2 * t;

	const h00 = 2 * t3 - 3 * t2 + 1;
	const h10 = t3 - 2 * t2 + t;
	const h01 = -2 * t3 + 3 * t2;
	const h11 = t3 - t2;

	return h00 * y0 + h10 * h * tangents[i]! + h01 * y1 + h11 * h * tangents[i + 1]!;
}

export function sampleVitalityCurve(points: CurvePoint[] | undefined): number[] {
	if (!points || points.length < 2) return new Array(VITALITY_CURVE_SAMPLES).fill(0);
	const samples: number[] = [];
	for (let i = 0; i < VITALITY_CURVE_SAMPLES; i++) {
		const vitality = i / (VITALITY_CURVE_SAMPLES - 1);
		const y = monotonicCubicInterpolation(points, vitality);
		samples.push(clamp(y, -2, 2));
	}
	return samples;
}


