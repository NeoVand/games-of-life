// Cellular Automaton Compute Shader
// Supports Life-like (B/S) and Generations rules

struct Params {
    width: u32,
    height: u32,
    birth_mask: u32,      // Bit i = 1 means birth with i neighbors
    survive_mask: u32,    // Bit i = 1 means survive with i neighbors
    num_states: u32,      // 2 for Life-like, 3+ for Generations
    _padding: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> cell_state_in: array<u32>;
@group(0) @binding(2) var<storage, read_write> cell_state_out: array<u32>;

// Get cell index with toroidal wrapping
fn get_index(x: i32, y: i32) -> u32 {
    let wrapped_x = ((x % i32(params.width)) + i32(params.width)) % i32(params.width);
    let wrapped_y = ((y % i32(params.height)) + i32(params.height)) % i32(params.height);
    return u32(wrapped_x) + u32(wrapped_y) * params.width;
}

// Get cell state at position (with wrapping)
fn get_cell(x: i32, y: i32) -> u32 {
    return cell_state_in[get_index(x, y)];
}

// Check if a cell is "alive" (state == 1 for Generations rules)
fn is_alive(state: u32) -> bool {
    return state == 1u;
}

// Count living neighbors (Moore neighborhood)
fn count_neighbors(x: i32, y: i32) -> u32 {
    var count: u32 = 0u;
    
    // Check all 8 neighbors
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

