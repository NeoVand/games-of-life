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
    _padding1: f32,
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

// Get cell state at grid position (with bounds checking)
fn get_cell_state(grid_x: i32, grid_y: i32) -> u32 {
    if (grid_x < 0 || grid_x >= i32(params.grid_width) || 
        grid_y < 0 || grid_y >= i32(params.grid_height)) {
        return 0u;
    }
    return cell_state[u32(grid_x) + u32(grid_y) * u32(params.grid_width)];
}

// Color palette for cell states
fn state_to_color(state: u32, num_states: u32) -> vec3<f32> {
    if (state == 0u) {
        // Dead - dark background
        return vec3<f32>(0.05, 0.05, 0.08);
    }
    
    if (num_states == 2u) {
        // Standard 2-state: bright cyan/white for alive
        return vec3<f32>(0.2, 0.9, 0.95);
    }
    
    // Multi-state (Generations): gradient from alive to dying
    if (state == 1u) {
        // Alive - bright
        return vec3<f32>(0.2, 0.95, 0.9);
    }
    
    // Dying states - gradient from warm to cool
    let dying_progress = f32(state - 1u) / f32(num_states - 2u);
    
    // Interpolate through a nice gradient: cyan -> purple -> red -> orange
    if (dying_progress < 0.33) {
        let t = dying_progress * 3.0;
        return mix(vec3<f32>(0.2, 0.9, 0.95), vec3<f32>(0.7, 0.3, 0.9), t);
    } else if (dying_progress < 0.66) {
        let t = (dying_progress - 0.33) * 3.0;
        return mix(vec3<f32>(0.7, 0.3, 0.9), vec3<f32>(0.95, 0.3, 0.3), t);
    } else {
        let t = (dying_progress - 0.66) * 3.0;
        return mix(vec3<f32>(0.95, 0.3, 0.3), vec3<f32>(0.3, 0.15, 0.1), t);
    }
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4<f32> {
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
                color = mix(color, vec3<f32>(0.08, 0.08, 0.12), 0.5);
            }
        }
    }
    
    return vec4<f32>(color, 1.0);
}

