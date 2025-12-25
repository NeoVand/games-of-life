// Spectral Aggregation Shader
//
// Aggregates visible cells into frequency spectrum bins.
// Uses fixed-point arithmetic for atomic accumulation (WGSL only supports atomic i32/u32).
//
// Each cell in the viewport contributes to the spectrum based on:
// - Y position → frequency bin (via pitch curve)
// - Vitality → amplitude (via amplitude curve)
// - Neighbor count → harmonic spread (via timbre curve)
// - Neighbor vitality → loudness gain (via neighbor vitality curve)
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

    // Neighbor vitality modulation controls
    neighbor_amp_depth: f32,    // 0..1, scales exponent for 2^(curve * depth)
    neighbor_timbre_depth: f32, // 0..1, bias timbre/brightness based on curve
    neighbor_wave_depth: f32,   // 0..1, modulate waveform complexity based on curve
    neighbor_sign: f32,         // +1 or -1 (invert)
    
    // Pre-normalization factor to prevent fixed-point overflow on large viewports.
    // Set to 1 / sqrt(viewport_cell_count), so that accumulated values stay in safe i32 range.
    inv_sqrt_cells: f32,
}

// Output spectrum bins - using atomic i32 for accumulation
// Layout: [amplitude_fp, wave_sum_fp, pan_left_fp, pan_right_fp] per bin
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
@group(0) @binding(7) var<storage, read> neighbor_vitality_curve: array<f32>; // 128 samples (log2 gain)
@group(0) @binding(8) var<storage, read_write> spectrum: SpectralOutput;

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
        case 5u: {
            v0 = neighbor_vitality_curve[i0];
            v1 = neighbor_vitality_curve[i1];
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

// Average vitality of neighbors (0..1), Moore neighborhood, toroidal wrap.
fn neighbor_vitality_normalized(x: i32, y: i32) -> f32 {
    var total: f32 = 0.0;
    let w = i32(params.grid_width);
    let h = i32(params.grid_height);
    
    for (var dy: i32 = -1; dy <= 1; dy++) {
        for (var dx: i32 = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) { continue; }
            let nx = (x + dx + w) % w;
            let ny = (y + dy + h) % h;
            let idx = u32(nx) + u32(ny) * params.grid_width;
            total += get_vitality(cells[idx]);
        }
    }
    
    return total / 8.0;
}

// Add to spectrum bin using fixed-point atomics.
// Note: the second channel is used as an amplitude-weighted "wave complexity" accumulator (not true phase).
// The AudioWorklet reconstructs per-bin wave shape as: wave = wave_sum / (amplitude + eps).
fn add_to_spectrum(bin: u32, amplitude: f32, wave_sum: f32, pan_left: f32, pan_right: f32) {
    if (bin >= params.num_bins) { return; }
    
    let base_idx = bin * 4u;
    
    // Convert to fixed-point and atomically add
    atomicAdd(&spectrum.data[base_idx + 0u], i32(amplitude * FP_SCALE));
    atomicAdd(&spectrum.data[base_idx + 1u], i32(wave_sum * FP_SCALE));
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
    
    // Neighbor vitality curve sample (in -2..2), allow global inversion
    let neighbor_vitality = neighbor_vitality_normalized(i32(cell_x), i32(cell_y));
    let neighbor_curve = sample_curve(5u, neighbor_vitality) * params.neighbor_sign;

    // Amplitude: vitality → loudness (curve 1), modulated by neighbor vitality (2^(curve * depth))
    // Pre-normalize by inv_sqrt_cells to prevent fixed-point overflow during atomic accumulation.
    let neighbor_gain = pow(2.0, neighbor_curve * params.neighbor_amp_depth); // depth=1 => 0.25×..4×
    let amplitude = sample_curve(1u, vitality) * params.master_volume * neighbor_gain * params.inv_sqrt_cells;
    
    // Timbre: neighbors → harmonic spread (curve 2)
    var timbre = sample_curve(2u, neighbors);
    let timbre_bias = clamp(neighbor_curve * 0.5, -1.0, 1.0) * params.neighbor_timbre_depth * 0.5;
    timbre = clamp(timbre + timbre_bias, 0.0, 1.0);
    
    // Spatial: X position → stereo pan (curve 3)
    // Curve output 0-1, convert to -1 to +1 for pan
    let pan = sample_curve(3u, x_normalized) * 2.0 - 1.0;
    let pan_left = sqrt(0.5 * (1.0 - pan));
    let pan_right = sqrt(0.5 * (1.0 + pan));
    
    // Waveform complexity (0..1), modulated by neighbor vitality curve.
    // Stored as amplitude-weighted sum; the AudioWorklet divides by amplitude to get an average.
    var wave = clamp(sample_curve(4u, vitality), 0.0, 1.0);
    wave = clamp(wave + neighbor_curve * params.neighbor_wave_depth * 0.25, 0.0, 1.0);
    
    // Add to main frequency bin
    add_to_spectrum(freq_bin, amplitude, wave * amplitude, amplitude * pan_left, amplitude * pan_right);
    
    // Harmonic spread based on timbre (adds to adjacent bins)
    if (timbre > 0.1) {
        let spread = u32(clamp(timbre, 0.0, 1.0) * 6.0 + 0.5); // ~0-6 adjacent bins
        for (var d: u32 = 1u; d <= spread; d++) {
            let falloff = pow(0.7, f32(d));
            if (freq_bin + d < params.num_bins) {
                let up_amp = amplitude * falloff * 0.45;
                add_to_spectrum(freq_bin + d, up_amp, wave * up_amp, up_amp * pan_left, up_amp * pan_right);
            }
            if (freq_bin >= d) {
                let down_amp = amplitude * falloff * 0.28;
                add_to_spectrum(freq_bin - d, down_amp, wave * down_amp, down_amp * pan_left, down_amp * pan_right);
            }
        }
    }
}

