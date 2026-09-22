# Browser-Native Substrate

Three single-file browser applications implementing the substrate in vanilla JS / WGSL — no build step, no server required.

## Files

### 1. `substrate.html` (~38KB, 1146 lines)
Interactive cell-graph with:
- 20+ canonical cells seeded
- Witness-log with hash-chained prev_hash
- JEV top-5 cosine search
- Wavefunction JEV with explicit interference
- 3D cell-graph visualization (canvas)
- IndexedDB persistence
- In-browser linear regression + MLP training
- Bulk cell addition, shock cells
- JSON export/import
- Inline Burgers' 1D solver

### 2. `substrate-ml.html` (~32KB, 959 lines)
Browser training and PDE/SAT solving:
- WebGPU + WebNN + WASM + Workers backend detection
- Linear regression with live loss curve
- XOR neural network (2-H-1 MLP)
- Burgers' 1D PDE solver with upwind advection
- SAT solver with Pigeonhole problem (proves UNSAT)
- Witness-log audit + chain verification
- Matrix multiply benchmark (CPU)
- IndexedDB save/load
- JSON export

### 3. `substrate-gpu.html` (~20KB)
WebGPU compute shaders:
- FNV-1a 64-bit hash on GPU
- JEV cosine similarity on GPU
- WGSL shader source included
- GPU vs CPU benchmark
- Verifies canary hash `0x024a555471370b18d`

### 4. `webgpu/fnv1a64.wgsl`
WGSL compute shader for FNV-1a 64-bit hashing.

### 5. `webgpu/jev_cosine.wgsl`
WGSL compute shader for JEV cosine similarity.

## Browser Support

| Browser | substrate.html | substrate-ml.html | substrate-gpu.html |
|---|---|---|---|
| Chrome 113+ | ✓ | ✓ | ✓ |
| Edge 113+ | ✓ | ✓ | ✓ |
| Firefox 110+ | ✓ | ✓ | partial |
| Safari 17+ | ✓ | ✓ | partial |
| Older browsers | ✓ (no GPU) | ✓ (CPU fallback) | ✗ |

## Quick Start

Open any of the HTML files in a browser. They are fully self-contained.

## Deployment

The `browser-deploy/` directory is a deploy-ready bundle:
- `index.html` — landing page
- `substrate.html` — interactive cell-graph
- `substrate-ml.html` — browser training
- `substrate-gpu.html` — WebGPU compute

## Architecture

```
┌─────────────────────────────────────────┐
│           Browser tab                   │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ Substrate (in-memory)            │   │
│  │  • Cells with embeddings         │   │
│  │  • Witness-log (hash-chained)    │   │
│  │  • JEV (cosine similarity)       │   │
│  │  • Wavefunction JEV              │   │
│  │  • Trainers (LR, MLP)            │   │
│  │  • Solvers (Burgers, SAT)        │   │
│  └──────────────────────────────────┘   │
│             ▲                           │
│             │ WebGPU                    │
│  ┌──────────┴────────────────────────┐ │
│  │ Compute Shaders (WGSL)            │ │
│  │  • FNV-1a 64-bit hash             │ │
│  │  • JEV cosine similarity          │ │
│  │  • (future) gradient descent      │ │
│  │  • (future) matrix multiply       │ │
│  └───────────────────────────────────┘ │
│             │                           │
│  ┌──────────▼────────────────────────┐ │
│  │ IndexedDB                         │ │
│  │  • Persistent substrate state     │ │
│  │  • Witness-log across sessions    │ │
│  │  • Trained model weights          │ │
│  └───────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

## What this demonstrates

The substrate is **not server-bound**. It runs in any modern browser with:
- All canonical operations (FNV-1a, witness-log, JEV, embeddings)
- All solver types (PDE, SAT, ML)
- All persistence (IndexedDB)
- GPU acceleration when available (WebGPU)

The browser becomes a node in the substrate network. Same primitives, different runtime.
