// Cellular Automaton Render Shader
// Visualizes cell states with zoom/pan support

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

struct RenderParams {
    grid_width: f32,
    grid_height: f32,
    canvas_width: f32,
    canvas_height: f32,
    offset_x: f32,       // Pan offset in grid units
    offset_y: f32,
    zoom: f32,           // Zoom level (cells visible across canvas width)
    num_states: f32,     // For color interpolation
    show_grid: f32,      // 1.0 to show grid lines
    is_light_theme: f32, // 1.0 for light theme, 0.0 for dark
    alive_r: f32,        // Alive cell color (RGB)
    alive_g: f32,
    alive_b: f32,
    brush_x: f32,        // Brush center in grid coordinates
    brush_y: f32,
    brush_radius: f32,   // Brush radius in cells
    neighborhood: f32,   // 0 = moore, 1 = vonNeumann, 2 = extendedMoore, 3 = hexagonal, 4 = extendedHexagonal
    spectrum_mode: f32,  // 0-5=smooth, 6-11=color-reactive, 12-17=banded
    spectrum_frequency: f32, // How many times to repeat the spectrum (1.0 = normal)
    neighbor_shading: f32, // 0=off, 1=count alive, 2=sum vitality
    boundary_mode: f32,  // 0=plane, 1=cylinderX, 2=cylinderY, 3=torus, 4=mobiusX, 5=mobiusY, 6=kleinX, 7=kleinY, 8=projective
    _padding1: f32,      // Padding for 16-byte alignment
    _padding2: f32,
    _padding3: f32,
}

@group(0) @binding(0) var<uniform> params: RenderParams;
@group(0) @binding(1) var<storage, read> cell_state: array<u32>;

// Full-screen triangle vertices (oversized triangle that covers entire viewport)
@vertex
fn vertex_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var output: VertexOutput;
    
    // Generate vertices for a triangle that covers the entire screen
    // Vertex 0: (-1, -1) -> bottom-left
    // Vertex 1: (3, -1)  -> far right (off screen)  
    // Vertex 2: (-1, 3)  -> far top (off screen)
    var pos: vec2<f32>;
    switch (vertex_index) {
        case 0u: { pos = vec2<f32>(-1.0, -1.0); }
        case 1u: { pos = vec2<f32>(3.0, -1.0); }
        case 2u: { pos = vec2<f32>(-1.0, 3.0); }
        default: { pos = vec2<f32>(0.0, 0.0); }
    }
    
    output.position = vec4<f32>(pos, 0.0, 1.0);
    // Convert from NDC (-1 to 1) to UV (0 to 1)
    output.uv = (pos + 1.0) * 0.5;
    // Flip Y for correct orientation
    output.uv.y = 1.0 - output.uv.y;
    
    return output;
}

// Get cell state at grid position with boundary-aware wrapping for seamless panning
fn get_cell_state(grid_x: i32, grid_y: i32) -> u32 {
    let w = i32(params.grid_width);
    let h = i32(params.grid_height);
    let mode = u32(params.boundary_mode);
    
    var fx = grid_x;
    var fy = grid_y;
    
    // Determine which boundaries need wrapping based on mode
    // Modes that wrap horizontally: 1 (cylinderX), 3 (torus), 4 (mobiusX), 6 (kleinX), 7 (kleinY), 8 (projective)
    let wraps_x = mode == 1u || mode == 3u || mode == 4u || mode == 6u || mode == 7u || mode == 8u;
    // Modes that wrap vertically: 2 (cylinderY), 3 (torus), 5 (mobiusY), 6 (kleinX), 7 (kleinY), 8 (projective)
    let wraps_y = mode == 2u || mode == 3u || mode == 5u || mode == 6u || mode == 7u || mode == 8u;
    // Modes with X-flip when wrapping X: 4 (mobiusX), 6 (kleinX), 8 (projective)
    let flips_x = mode == 4u || mode == 6u || mode == 8u;
    // Modes with Y-flip when wrapping Y: 5 (mobiusY), 7 (kleinY), 8 (projective)
    let flips_y = mode == 5u || mode == 7u || mode == 8u;
    
    // Count how many times we cross each boundary (for proper flipping)
    var x_wraps = 0;
    var y_wraps = 0;
    
    // Handle X coordinate
    if (fx < 0 || fx >= w) {
        if (!wraps_x) {
            return 0u; // No wrap - out of bounds
        }
        // Count wraps and normalize
        if (fx < 0) {
            x_wraps = (-fx - 1) / w + 1;
            fx = ((fx % w) + w) % w;
        } else {
            x_wraps = fx / w;
            fx = fx % w;
        }
    }
    
    // Handle Y coordinate  
    if (fy < 0 || fy >= h) {
        if (!wraps_y) {
            return 0u; // No wrap - out of bounds
        }
        // Count wraps and normalize
        if (fy < 0) {
            y_wraps = (-fy - 1) / h + 1;
            fy = ((fy % h) + h) % h;
        } else {
            y_wraps = fy / h;
            fy = fy % h;
        }
    }
    
    // Apply flips based on number of boundary crossings
    // Odd number of X-wraps with flip mode -> flip Y
    if (flips_x && (x_wraps & 1) == 1) {
        fy = h - 1 - fy;
    }
    // Odd number of Y-wraps with flip mode -> flip X
    if (flips_y && (y_wraps & 1) == 1) {
        fx = w - 1 - fx;
    }
    
    // Final bounds check (should always pass, but safety first)
    if (fx < 0 || fx >= w || fy < 0 || fy >= h) {
        return 0u;
    }
    
    return cell_state[u32(fx) + u32(fy) * u32(params.grid_width)];
}

// Check if a cell is "alive" (state == 1)
fn is_alive(grid_x: i32, grid_y: i32) -> bool {
    return get_cell_state(grid_x, grid_y) == 1u;
}

// Check if a cell is "active" (any non-dead state)
fn is_active(grid_x: i32, grid_y: i32) -> bool {
    return get_cell_state(grid_x, grid_y) > 0u;
}

// Get cell vitality (1.0 for alive, decreasing for dying states, 0 for dead)
fn get_vitality(grid_x: i32, grid_y: i32) -> f32 {
    let state = get_cell_state(grid_x, grid_y);
    if (state == 0u) { return 0.0; }
    if (state == 1u) { return 1.0; }
    // Dying states: linearly decrease from 1.0 to near 0
    let num_states = u32(params.num_states);
    if (num_states <= 2u) { return 0.0; }
    // state 2 is freshly dying (high vitality), state num_states-1 is almost dead (low vitality)
    return 1.0 - f32(state - 1u) / f32(num_states - 1u);
}

// Count active (non-dead) neighbors for a cell (used for neighbor shading)
// Returns a normalized value 0.0-1.0 based on neighborhood type
fn count_active_neighbors_normalized(cell_x: i32, cell_y: i32) -> f32 {
    var count: u32 = 0u;
    var max_neighbors: u32 = 8u;
    let nh = i32(params.neighborhood);
    
    if (nh == 0) {
        // Moore (8 neighbors)
        max_neighbors = 8u;
        for (var dy: i32 = -1; dy <= 1; dy++) {
            for (var dx: i32 = -1; dx <= 1; dx++) {
                if (dx == 0 && dy == 0) { continue; }
                if (is_active(cell_x + dx, cell_y + dy)) { count++; }
            }
        }
    } else if (nh == 1) {
        // Von Neumann (4 neighbors)
        max_neighbors = 4u;
        if (is_active(cell_x, cell_y - 1)) { count++; }
        if (is_active(cell_x, cell_y + 1)) { count++; }
        if (is_active(cell_x - 1, cell_y)) { count++; }
        if (is_active(cell_x + 1, cell_y)) { count++; }
    } else if (nh == 2) {
        // Extended Moore (24 neighbors)
        max_neighbors = 24u;
        for (var dy: i32 = -2; dy <= 2; dy++) {
            for (var dx: i32 = -2; dx <= 2; dx++) {
                if (dx == 0 && dy == 0) { continue; }
                if (is_active(cell_x + dx, cell_y + dy)) { count++; }
            }
        }
    } else if (nh == 3) {
        // Hexagonal (6 neighbors)
        max_neighbors = 6u;
        let is_odd = (cell_y & 1) == 1;
        if (is_odd) {
            if (is_active(cell_x, cell_y - 1)) { count++; }
            if (is_active(cell_x + 1, cell_y - 1)) { count++; }
            if (is_active(cell_x - 1, cell_y)) { count++; }
            if (is_active(cell_x + 1, cell_y)) { count++; }
            if (is_active(cell_x, cell_y + 1)) { count++; }
            if (is_active(cell_x + 1, cell_y + 1)) { count++; }
        } else {
            if (is_active(cell_x - 1, cell_y - 1)) { count++; }
            if (is_active(cell_x, cell_y - 1)) { count++; }
            if (is_active(cell_x - 1, cell_y)) { count++; }
            if (is_active(cell_x + 1, cell_y)) { count++; }
            if (is_active(cell_x - 1, cell_y + 1)) { count++; }
            if (is_active(cell_x, cell_y + 1)) { count++; }
        }
    } else {
        // Extended Hexagonal (18 neighbors) - just use inner 6 for simplicity
        max_neighbors = 6u;
        let is_odd = (cell_y & 1) == 1;
        if (is_odd) {
            if (is_active(cell_x, cell_y - 1)) { count++; }
            if (is_active(cell_x + 1, cell_y - 1)) { count++; }
            if (is_active(cell_x - 1, cell_y)) { count++; }
            if (is_active(cell_x + 1, cell_y)) { count++; }
            if (is_active(cell_x, cell_y + 1)) { count++; }
            if (is_active(cell_x + 1, cell_y + 1)) { count++; }
        } else {
            if (is_active(cell_x - 1, cell_y - 1)) { count++; }
            if (is_active(cell_x, cell_y - 1)) { count++; }
            if (is_active(cell_x - 1, cell_y)) { count++; }
            if (is_active(cell_x + 1, cell_y)) { count++; }
            if (is_active(cell_x - 1, cell_y + 1)) { count++; }
            if (is_active(cell_x, cell_y + 1)) { count++; }
        }
    }
    
    return f32(count) / f32(max_neighbors);
}

// Sum vitality of neighbors (used for vitality-based shading)
// Returns a normalized value 0.0-1.0 based on neighborhood type
fn sum_neighbor_vitality_normalized(cell_x: i32, cell_y: i32) -> f32 {
    var total: f32 = 0.0;
    var max_neighbors: f32 = 8.0;
    let nh = i32(params.neighborhood);
    
    if (nh == 0) {
        // Moore (8 neighbors)
        max_neighbors = 8.0;
        for (var dy: i32 = -1; dy <= 1; dy++) {
            for (var dx: i32 = -1; dx <= 1; dx++) {
                if (dx == 0 && dy == 0) { continue; }
                total += get_vitality(cell_x + dx, cell_y + dy);
            }
        }
    } else if (nh == 1) {
        // Von Neumann (4 neighbors)
        max_neighbors = 4.0;
        total += get_vitality(cell_x, cell_y - 1);
        total += get_vitality(cell_x, cell_y + 1);
        total += get_vitality(cell_x - 1, cell_y);
        total += get_vitality(cell_x + 1, cell_y);
    } else if (nh == 2) {
        // Extended Moore (24 neighbors)
        max_neighbors = 24.0;
        for (var dy: i32 = -2; dy <= 2; dy++) {
            for (var dx: i32 = -2; dx <= 2; dx++) {
                if (dx == 0 && dy == 0) { continue; }
                total += get_vitality(cell_x + dx, cell_y + dy);
            }
        }
    } else if (nh == 3) {
        // Hexagonal (6 neighbors)
        max_neighbors = 6.0;
        let is_odd = (cell_y & 1) == 1;
        if (is_odd) {
            total += get_vitality(cell_x, cell_y - 1);
            total += get_vitality(cell_x + 1, cell_y - 1);
            total += get_vitality(cell_x - 1, cell_y);
            total += get_vitality(cell_x + 1, cell_y);
            total += get_vitality(cell_x, cell_y + 1);
            total += get_vitality(cell_x + 1, cell_y + 1);
        } else {
            total += get_vitality(cell_x - 1, cell_y - 1);
            total += get_vitality(cell_x, cell_y - 1);
            total += get_vitality(cell_x - 1, cell_y);
            total += get_vitality(cell_x + 1, cell_y);
            total += get_vitality(cell_x - 1, cell_y + 1);
            total += get_vitality(cell_x, cell_y + 1);
        }
    } else {
        // Extended Hexagonal - use inner 6 neighbors
        max_neighbors = 6.0;
        let is_odd = (cell_y & 1) == 1;
        if (is_odd) {
            total += get_vitality(cell_x, cell_y - 1);
            total += get_vitality(cell_x + 1, cell_y - 1);
            total += get_vitality(cell_x - 1, cell_y);
            total += get_vitality(cell_x + 1, cell_y);
            total += get_vitality(cell_x, cell_y + 1);
            total += get_vitality(cell_x + 1, cell_y + 1);
        } else {
            total += get_vitality(cell_x - 1, cell_y - 1);
            total += get_vitality(cell_x, cell_y - 1);
            total += get_vitality(cell_x - 1, cell_y);
            total += get_vitality(cell_x + 1, cell_y);
            total += get_vitality(cell_x - 1, cell_y + 1);
            total += get_vitality(cell_x, cell_y + 1);
        }
    }
    
    return total / max_neighbors;
}

// Apply neighbor shading to a color
// Cells with more/stronger neighbors appear more vibrant
fn apply_neighbor_shading(color: vec3<f32>, cell_x: i32, cell_y: i32) -> vec3<f32> {
    let mode = i32(params.neighbor_shading);
    if (mode == 0) {
        return color;
    }
    
    var neighbor_ratio: f32;
    if (mode == 1) {
        // Count active (non-dead) neighbors
        neighbor_ratio = count_active_neighbors_normalized(cell_x, cell_y);
    } else {
        // Sum vitality of all neighbors (weighted by how alive they are)
        neighbor_ratio = sum_neighbor_vitality_normalized(cell_x, cell_y);
    }
    
    // neighbor_ratio: 0 = isolated, 1 = max neighbors/vitality
    // Convert to HSL to adjust saturation and lightness
    let hsl = rgb_to_hsl(color);
    
    // Boost factor: cells with more vital neighbors get boosted
    // Range from 0.5 (isolated) to 1.0 (fully surrounded)
    let boost = 0.5 + neighbor_ratio * 0.5;
    
    // Adjust saturation: more neighbors = more saturated
    var new_sat = hsl.y * (0.6 + neighbor_ratio * 0.6); // Range: 60% to 120% of original
    new_sat = clamp(new_sat, 0.0, 1.0);
    
    // Adjust lightness based on theme
    var new_light = hsl.z;
    if (params.is_light_theme > 0.5) {
        // Light mode: isolated cells get lighter (fade toward white bg)
        // Clustered cells stay at their natural lightness
        let fade_amount = (1.0 - neighbor_ratio) * 0.3;
        new_light = mix(hsl.z, 0.9, fade_amount);
    } else {
        // Dark mode: isolated cells get darker (fade toward black bg)
        // Clustered cells stay bright
        let fade_amount = (1.0 - neighbor_ratio) * 0.4;
        new_light = mix(hsl.z, 0.1, fade_amount);
    }
    
    return hsl_to_rgb(vec3<f32>(hsl.x, new_sat, new_light));
}

// Background color based on theme
fn get_bg_color() -> vec3<f32> {
    if (params.is_light_theme > 0.5) {
        return vec3<f32>(0.95, 0.95, 0.97);
    }
    return vec3<f32>(0.05, 0.05, 0.08);
}

// Grid line color based on theme
fn get_grid_color() -> vec3<f32> {
    if (params.is_light_theme > 0.5) {
        return vec3<f32>(0.85, 0.85, 0.88);
    }
    return vec3<f32>(0.08, 0.08, 0.12);
}

// Convert RGB to HSL
fn rgb_to_hsl(rgb: vec3<f32>) -> vec3<f32> {
    let max_c = max(max(rgb.r, rgb.g), rgb.b);
    let min_c = min(min(rgb.r, rgb.g), rgb.b);
    let l = (max_c + min_c) / 2.0;
    
    if (max_c == min_c) {
        return vec3<f32>(0.0, 0.0, l);
    }
    
    let d = max_c - min_c;
    let s = select(d / (2.0 - max_c - min_c), d / (max_c + min_c), l > 0.5);
    
    var h: f32;
    if (max_c == rgb.r) {
        h = (rgb.g - rgb.b) / d + select(0.0, 6.0, rgb.g < rgb.b);
    } else if (max_c == rgb.g) {
        h = (rgb.b - rgb.r) / d + 2.0;
    } else {
        h = (rgb.r - rgb.g) / d + 4.0;
    }
    h /= 6.0;
    
    return vec3<f32>(h, s, l);
}

// Convert HSL to RGB
fn hsl_to_rgb(hsl: vec3<f32>) -> vec3<f32> {
    if (hsl.y == 0.0) {
        return vec3<f32>(hsl.z, hsl.z, hsl.z);
    }
    
    let q = select(hsl.z + hsl.y - hsl.z * hsl.y, hsl.z * (1.0 + hsl.y), hsl.z < 0.5);
    let p = 2.0 * hsl.z - q;
    
    let r = hue_to_rgb(p, q, hsl.x + 1.0/3.0);
    let g = hue_to_rgb(p, q, hsl.x);
    let b = hue_to_rgb(p, q, hsl.x - 1.0/3.0);
    
    return vec3<f32>(r, g, b);
}

fn hue_to_rgb(p: f32, q: f32, t_in: f32) -> f32 {
    var t = t_in;
    if (t < 0.0) { t += 1.0; }
    if (t > 1.0) { t -= 1.0; }
    if (t < 1.0/6.0) { return p + (q - p) * 6.0 * t; }
    if (t < 1.0/2.0) { return q; }
    if (t < 2.0/3.0) { return p + (q - p) * (2.0/3.0 - t) * 6.0; }
    return p;
}

// Color palette for cell states with spectrum mode support
fn state_to_color(state: u32, num_states: u32) -> vec3<f32> {
    let alive_color = vec3<f32>(params.alive_r, params.alive_g, params.alive_b);
    let bg = get_bg_color();
    
    if (state == 0u) {
        return bg;
    }
    
    if (num_states == 2u) {
        // Standard 2-state: use alive color
        return alive_color;
    }
    
    // Multi-state (Generations): gradient from alive to dying
    if (state == 1u) {
        return alive_color;
    }
    
    // Dying states - apply spectrum mode
    let dying_progress = f32(state - 1u) / f32(num_states - 1u);
    
    // Apply spectrum frequency - this controls how many times the spectrum repeats
    // frequency = 1.0 means spectrum spans all states once
    // frequency = 2.0 means spectrum repeats twice
    // frequency = 0.5 means spectrum is stretched (only half is used)
    let freq = params.spectrum_frequency;
    let spectrum_progress = fract(dying_progress * freq);
    
    let alive_hsl = rgb_to_hsl(alive_color);
    let mode = i32(params.spectrum_mode);
    
    var dying_hue: f32;
    var dying_sat: f32;
    var dying_light: f32;
    
    // Light theme: colors should stay saturated and get LIGHTER (toward white bg ~0.95)
    // Dark theme: colors can desaturate and get darker (toward dark bg ~0.05)
    let is_light = params.is_light_theme > 0.5;
    
    // Spectrum mode 0: Hue Shift (subtle 25% rotation)
    if (mode == 0) {
        dying_hue = alive_hsl.x + 0.25 * spectrum_progress;
        if (dying_hue > 1.0) { dying_hue -= 1.0; }
        if (is_light) {
            // Light mode: boost saturation for low-sat colors, then fade
            let boosted_sat = max(alive_hsl.y, 0.5); // Ensure minimum saturation
            dying_sat = boosted_sat * max(1.0 - spectrum_progress * 0.4, 0.5);
            dying_light = mix(alive_hsl.z, 0.92, dying_progress * dying_progress);
        } else {
            // Dark mode: boost saturation for low-sat colors
            let boosted_sat = max(alive_hsl.y, 0.4);
            let sat_curve = 1.0 - spectrum_progress * spectrum_progress;
            dying_sat = boosted_sat * max(sat_curve, 0.25);
            dying_light = mix(alive_hsl.z, 0.12, dying_progress * dying_progress);
        }
    }
    // Spectrum mode 1: Rainbow (full spectrum rotation)
    else if (mode == 1) {
        dying_hue = alive_hsl.x + spectrum_progress; // Full rotation
        if (dying_hue > 1.0) { dying_hue -= 1.0; }
        if (is_light) {
            dying_sat = max(0.7, alive_hsl.y); // Keep saturated for vivid rainbow
            dying_light = mix(alive_hsl.z, 0.88, dying_progress * dying_progress);
        } else {
            let boosted_sat = max(alive_hsl.y, 0.5);
            dying_sat = boosted_sat * max(1.0 - spectrum_progress * 0.3, 0.45);
            dying_light = mix(alive_hsl.z, 0.15, dying_progress * dying_progress);
        }
    }
    // Spectrum mode 2: Warm (shift toward red/orange)
    else if (mode == 2) {
        let target_hue = 0.05; // red-orange
        let hue_diff = target_hue - alive_hsl.x;
        var adjusted_diff = hue_diff;
        if (hue_diff > 0.5) { adjusted_diff = hue_diff - 1.0; }
        if (hue_diff < -0.5) { adjusted_diff = hue_diff + 1.0; }
        dying_hue = alive_hsl.x + adjusted_diff * spectrum_progress;
        if (dying_hue < 0.0) { dying_hue += 1.0; }
        if (dying_hue > 1.0) { dying_hue -= 1.0; }
        if (is_light) {
            let boosted_sat = max(alive_hsl.y, 0.5);
            dying_sat = boosted_sat * max(1.0 - spectrum_progress * 0.3, 0.5);
            dying_light = mix(alive_hsl.z, 0.9, dying_progress * dying_progress);
        } else {
            let boosted_sat = max(alive_hsl.y, 0.45);
            dying_sat = boosted_sat * max(1.0 - spectrum_progress * 0.3, 0.4);
            dying_light = mix(alive_hsl.z, 0.1, dying_progress * dying_progress);
        }
    }
    // Spectrum mode 3: Cool (shift toward blue/purple)
    else if (mode == 3) {
        let target_hue = 0.7; // blue-purple
        let hue_diff = target_hue - alive_hsl.x;
        var adjusted_diff = hue_diff;
        if (hue_diff > 0.5) { adjusted_diff = hue_diff - 1.0; }
        if (hue_diff < -0.5) { adjusted_diff = hue_diff + 1.0; }
        dying_hue = alive_hsl.x + adjusted_diff * spectrum_progress;
        if (dying_hue < 0.0) { dying_hue += 1.0; }
        if (dying_hue > 1.0) { dying_hue -= 1.0; }
        if (is_light) {
            let boosted_sat = max(alive_hsl.y, 0.5);
            dying_sat = boosted_sat * max(1.0 - spectrum_progress * 0.3, 0.5);
            dying_light = mix(alive_hsl.z, 0.9, dying_progress * dying_progress);
        } else {
            let boosted_sat = max(alive_hsl.y, 0.45);
            dying_sat = boosted_sat * max(1.0 - spectrum_progress * 0.3, 0.4);
            dying_light = mix(alive_hsl.z, 0.1, dying_progress * dying_progress);
        }
    }
    // Spectrum mode 4: Monochrome (fade without hue change)
    else if (mode == 4) {
        dying_hue = alive_hsl.x; // Keep same hue
        if (is_light) {
            // Light mode: boost and maintain saturation longer, fade toward white
            let boosted_sat = max(alive_hsl.y, 0.4);
            dying_sat = boosted_sat * (1.0 - spectrum_progress * 0.6);
            dying_light = mix(alive_hsl.z, 0.93, dying_progress);
        } else {
            // Dark mode: boost saturation, then desaturate and darken
            let boosted_sat = max(alive_hsl.y, 0.35);
            dying_sat = boosted_sat * (1.0 - spectrum_progress * 0.7);
            dying_light = mix(alive_hsl.z, 0.1, dying_progress);
        }
    }
    // Spectrum mode 5: Fire (alive -> yellow -> orange -> red -> dark/light)
    else if (mode == 5) {
        let fire_progress = spectrum_progress * spectrum_progress; // Accelerate toward end
        
        // More gradual hue journey: alive -> yellow (0.12) -> orange (0.06) -> red (0.0)
        if (spectrum_progress < 0.33) {
            // First third: alive color toward yellow
            dying_hue = mix(alive_hsl.x, 0.12, spectrum_progress * 3.0);
        } else if (spectrum_progress < 0.66) {
            // Second third: yellow toward orange
            dying_hue = mix(0.12, 0.06, (spectrum_progress - 0.33) * 3.0);
        } else {
            // Final third: orange toward red
            dying_hue = mix(0.06, 0.0, (spectrum_progress - 0.66) * 3.0);
        }
        if (dying_hue < 0.0) { dying_hue += 1.0; }
        
        if (is_light) {
            dying_sat = max(0.85 - fire_progress * 0.25, 0.55); // Stay more saturated
            dying_light = mix(0.55, 0.9, dying_progress * dying_progress); // bright fire fading to white
        } else {
            dying_sat = max(1.0 - fire_progress * 0.2, 0.75); // Very saturated throughout
            dying_light = mix(0.65, 0.04, dying_progress * dying_progress); // Brighter start, fade to embers
        }
    }
    // ========== ROW 2: Color-reactive harmonies (modes 6-11) ==========
    
    // Spectrum mode 6: Complement (transition to opposite hue)
    else if (mode == 6) {
        let complement_hue = fract(alive_hsl.x + 0.5); // Opposite on color wheel
        dying_hue = mix(alive_hsl.x, complement_hue, spectrum_progress);
        if (dying_hue > 1.0) { dying_hue -= 1.0; }
        
        // Saturation peaks in the middle for vivid transition
        let sat_curve = 1.0 - abs(spectrum_progress - 0.5) * 1.5;
        if (is_light) {
            dying_sat = max(alive_hsl.y, 0.6) * max(sat_curve, 0.5);
            dying_light = mix(alive_hsl.z, 0.9, dying_progress * dying_progress);
        } else {
            dying_sat = max(alive_hsl.y, 0.5) * max(sat_curve, 0.4);
            dying_light = mix(alive_hsl.z, 0.12, dying_progress * dying_progress);
        }
    }
    // Spectrum mode 7: Triadic (three-way color harmony)
    else if (mode == 7) {
        // Cycle through triadic colors: alive -> +120° -> +240°
        let triadic1 = fract(alive_hsl.x + 0.333);
        let triadic2 = fract(alive_hsl.x + 0.666);
        
        if (spectrum_progress < 0.5) {
            dying_hue = mix(alive_hsl.x, triadic1, spectrum_progress * 2.0);
        } else {
            dying_hue = mix(triadic1, triadic2, (spectrum_progress - 0.5) * 2.0);
        }
        if (dying_hue > 1.0) { dying_hue -= 1.0; }
        
        if (is_light) {
            dying_sat = max(alive_hsl.y, 0.65) * max(1.0 - spectrum_progress * 0.3, 0.55);
            dying_light = mix(alive_hsl.z, 0.88, dying_progress * dying_progress);
        } else {
            dying_sat = max(alive_hsl.y, 0.55) * max(1.0 - spectrum_progress * 0.25, 0.5);
            dying_light = mix(alive_hsl.z, 0.12, dying_progress * dying_progress);
        }
    }
    // Spectrum mode 8: Split (split-complementary: ±150° from alive)
    else if (mode == 8) {
        let split1 = fract(alive_hsl.x + 0.417); // +150°
        let split2 = fract(alive_hsl.x + 0.583); // -150° (same as +210°)
        
        // Oscillate between the two split colors
        let phase = sin(spectrum_progress * 3.14159 * 2.0) * 0.5 + 0.5;
        dying_hue = mix(split1, split2, phase);
        
        if (is_light) {
            dying_sat = max(alive_hsl.y, 0.6) * max(1.0 - spectrum_progress * 0.35, 0.5);
            dying_light = mix(alive_hsl.z, 0.88, dying_progress * dying_progress);
        } else {
            dying_sat = max(alive_hsl.y, 0.5) * max(1.0 - spectrum_progress * 0.3, 0.45);
            dying_light = mix(alive_hsl.z, 0.12, dying_progress * dying_progress);
        }
    }
    // Spectrum mode 9: Analogous (neighboring hues ±30°)
    else if (mode == 9) {
        // Smooth wave through analogous colors
        let wave = sin(spectrum_progress * 3.14159 * 3.0); // 1.5 oscillations
        dying_hue = alive_hsl.x + wave * 0.083; // ±30° range
        if (dying_hue < 0.0) { dying_hue += 1.0; }
        if (dying_hue > 1.0) { dying_hue -= 1.0; }
        
        // Keep saturation high since colors are similar
        if (is_light) {
            dying_sat = max(alive_hsl.y, 0.55) * max(1.0 - spectrum_progress * 0.4, 0.5);
            dying_light = mix(alive_hsl.z, 0.9, dying_progress * dying_progress);
        } else {
            dying_sat = max(alive_hsl.y, 0.45) * max(1.0 - spectrum_progress * 0.35, 0.4);
            dying_light = mix(alive_hsl.z, 0.12, dying_progress * dying_progress);
        }
    }
    // Spectrum mode 10: Pastel (soft desaturated tones)
    else if (mode == 10) {
        // Gentle hue drift with low saturation
        dying_hue = alive_hsl.x + spectrum_progress * 0.15;
        if (dying_hue > 1.0) { dying_hue -= 1.0; }
        
        if (is_light) {
            dying_sat = max(alive_hsl.y * 0.5, 0.2) * (1.0 - spectrum_progress * 0.5);
            dying_light = mix(max(alive_hsl.z, 0.7), 0.95, dying_progress);
        } else {
            dying_sat = max(alive_hsl.y * 0.6, 0.25) * (1.0 - spectrum_progress * 0.4);
            dying_light = mix(max(alive_hsl.z, 0.5), 0.2, dying_progress);
        }
    }
    // Spectrum mode 11: Vivid (high saturation punch)
    else if (mode == 11) {
        // Quick hue jumps for punchy color changes
        let num_bands = 8.0;
        let band = floor(spectrum_progress * num_bands);
        dying_hue = alive_hsl.x + (band / num_bands) * 0.4;
        if (dying_hue > 1.0) { dying_hue -= 1.0; }
        
        // Maximum saturation, slight variation per band
        let band_var = fract(band * 0.37);
        if (is_light) {
            dying_sat = min(1.0, max(alive_hsl.y, 0.7) + 0.2 * band_var);
            dying_light = mix(0.5, 0.85, dying_progress * dying_progress);
        } else {
            dying_sat = min(1.0, max(alive_hsl.y, 0.75) + 0.15 * band_var);
            dying_light = mix(0.55, 0.1, dying_progress * dying_progress);
        }
    }
    
    // ========== ROW 3: Banded/themed spectrums (modes 12-17) ==========
    
    // Spectrum mode 12: Thermal (heat map based on alive color temperature)
    else if (mode == 12) {
        let num_bands = 12.0;
        let band = floor(spectrum_progress * num_bands);
        let band_t = band / (num_bands - 1.0);
        
        // Journey from alive color through thermal spectrum
        // Determine if alive is warm or cool to choose direction
        let is_warm_start = alive_hsl.x < 0.17 || alive_hsl.x > 0.83;
        if (is_warm_start) {
            // Warm start: red/orange -> yellow -> green -> cyan -> blue -> purple
            dying_hue = mix(alive_hsl.x, 0.75, band_t);
        } else {
            // Cool start: go toward warm
            dying_hue = mix(alive_hsl.x, 0.0, band_t);
        }
        if (dying_hue < 0.0) { dying_hue += 1.0; }
        if (dying_hue > 1.0) { dying_hue -= 1.0; }
        
        dying_sat = select(0.9, 0.7, (band % 2.0) < 1.0);
        let fade = dying_progress * dying_progress;
        dying_light = select(mix(0.55, 0.12, fade), mix(0.5, 0.88, fade), is_light);
    }
    // Spectrum mode 13: Bands (quantized steps from alive color)
    else if (mode == 13) {
        let num_bands = 10.0;
        let band = floor(spectrum_progress * num_bands);
        
        // Each band is a discrete step away from alive color
        dying_hue = alive_hsl.x + (band / num_bands) * 0.6;
        if (dying_hue > 1.0) { dying_hue -= 1.0; }
        
        // Alternating saturation for structure
        dying_sat = select(max(alive_hsl.y, 0.75), max(alive_hsl.y, 0.55), (band % 2.0) < 1.0);
        
        let stripe = (band % 2.0) < 1.0;
        if (is_light) {
            dying_light = select(0.5, 0.62, stripe);
            dying_light = mix(dying_light, 0.9, dying_progress * dying_progress);
        } else {
            dying_light = select(0.52, 0.4, stripe);
            dying_light = mix(dying_light, 0.1, dying_progress * dying_progress);
        }
    }
    // Spectrum mode 14: Neon (electric cycling based on alive color)
    else if (mode == 14) {
        let num_bands = 9.0;
        let band = floor(spectrum_progress * num_bands);
        
        // Cycle through alive + its triadic colors
        let color_idx = band % 3.0;
        if (color_idx < 1.0) {
            dying_hue = alive_hsl.x;
        } else if (color_idx < 2.0) {
            dying_hue = fract(alive_hsl.x + 0.333);
        } else {
            dying_hue = fract(alive_hsl.x + 0.666);
        }
        
        dying_sat = 1.0; // Maximum neon saturation
        
        if (is_light) {
            dying_light = 0.48 + (band % 3.0) * 0.04;
            dying_light = mix(dying_light, 0.88, dying_progress * dying_progress);
        } else {
            dying_light = 0.52 + (band % 3.0) * 0.05;
            dying_light = mix(dying_light, 0.08, dying_progress * dying_progress);
        }
    }
    // Spectrum mode 15: Sunset (warm to cool from alive color)
    else if (mode == 15) {
        let num_bands = 12.0;
        let band = floor(spectrum_progress * num_bands);
        let band_t = band / (num_bands - 1.0);
        
        // Always go warm -> cool direction from any starting color
        // Map alive hue to a warm starting point, then transition to cool
        let warm_hue = mix(alive_hsl.x, 0.08, 0.5); // Pull toward orange
        let cool_hue = 0.6; // End at blue
        dying_hue = mix(warm_hue, cool_hue, band_t);
        if (dying_hue < 0.0) { dying_hue += 1.0; }
        
        dying_sat = select(0.85, 0.65, (band % 2.0) < 1.0);
        
        if (is_light) {
            dying_light = mix(0.55, 0.88, dying_progress * dying_progress);
        } else {
            dying_light = mix(0.55, 0.1, dying_progress * dying_progress);
        }
    }
    // Spectrum mode 16: Ocean (blues and cyans tinted by alive color)
    else if (mode == 16) {
        let num_bands = 10.0;
        let band = floor(spectrum_progress * num_bands);
        let band_t = band / (num_bands - 1.0);
        
        // Ocean range: cyan (0.5) to deep blue (0.66), tinted by alive color
        let base_ocean = mix(0.5, 0.66, band_t);
        // Tint slightly toward alive color
        dying_hue = mix(alive_hsl.x, base_ocean, 0.3 + spectrum_progress * 0.7);
        
        // Wave-like saturation
        let wave = sin(band_t * 3.14159 * 2.0) * 0.15;
        if (is_light) {
            dying_sat = max(0.5, alive_hsl.y * 0.8) + wave;
            dying_light = mix(0.55, 0.88, dying_progress * dying_progress);
        } else {
            dying_sat = max(0.6, alive_hsl.y * 0.9) + wave;
            dying_light = mix(0.5, 0.08, dying_progress * dying_progress);
        }
    }
    // Spectrum mode 17: Forest (greens and earth tones from alive color)
    else {
        let num_bands = 10.0;
        let band = floor(spectrum_progress * num_bands);
        let band_t = band / (num_bands - 1.0);
        
        // Forest range: green (0.33) -> yellow-green (0.25) -> brown/orange (0.08)
        let forest_hue = mix(0.33, 0.08, band_t);
        // Blend with alive color for personalization
        dying_hue = mix(alive_hsl.x, forest_hue, 0.4 + spectrum_progress * 0.6);
        if (dying_hue < 0.0) { dying_hue += 1.0; }
        
        // Earthy desaturation toward browns
        if (is_light) {
            dying_sat = mix(max(alive_hsl.y, 0.5), 0.35, band_t);
            dying_light = mix(0.5, 0.88, dying_progress * dying_progress);
        } else {
            dying_sat = mix(max(alive_hsl.y, 0.6), 0.4, band_t);
            dying_light = mix(0.45, 0.1, dying_progress * dying_progress);
        }
    }
    
    let dying_hsl = vec3<f32>(dying_hue, dying_sat, dying_light);
    let dying_rgb = hsl_to_rgb(dying_hsl);
    
    // Only blend with background at the very end
    let bg_blend = dying_progress * dying_progress * dying_progress; // Cubic for late blend
    return mix(dying_rgb, bg, bg_blend * 0.6);
}

// Constants for hexagonal grid layout
const HEX_HEIGHT_RATIO: f32 = 0.866025404; // sqrt(3)/2 - vertical spacing between hex rows

// Get the visual center of a hexagonal cell (in grid coordinates)
fn get_hex_center(cell_x: i32, cell_y: i32) -> vec2<f32> {
    let is_odd = (cell_y & 1) == 1;
    var center_x = f32(cell_x) + 0.5;
    if (is_odd) {
        center_x += 0.5;
    }
    let center_y = (f32(cell_y) + 0.5) * HEX_HEIGHT_RATIO;
    return vec2<f32>(center_x, center_y);
}

// Check if a cell is within the brush radius
// For hexagonal grids, we need to account for the visual compression
fn is_in_brush(cell_x: i32, cell_y: i32) -> bool {
    if (params.brush_radius < 0.0) {
        return false; // Brush preview disabled
    }
    
    let brush_center_x = floor(params.brush_x);
    let brush_center_y = floor(params.brush_y);
    let r = floor(params.brush_radius);
    
    // For hexagonal grids, use visual distance (accounting for hex aspect ratio)
    if (params.neighborhood > 2.5) {
        // Hexagonal: calculate visual distance using hex centers
        let cell_center = get_hex_center(cell_x, cell_y);
        let brush_cell_center = get_hex_center(i32(brush_center_x), i32(brush_center_y));
        
        // Visual distance in grid units
        let dx = cell_center.x - brush_cell_center.x;
        let dy = cell_center.y - brush_cell_center.y;
        
        // For hex, we want a circular brush in visual space
        // The visual radius in Y is compressed by HEX_HEIGHT_RATIO
        let visual_radius = params.brush_radius * 0.5; // Half because hex centers are 0.5 apart
        let dist_sq = dx * dx + dy * dy;
        let radius_sq = visual_radius * visual_radius;
        
        return dist_sq <= radius_sq;
    } else {
        // Square grids: simple Euclidean distance in cell coordinates
        let dx = f32(cell_x) - brush_center_x;
        let dy = f32(cell_y) - brush_center_y;
        
        // Check if within the iteration range AND within the circular brush
        if (abs(dx) > r || abs(dy) > r) {
            return false;
        }
        
        let dist_sq = dx * dx + dy * dy;
        let radius_sq = params.brush_radius * params.brush_radius;
        
        return dist_sq <= radius_sq;
    }
}

// Find the nearest hex cell to a point using axial coordinates
// Returns the cell coordinates
fn nearest_hex_cell(grid_x: f32, grid_y: f32) -> vec2<i32> {
    // Convert to "axial" coordinates for easier hex math
    // In axial coords: q = x, r relates to y
    // For odd-r offset: q = x - (y - (y&1)) / 2
    
    // First, find approximate row
    let row_f = grid_y / HEX_HEIGHT_RATIO;
    let row = i32(floor(row_f + 0.5)); // Round to nearest row
    
    // Adjust x based on whether we're in an odd or even row
    let is_odd = (row & 1) == 1;
    var adjusted_x = grid_x;
    if (is_odd) {
        adjusted_x -= 0.5;
    }
    let col = i32(floor(adjusted_x + 0.5)); // Round to nearest column
    
    // Now we have a candidate cell, but we need to check neighbors
    // to find the true nearest (handles edge cases at hex boundaries)
    let center = get_hex_center(col, row);
    var best_col = col;
    var best_row = row;
    var best_dist = distance(vec2<f32>(grid_x, grid_y), center);
    
    // Check the 6 neighbors
    let neighbors = array<vec2<i32>, 6>(
        vec2<i32>(col - 1, row),
        vec2<i32>(col + 1, row),
        vec2<i32>(col - select(1, 0, is_odd), row - 1),
        vec2<i32>(col + select(0, 1, is_odd), row - 1),
        vec2<i32>(col - select(1, 0, is_odd), row + 1),
        vec2<i32>(col + select(0, 1, is_odd), row + 1)
    );
    
    for (var i = 0; i < 6; i++) {
        let nc = get_hex_center(neighbors[i].x, neighbors[i].y);
        let nd = distance(vec2<f32>(grid_x, grid_y), nc);
        if (nd < best_dist) {
            best_dist = nd;
            best_col = neighbors[i].x;
            best_row = neighbors[i].y;
        }
    }
    
    return vec2<i32>(best_col, best_row);
}

// Convert screen position to hexagonal grid coordinates (offset "odd-r" layout)
fn screen_to_hex_cell(grid_x: f32, grid_y: f32) -> vec2<i32> {
    return nearest_hex_cell(grid_x, grid_y);
}

// Calculate the distance to the nearest hex cell boundary
// This is used for drawing grid lines - we draw where a pixel is
// equidistant from two hex centers (Voronoi boundary)
fn hex_boundary_distance(grid_x: f32, grid_y: f32, cell_x: i32, cell_y: i32) -> f32 {
    let center = get_hex_center(cell_x, cell_y);
    let dist_to_center = distance(vec2<f32>(grid_x, grid_y), center);
    
    // Check distance to all 6 neighbors' centers
    let is_odd = (cell_y & 1) == 1;
    let neighbors = array<vec2<i32>, 6>(
        vec2<i32>(cell_x - 1, cell_y),
        vec2<i32>(cell_x + 1, cell_y),
        vec2<i32>(cell_x - select(1, 0, is_odd), cell_y - 1),
        vec2<i32>(cell_x + select(0, 1, is_odd), cell_y - 1),
        vec2<i32>(cell_x - select(1, 0, is_odd), cell_y + 1),
        vec2<i32>(cell_x + select(0, 1, is_odd), cell_y + 1)
    );
    
    // Find the closest neighbor center
    var min_neighbor_dist = 1000.0;
    for (var i = 0; i < 6; i++) {
        let nc = get_hex_center(neighbors[i].x, neighbors[i].y);
        let nd = distance(vec2<f32>(grid_x, grid_y), nc);
        min_neighbor_dist = min(min_neighbor_dist, nd);
    }
    
    // The boundary is where dist_to_center == min_neighbor_dist
    // Return how close we are to that boundary
    // Positive means we're clearly inside our cell
    // Near zero means we're at the boundary
    return (min_neighbor_dist - dist_to_center) * 0.5;
}

// Render square grid cells (default)
fn render_square(input: VertexOutput) -> vec4<f32> {
    // Calculate aspect ratio correction
    let aspect = params.canvas_width / params.canvas_height;
    
    // Convert UV to grid coordinates
    // zoom represents how many cells are visible across the screen width
    let cells_visible_x = params.zoom;
    let cells_visible_y = params.zoom / aspect;
    
    let grid_x = input.uv.x * cells_visible_x + params.offset_x;
    let grid_y = input.uv.y * cells_visible_y + params.offset_y;
    
    // Get integer cell coordinates
    let cell_x = i32(floor(grid_x));
    let cell_y = i32(floor(grid_y));
    
    // Get cell state
    let state = get_cell_state(cell_x, cell_y);
    
    // Base color from state
    var color = state_to_color(state, u32(params.num_states));
    
    // Apply neighbor shading if enabled (only for non-dead cells)
    if (state > 0u) {
        color = apply_neighbor_shading(color, cell_x, cell_y);
    }
    
    // Brush preview highlight - subtle semi-transparent overlay
    if (is_in_brush(cell_x, cell_y)) {
        // Use a subtle white/black overlay based on theme
        // This creates a "selected" look without being too distracting
        if (params.is_light_theme > 0.5) {
            // Light theme: darken with semi-transparent black overlay
            color = mix(color, vec3<f32>(0.0, 0.0, 0.0), 0.2);
        } else {
            // Dark theme: lighten with semi-transparent white overlay  
            color = mix(color, vec3<f32>(1.0, 1.0, 1.0), 0.2);
        }
    }
    
    // Add grid lines when enabled and zoomed in enough to see them
    if (params.show_grid > 0.5) {
        let frac_x = fract(grid_x);
        let frac_y = fract(grid_y);
        
        // Grid line thickness scales with zoom - thicker when zoomed in
        // At zoom 1000, lines are very thin; at zoom 50, lines are more visible
        let base_thickness = 0.08;
        let line_thickness = clamp(base_thickness * (200.0 / params.zoom), 0.01, 0.15);
        
        // Only draw lines if cells are large enough to see them (> ~2 pixels per cell)
        let pixels_per_cell = params.canvas_width / params.zoom;
        if (pixels_per_cell > 2.0) {
            if (frac_x < line_thickness || frac_x > (1.0 - line_thickness) ||
                frac_y < line_thickness || frac_y > (1.0 - line_thickness)) {
                // Grid lines - darker overlay
                color = mix(color, get_grid_color(), 0.5);
            }
        }
    }
    
    return vec4<f32>(color, 1.0);
}

// Render hexagonal grid cells
fn render_hexagonal(input: VertexOutput) -> vec4<f32> {
    // Calculate aspect ratio correction
    let aspect = params.canvas_width / params.canvas_height;
    
    // For hexagonal grids, the coordinate system is:
    // - X: cell columns (with odd rows offset by 0.5)
    // - Y: cell rows * HEX_HEIGHT_RATIO (rows are closer together)
    // The zoom represents visual units (same as X), so Y needs to be scaled
    let cells_visible_x = params.zoom;
    let cells_visible_y = params.zoom / aspect;
    
    // Convert UV to visual coordinates
    let grid_x = input.uv.x * cells_visible_x + params.offset_x;
    let grid_y = input.uv.y * cells_visible_y + params.offset_y;
    
    // Convert screen position to hex cell coordinates
    let cell = screen_to_hex_cell(grid_x, grid_y);
    let cell_x = cell.x;
    let cell_y = cell.y;
    
    // Get cell state
    let state = get_cell_state(cell_x, cell_y);
    
    // Base color from state
    var color = state_to_color(state, u32(params.num_states));
    
    // Apply neighbor shading if enabled (only for non-dead cells)
    if (state > 0u) {
        color = apply_neighbor_shading(color, cell_x, cell_y);
    }
    
    // Brush preview highlight
    if (is_in_brush(cell_x, cell_y)) {
        if (params.is_light_theme > 0.5) {
            color = mix(color, vec3<f32>(0.0, 0.0, 0.0), 0.2);
        } else {
            color = mix(color, vec3<f32>(1.0, 1.0, 1.0), 0.2);
        }
    }
    
    // Add hexagonal grid lines when enabled and zoomed in enough
    if (params.show_grid > 0.5) {
        let pixels_per_cell = params.canvas_width / params.zoom;
        if (pixels_per_cell > 4.0) {
            // Calculate distance to hex cell boundary (Voronoi edge)
            let boundary_dist = hex_boundary_distance(grid_x, grid_y, cell_x, cell_y);
            
            // Grid line thickness scales with zoom
            let base_thickness = 0.04;
            let line_thickness = clamp(base_thickness * (100.0 / params.zoom), 0.008, 0.08);
            
            // Draw grid line when close to boundary
            if (boundary_dist < line_thickness) {
                let blend = smoothstep(0.0, line_thickness, boundary_dist);
                color = mix(get_grid_color(), color, blend);
            }
        }
    }
    
    return vec4<f32>(color, 1.0);
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Check if we're using hexagonal neighborhood (neighborhood == 3)
    if (params.neighborhood > 2.5) {
        return render_hexagonal(input);
    }
    return render_square(input);
}
