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
    neighborhood: f32,   // 0 = square, 3 = hexagonal
    spectrum_mode: f32,  // 0=hueShift, 1=rainbow, 2=warm, 3=cool, 4=monochrome, 5=fire
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

// Get cell state at grid position (with bounds checking)
fn get_cell_state(grid_x: i32, grid_y: i32) -> u32 {
    if (grid_x < 0 || grid_x >= i32(params.grid_width) || 
        grid_y < 0 || grid_y >= i32(params.grid_height)) {
        return 0u;
    }
    return cell_state[u32(grid_x) + u32(grid_y) * u32(params.grid_width)];
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
        dying_hue = alive_hsl.x + 0.25 * dying_progress;
        if (dying_hue > 1.0) { dying_hue -= 1.0; }
        if (is_light) {
            // Light mode: keep saturation high, increase lightness toward white
            dying_sat = alive_hsl.y * max(1.0 - dying_progress * 0.3, 0.6);
            dying_light = mix(alive_hsl.z, 0.92, dying_progress * dying_progress);
        } else {
            // Dark mode: can desaturate more, decrease lightness toward dark
            let sat_curve = 1.0 - dying_progress * dying_progress;
            dying_sat = alive_hsl.y * max(sat_curve, 0.2);
            dying_light = mix(alive_hsl.z, 0.12, dying_progress * dying_progress);
        }
    }
    // Spectrum mode 1: Rainbow (full spectrum rotation)
    else if (mode == 1) {
        dying_hue = alive_hsl.x + dying_progress; // Full rotation
        if (dying_hue > 1.0) { dying_hue -= 1.0; }
        if (is_light) {
            dying_sat = max(0.8, alive_hsl.y); // Keep very saturated for vivid rainbow
            dying_light = mix(alive_hsl.z, 0.88, dying_progress * dying_progress);
        } else {
            dying_sat = alive_hsl.y * max(1.0 - dying_progress * 0.4, 0.4);
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
        dying_hue = alive_hsl.x + adjusted_diff * dying_progress;
        if (dying_hue < 0.0) { dying_hue += 1.0; }
        if (dying_hue > 1.0) { dying_hue -= 1.0; }
        if (is_light) {
            dying_sat = max(0.7, alive_hsl.y * (1.0 - dying_progress * 0.2));
            dying_light = mix(alive_hsl.z, 0.9, dying_progress * dying_progress);
        } else {
            dying_sat = alive_hsl.y * max(1.0 - dying_progress * 0.3, 0.4);
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
        dying_hue = alive_hsl.x + adjusted_diff * dying_progress;
        if (dying_hue < 0.0) { dying_hue += 1.0; }
        if (dying_hue > 1.0) { dying_hue -= 1.0; }
        if (is_light) {
            dying_sat = max(0.7, alive_hsl.y * (1.0 - dying_progress * 0.2));
            dying_light = mix(alive_hsl.z, 0.9, dying_progress * dying_progress);
        } else {
            dying_sat = alive_hsl.y * max(1.0 - dying_progress * 0.3, 0.4);
            dying_light = mix(alive_hsl.z, 0.1, dying_progress * dying_progress);
        }
    }
    // Spectrum mode 4: Monochrome (fade without hue change)
    else if (mode == 4) {
        dying_hue = alive_hsl.x; // Keep same hue
        if (is_light) {
            // Light mode: keep some saturation, fade toward white
            dying_sat = alive_hsl.y * (1.0 - dying_progress * 0.5);
            dying_light = mix(alive_hsl.z, 0.93, dying_progress);
        } else {
            // Dark mode: desaturate and darken
            dying_sat = alive_hsl.y * (1.0 - dying_progress * 0.8);
            dying_light = mix(alive_hsl.z, 0.1, dying_progress);
        }
    }
    // Spectrum mode 5: Fire (orange -> red -> dark/light)
    else {
        let fire_progress = dying_progress * dying_progress; // Accelerate toward end
        if (dying_progress < 0.5) {
            dying_hue = mix(alive_hsl.x, 0.08, dying_progress * 2.0); // toward orange
        } else {
            dying_hue = mix(0.08, 0.0, (dying_progress - 0.5) * 2.0); // toward red
        }
        if (dying_hue < 0.0) { dying_hue += 1.0; }
        if (is_light) {
            dying_sat = max(0.8 - fire_progress * 0.3, 0.5);
            dying_light = mix(0.5, 0.9, fire_progress); // bright fire fading to white
        } else {
            dying_sat = max(1.0 - fire_progress * 0.3, 0.7);
            dying_light = mix(0.6, 0.05, fire_progress); // fire fading to black
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
