// Cellular Automaton Compute Shader
// Supports Life-like (B/S) and Generations rules
// Supports multiple neighborhood types

struct Params {
    width: u32,
    height: u32,
    birth_mask: u32,      // Bit i = 1 means birth with i neighbors
    survive_mask: u32,    // Bit i = 1 means survive with i neighbors
    num_states: u32,      // 2 for Life-like, 3+ for Generations
    wrap_boundary: u32,   // 1 = toroidal wrap, 0 = fixed edges (cells outside are dead)
    neighborhood: u32,    // 0 = Moore (8), 1 = Von Neumann (4), 2 = Extended Moore (24)
    _padding: u32,        // Padding for 16-byte alignment
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> cell_state_in: array<u32>;
@group(0) @binding(2) var<storage, read_write> cell_state_out: array<u32>;

// Get cell state at position
fn get_cell(x: i32, y: i32) -> u32 {
    if (params.wrap_boundary == 1u) {
        // Toroidal wrapping
        let wrapped_x = ((x % i32(params.width)) + i32(params.width)) % i32(params.width);
        let wrapped_y = ((y % i32(params.height)) + i32(params.height)) % i32(params.height);
        let idx = u32(wrapped_x) + u32(wrapped_y) * params.width;
        return cell_state_in[idx];
    } else {
        // Fixed edges - cells outside are dead
        if (x < 0 || x >= i32(params.width) || y < 0 || y >= i32(params.height)) {
            return 0u;
        }
        let idx = u32(x) + u32(y) * params.width;
        return cell_state_in[idx];
    }
}

// Check if a cell is "alive" (state == 1 for Generations rules)
fn is_alive(state: u32) -> bool {
    return state == 1u;
}

// Count living neighbors - Moore neighborhood (8 cells)
fn count_neighbors_moore(x: i32, y: i32) -> u32 {
    var count: u32 = 0u;
    
    for (var dy: i32 = -1; dy <= 1; dy++) {
        for (var dx: i32 = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) {
                continue;
            }
            if (is_alive(get_cell(x + dx, y + dy))) {
                count++;
            }
        }
    }
    
    return count;
}

// Count living neighbors - Von Neumann neighborhood (4 cells)
fn count_neighbors_von_neumann(x: i32, y: i32) -> u32 {
    var count: u32 = 0u;
    
    // Only orthogonal neighbors (N, S, E, W)
    if (is_alive(get_cell(x, y - 1))) { count++; } // North
    if (is_alive(get_cell(x, y + 1))) { count++; } // South
    if (is_alive(get_cell(x - 1, y))) { count++; } // West
    if (is_alive(get_cell(x + 1, y))) { count++; } // East
    
    return count;
}

// Count living neighbors - Extended Moore neighborhood (24 cells, radius 2)
fn count_neighbors_extended(x: i32, y: i32) -> u32 {
    var count: u32 = 0u;
    
    for (var dy: i32 = -2; dy <= 2; dy++) {
        for (var dx: i32 = -2; dx <= 2; dx++) {
            if (dx == 0 && dy == 0) {
                continue;
            }
            if (is_alive(get_cell(x + dx, y + dy))) {
                count++;
            }
        }
    }
    
    return count;
}

// Count neighbors based on neighborhood type
fn count_neighbors(x: i32, y: i32) -> u32 {
    switch (params.neighborhood) {
        case 1u: { return count_neighbors_von_neumann(x, y); }
        case 2u: { return count_neighbors_extended(x, y); }
        default: { return count_neighbors_moore(x, y); }
    }
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let x = i32(global_id.x);
    let y = i32(global_id.y);
    
    // Bounds check
    if (global_id.x >= params.width || global_id.y >= params.height) {
        return;
    }
    
    let idx = global_id.x + global_id.y * params.width;
    let current_state = cell_state_in[idx];
    let neighbors = count_neighbors(x, y);
    
    var new_state: u32 = 0u;
    
    if (params.num_states == 2u) {
        // Standard Life-like rules (2-state)
        if (current_state == 0u) {
            // Dead cell - check birth condition
            if ((params.birth_mask & (1u << neighbors)) != 0u) {
                new_state = 1u;
            }
        } else {
            // Alive cell - check survival condition
            if ((params.survive_mask & (1u << neighbors)) != 0u) {
                new_state = 1u;
            }
        }
    } else {
        // Generations rules (multi-state)
        if (current_state == 0u) {
            // Dead cell - check birth condition
            if ((params.birth_mask & (1u << neighbors)) != 0u) {
                new_state = 1u; // Born
            }
        } else if (current_state == 1u) {
            // Alive cell - check survival condition
            if ((params.survive_mask & (1u << neighbors)) != 0u) {
                new_state = 1u; // Survive
            } else {
                new_state = 2u; // Start dying
            }
        } else {
            // Dying cell - increment towards death
            new_state = current_state + 1u;
            if (new_state >= params.num_states) {
                new_state = 0u; // Dead
            }
        }
    }
    
    cell_state_out[idx] = new_state;
}

