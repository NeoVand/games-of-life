# Games of Life — Library Plan (Synthesis v1)

This document synthesizes and upgrades:
- `docs/ca-library-design-prelude.md` (capability inventory + initial architecture)
- `docs/games-of-life-library-design-prelude-critique.md` (verification + drift/bug findings)

It is a **single, coherent plan** for extracting a reusable WebGPU cellular automaton library from the Games of Life codebase, with an emphasis on:
- **Reliability** (no semantic drift between CPU/TS and WGSL)
- **Modularity** (rules ↔ rendering ↔ tiling ↔ interaction separable)
- **Ergonomics** (5–10 lines to mount a CA anywhere: button/icon → full screen)
- **Extensibility** (new tilings, new kernels, async stepping)

---

## 1) Name, scope, and product framing

### 1.1 Branding
The library ecosystem is named **Games of Life**.

### 1.2 What “Games of Life” refers to
We will treat Games of Life as:
- **The app**: the current SvelteKit project (consumer #1).
- **The engine/library**: the extracted core + wrappers (product).

### 1.3 Packaging strategy (recommended)
Start with a **framework-agnostic TypeScript core**, then add optional wrappers.

Two viable publication layouts:
- **Scoped multi-package (recommended)**:
  - `@games-of-life/core` — the engine (framework-agnostic)
  - `@games-of-life/svelte` — Svelte integration (optional)
  - `@games-of-life/shaders` — WGSL capsule sources/helpers (optional; could be a subpath export instead)
- **Single package with subpath exports**:
  - `games-of-life/core`, `games-of-life/svelte`, `games-of-life/shaders`

Decision criterion:
- If you want the ecosystem to grow (React, Web Components, vanilla), **use the scoped packages**.

---

## 2) Verified current capabilities (what must be preserved)

These are confirmed in the current codebase (WebGPU and/or CPU mini-sim), and they define the “baseline instrument”.

### 2.1 State model
- `u32` per cell.
- Semantics:
  - `0`: dead
  - `1`: alive
  - `2..(numStates-1)`: decay states (Generations-like trails)

### 2.2 Kernels/rules (compute semantics)
- B/S bitmask rules with optional `/Ck` generations.
- Neighborhoods:
  - Moore (8), Von Neumann (4), Extended Moore (24), Hex (6), Extended Hex (18)
- Boundary topologies (9):
  - plane, cylinderX, cylinderY, torus, mobiusX, mobiusY, kleinX, kleinY, projectivePlane
- Vitality influence modes (dying cells influence neighbor totals):
  - none, threshold, ghost, sigmoid, decay, curve (128-sample LUT)

### 2.3 Rendering
- Rect and hex rendering modes.
- Theme (light/dark), gridlines, axes animation.
- 18 spectrum modes + spectrum frequency.
- Neighbor shading: off / count active / sum vitality.
- Brush preview overlay (shader-side).

### 2.4 Interaction / authoring tools
- Brushes:
  - fill types: solid, gradient, noise, spray
  - shapes: circle, square, diamond, hexagon, ring, triangle, line, cross, star, heart, spiral, flower, burst, wave, dots, scatter, text
  - rotation, aspect ratio, density, intensity
- Text brush preview uses a GPU text bitmap; painting uses CPU bitmap.
- Pan/zoom with pick transforms (rect + hex) and “fit” animation.
- GPU readback: full snapshots and alive count.
- Recording: 1:1 render to a separate canvas and stream via MediaRecorder.

### 2.5 Multiple simulations in one UI
The current tour gallery runs multiple mini-sims (verified **6**, arranged 2×3; comments are inconsistent but code maps over 6 rules).

Library requirement:
- Support **N mounts** (many independent canvases, not one global singleton).

---

## 3) Critical correctness and drift risks to design against (verified issues)

The current codebase already exhibits “AI drift” patterns. The library must structurally prevent them.

### 3.1 Enum/index drift (spectrum/brush/boundary mappings)
Today, mappings exist in multiple places (store, Canvas, Simulation comments, WGSL).

Library requirement:
- A **single source-of-truth** for:
  - spectrum mode IDs ↔ indices
  - brush shape IDs ↔ indices
  - boundary IDs ↔ indices
  - neighborhood IDs ↔ indices

### 3.2 Rule serialization mismatch (real bug)
`ruleToString` in `utils/rules.ts` serializes only neighbor counts 0..8, which is incorrect for extended neighborhoods.

Library requirement:
- Define rule representation + serialization as **canonical and round-trippable**, or explicitly non-round-trippable with documented constraints.
- Avoid having separate “UI-only” serializers.

### 3.3 CPU vs WGSL semantic drift (brush/text/boundary)
Your system duplicates key logic across TS and WGSL.

Library requirement:
- Establish a “shared semantics strategy” (see §9).

### 3.4 Hex tiling invariants (parity constraint)
Odd-r hex wrapping has constraints (e.g., height parity for torus-like wrap correctness).

Library requirement:
- Tilings must provide `normalizeGridSize()` / `validateGridSize()` with clear errors.

---

## 4) Design principles (the “instrument” philosophy)

- **Small surface, deep composition**: v0 API should be minimal but extensible via interfaces.
- **Explicit seams**: kernels, renderers, tilings, boundaries, interaction, scheduling are distinct.
- **No hidden global state**: multi-mount by default; optional shared-device caching is explicit.
- **Correctness-first**: eliminate drift via shared encodings, reusable WGSL snippets, and golden tests.
- **Progressive complexity**:
  - trivial: `createMount(canvas).start()`
  - advanced: custom kernel + custom renderer + async step patches

---

## 5) Library architecture (modules and responsibilities)

### 5.1 Core package: `@games-of-life/core`
Submodules (tree-shakeable):

- **`gpu/`**
  - WebGPU init helpers
  - device-loss handling policy hooks
  - resource creation + alignment helpers
  - optional shared device/pipeline caches (opt-in)

- **`state/`**
  - cell storage abstractions:
    - `PingPongBuffer<u32>`
    - `CellPatch` formats (sparse indices, rect tiles)
  - CPU backing arrays when needed

- **`spec/` (canonical encodings)**
  - enums + IDs + index mapping:
    - `SpectrumModeId`, `BrushShapeId`, `BoundaryId`, `NeighborhoodId`
  - canonical conversion functions used by:
    - renderer config → uniforms
    - kernel config → uniforms
    - any wrapper UI

- **`tilings/`**
  - `square()` and `hexOddR()` built-ins
  - provides:
    - geometry: `cellToWorld`, `worldToCell`
    - invariants: `normalizeGridSize`, `validateGridSize`
    - neighbor stencils (or a method to build them)

- **`boundaries/`**
  - 9 built-in boundary conditions
  - provides:
    - CPU coordinate transform
    - WGSL coordinate transform snippet
    - canonical ID ↔ index mapping

- **`rules/`**
  - canonical rule representation:
    - `RuleSpec` (mask + maxNeighbors + numStates + neighborhood)
    - vitality settings and curve points/samples
  - parsing and *correct* serialization

- **`kernels/`**
  - kernel interface + built-ins:
    - `bsGenerationsKernel` (your current compute semantics)
  - optional CPU kernel for:
    - tiny sims
    - async/agent-based stepping

- **`renderers/`**
  - renderer interface + built-in cell renderer:
    - `cellsRenderer` (your current render semantics)

- **`interaction/`**
  - brushes, text stamping, painting
  - must support both backends:
    - GPU buffer painting
    - CPU array painting

- **`runtime/`**
  - loop helpers (optional):
    - `createScheduler()`
    - rAF render loop
    - fixed timestep stepping
    - async stepping support

- **`mount/`**
  - `createMount()` orchestration:
    - binds canvas/context
    - selects kernel + renderer + grid storage
    - exposes the minimal imperative API

### 5.2 Svelte wrapper: `@games-of-life/svelte` (optional)
Goal: make Svelte ergonomics excellent without infecting the core.

Deliverables:
- `useMount()` / Svelte actions for canvases
- lightweight stores/adapters (but core remains store-free)

---

## 6) Public API v0 (minimal but complete)

### 6.1 The “mount” object
`Mount` must be the unit of composition: one mount per canvas.

Required capabilities:
- `render()` — render current visual state
- `step()` — advance one logical step (sync or async)
- `start()` / `stop()` — optional scheduler-managed loops
- `destroy()` — release resources
- `resizeSurface()` — update canvas sizing (DPR-aware)
- `resizeGrid()` — (optional) rebuild grid storage
- `applyPatch(patch)` — apply partial updates to state
- `readback()` — optional snapshot interface (expensive)

### 6.2 Kernel/renderer interfaces (stable seams)
Both interfaces should be “capsule-driven”:
- a declared binding layout
- a uniform schema
- a compile method that produces a pipeline runnable by the mount

### 6.3 Configuration objects are declarative
Avoid passing raw indices; users pass semantic IDs:
- `spectrum: { mode: 'fire', frequency: 2.3 }`
- `boundary: 'torus'`
- `tiling: 'hexOddR'`
- `brush.shape: 'heart'`

All conversions happen via `spec/` (single source-of-truth).

---

## 7) Key feature design decisions (to keep the system coherent)

### 7.1 Separate “tiling” from “neighborhood”
Today they’re entangled. In the library:
- **Tiling** governs geometry and picking.
- **Neighborhood** governs the stencil (counts) used by a kernel.

Pragmatic approach for v0:
- Keep current coupled combinations as supported presets:
  - square+Moore/VN/ExtMoore
  - hexOddR+Hex/ExtHex
- Internally prepare the separation so future tilings can plug in.

### 7.2 Rules vs rendering separation
Rules and rendering must be independently swappable:
- kernels define how state evolves
- renderers define how state is visualized

### 7.3 Brush preview vs brush apply must not drift
This is a major correctness risk.

v0 strategy:
- define brush shapes once as a shared spec
- implement:
  - WGSL preview from the spec
  - TS painter from the spec
- add golden tests to ensure parity for a fixed set of sample points

### 7.4 Device-loss and recovery strategy
Core must expose explicit hooks:
- `onDeviceLost(info)` callback
- a “recreate pipelines + reupload state” path (best effort)

---

## 8) Async stepping (LLM-per-cell and “visual formation”)

We want:
- **bulk synchronous commit** for logical correctness
- **streamed visual updates** during a step when desired

v0 design primitives:
- `step(): Promise<StepResult>`
- `StepResult` includes:
  - `committed: boolean`
  - optional `visualPatches?: AsyncIterable<CellPatch>`
  - optional `finalPatch?: CellPatch` (or “commit buffer swap”)

This supports:
- CPU async kernels that yield patches as they compute.
- GPU kernels that remain synchronous (no patches), but can still render at independent cadence.

---

## 9) “Shared semantics” strategy (prevent drift)

This is mandatory because the current code already drifts.

### 9.1 Canonical encodings module
Everything index-based is derived from `spec/`:
- IDs are stable public API
- indices are internal implementation details generated from IDs

### 9.2 WGSL snippet reuse
Boundary transforms, tiling transforms, and shared math should be WGSL snippets supplied by their modules and composed into shader capsules.

### 9.3 Golden tests (small-grid truth tables)
Even without running WebGPU in CI initially, we can:
- validate CPU reference implementations
- validate that “serialize → parse” round-trips for rules
- validate brush painter vs expected shape masks

Later, add WebGPU-based golden tests where supported.

---

## 10) Roadmap (v0 → v1) with success criteria

### v0 (Extraction minimal core)
Goal: Rebuild **both**:
- the main simulation canvas
- the tour gallery mini-sims (6 mounts)
using one engine.

Deliverables:
- `@games-of-life/core` with:
  - `createMount`
  - `bsGenerationsKernel`
  - `cellsRenderer`
  - `square` + `hexOddR` tilings
  - 9 boundary modes
  - vitality modes
  - canonical enums and mappings
- Basic examples:
  - “tiny button CA”
  - “full-screen CA”

Success criteria:
- The Svelte app can be refit to use the library without regressions in:
  - hex/rect behavior
  - boundary modes
  - spectra and vitality
  - brush shapes and text brush

### v0.5 (Hardening)
Deliverables:
- drift prevention:
  - rule serialization fixed and canonicalized
  - remove duplicated enum mappings in consumer code
- optional shared-device cache for many mounts
- stable patch format and `applyPatch`

### v1 (Extensibility + async)
Deliverables:
- CPU async kernel interface for agent-per-cell
- renderer/kernels “capsule” format formalized
- experimental third tiling (e.g., triangular) as proof of architecture

---

## 11) Migration plan (from the current app to the library)

1. **Extract `rules/` and `spec/`** (fix rule serialization, unify indices).
2. **Extract `boundaries/` and `tilings/`** including invariants (hex parity).
3. **Split the monolithic Simulation** into:
   - kernel runner
   - renderer
   - mount orchestration
   - interaction painter
4. **Replace tour mini-sim** with mounts (or a shared CPU kernel using same rule semantics).
5. Rebuild the app as consumer #1 and treat it as your integration suite.

---

## 12) Open decisions (must resolve early)

- **Package naming**: `games-of-life/*` vs `@games-of-life/*`.
- **CPU fallback**: required in v0 or optional?
- **Shared device caching**: default off (predictability) or on (performance for many mounts)?
- **Rule representation**: keep “mask” forever, or allow weighted stencils in v1?
- **History**: explicitly app-level (recommended), but we should define patch formats that make history efficient.

---

## 13) Immediate next step

If you approve this plan direction, the next design iteration should produce:
- a concrete **TypeScript interface spec** for:
  - `Mount`, `Kernel`, `Renderer`, `Tiling`, `Boundary`, `RuleSpec`, `CellPatch`
- the canonical **enum/encoding tables** (IDs + indices) as a single source-of-truth
- a small “capsule” schema for WGSL modules and bindings (enough for v0)


