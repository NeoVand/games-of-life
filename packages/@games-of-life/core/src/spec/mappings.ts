/**
 * Canonical ID ↔ index mappings used across kernels, renderers, and UI adapters.
 *
 * Rule: IDs are stable public API. Indices are internal encodings (e.g., WGSL uniforms).
 * This module is the single source of truth to prevent drift.
 */

export const spectrumModeIds = [
	'hueShift',
	'rainbow',
	'warm',
	'cool',
	'monochrome',
	'fire',
	'complement',
	'triadic',
	'split',
	'analogous',
	'pastel',
	'vivid',
	'thermal',
	'bands',
	'neon',
	'sunset',
	'ocean',
	'forest'
] as const;
export type SpectrumModeId = (typeof spectrumModeIds)[number];

export const brushShapeIds = [
	'circle',
	'square',
	'diamond',
	'hexagon',
	'ring',
	'triangle',
	'line',
	'cross',
	'star',
	'heart',
	'spiral',
	'flower',
	'burst',
	'wave',
	'dots',
	'scatter',
	'text'
] as const;
export type BrushShapeId = (typeof brushShapeIds)[number];

export const boundaryIds = [
	'plane',
	'cylinderX',
	'cylinderY',
	'torus',
	'mobiusX',
	'mobiusY',
	'kleinX',
	'kleinY',
	'projectivePlane'
] as const;
export type BoundaryId = (typeof boundaryIds)[number];

export const neighborhoodIds = [
	'moore',
	'vonNeumann',
	'extendedMoore',
	'hexagonal',
	'extendedHexagonal'
] as const;
export type NeighborhoodId = (typeof neighborhoodIds)[number];

export function idToIndex<const T extends readonly string[]>(ids: T, id: T[number]): number {
	const idx = (ids as readonly string[]).indexOf(id);
	if (idx < 0) throw new Error(`Unknown id: ${String(id)}`);
	return idx;
}

export function spectrumModeToIndex(id: SpectrumModeId): number {
	return idToIndex(spectrumModeIds, id);
}

export function brushShapeToIndex(id: BrushShapeId): number {
	return idToIndex(brushShapeIds, id);
}

export function boundaryToIndex(id: BoundaryId): number {
	return idToIndex(boundaryIds, id);
}

export function neighborhoodToIndex(id: NeighborhoodId): number {
	return idToIndex(neighborhoodIds, id);
}


