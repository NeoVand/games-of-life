# Games of Life — Library Development TODO (Comprehensive, v0→v1)

This TODO list is the actionable counterpart to:
- `docs/games-of-life-library-plan.md`

It is ordered so you can implement the library with minimal rework, while preserving correctness and preventing drift.

**Constraint:** do not implement until you confirm this plan.

---

## A) Early decisions (blockers)

- **A1 — Choose publishing layout**
  - Decide between:
    - `@games-of-life/*` (recommended for ecosystem)
    - `games-of-life/*` (single package with subpath exports)
  - Decide whether `@games-of-life/shaders` is a separate package or a subpath export.

- **A2 — Define “core vs wrapper” boundary**
  - Confirm that `@games-of-life/core` is framework-agnostic (no Svelte runes, no UI, no stores).
  - Confirm `@games-of-life/svelte` owns Svelte conveniences only (actions/components/adapters).

- **A3 — Decide CPU fallback policy for v0**
  - Options:
    - v0 includes CPU kernel (supports “mini sims” and async kernels early).
    - v0 is GPU-first; CPU kernel is v1.

- **A4 — Device sharing policy**
  - Decide whether v0 defaults to:
    - per-mount device (simple but expensive)
    - shared device (better for many mounts; needs careful lifetime management)

---

## B) Canonical specifications (drift prevention foundation)

- **B1 — Create a canonical `spec/` module**
  - Single source-of-truth for:
    - `SpectrumModeId` (18 modes) + stable ordering
    - `BrushShapeId` (17 shapes) + stable ordering
    - `BoundaryId` (9) + stable ordering
    - `NeighborhoodId` (5) + stable ordering
  - Export:
    - ID lists
    - `idToIndex()` / `indexToId()` for each domain
    - validation helpers

- **B2 — Define canonical rule representation**
  - Define `RuleSpec` that explicitly includes:
    - `birthMask`, `surviveMask`
    - `numStates`
    - `neighborhoodId`
    - `maxNeighbors` (derived from neighborhood)
  - Decide mask encoding constraints:
    - enforce neighbor count ≤ 31 if using single `u32` bitmask

- **B3 — Fix rule string round-tripping in the library design**
  - Define `parseRuleString()` and `formatRuleString()` that correctly handle:
    - single digits (compact)
    - comma-separated double digits (10–24)
    - ranges (e.g., `9-17`)
  - Decide whether range formatting is preserved or normalized.

- **B4 — Vitality spec**
  - Canonicalize vitality config:
    - `mode`
    - parameters (threshold, ghostFactor, sigmoidSharpness, decayPower)
    - curve control points (source-of-truth)
    - 128-sample LUT generation function (monotonic cubic)

---

## C) Tiling + boundary (math + invariants)

- **C1 — Define `Tiling` interface**
  - Must provide:
    - `cellToWorld(cell)` / `worldToCell(world)` (for picking and geometry)
    - `normalizeGridSize({width,height}, boundaryId)` or `validateGridSize(...)`
    - optional neighbor coordinate helpers (or stencil builder hooks)

- **C2 — Implement built-in tilings**
  - `square` (current rect)
  - `hexOddR` (current odd-r hex)

- **C3 — Define `BoundaryCondition` interface**
  - Must provide:
    - canonical ID/index mapping
    - CPU coordinate transform (for painting and CPU kernels)
    - WGSL snippet for coordinate transform (for GPU kernels/renderers)

- **C4 — Encode tiling/boundary invariants**
  - Example: hex odd-r + torus wrapping parity constraint (height must be even).
  - Ensure invalid configurations fail fast with clear errors.

---

## D) Shader capsule + pipeline layer (GPU core)

- **D1 — Define a minimal “shader capsule” schema (v0)**
  - Declares:
    - WGSL source(s)
    - bind group layouts
    - uniform layout (typed schema doc)
    - entrypoints
  - Keep composition pragmatic:
    - template strings + insertion points are fine in v0

- **D2 — Extract/standardize shared WGSL snippets**
  - boundary transform snippet
  - tiling transform snippet
  - shared constants (indices, params)

- **D3 — Implement GPU kernel capsule: `bsGenerationsKernel`**
  - Encode:
    - rule masks, numStates
    - neighborhood selection
    - boundary selection
    - vitality settings (+ curve buffer)

- **D4 — Implement GPU renderer capsule: `cellsRenderer`**
  - Encode:
    - theme
    - spectrum mode/frequency
    - neighbor shading
    - grid/axes toggles
    - brush preview params
    - tiling selection (rect vs hex)

---

## E) State backend + patch protocol

- **E1 — Define `CellStateBackend` abstraction**
  - Backends:
    - GPU storage buffer ping-pong
    - CPU typed array

- **E2 — Define `CellPatch` formats**
  - Start with:
    - sparse indices + values
  - Optional:
    - tiled rectangles (for performance)

- **E3 — Implement apply/readback operations**
  - `applyPatch(patch)`
  - `readback()` (full snapshot)
  - `countAlive()` (optional fast approximate + optional accurate async readback)

---

## F) Interaction module (brushes + painting)

- **F1 — Canonical brush model**
  - IDs from `spec/` only (no duplicated arrays)
  - config: shape, size, rotation, aspect, density, intensity, fillType

- **F2 — Unify “preview vs apply” semantics**
  - Choose a strategy:
    - shared brush shape DSL → codegen WGSL + TS
    - or hand-written but with golden tests for parity

- **F3 — Text stamp subsystem**
  - CPU rasterization
  - GPU bitmap upload for preview
  - CPU bitmap application for painting

- **F4 — High-performance painting**
  - batch write strategy for GPU backend (avoid per-cell writeBuffer in hot loops where possible)
  - preserve exact behavior where correctness depends on it

---

## G) Mount + runtime scheduling (multi-canvas support)

- **G1 — Define `Mount` interface (v0)**
  - `render()`, `step()`, `start()`, `stop()`, `destroy()`
  - `resizeSurface()`, `resizeGrid()` (policy-driven)
  - `applyPatch()`, optional `readback()`

- **G2 — Implement `createMount()`**
  - accepts:
    - canvas + DPR strategy
    - grid size + tiling + boundary
    - kernel + renderer configs
  - builds and wires:
    - backend storage
    - kernel runner
    - renderer
    - optional scheduler

- **G3 — Scheduler design**
  - decouple:
    - render cadence (rAF)
    - step cadence (fixed Hz, variable, manual)
  - support async step:
    - `StepResult` with optional `visualPatches` stream

- **G4 — Multi-mount resource sharing**
  - optional shared device/pipeline cache
  - explicit lifetime and reference counting

---

## H) Testing strategy (correctness-first)

- **H1 — Rule parsing/formatting tests**
  - include extended neighborhoods and ranges
  - ensure stable round-trips

- **H2 — Vitality curve sampling tests**
  - monotonic cubic correctness + clamping
  - LUT generation determinism

- **H3 — Brush parity tests**
  - verify TS painter matches expected masks for shapes
  - later: compare GPU preview sampling on a tiny grid (optional)

- **H4 — Boundary transform tests**
  - CPU transform properties for each boundary mode
  - hex parity invariant tests

- **H5 — Integration tests (consumer #1)**
  - rebuild Games of Life app using the library as a golden integration suite

---

## I) Migration tasks (apply library to current app)

- **I1 — Replace `src/lib/index.ts` export surface**
  - stop exporting Svelte stores from the core library

- **I2 — Port main canvas**
  - move loop logic from `Canvas.svelte` into:
    - library mount + scheduler
    - Svelte wrapper (action/component)

- **I3 — Replace tour gallery mini-sim**
  - implement gallery as 6 small mounts (2×3 UI layout)
  - ensure semantics match main engine (vitality curve, neighborhoods)

- **I4 — Remove duplicated mapping functions**
  - `getSpectrumModeIndex`, `getBrushShapeIndex`, etc. should be derived from `spec/`.

---

## J) Documentation + examples (adoption)

- **J1 — Quickstart examples**
  - “one-liner mount”
  - “tiny button CA”
  - “full-screen CA”

- **J2 — Advanced examples**
  - custom vitality curve
  - custom boundary mode selection
  - async kernel example (agent-per-cell placeholder)

- **J3 — API docs**
  - document stable interfaces and invariants clearly for AI/tooling consumption

---

## K) Release checklist (v0)

- **K1**: APIs finalized (Mount/Kernel/Renderer/Tiling/Boundary/RuleSpec/CellPatch)
- **K2**: Drift prevention in place (`spec/` canonical encodings)
- **K3**: Rule serialization fixed and canonical
- **K4**: Tour gallery uses mounts (no parallel CA engine)
- **K5**: App rebuild passes manual acceptance (visual + perf + correctness)


