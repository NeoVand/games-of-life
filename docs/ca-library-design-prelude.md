# CA WebGPU Library — Design Prelude (Codebase Study + Observations)

This document is an **observational prelude** to a future design doc. It maps the current codebase, extracts the **degrees of freedom** you already support, highlights coupling/technical debt, and proposes a **modular library architecture** and **API direction** for a standalone NPM package.

Scope constraints (per request):
- **No code changes** in the repo, only this markdown.
- Bias toward **clean library interfaces**, future extensibility (new rules, new tilings), and **reliable WebGPU** performance.
- Treat this repo as AI-generated: accept the *capabilities*, not the *current structure*.

---

## 1) What you have today (high-level)

You currently have **two cellular automaton engines**:
- **Main simulation (WebGPU)**: a robust GPU compute + GPU render pipeline with many user-facing controls.
- **Tour gallery mini-simulations (CPU/Canvas2D)**: a separate, lightweight CA implementation used to render a 3×2 “gallery” of tiny canvases in the guided tour UI.

The key opportunity: **extract a single engine** with an API that supports:
- Many independent “mounts” (tiny button/icon canvases up to full-screen).
- Shared capabilities (rules, palettes/spectrums, vitality, boundaries, hex/rect tilings).
- A clean separation between **rules/kernels**, **grid/tiling**, **rendering**, **interaction**, and **scheduling** (including future async).

---

## 2) Codebase map (important files + responsibilities)

### 2.1 Framework & build
- **SvelteKit + Vite + Svelte 5** (runes): `package.json`, `src/routes/*`, `svelte.config.js`, `vite.config.ts`
- This is a static build for GH pages via `@sveltejs/adapter-static`.

### 2.2 “Engine” (WebGPU)
- `src/lib/webgpu/context.ts`
  - WebGPU capability check + adapter/device acquisition + canvas context configure.
  - Helper buffer creation (`createBuffer`, `createEmptyBuffer`).
- `src/lib/webgpu/simulation.ts`
  - **Monolithic controller**: compute+render pipelines, ping-pong buffers, view state, coordinate transforms, brush painting, text brush rasterization, recording canvas, readback + counts, seeding, undo snapshot.
  - Imports **UI/store types** today (e.g., boundary mode index mapping, seed patterns).
- `src/lib/webgpu/shaders/life-compute.wgsl`
  - Rule evaluation: **B/S bitmasks**, multi-state decay, multiple neighborhoods (Moore/VN/Extended Moore/Hex/Extended Hex), boundary topologies, vitality influence modes (threshold/ghost/sigmoid/decay/curve).
- `src/lib/webgpu/shaders/life-render.wgsl`
  - Rendering: rect/hex mapping, grid lines, axes, neighbor shading, 18 spectrum modes + frequency, brush preview shapes (incl. text bitmap sampling), theming.

### 2.3 “Domain model” (rules)
- `src/lib/utils/rules.ts`
  - Rule parsing: `B.../S.../C...`, including ranges.
  - Rule presets (very large list): neighborhood types, recommended density, optional vitality settings (including curve points).
  - Vitality curve sampling (`sampleCurvePoints`) using monotonic cubic interpolation with clamping.

### 2.4 UI state & interaction glue (Svelte-specific)
- `src/lib/stores/simulation.svelte.ts`
  - Svelte runes store for *everything*: playback, speed, grid size, brush config, palettes, spectrums, neighbor shading, boundary mode, vitality controls, seeding, etc.
  - Also exports seed patterns and conversion helpers (e.g., boundary mode index).
- `src/lib/components/Canvas.svelte`
  - The main “app runtime loop”:
    - init WebGPU
    - create/destroy `Simulation`
    - requestAnimationFrame render loop
    - step scheduling at `speed` Hz
    - pointer/touch input → paint/pan/zoom
    - sets simulation view uniforms each frame
    - recording, screenshot, and history snapshots

### 2.5 The second CA engine (tour gallery mini-sim)
- `src/lib/utils/tour.ts`
  - Contains a separate CA implementation:
    - grid as `Uint8Array`, step via CPU loops
    - simple vitality handling (subset), neighborhoods (subset)
    - render via ImageData to multiple canvases
  - This is the “tour card / mini gallery” simulation you described.

### 2.6 History / undo timeline (app feature)
- `src/lib/stores/history.ts`
  - Stores full-grid snapshots + branching history.
  - Coupled to `simulation.svelte.ts` for rule/boundary state.

### 2.7 Current exports
- `src/lib/index.ts`
  - Exports WebGPU context + `Simulation` + rules utilities.
  - Also exports Svelte stores (`getSimulationState`, `getUIState`) which makes the “library surface” currently **Svelte-dependent**.

---

## 3) Degrees of freedom you already support (the “capability inventory”)

This is the key list to preserve in the library design.

### 3.1 State model
- **Cell state is `u32`**.
- State semantics:
  - `0` = dead
  - `1` = alive
  - `2..(C-1)` = “dying/decay states” for multi-state “Generations-like” rules.
- `numStates` is currently used both for compute transitions and for render palette interpolation.

### 3.2 Rule space (compute kernel)
- **Birth/Survive bitmasks** with optional `/Ck` generations.
- Neighborhoods:
  - Moore (8)
  - Von Neumann (4)
  - Extended Moore (24)
  - Hexagonal (6)
  - Extended Hexagonal (18)
- Boundary topologies (9):
  - plane (no wrap)
  - cylinderX / cylinderY
  - torus
  - mobiusX / mobiusY
  - kleinX / kleinY
  - projectivePlane
- Vitality influence (“memory” in neighbor counting):
  - none
  - threshold
  - ghost
  - sigmoid
  - decay power curve
  - custom curve (128-sample LUT)

### 3.3 Rendering degrees of freedom
- Rect vs hex rendering based on neighborhood selection.
- **18 spectrum modes** + spectrum frequency (repeat/stretch).
- Theme: light/dark backgrounds and grid lines.
- Neighbor shading (off / count active / sum vitality).
- Grid lines (conditional on zoom/pixel density).
- Axes overlay with animation (progress 0→1).
- Alive color palette choices (separate sets for light/dark).

### 3.4 Interaction / brush system
- Brush modes:
  - fill styles: solid / gradient / noise / spray
  - shapes: circle, square, diamond, hexagon, ring, triangle, line, cross, star, heart, spiral, flower, burst, wave, dots, scatter, **text**
  - rotation, aspect ratio, density, intensity
- Brush preview is drawn in shader; brush painting is performed on CPU by writing individual cells to the GPU buffer (batched).
- Text brush:
  - rasterizes text to a bitmap on CPU
  - uploads bitmap to GPU for preview
  - uses a CPU copy to paint matching cells

### 3.5 View controls & ergonomics
- Pan/zoom with “fit view” and animation.
- Screen→grid coordinate transforms for rect and hex.
- Seamless panning with wrapping boundary modes (offset normalization).
- Input support: mouse, wheel, touch pinch/pan.

### 3.6 Runtime & extras
- Double-buffer ping-pong stepping.
- Continuous seeding with named seed patterns.
- GPU readback:
  - full snapshot (`getCellDataAsync`)
  - alive count (`countAliveCellsAsync`)
- Recording:
  - renders 1:1 full grid to a separate canvas stream for MediaRecorder.

### 3.7 “Mini-sim tour gallery”
- A separate CPU implementation supporting:
  - multiple neighborhoods (including hex/extended hex)
  - a subset of vitality modes (none/ghost/curve, with simplified curve sampling)
  - additive stimulation
  - ImageData-based rendering for performance

---

## 4) Where you depend on Svelte (and where you don’t)

### 4.1 Notably Svelte-dependent today
- `src/lib/stores/*` (Svelte runes).
- `src/lib/components/*` (UI).
- The “public exports” in `src/lib/index.ts` include Svelte stores, which effectively brands the repo as a Svelte library even though the GPU engine itself can be framework-agnostic.

### 4.2 The engine is mostly framework-agnostic already
- `src/lib/webgpu/context.ts` is plain TS.
- `src/lib/utils/rules.ts` is plain TS.
- `src/lib/webgpu/simulation.ts` is *logically* framework-agnostic but **imports store things**:
  - `SEED_PATTERNS`, `SEED_PATTERNS_HEX`, and boundary-mode indexing from `simulation.svelte.ts`
  - this is the biggest “pry point” for extraction.

### 4.3 Recommendation: core-first, wrappers second
For an NPM library intended for many adopters:
- Build a **pure TypeScript core** package first (framework-agnostic).
- Provide **optional wrappers** for Svelte (and later React, vanilla custom element, etc.).
- Keep Svelte as “one consumer” of the engine, not part of the engine.

Reason: your engine’s value is WebGPU correctness + performance + expressivity. Tying it to Svelte would unnecessarily limit adoption and complicate API evolution.

---

## 5) Key architectural issues (useful criticism before redesign)

### 5.1 Monolith: `Simulation` does too much
`src/lib/webgpu/simulation.ts` currently mixes:
- device resources + pipeline compilation
- compute kernel semantics (uniform packing, rule encoding)
- rendering semantics (render uniforms)
- UI/interaction features (brush preview params, screen transforms)
- authoring tools (brush painting, text bitmap generation)
- recording, readback, counting, undo

This is normal for a prototype but becomes painful for a library because:
- “Small canvases in a button” shouldn’t pay for heavy features by default.
- Custom kernels/tilings become hard to plug in.
- Testing and correctness validation are harder.

### 5.2 Cross-layer duplication
There are multiple “must match shader” duplications across:
- boundary coordinate transform logic (compute shader, render shader, TS `transformCoordinate`)
- brush SDF logic (shader and TS brush painter)
- text mapping logic (shader and TS brush painter)

For a library, this is risk: small drift becomes “mysterious bugs.”

### 5.3 Enum→index mapping scattered
Examples:
- boundary mode indexes
- brush shape indexes
- spectrum mode indexes
These mappings appear in multiple places (store, Canvas, Simulation).

Library direction: **single source-of-truth** for these encodings.

### 5.4 Mini-sim gallery is a parallel engine
The tour gallery is its own CA engine with partial overlap and partial divergence:
- vitality curve sampling differs (linear vs monotonic cubic)
- may diverge from GPU semantics over time

Library direction: the gallery should be a tiny configuration of the same engine (or a shared “kernel spec” compiled to CPU/GPU).

---

## 6) Library vision (what “instrument-like” means in practice)

Your library should feel like a musical instrument:
- **Easy**: the first sound happens in ~5 lines.
- **Deep**: every parameter is composable and orthogonal.
- **Reliable**: hard edges are explicit (device loss, resizing, async stepping).
- **Scalable**: many small simulations can coexist without accidental global state.

In practical API terms:
- Create/mount/destroy multiple simulations cheaply.
- Strong defaults with escape hatches.
- Clear modular boundaries so advanced users can replace only what they need.

---

## 7) Proposed package layout (separation of concerns)

### 7.1 Recommended monorepo package split (even if you ship one package initially)
- **`@lifeinlife/ca-core`** (framework-agnostic TypeScript)
  - WebGPU context and device management
  - typed grid/state buffers
  - kernel interface and built-in kernels
  - renderer interface and built-in renderers
  - scheduler/runtime loop helpers
  - interaction helpers (optional submodules)
- **`@lifeinlife/ca-shaders`** (optional)
  - WGSL sources and/or WGSL template composition utilities
  - shader “capsules” with declared bind groups, uniforms, and entrypoints
- **`@lifeinlife/ca-svelte`** (optional wrapper)
  - Svelte actions/components that wrap `ca-core` mounts
  - Svelte stores as *adapters* (not core state)
- (later) **`@lifeinlife/ca-react`** (optional)

You can also ship as one package with subpath exports:
- `ca/webgpu`, `ca/kernels`, `ca/renderers`, `ca/svelte`, etc.

---

## 8) Core abstractions (clean interfaces)

These are intended as “stable seams” for future AI tooling and human readers.

### 8.1 The central object: `AutomatonMount`
An `AutomatonMount` is one **instance bound to one canvas** (or one `GPUCanvasContext`).

Responsibilities:
- owns render surface sizing + presentation
- holds references to the configured kernel + renderer + grid
- exposes minimal, explicit control methods

Conceptual interface (illustrative, not final TS):
- **`start()` / `stop()`**: run render loop, optionally stepping
- **`step()`**: advance simulation by one logical tick (may be async)
- **`render()`**: draw current state
- **`resize()`**: update canvas size and/or grid size (depending on strategy)
- **`destroy()`**: release GPU resources

### 8.2 Kernel interface: `Kernel`
A kernel describes how “state updates” happen.

It must support:
- **GPU implementation**: a compute pipeline (WGSL + binding layout)
- (optional) CPU implementation: for tiny sims or for async/hybrid strategies

Key idea: kernels should be “swapable” without changing rendering/interaction.

### 8.3 Renderer interface: `Renderer`
A renderer describes how to map the grid state into pixels.

Support:
- multiple renderers for the same state:
  - classic cell renderer (yours)
  - vector/outline renderer (future)
  - density-field renderer (future)

### 8.4 Grid/Tiling interface: `Tiling`

You already support two “grid presentations” (rect + hex) and you want future tilings.

Library direction: a tiling should be a **first-class module** that provides:
- **Topology**: coordinate system + neighbor semantics (for kernels)
- **Geometry**: mapping from cell coordinates to visual coordinates (for renderers)
- **Picking**: screen/world → cell coordinate (for interaction)

Important: tiling is not the same thing as neighborhood. In your current code, “neighborhood” determines both:
- which neighbors are counted (rule semantics)
- whether the renderer/picker uses hex geometry

For a library, we should separate these:
- **Tiling**: square / hex / future (triangular, Penrose-ish, etc.)
- **Neighborhood**: neighborhood radius/shape *within* a tiling (or even arbitrary stencils)

### 8.5 Boundary interface: `BoundaryCondition`
Boundary conditions are currently “baked” into shader logic and parameter indices. For a library:
- keep boundary as a first-class concept
- define a stable encoding for GPU kernels
- allow new boundary conditions later without rewriting all interfaces

### 8.6 Interaction interface: `Brush` + `Painter`
Brush preview is a renderer concern; brush application is a mutation concern.

Library direction:
- **Brush shape SDF** and **text bitmap** should live in an “interaction” module
- painting should work against:
  - GPU buffers (fast)
  - CPU arrays (fallback or mini-sims)
  - user-defined “cell state backend” (future)

### 8.7 Scheduling interface: `Stepper` / `Scheduler`
Your library must support:
- fixed timestep (classic CA)
- variable timestep (artistic)
- async step (LLM-per-cell)

So the core should provide a scheduler abstraction rather than entangling the step loop with rendering.

---

## 9) API sketch (what “few lines” looks like)

The goal is to let a user create a CA canvas in 5–10 lines, with strong defaults:

```ts
import { createMount, Kernels, Renderers, Tilings } from '@lifeinlife/ca-core';

const mount = await createMount({
  canvas: document.querySelector('#ca')!,
  grid: { width: 256, height: 256, tiling: Tilings.hex() },
  kernel: Kernels.bsGenerations({
    rule: 'B2,5,6,11/S5,9,11/C48',
    vitality: { mode: 'curve', curvePoints: [/* ... */] }
  }),
  renderer: Renderers.cells({
    theme: 'dark',
    spectrum: { mode: 'fire', frequency: 2.3 },
    neighborShading: 'vitality'
  })
});

mount.start(); // (render loop + internal stepping if configured)
```

And for a “tiny button CA”:

```ts
const mount = await createMount({
  canvas: button.querySelector('canvas')!,
  grid: { width: 56, height: 56, tiling: Tilings.square() },
  kernel: Kernels.bsGenerations({ rule: 'B3/S23' }),
  renderer: Renderers.cells({ pixelRatio: 1, showGrid: false })
});

mount.start({ stepHz: 30 });
```

The API should also support “headless simulation” (no rendering), and “render-only” (visualize a provided state source).

---

## 10) A proposed internal architecture (modules inside `ca-core`)

### 10.1 `gpu/` (device + resource lifetime)
Responsibilities:
- `requestAdapter/device` + device-loss strategy
- capability probing + limits
- shared device caching (optional, opt-in)
- buffer creation utilities and alignment helpers

Design note:
- The core should allow either:
  - one device per app
  - or one device per mount
  - without forcing global singletons

### 10.2 `state/` (grid state representation)
Responsibilities:
- `CellStateFormat` (e.g., `u32`, maybe textures later)
- `PingPongBuffer<T>` management
- optional “sparse patches” abstraction for high-level operations and history diffs

### 10.3 `tilings/`
Built-ins:
- `squareOffset()` (your current rect grid)
- `hexOddR()` (your current hex layout)

Future-friendly design:
- tilings expose:
  - `cellToWorld` / `worldToCell`
  - `neighbors(stencil)` generation
  - shader snippets (see §11)

### 10.4 `boundaries/`
Built-ins:
- the 9 topologies you already have

Key improvement:
- one canonical definition of:
  - CPU coordinate transform
  - WGSL coordinate transform
  - “index mapping”

### 10.5 `kernels/`
Built-ins:
- `bsGenerations` kernel (your WGSL compute)
  - accepts:
    - rule masks or rule string
    - neighborhood spec
    - vitality config
    - boundary condition
  - can compile variants per tiling/neighborhood combination

Optional future kernels:
- outer-totalistic but non-BS (e.g., weighted sums)
- agent-based CPU kernel with async callbacks (LLM-per-cell)

### 10.6 `renderers/`
Built-ins:
- `cells` renderer (your WGSL render)
  - options:
    - theme
    - palette + spectrum
    - grid lines, axes
    - neighbor shading mode
    - brush preview overlay (optional)

### 10.7 `interaction/`
Built-ins:
- `Brush` definitions (shape, rotation, aspect, density/intensity)
- `TextStamp` rasterization
- `Painter` that applies brush to a grid state backend

Crucial design principle:
- **Preview and apply should share the same shape definition**.
  - Ideally: generate both WGSL + TS from a shared shape DSL, or keep shape set small and thoroughly tested.

### 10.8 `runtime/`
Built-ins:
- `createLoop({ renderHz, stepHz, stepStrategy })`
- decouple:
  - render cadence (rAF)
  - simulation cadence (fixed Hz, variable, async)

### 10.9 `extras/` (optional, tree-shakeable)
- recording helper (MediaRecorder)
- screenshot helper
- full-grid readback helpers
- history snapshot helpers (but **history should be app-level**, not core)

---

## 11) Making “rules vs rendering” truly separable (shader capsule design)

To support “completely different rules” while reusing the graphical engine:

### 11.1 Define a “shader capsule” contract
A capsule is a package of:
- WGSL module source(s)
- bind group layouts + buffer formats
- a uniform schema (typed, documented)
- entrypoints (`compute_main`, `vertex_main`, `fragment_main`)

Then:
- Kernels provide compute capsules.
- Renderers provide render capsules.
- Tilings and boundary conditions provide **WGSL snippets** injected into capsules.

### 11.2 Avoid one mega-WGSL file
Right now `life-compute.wgsl` includes:
- boundary logic
- neighborhood enumeration
- vitality math
- rule transition logic

For extensibility:
- boundary logic should be a shared imported snippet
- neighborhood stencils should be pluggable
- rule transition should be the “kernel core”

### 11.3 A pragmatic path
You don’t need a full WGSL preprocessor on day 1.
Start with:
- a few template strings with explicit insertion points
- a small “wgsl builder” that ensures consistent bindings and avoids drift

---

## 12) Async stepping (designing for LLM-per-cell)

You want:
- bulk synchronous logical steps for correctness
- asynchronous/streaming visuals during a step (to “see formation”)

This suggests separating:
- **Model update** (might be slow, CPU, async)
- **Visual state** (can be updated incrementally)

### 12.1 Proposed abstraction: `StepResultStream`
A step can produce:
- final committed state
- optional intermediate partial states / patches

Conceptual:
- `step(): Promise<StepCompletion>`
- `StepCompletion` may include an async iterator of visual patches:
  - `for await (const patch of completion.visualPatches) mount.applyPatch(patch)`

### 12.2 Represent patches explicitly
Instead of “full snapshots always”:
- `CellPatch = { indices: Uint32Array; values: Uint32Array }`
- or rectangular ranges, or sparse tiles

This helps:
- history (diff-based)
- streaming visuals
- small UI canvases (low overhead)

### 12.3 Hybrid mode: GPU render + CPU compute
For agent-based rules:
- compute state on CPU (async)
- upload patches to GPU buffer
- keep renderer the same

The library should make this a first-class pattern.

---

## 13) Unifying the mini gallery with the main engine

Your tour gallery should become:
- either a **small mount** using the same kernel/renderer but tiny grid sizes
- or a CPU kernel using the same kernel specification (same rule/vitality semantics)

Strong recommendation: make the gallery use the **same semantics** (vitality curves, neighborhood math, boundary behavior), even if implementation differs.

---

## 14) Migration plan (from this app to the library, later)

### 14.1 Extraction order (min-risk)
- Extract `rules.ts` + vitality curve sampling as a pure module (`ca-core/rules`).
- Extract `boundary` + `tiling` definitions and make them the single source of truth for:
  - CPU transforms
  - WGSL transforms
  - index encoding
- Split `Simulation` into:
  - `KernelRunner` (compute)
  - `CellRenderer` (render)
  - `Mount` (ties to canvas + loop)
  - `Painter` (brush application)
- Replace `tour.ts` mini engine with “small mounts” (or CPU kernel) once stable.

### 14.2 Keep the app as the “golden consumer”
As you rebuild this app on the library:
- it becomes an integration test suite for:
  - hex/rect correctness
  - vitality, boundaries, spectra
  - brush shapes/text
  - recording/readback

---

## 15) Open questions (useful for the next iteration)

- **State encoding**: keep `u32` forever, or introduce texture-based paths for advanced rendering?
- **Max states**: you mention “up to 1024”; do we want hard limits in core API or allow “device-limit-driven” caps?
- **Multi-mount resource sharing**:
  - share one device across mounts?
  - share compiled pipelines across mounts?
- **Determinism**:
  - current brushes/randomization use `Math.random()`; do we want seeded PRNG support?
- **Brush correctness**:
  - how to guarantee shader preview exactly matches CPU painting?
- **Boundary + tiling combos**:
  - some combinations have subtle constraints (e.g., hex torus parity constraints).
  - the library should encode these invariants explicitly (validation + helpful errors).
- **Async kernels**:
  - define the minimal patch protocol that works for both CPU and GPU backends.

---

## 16) Bottom-line recommendation (pure TS vs Svelte library)

- **Primary**: build a framework-agnostic **TypeScript/WebGPU core** (`@lifeinlife/ca-core`).
- **Secondary**: provide a thin **Svelte wrapper** (`@lifeinlife/ca-svelte`) that makes it ergonomic in Svelte (actions, components, stores-as-adapters).

This preserves your ability to:
- use the engine in Svelte (your current app)
- also embed it in any DOM/UI context (buttons, icons, Web Components, React, vanilla)
- keep the “engine as instrument” timeless, with a stable core API

---

## 17) Next iteration prompts (what I suggest we do next)

If you want, in the next round we can:
- specify the exact TypeScript interfaces for `Kernel`, `Renderer`, `Tiling`, `BoundaryCondition`, `Mount`
- define the “shader capsule” format precisely (bindings + uniform schemas)
- decide what belongs in core vs wrappers vs optional extras
- design a minimal v0 API that can rebuild **both** the main canvas and the tour gallery with one engine
