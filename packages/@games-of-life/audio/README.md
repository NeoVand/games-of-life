# @games-of-life/audio

Real-time audio sonification for cellular automata using WebGPU spectral aggregation and AudioWorklet synthesis.

## Overview

This package provides:

- **GPU spectral aggregation**: Aggregates visible cell states into frequency-domain data
- **AudioWorklet synthesis**: Converts spectral data to audio in real-time
- **Curve-based controls**: Pitch, amplitude, timbre, spatial, and wave curves
- **Musical scale quantization**: Optional pitch snapping to musical scales

## Architecture

```
[Cell Buffer] → [GPU Aggregation Shader] → [Spectrum Buffer]
                                                   ↓
                                           GPU→CPU Transfer
                                                   ↓
                                          [AudioWorklet]
                                                   ↓
                                           [Stereo Audio]
```

## Usage

```typescript
import { AudioEngine, DEFAULT_AUDIO_CONFIG } from '@games-of-life/audio';

const engine = new AudioEngine();
await engine.initialize(gpuDevice, simulation);

// Enable audio
engine.setEnabled(true);

// Update each frame (call in render loop)
engine.update(canvasWidth, canvasHeight);
```

