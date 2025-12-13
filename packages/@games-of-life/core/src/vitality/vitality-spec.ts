export type VitalityMode = 'none' | 'threshold' | 'ghost' | 'sigmoid' | 'decay' | 'curve';

export interface CurvePoint {
	x: number; // 0..1
	y: number; // typically -2..2 (library clamps)
}

export interface VitalitySpec {
	mode: VitalityMode;
	threshold: number;
	ghostFactor: number;
	sigmoidSharpness: number;
	decayPower: number;
	curvePoints?: CurvePoint[];
}

export const DEFAULT_VITALITY: VitalitySpec = {
	mode: 'none',
	threshold: 1.0,
	ghostFactor: 0.0,
	sigmoidSharpness: 10.0,
	decayPower: 1.0
};


