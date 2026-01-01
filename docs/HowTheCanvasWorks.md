# How The Life Canvas Works

A comprehensive visual guide to understanding the Life in Life cellular automaton simulation architecture.

---

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [Package Architecture](#package-architecture)
3. [The LifeCanvas Component](#the-lifecanvas-component)
4. [WebGPU Simulation Pipeline](#webgpu-simulation-pipeline)
5. [The Animation Loop](#the-animation-loop)
6. [Cell State & Rules](#cell-state--rules)
7. [Double Buffering Pattern](#double-buffering-pattern)
8. [User Interaction Flow](#user-interaction-flow)
9. [The Complete Data Flow](#the-complete-data-flow)
10. [Neighborhood Types](#neighborhood-types)
11. [Boundary Modes](#boundary-modes)

---

## High-Level Overview

The Life in Life project is a high-performance cellular automaton simulator built with **Svelte 5** and **WebGPU**. It runs Game of Life-style simulations entirely on the GPU for maximum performance.

```mermaid
flowchart TB
    subgraph User["👤 User Interface"]
        UI[Svelte UI Components]
        Controls[Controls & Settings]
        Canvas[Canvas Element]
    end
    
    subgraph State["🗄️ State Management"]
        Store[Simulation Store<br/>simulation.svelte.ts]
    end
    
    subgraph GPU["⚡ GPU Pipeline"]
        Compute[Compute Shader<br/>life-compute.wgsl]
        Render[Render Shader<br/>life-render.wgsl]
        Buffers[(Cell State Buffers)]
    end
    
    UI --> Store
    Controls --> Store
    Store --> GPU
    GPU --> Canvas
    Canvas --> User
    
    style GPU fill:#1a1a2e,stroke:#00d4ff,color:#fff
    style State fill:#1a1a2e,stroke:#ff6b6b,color:#fff
    style User fill:#1a1a2e,stroke:#4ade80,color:#fff
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Cellular Automaton** | A grid of cells where each cell's next state depends on its neighbors |
| **WebGPU** | Modern GPU API for parallel computation and rendering |
| **Double Buffering** | Two buffers alternate: one reads, one writes (no race conditions) |
| **Ping-Pong Pattern** | Compute reads from A→writes to B, then reads from B→writes to A |

---

## Package Architecture

The project is organized as a monorepo with specialized packages:

```mermaid
flowchart TB
    subgraph App["📱 Application (src/)"]
        MainApp[MainApp.svelte]
        CanvasComp[Canvas.svelte]
        Stores[Svelte Stores]
        Components[UI Components]
    end
    
    subgraph Packages["📦 Packages (@games-of-life/)"]
        subgraph Svelte["svelte/"]
            LifeCanvas[LifeCanvas.svelte<br/>Reusable Component]
        end
        
        subgraph WebGPU["webgpu/"]
            Simulation[Simulation Class]
            Context[WebGPU Context]
            Shaders[WGSL Shaders]
        end
        
        subgraph Core["core/"]
            Rules[Rules & Parsing]
            Boundaries[Boundary Modes]
            Neighborhoods[Neighborhood Types]
            Seeds[Seed Patterns]
            Vitality[Vitality System]
        end
        
        subgraph Audio["audio/"]
            AudioEngine[Audio Engine]
            Synthesis[Audio Synthesis]
        end
    end
    
    MainApp --> CanvasComp
    CanvasComp --> Simulation
    CanvasComp --> Stores
    LifeCanvas --> Simulation
    Simulation --> Core
    Simulation --> Shaders
    Context --> Simulation
    
    style Packages fill:#0d1117,stroke:#58a6ff,color:#fff
    style App fill:#0d1117,stroke:#f0883e,color:#fff
```

### Package Responsibilities

```mermaid
mindmap
  root(("@games-of-life"))
    core
      Rule parsing B/S notation
      Neighborhood definitions
      Boundary mode logic
      Seed patterns
      Vitality curves
    webgpu
      GPU initialization
      Simulation class
      Compute pipeline
      Render pipeline
      Buffer management
    svelte
      LifeCanvas component
      Reusable widget
      Minimal dependencies
    audio
      Sonification
      GPU audio pipeline
      Spectral analysis
```

---

## The LifeCanvas Component

The `LifeCanvas.svelte` component is the heart of rendering. Here's how it initializes and runs:

```mermaid
sequenceDiagram
    participant Component as LifeCanvas.svelte
    participant WebGPU as initWebGPU()
    participant Sim as Simulation
    participant RAF as requestAnimationFrame
    
    Component->>Component: $effect() triggered on mount
    Component->>WebGPU: Initialize GPU context
    WebGPU-->>Component: GPUDevice, GPUContext, Format
    
    Component->>Sim: new Simulation(ctx, config)
    Sim->>Sim: initializePipelines()
    Sim->>Sim: initializeBuffers()
    Sim->>Sim: createBindGroups()
    Sim-->>Component: simulation instance
    
    Component->>Component: applyViewDefaults()
    Component->>Component: reset() - apply seed
    
    loop Animation Loop
        RAF->>Component: loop(timestamp)
        alt playing === true
            Component->>Sim: step() - compute pass
        end
        Component->>Sim: render(width, height)
        Component->>RAF: requestAnimationFrame(loop)
    end
```

### Props & Configuration

```mermaid
classDiagram
    class LifeCanvasProps {
        +number width
        +number height
        +number gridWidth
        +number gridHeight
        +CARuleLike rule
        +number speed
        +boolean playing
        +Seed seed
        +boolean showGrid
        +number neighborShading
        +number spectrumMode
        +boolean isLightTheme
        +number[] aliveColor
        +number[] vitalityCurve
    }
    
    class Seed {
        <<union>>
        random : density, includeSpectrum
        blank
        disk : radius, density, state
        cells : cells[][], tiled, spacing
    }
    
    class CARuleLike {
        +number birthMask
        +number surviveMask
        +number numStates
        +NeighborhoodId neighborhood
    }
    
    LifeCanvasProps --> Seed
    LifeCanvasProps --> CARuleLike
```

---

## WebGPU Simulation Pipeline

The simulation uses two GPU pipelines working together:

```mermaid
flowchart LR
    subgraph Compute["🔢 Compute Pipeline"]
        direction TB
        CI[Cell Buffer A<br/>Read-Only] --> CS[Compute Shader<br/>life-compute.wgsl]
        Params[Parameters<br/>Uniform Buffer] --> CS
        Vitality[Vitality Curve<br/>Storage Buffer] --> CS
        CS --> CO[Cell Buffer B<br/>Write]
    end
    
    subgraph Render["🎨 Render Pipeline"]
        direction TB
        CB[Cell Buffer<br/>Current State] --> RS[Render Shader<br/>life-render.wgsl]
        VP[View Params<br/>Uniform Buffer] --> RS
        TB[Text Bitmap<br/>For Brush Preview] --> RS
        RS --> FT[Canvas Texture]
    end
    
    Compute --> |"step()"| Render
    Render --> |"render()"| Screen[📺 Screen]
    
    style Compute fill:#1e3a5f,stroke:#00d4ff,color:#fff
    style Render fill:#3a1e5f,stroke:#d400ff,color:#fff
```

### Buffer Architecture

```mermaid
flowchart TB
    subgraph Buffers["GPU Buffers"]
        CellA["Cell Buffer A<br/>u32 per cell<br/>width × height × 4 bytes"]
        CellB["Cell Buffer B<br/>u32 per cell<br/>width × height × 4 bytes"]
        ComputeParams["Compute Params (64 bytes)<br/>• width, height<br/>• birthMask, surviveMask<br/>• numStates<br/>• boundaryMode<br/>• neighborhood<br/>• vitalityMode + params"]
        RenderParams["Render Params (128 bytes)<br/>• grid/canvas dimensions<br/>• offset, zoom<br/>• colors, brush pos<br/>• spectrum settings"]
        VitalityCurve["Vitality Curve<br/>128 × f32 samples"]
        TextBitmap["Text Bitmap<br/>For text brush preview"]
        Readback["Readback Buffer<br/>For CPU reads"]
    end
    
    CellA <--> |"Ping-Pong"| CellB
    ComputeParams --> |"Uniforms"| ComputeShader[Compute Shader]
    VitalityCurve --> ComputeShader
    RenderParams --> |"Uniforms"| RenderShader[Render Shader]
    TextBitmap --> RenderShader
    
    style Buffers fill:#1a1a2e,stroke:#00ff88,color:#fff
```

---

## The Animation Loop

The main canvas runs a continuous animation loop that coordinates stepping and rendering:

```mermaid
flowchart TB
    Start([Animation Frame]) --> Check{simulation &&<br/>canvas ready?}
    Check -->|No| End([Next Frame])
    Check -->|Yes| ViewAnim[Update View Animation<br/>Smooth pan/zoom transitions]
    
    ViewAnim --> AxisAnim[Update Axis Animation<br/>Grow/shrink from center]
    
    AxisAnim --> Playing{isPlaying?}
    
    Playing -->|Yes| CalcSteps[Calculate steps to run<br/>based on speed & deltaTime]
    CalcSteps --> StepLoop[Run simulation.step()<br/>up to budget limit]
    StepLoop --> Seeding{Continuous<br/>seeding enabled?}
    Seeding -->|Yes| Seed[continuousSeed()]
    Seeding -->|No| Skip1[Skip]
    Seed --> GenUpdate[Increment generation count]
    Skip1 --> GenUpdate
    
    Playing -->|No| ResetTimers[Reset accumulators]
    
    GenUpdate --> SyncView[Sync view state to GPU<br/>colors, brush, spectrum, etc.]
    ResetTimers --> SyncView
    
    SyncView --> Render[simulation.render()<br/>Execute render pipeline]
    Render --> Recording{isRecording?}
    Recording -->|Yes| RecordRender[Render to recording canvas]
    Recording -->|No| Skip2[Skip]
    
    RecordRender --> Audio
    Skip2 --> Audio
    
    Audio[Update audio if enabled]
    Audio --> Stats[Update alive cell count]
    Stats --> RAF[requestAnimationFrame]
    RAF --> End
    
    style Start fill:#00d4ff,stroke:#fff,color:#000
    style End fill:#00d4ff,stroke:#fff,color:#000
```

### Timing & Step Budget

```mermaid
flowchart LR
    subgraph Timing["⏱️ Time Management"]
        Speed["speed = steps/second"]
        StepMs["stepMs = 1000/speed"]
        FrameDelta["frameDt = now - lastFrame"]
        Accumulator["simAccMs += frameDt"]
    end
    
    subgraph Budget["💰 Step Budget"]
        MaxSteps["Max 64 steps/frame"]
        TimeBudget["6ms time budget"]
        WhileLoop["while accMs >= stepMs<br/>AND steps < max<br/>AND time < budget"]
    end
    
    Timing --> Budget
    Budget --> Steps["Run step()"]
    
    style Timing fill:#2d3748,stroke:#68d391,color:#fff
    style Budget fill:#2d3748,stroke:#f6ad55,color:#fff
```

---

## Cell State & Rules

Each cell is stored as a single `u32` (unsigned 32-bit integer):

```mermaid
stateDiagram-v2
    [*] --> Dead: State 0
    Dead --> Alive: Birth condition met
    Alive --> Alive: Survive condition met
    Alive --> Dying2: No survival
    
    state "Dying States (2 to numStates-1)" as DyingGroup {
        Dying2: State 2
        Dying3: State 3
        DyingN: State n-1
        
        Dying2 --> Dying3
        Dying3 --> DyingN: ...
    }
    
    DyingN --> Dead: Final decay
    
    note right of Dead
        0 = Dead (empty)
    end note
    
    note right of Alive
        1 = Fully alive
        Can birth neighbors
    end note
    
    note right of DyingGroup
        States 2+ = Dying
        Visual trail effect
        "Generations" rules
    end note
```

### Rule Bitmasks

Rules are encoded as bitmasks for ultra-fast GPU evaluation:

```mermaid
flowchart LR
    subgraph RuleExample["Example: B3/S23 (Conway's Life)"]
        Birth["Birth Mask<br/>Bit 3 = 1<br/>0b00001000 = 8"]
        Survive["Survive Mask<br/>Bits 2,3 = 1<br/>0b00001100 = 12"]
    end
    
    subgraph Evaluation["GPU Evaluation"]
        NeighborCount["neighbors = 3"]
        BirthCheck["birthMask & (1 << 3)<br/>8 & 8 = 8 ≠ 0<br/>✅ Birth!"]
        SurviveCheck["surviveMask & (1 << 3)<br/>12 & 8 = 8 ≠ 0<br/>✅ Survive!"]
    end
    
    RuleExample --> Evaluation
    
    style RuleExample fill:#1e3a5f,stroke:#60a5fa,color:#fff
    style Evaluation fill:#3a1e5f,stroke:#a78bfa,color:#fff
```

---

## Double Buffering Pattern

The ping-pong pattern prevents read/write conflicts:

```mermaid
sequenceDiagram
    participant Step as Step Counter
    participant A as Buffer A
    participant B as Buffer B
    participant Compute as Compute Shader
    
    Note over Step: stepCount = 0
    A->>Compute: Read current state
    Compute->>B: Write new state
    Note over Step: stepCount = 1
    
    B->>Compute: Read current state
    Compute->>A: Write new state
    Note over Step: stepCount = 2
    
    A->>Compute: Read current state
    Compute->>B: Write new state
    Note over Step: stepCount = 3
    
    Note over A,B: Pattern repeats forever!
```

### Bind Group Selection

```mermaid
flowchart TD
    Step["stepCount"]
    Mod["stepCount % 2"]
    
    Mod -->|0| BG0["Bind Group 0<br/>Read: Buffer A<br/>Write: Buffer B"]
    Mod -->|1| BG1["Bind Group 1<br/>Read: Buffer B<br/>Write: Buffer A"]
    
    BG0 --> Dispatch["Dispatch Compute Shader"]
    BG1 --> Dispatch
    
    style BG0 fill:#10b981,stroke:#fff,color:#fff
    style BG1 fill:#f59e0b,stroke:#fff,color:#fff
```

---

## User Interaction Flow

Here's how user interactions flow through the system:

```mermaid
flowchart TB
    subgraph Input["🎮 User Input"]
        Mouse[Mouse Events]
        Touch[Touch Events]
        Keyboard[Keyboard Events]
        Wheel[Wheel Events]
    end
    
    subgraph Handler["Event Handlers"]
        MouseDown[handleMouseDown]
        MouseMove[handleMouseMove]
        TouchStart[handleTouchStart]
        TouchMove[handleTouchMove]
    end
    
    subgraph Mode["Tool Mode Check"]
        ToolMode{effectiveToolMode}
        ToolMode -->|brush| Drawing[Paint Mode]
        ToolMode -->|pan| Panning[Pan Mode]
    end
    
    subgraph Actions["Simulation Actions"]
        ScreenToGrid["screenToGrid()<br/>Convert coordinates"]
        PaintBrush["paintBrush()<br/>Set cell states"]
        Pan["pan()<br/>Adjust offset"]
        ZoomAt["zoomAt()<br/>Scale around point"]
    end
    
    subgraph GPU["GPU Update"]
        PendingPaints["pendingPaints Map<br/>index → state"]
        ApplyPaints["applyPaints()<br/>Write to buffer"]
    end
    
    Input --> Handler
    Handler --> Mode
    Drawing --> ScreenToGrid
    ScreenToGrid --> PaintBrush
    PaintBrush --> PendingPaints
    PendingPaints --> ApplyPaints
    Panning --> Pan
    Wheel --> ZoomAt
    
    style Input fill:#4c1d95,stroke:#c4b5fd,color:#fff
    style Actions fill:#065f46,stroke:#6ee7b7,color:#fff
```

### Brush System

```mermaid
classDiagram
    class BrushConfig {
        +number size
        +BrushShape shape
        +BrushType type
        +number rotation
        +number density
        +number intensity
        +number aspectRatio
    }
    
    class BrushShape {
        <<enumeration>>
        circle
        square
        diamond
        hexagon
        ring
        triangle
        line
        cross
        star
        heart
        spiral
        flower
        burst
        wave
        dots
        scatter
        text
    }
    
    class BrushType {
        <<enumeration>>
        solid
        gradient
        noise
        spray
    }
    
    BrushConfig --> BrushShape
    BrushConfig --> BrushType
```

---

## The Complete Data Flow

From user interaction to pixels on screen:

```mermaid
flowchart TB
    subgraph User["1️⃣ User Action"]
        Click[Click/Touch on Canvas]
    end
    
    subgraph Coordinate["2️⃣ Coordinate Transform"]
        Screen["Screen Coordinates<br/>(pixels)"]
        Grid["Grid Coordinates<br/>(cells)"]
        Screen --> |"screenToGrid()"| Grid
    end
    
    subgraph Paint["3️⃣ Paint Operation"]
        BrushCheck["Check brush shape<br/>isInBrush()"]
        StateCalc["Calculate cell state<br/>getCellState()"]
        Pending["Add to pendingPaints<br/>Map<index, state>"]
    end
    
    subgraph Apply["4️⃣ Apply to GPU"]
        WriteBuffer["writeBuffer()<br/>to current cell buffer"]
    end
    
    subgraph Step["5️⃣ Simulation Step"]
        ComputePass["beginComputePass()"]
        Dispatch["dispatchWorkgroups()<br/>width/8, height/8"]
        NeighborCount["Count neighbors<br/>Apply rules"]
        WriteNew["Write new state<br/>to other buffer"]
    end
    
    subgraph Render["6️⃣ Render"]
        RenderPass["beginRenderPass()"]
        FullScreen["Draw full-screen triangle"]
        Sample["Sample cell states<br/>Apply colors"]
        Output["Output to canvas texture"]
    end
    
    User --> Coordinate
    Coordinate --> Paint
    Paint --> Apply
    Apply --> Step
    Step --> Render
    Render --> Display[📺 Display]
    
    style User fill:#7c3aed,stroke:#fff,color:#fff
    style Coordinate fill:#2563eb,stroke:#fff,color:#fff
    style Paint fill:#0891b2,stroke:#fff,color:#fff
    style Apply fill:#059669,stroke:#fff,color:#fff
    style Step fill:#d97706,stroke:#fff,color:#fff
    style Render fill:#dc2626,stroke:#fff,color:#fff
```

---

## Neighborhood Types

The simulation supports multiple neighborhood configurations:

```mermaid
flowchart TB
    subgraph Moore["Moore (8 neighbors)"]
        M1[N] --- M2[NE]
        M3[W] --- M4["⚫"] --- M5[E]
        M6[SW] --- M7[S] --- M8[SE]
    end
    
    subgraph VonNeumann["Von Neumann (4)"]
        V1[" "] --- V2[N] --- V3[" "]
        V4[W] --- V5["⚫"] --- V6[E]
        V7[" "] --- V8[S] --- V9[" "]
    end
    
    subgraph Hexagonal["Hexagonal (6)"]
        H1[NW] --- H2[NE]
        H3[W] --- H4["⬡"] --- H5[E]
        H6[SW] --- H7[SE]
    end
    
    subgraph Extended["Extended Moore (24)"]
        E1["5×5 grid<br/>minus center"]
    end
```

### Neighborhood Index Mapping

```mermaid
flowchart LR
    Moore["moore"] --> |"0"| Shader
    VN["vonNeumann"] --> |"1"| Shader
    ExtMoore["extendedMoore"] --> |"2"| Shader
    Hex["hexagonal"] --> |"3"| Shader
    ExtHex["extendedHexagonal"] --> |"4"| Shader
    
    Shader[Compute Shader<br/>switch statement]
```

---

## Boundary Modes

Nine topological boundary conditions control edge behavior:

```mermaid
flowchart TB
    subgraph Plane["Plane (0)"]
        P["No wrapping<br/>Edges are dead"]
    end
    
    subgraph Cylinder["Cylinders"]
        CX["CylinderX (1)<br/>Horizontal wrap"]
        CY["CylinderY (2)<br/>Vertical wrap"]
    end
    
    subgraph Torus["Torus (3)"]
        T["Both wrap<br/>Donut shape 🍩"]
    end
    
    subgraph Mobius["Möbius Strips"]
        MX["MöbiusX (4)<br/>H-wrap + V-flip"]
        MY["MöbiusY (5)<br/>V-wrap + H-flip"]
    end
    
    subgraph Klein["Klein Bottles"]
        KX["KleinX (6)<br/>H-Möbius + V-cylinder"]
        KY["KleinY (7)<br/>V-Möbius + H-cylinder"]
    end
    
    subgraph Projective["Projective Plane (8)"]
        PP["Both edges flip<br/>Real projective plane"]
    end
```

### Boundary Wrapping Logic

```mermaid
flowchart TD
    Coord["Input: (x, y)"] --> XCheck{x out of bounds?}
    
    XCheck -->|Yes| WrapsX{mode wraps X?}
    WrapsX -->|No| Dead1["Return 0 (dead)"]
    WrapsX -->|Yes| WrapX["Wrap x modulo width<br/>Count x_wraps"]
    
    XCheck -->|No| YCheck
    WrapX --> YCheck
    
    YCheck{y out of bounds?} -->|Yes| WrapsY{mode wraps Y?}
    WrapsY -->|No| Dead2["Return 0 (dead)"]
    WrapsY -->|Yes| WrapY["Wrap y modulo height<br/>Count y_wraps"]
    
    YCheck -->|No| Flip
    WrapY --> Flip
    
    Flip["Apply flips based on<br/>wrap count parity"] --> Index["Calculate buffer index"]
    Index --> Return["Return cell_state[idx]"]
```

---

## Summary

```mermaid
mindmap
  root((Life Canvas))
    Components
      LifeCanvas.svelte
      Canvas.svelte
      UI Controls
    WebGPU
      Compute Pipeline
        Rules evaluation
        Neighbor counting
        State transitions
      Render Pipeline
        Color mapping
        Grid lines
        Brush preview
    State
      Svelte 5 Runes
      $state, $derived, $effect
      Reactive updates
    Core Logic
      Rule parsing
      Neighborhoods
      Boundaries
      Vitality
    Performance
      GPU parallelism
      Double buffering
      60fps animation
      Step budgeting
```

---

## Getting Started

1. **Explore the packages**: Start with `@games-of-life/core` to understand rules and neighborhoods
2. **Read the shaders**: `life-compute.wgsl` shows the core CA logic
3. **Follow the data**: Trace from user click → `paintBrush()` → GPU buffer → shader → screen
4. **Experiment**: Modify rules in the UI and watch how behavior changes

Happy exploring! 🎮✨
