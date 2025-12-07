// Cellular Automaton Compute Shader
// Supports Life-like (B/S) and Generations rules
// Supports multiple neighborhood types

struct Params {
    width: u32,
    height: u32,
    birth_mask: u32,          // Bit i = 1 means birth with i neighbors
    survive_mask: u32,        // Bit i = 1 means survive with i neighbors
    num_states: u32,          // 2 for Life-like, 3+ for Generations
    boundary_mode: u32,       // 0=plane, 1=cylinderX, 2=cylinderY, 3=torus, 4=mobiusX, 5=mobiusY, 6=kleinX, 7=kleinY, 8=projectivePlane
    neighborhood: u32,        // 0 = Moore (8), 1 = Von Neumann (4), 2 = Extended Moore (24), 3 = Hexagonal (6), 4 = Extended Hexagonal (18)
    vitality_mode: u32,       // 0=none, 1=threshold, 2=ghost, 3=sigmoid, 4=decay
    vitality_threshold: f32,  // For modes 1,3: vitality cutoff (0.0-1.0)
    vitality_ghost: f32,      // For modes 2,4: ghost contribution factor (0.0-1.0)
    vitality_sigmoid: f32,    // For mode 3: sigmoid sharpness (1.0-20.0)
    vitality_decay: f32,      // For mode 4: power curve exponent (0.5-3.0)
    _padding1: u32,           // Padding for 16-byte alignment
    _padding2: u32,
    _padding3: u32,
    _padding4: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> cell_state_in: array<u32>;
@group(0) @binding(2) var<storage, read_write> cell_state_out: array<u32>;

// Boundary modes:
// 0 = plane (no wrap)
// 1 = cylinderX (horizontal wrap only)
// 2 = cylinderY (vertical wrap only)
// 3 = torus (both wrap, same orientation)
// 4 = mobiusX (horizontal wrap with vertical flip)
// 5 = mobiusY (vertical wrap with horizontal flip)
// 6 = kleinX (horizontal möbius + vertical cylinder)
// 7 = kleinY (vertical möbius + horizontal cylinder)
// 8 = projectivePlane (both edges flip)

// Get cell state at position with boundary handling
// This logic must match the render shader's get_cell_state function exactly
fn get_cell(x: i32, y: i32) -> u32 {
    let w = i32(params.width);
    let h = i32(params.height);
    let mode = params.boundary_mode;
    
    // Determine which boundaries wrap and flip based on mode
    // Modes that wrap horizontally: 1 (cylinderX), 3 (torus), 4 (mobiusX), 6 (kleinX), 7 (kleinY), 8 (projective)
    let wraps_x = mode == 1u || mode == 3u || mode == 4u || mode == 6u || mode == 7u || mode == 8u;
    // Modes that wrap vertically: 2 (cylinderY), 3 (torus), 5 (mobiusY), 6 (kleinX), 7 (kleinY), 8 (projective)
    let wraps_y = mode == 2u || mode == 3u || mode == 5u || mode == 6u || mode == 7u || mode == 8u;
    // Modes with X-flip when wrapping X: 4 (mobiusX), 6 (kleinX), 8 (projective)
    let flips_x = mode == 4u || mode == 6u || mode == 8u;
    // Modes with Y-flip when wrapping Y: 5 (mobiusY), 7 (kleinY), 8 (projective)
    let flips_y = mode == 5u || mode == 7u || mode == 8u;
    
    var fx = x;
    var fy = y;
    
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
    
    let idx = u32(fx) + u32(fy) * params.width;
    return cell_state_in[idx];
}

// Check if a cell is "alive" (state == 1 for Generations rules)
fn is_alive(state: u32) -> bool {
    return state == 1u;
}

// Calculate vitality of a cell (1.0 = fully alive, 0.0 = dead)
// For dying cells, vitality decreases from ~1.0 to ~0.0
fn get_vitality(state: u32) -> f32 {
    if (state == 0u) { return 0.0; }  // Dead
    if (state == 1u) { return 1.0; }  // Fully alive
    // Dying: vitality = (numStates - state) / (numStates - 1)
    // State 2 -> vitality close to 1.0, last state -> vitality close to 0.0
    return f32(params.num_states - state) / f32(params.num_states - 1u);
}

// Calculate how much a cell contributes to neighbor count based on vitality mode
fn get_neighbor_contribution(state: u32) -> f32 {
    let mode = params.vitality_mode;
    
    // Mode 0: Standard - only state 1 counts
    if (mode == 0u) {
        if (state == 1u) { return 1.0; }
        return 0.0;
    }
    
    let vitality = get_vitality(state);
    
    // Mode 1: Threshold - cells above threshold count as 1
    if (mode == 1u) {
        if (vitality >= params.vitality_threshold) { return 1.0; }
        return 0.0;
    }
    
    // Mode 2: Ghost - dying cells contribute fractionally
    // Alive cells always contribute 1.0
    // Dying cells contribute vitality * ghost_factor
    if (mode == 2u) {
        if (state == 1u) { return 1.0; }
        if (state == 0u) { return 0.0; }
        return vitality * params.vitality_ghost;
    }
    
    // Mode 3: Sigmoid - smooth S-curve transition
    // sigmoid((vitality - threshold) * sharpness)
    if (mode == 3u) {
        let x = (vitality - params.vitality_threshold) * params.vitality_sigmoid;
        return 1.0 / (1.0 + exp(-x));
    }
    
    // Mode 4: Decay - power curve with ghost factor
    // Alive cells contribute 1.0
    // Dying cells contribute vitality^power * ghost_factor
    if (state == 1u) { return 1.0; }
    if (state == 0u) { return 0.0; }
    return pow(vitality, params.vitality_decay) * params.vitality_ghost;
}

// Convert accumulated neighbor total to integer count with clamping to avoid underflow/overflow
fn neighbor_total_to_count(total: f32, max_neighbors: f32) -> u32 {
    let clamped = clamp(total, 0.0, max_neighbors);
    return u32(clamped + 0.5);
}

// Count living neighbors - Moore neighborhood (8 cells)
fn count_neighbors_moore(x: i32, y: i32) -> u32 {
    var total: f32 = 0.0;
    
    for (var dy: i32 = -1; dy <= 1; dy++) {
        for (var dx: i32 = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) {
                continue;
            }
            total += get_neighbor_contribution(get_cell(x + dx, y + dy));
        }
    }
    
    return neighbor_total_to_count(total, 8.0);
}

// Count living neighbors - Von Neumann neighborhood (4 cells)
fn count_neighbors_von_neumann(x: i32, y: i32) -> u32 {
    var total: f32 = 0.0;
    
    // Only orthogonal neighbors (N, S, E, W)
    total += get_neighbor_contribution(get_cell(x, y - 1)); // North
    total += get_neighbor_contribution(get_cell(x, y + 1)); // South
    total += get_neighbor_contribution(get_cell(x - 1, y)); // West
    total += get_neighbor_contribution(get_cell(x + 1, y)); // East
    
    return neighbor_total_to_count(total, 4.0);
}

// Count living neighbors - Extended Moore neighborhood (24 cells, radius 2)
fn count_neighbors_extended(x: i32, y: i32) -> u32 {
    var total: f32 = 0.0;
    
    for (var dy: i32 = -2; dy <= 2; dy++) {
        for (var dx: i32 = -2; dx <= 2; dx++) {
            if (dx == 0 && dy == 0) {
                continue;
            }
            total += get_neighbor_contribution(get_cell(x + dx, y + dy));
        }
    }
    
    return neighbor_total_to_count(total, 24.0);
}

// Count living neighbors - Hexagonal neighborhood (6 cells)
// Uses "offset coordinates" (odd-r) where odd rows are shifted right
// Each cell has 6 neighbors arranged in a honeycomb pattern
fn count_neighbors_hexagonal(x: i32, y: i32) -> u32 {
    var total: f32 = 0.0;
    
    // Determine if this row is odd or even
    let is_odd_row = (y & 1) == 1;
    
    // Top-left and top-right neighbors
    if (is_odd_row) {
        // Odd row: top neighbors at (x, y-1) and (x+1, y-1)
        total += get_neighbor_contribution(get_cell(x, y - 1));
        total += get_neighbor_contribution(get_cell(x + 1, y - 1));
    } else {
        // Even row: top neighbors at (x-1, y-1) and (x, y-1)
        total += get_neighbor_contribution(get_cell(x - 1, y - 1));
        total += get_neighbor_contribution(get_cell(x, y - 1));
    }
    
    // Left and right neighbors (same for both odd and even rows)
    total += get_neighbor_contribution(get_cell(x - 1, y));
    total += get_neighbor_contribution(get_cell(x + 1, y));
    
    // Bottom-left and bottom-right neighbors
    if (is_odd_row) {
        // Odd row: bottom neighbors at (x, y+1) and (x+1, y+1)
        total += get_neighbor_contribution(get_cell(x, y + 1));
        total += get_neighbor_contribution(get_cell(x + 1, y + 1));
    } else {
        // Even row: bottom neighbors at (x-1, y+1) and (x, y+1)
        total += get_neighbor_contribution(get_cell(x - 1, y + 1));
        total += get_neighbor_contribution(get_cell(x, y + 1));
    }
    
    return neighbor_total_to_count(total, 6.0);
}

// Count living neighbors - Extended Hexagonal neighborhood (18 cells)
// Two rings of neighbors around the center cell in a hexagonal grid
// Ring 1: 6 immediate neighbors (same as regular hexagonal)
// Ring 2: 12 neighbors at distance 2
fn count_neighbors_extended_hexagonal(x: i32, y: i32) -> u32 {
    var total: f32 = 0.0;
    
    // Determine if this row is odd or even
    let is_odd_row = (y & 1) == 1;
    
    // === RING 1: 6 immediate neighbors (same as regular hexagonal) ===
    
    // Top neighbors (y-1)
    if (is_odd_row) {
        total += get_neighbor_contribution(get_cell(x, y - 1));
        total += get_neighbor_contribution(get_cell(x + 1, y - 1));
    } else {
        total += get_neighbor_contribution(get_cell(x - 1, y - 1));
        total += get_neighbor_contribution(get_cell(x, y - 1));
    }
    
    // Left and right neighbors (y)
    total += get_neighbor_contribution(get_cell(x - 1, y));
    total += get_neighbor_contribution(get_cell(x + 1, y));
    
    // Bottom neighbors (y+1)
    if (is_odd_row) {
        total += get_neighbor_contribution(get_cell(x, y + 1));
        total += get_neighbor_contribution(get_cell(x + 1, y + 1));
    } else {
        total += get_neighbor_contribution(get_cell(x - 1, y + 1));
        total += get_neighbor_contribution(get_cell(x, y + 1));
    }
    
    // === RING 2: 12 outer neighbors ===
    
    // Row y-2 (2 cells directly above)
    let is_odd_row_m1 = ((y - 1) & 1) == 1;
    if (is_odd_row_m1) {
        // Row y-1 is odd, so y-2 is even
        total += get_neighbor_contribution(get_cell(x, y - 2));      // directly above
        total += get_neighbor_contribution(get_cell(x + 1, y - 2));  // above-right
    } else {
        // Row y-1 is even, so y-2 is odd
        total += get_neighbor_contribution(get_cell(x - 1, y - 2));  // above-left
        total += get_neighbor_contribution(get_cell(x, y - 2));      // directly above
    }
    
    // Row y-1 outer cells (2 cells at far corners of top row)
    if (is_odd_row) {
        // Current row is odd
        total += get_neighbor_contribution(get_cell(x - 1, y - 1));  // far top-left
        total += get_neighbor_contribution(get_cell(x + 2, y - 1));  // far top-right
    } else {
        // Current row is even
        total += get_neighbor_contribution(get_cell(x - 2, y - 1));  // far top-left
        total += get_neighbor_contribution(get_cell(x + 1, y - 1));  // far top-right
    }
    
    // Row y outer cells (2 cells at distance 2 horizontally)
    total += get_neighbor_contribution(get_cell(x - 2, y));  // far left
    total += get_neighbor_contribution(get_cell(x + 2, y));  // far right
    
    // Row y+1 outer cells (2 cells at far corners of bottom row)
    if (is_odd_row) {
        // Current row is odd
        total += get_neighbor_contribution(get_cell(x - 1, y + 1));  // far bottom-left
        total += get_neighbor_contribution(get_cell(x + 2, y + 1));  // far bottom-right
    } else {
        // Current row is even
        total += get_neighbor_contribution(get_cell(x - 2, y + 1));  // far bottom-left
        total += get_neighbor_contribution(get_cell(x + 1, y + 1));  // far bottom-right
    }
    
    // Row y+2 (2 cells directly below)
    let is_odd_row_p1 = ((y + 1) & 1) == 1;
    if (is_odd_row_p1) {
        // Row y+1 is odd, so y+2 is even
        total += get_neighbor_contribution(get_cell(x, y + 2));      // directly below
        total += get_neighbor_contribution(get_cell(x + 1, y + 2));  // below-right
    } else {
        // Row y+1 is even, so y+2 is odd
        total += get_neighbor_contribution(get_cell(x - 1, y + 2));  // below-left
        total += get_neighbor_contribution(get_cell(x, y + 2));      // directly below
    }
    
    return neighbor_total_to_count(total, 18.0);
}

// Count neighbors based on neighborhood type
fn count_neighbors(x: i32, y: i32) -> u32 {
    switch (params.neighborhood) {
        case 1u: { return count_neighbors_von_neumann(x, y); }
        case 2u: { return count_neighbors_extended(x, y); }
        case 3u: { return count_neighbors_hexagonal(x, y); }
        case 4u: { return count_neighbors_extended_hexagonal(x, y); }
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

