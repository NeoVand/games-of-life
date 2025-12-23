/**
 * Spectral Aggregation Shader Source
 * 
 * This file exports the WGSL shader code for spectral aggregation.
 * Uses ?raw import in the actual build, but we inline it here for simplicity.
 */

export const spectralAggregateWgsl = /* wgsl */`
// Spectral Aggregation Shader
//
// Aggregates visible cells into frequency spectrum bins.
// Uses fixed-point arithmetic for atomic accumulation (WGSL only supports atomic i32/u32).

// Fixed-point scale factor (16.16 format)
const FP_SCALE: f32 = 65536.0;

struct AudioParams {
    // Viewport bounds (cells visible on screen)
    viewport_min_x: f32,
    viewport_min_y: f32,
    viewport_width: f32,
    viewport_height: f32,
    
    // Grid dimensions
    grid_width: u32,
    grid_height: u32,
    num_states: u32,
    
    // Spectrum parameters
    num_bins: u32,
    min_freq: f32,
    max_freq: f32,
    
    // Master volume (0-1)
    master_volume: f32,
    
    _padding: u32,
}

// Output spectrum bins using atomic i32 for accumulation
struct SpectralOutput {
    data: array<atomic<i32>>,
}

@group(0) @binding(0) var<uniform> params: AudioParams;
@group(0) @binding(1) var<storage, read> cells: array<u32>;
@group(0) @binding(2) var<storage, read> pitch_curve: array<f32>;
@group(0) @binding(3) var<storage, read> amplitude_curve: array<f32>;
@group(0) @binding(4) var<storage, read> timbre_curve: array<f32>;
@group(0) @binding(5) var<storage, read> spatial_curve: array<f32>;
@group(0) @binding(6) var<storage, read> wave_curve: array<f32>;
@group(0) @binding(7) var<storage, read_write> spectrum: SpectralOutput;

fn sample_curve(curve_base: u32, t: f32) -> f32 {
    let idx = clamp(t * 127.0, 0.0, 127.0);
    let i0 = u32(floor(idx));
    let i1 = min(i0 + 1u, 127u);
    let frac = idx - f32(i0);
    
    var v0: f32;
    var v1: f32;
    
    switch(curve_base) {
        case 0u: { v0 = pitch_curve[i0]; v1 = pitch_curve[i1]; }
        case 1u: { v0 = amplitude_curve[i0]; v1 = amplitude_curve[i1]; }
        case 2u: { v0 = timbre_curve[i0]; v1 = timbre_curve[i1]; }
        case 3u: { v0 = spatial_curve[i0]; v1 = spatial_curve[i1]; }
        case 4u: { v0 = wave_curve[i0]; v1 = wave_curve[i1]; }
        default: { v0 = 0.0; v1 = 0.0; }
    }
    
    return mix(v0, v1, frac);
}

fn get_vitality(state: u32) -> f32 {
    if (state == 0u) { return 0.0; }
    if (state == 1u) { return 1.0; }
    return f32(params.num_states - state) / f32(params.num_states - 1u);
}

fn count_neighbors_normalized(x: i32, y: i32) -> f32 {
    var count: f32 = 0.0;
    let w = i32(params.grid_width);
    let h = i32(params.grid_height);
    
    for (var dy: i32 = -1; dy <= 1; dy++) {
        for (var dx: i32 = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) { continue; }
            let nx = (x + dx + w) % w;
            let ny = (y + dy + h) % h;
            let idx = u32(nx) + u32(ny) * params.grid_width;
            if (cells[idx] == 1u) { count += 1.0; }
        }
    }
    return count / 8.0;
}

fn add_to_spectrum(bin: u32, amplitude: f32, phase: f32, pan_left: f32, pan_right: f32) {
    if (bin >= params.num_bins) { return; }
    let base_idx = bin * 4u;
    atomicAdd(&spectrum.data[base_idx + 0u], i32(amplitude * FP_SCALE));
    atomicAdd(&spectrum.data[base_idx + 1u], i32(phase * FP_SCALE));
    atomicAdd(&spectrum.data[base_idx + 2u], i32(pan_left * FP_SCALE));
    atomicAdd(&spectrum.data[base_idx + 3u], i32(pan_right * FP_SCALE));
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let vp_x = f32(global_id.x);
    let vp_y = f32(global_id.y);
    
    if (vp_x >= params.viewport_width || vp_y >= params.viewport_height) { return; }
    
    let cell_x = params.viewport_min_x + vp_x;
    let cell_y = params.viewport_min_y + vp_y;
    
    if (cell_x < 0.0 || cell_x >= f32(params.grid_width) ||
        cell_y < 0.0 || cell_y >= f32(params.grid_height)) { return; }
    
    let cell_idx = u32(cell_x) + u32(cell_y) * params.grid_width;
    let state = cells[cell_idx];
    let vitality = get_vitality(state);
    
    if (vitality < 0.001) { return; }
    
    let y_normalized = vp_y / params.viewport_height;
    let x_normalized = vp_x / params.viewport_width;
    let neighbors = count_neighbors_normalized(i32(cell_x), i32(cell_y));
    
    let pitch_t = sample_curve(0u, y_normalized);
    let freq_bin = u32(clamp(pitch_t * f32(params.num_bins - 1u), 0.0, f32(params.num_bins - 1u)));
    let amplitude = sample_curve(1u, vitality) * params.master_volume;
    let timbre = sample_curve(2u, neighbors);
    let pan = sample_curve(3u, x_normalized) * 2.0 - 1.0;
    let pan_left = sqrt(0.5 * (1.0 - pan));
    let pan_right = sqrt(0.5 * (1.0 + pan));
    let wave_phase = sample_curve(4u, vitality) * 6.28318;
    
    add_to_spectrum(freq_bin, amplitude, wave_phase, amplitude * pan_left, amplitude * pan_right);
    
    if (timbre > 0.1) {
        let spread = u32(timbre * 2.0);
        for (var d: u32 = 1u; d <= spread; d++) {
            let harmonic_amp = amplitude * (1.0 - f32(d) * 0.4);
            if (freq_bin + d < params.num_bins) {
                add_to_spectrum(freq_bin + d, harmonic_amp * 0.4, wave_phase, harmonic_amp * 0.4 * pan_left, harmonic_amp * 0.4 * pan_right);
            }
            if (freq_bin >= d) {
                add_to_spectrum(freq_bin - d, harmonic_amp * 0.25, wave_phase, harmonic_amp * 0.25 * pan_left, harmonic_amp * 0.25 * pan_right);
            }
        }
    }
}
`;

