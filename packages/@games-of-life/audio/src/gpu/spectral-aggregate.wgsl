// Spectral Aggregation Shader
//
// Aggregates visible cells into frequency spectrum bins.
// Uses fixed-point arithmetic for atomic accumulation (WGSL only supports atomic i32/u32).
//
// Each cell in the viewport contributes to the spectrum based on:
// - Y position → frequency bin (via pitch curve)
// - Vitality → amplitude (via amplitude curve)
// - Neighbor count → harmonic spread (via timbre curve)
// - X position → stereo pan (via spatial curve)

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

// Output spectrum bins - using atomic i32 for accumulation
// Layout: [amplitude_fp, phase_fp, pan_left_fp, pan_right_fp] per bin
// These are in fixed-point format (multiply by 65536)
struct SpectralOutput {
    data: array<atomic<i32>>,
}

@group(0) @binding(0) var<uniform> params: AudioParams;
@group(0) @binding(1) var<storage, read> cells: array<u32>;
@group(0) @binding(2) var<storage, read> pitch_curve: array<f32>;      // 128 samples
@group(0) @binding(3) var<storage, read> amplitude_curve: array<f32>;  // 128 samples
@group(0) @binding(4) var<storage, read> timbre_curve: array<f32>;     // 128 samples
@group(0) @binding(5) var<storage, read> spatial_curve: array<f32>;    // 128 samples
@group(0) @binding(6) var<storage, read> wave_curve: array<f32>;       // 128 samples
@group(0) @binding(7) var<storage, read_write> spectrum: SpectralOutput;

// Sample a curve at position t (0-1)
fn sample_curve(curve_base: u32, t: f32) -> f32 {
    let idx = clamp(t * 127.0, 0.0, 127.0);
    let i0 = u32(floor(idx));
    let i1 = min(i0 + 1u, 127u);
    let frac = idx - f32(i0);
    
    // Read from appropriate curve based on curve_base
    var v0: f32;
    var v1: f32;
    
    switch(curve_base) {
        case 0u: {
            v0 = pitch_curve[i0];
            v1 = pitch_curve[i1];
        }
        case 1u: {
            v0 = amplitude_curve[i0];
            v1 = amplitude_curve[i1];
        }
        case 2u: {
            v0 = timbre_curve[i0];
            v1 = timbre_curve[i1];
        }
        case 3u: {
            v0 = spatial_curve[i0];
            v1 = spatial_curve[i1];
        }
        case 4u: {
            v0 = wave_curve[i0];
            v1 = wave_curve[i1];
        }
        default: {
            v0 = 0.0;
            v1 = 0.0;
        }
    }
    
    return mix(v0, v1, frac);
}

// Get cell vitality (0 = dead, 1 = alive, interpolated for dying states)
fn get_vitality(state: u32) -> f32 {
    if (state == 0u) { return 0.0; }
    if (state == 1u) { return 1.0; }
    // Dying: vitality decreases from ~1 to ~0
    return f32(params.num_states - state) / f32(params.num_states - 1u);
}

// Count alive neighbors (simplified, assumes Moore neighborhood)
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
    return count / 8.0; // Normalize to 0-1
}

// Add to spectrum bin using fixed-point atomics
fn add_to_spectrum(bin: u32, amplitude: f32, phase: f32, pan_left: f32, pan_right: f32) {
    if (bin >= params.num_bins) { return; }
    
    let base_idx = bin * 4u;
    
    // Convert to fixed-point and atomically add
    atomicAdd(&spectrum.data[base_idx + 0u], i32(amplitude * FP_SCALE));
    atomicAdd(&spectrum.data[base_idx + 1u], i32(phase * FP_SCALE));
    atomicAdd(&spectrum.data[base_idx + 2u], i32(pan_left * FP_SCALE));
    atomicAdd(&spectrum.data[base_idx + 3u], i32(pan_right * FP_SCALE));
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    // Calculate viewport-relative position
    let vp_x = f32(global_id.x);
    let vp_y = f32(global_id.y);
    
    // Bounds check: within viewport?
    if (vp_x >= params.viewport_width || vp_y >= params.viewport_height) {
        return;
    }
    
    // Calculate actual cell coordinates
    let cell_x = params.viewport_min_x + vp_x;
    let cell_y = params.viewport_min_y + vp_y;
    
    // Bounds check: within grid?
    if (cell_x < 0.0 || cell_x >= f32(params.grid_width) ||
        cell_y < 0.0 || cell_y >= f32(params.grid_height)) {
        return;
    }
    
    // Get cell state
    let cell_idx = u32(cell_x) + u32(cell_y) * params.grid_width;
    let state = cells[cell_idx];
    let vitality = get_vitality(state);
    
    // Skip dead cells (no sound contribution)
    if (vitality < 0.001) {
        return;
    }
    
    // Sample curves
    let y_normalized = vp_y / params.viewport_height;
    let x_normalized = vp_x / params.viewport_width;
    let neighbors = count_neighbors_normalized(i32(cell_x), i32(cell_y));
    
    // Pitch: Y position → frequency bin (curve 0)
    let pitch_t = sample_curve(0u, y_normalized);
    let freq_bin = u32(clamp(pitch_t * f32(params.num_bins - 1u), 0.0, f32(params.num_bins - 1u)));
    
    // Amplitude: vitality → loudness (curve 1)
    // Scale per-cell contribution very small - many cells will accumulate
    // Final normalization happens on CPU side, but we keep base values tiny
    let base_amplitude = sample_curve(1u, vitality) * params.master_volume;
    let amplitude = base_amplitude * 0.01; // Very small per-cell contribution
    
    // Timbre: neighbors → harmonic spread (curve 2)
    let timbre = sample_curve(2u, neighbors);
    
    // Spatial: X position → stereo pan (curve 3)
    // Curve output 0-1, convert to -1 to +1 for pan
    let pan = sample_curve(3u, x_normalized) * 2.0 - 1.0;
    let pan_left = sqrt(0.5 * (1.0 - pan));
    let pan_right = sqrt(0.5 * (1.0 + pan));
    
    // Wave: vitality → phase variation (curve 4)
    let wave_phase = sample_curve(4u, vitality) * 6.28318; // 0-2π
    
    // Add to main frequency bin
    add_to_spectrum(freq_bin, amplitude, wave_phase, amplitude * pan_left, amplitude * pan_right);
    
    // Harmonic spread based on timbre (adds to adjacent bins)
    if (timbre > 0.1) {
        let spread = u32(timbre * 2.0); // 0-2 adjacent bins
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

