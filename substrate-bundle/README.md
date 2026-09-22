# Browser-Native Substrate

The substrate runs in your browser. Same primitives as the canon. No server required. Your data stays local. Can be deployed anywhere — Cloudflare Pages, GitHub Pages, S3, your local file system, an IoT device, even projected onto a wall.

## What's here

### Apps (10)

| App | Description | File |
|---|---|---|
| Substrate Core | Interactive cell-graph with JEV, wavefunction, 3D viz, IndexedDB, in-browser LR+MLP training | `substrate.html` |
| Substrate ML | Browser training + PDE/SAT solving. WebGPU/WebNN/WASM backend detection | `substrate-ml.html` |
| Substrate GPU | WebGPU compute shaders for FNV-1a hash and JEV cosine | `substrate-gpu.html` |
| Substrate WebNN | WebNN graph builder for MatMul, Softmax, MLP | `substrate-webnn.html` |
| Substrate 3D | Real 3D cell-graph renderer (drag/zoom/query) | `substrate-3d.html` |
| Substrate Playground | Multi-tab substrate (7 tabs) | `substrate-playground.html` |
| Distributed Training | Hardware-enabled training dashboard | `distributed-training.html` |
| IoT Nodes | Substrate projected across IoT devices | `iot-nodes.html` |
| Tycoon Live | Cargo Line Tycoon multiplayer | `tycoon-live.html` |
| SDK Demo | Drop-in ES module demo | `sdk-demo.html` |

### SDK (1)

| File | Description |
|---|---|
| `substrate-sdk.js` | 370-line ES module. Substrate, Cell, LocalEmbedder, fnv1a64, FLEET_CANARY_HEX, opcodes, IndexedDB persistence, coordinator hooks |

### i18n (7 languages)

`en`, `zh` (中文), `pt` (Português), `es` (Español), `ja` (日本語), `ar` (العربية), `vi` (Tiếng Việt)

### WGSL Shaders (2)

- `webgpu/fnv1a64.wgsl` — FNV-1a 64-bit hash compute shader
- `webgpu/jev_cosine.wgsl` — JEV cosine similarity compute shader

### Worker (1)

- `canon-api-worker/src/index.js` — Cloudflare Worker for distributed coordination (nodes, sessions, submissions, leaderboard)

## Live deployment

**Browser apps**: https://quilt-e4m.pages.dev/

19 paths available: 11 apps + 7 i18n + SDK.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Browser tab                            │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Substrate (vanilla JS / ES module)                   │ │
│  │  - Cells, Witness-log, JEV, Wavefunction JEV         │ │
│  │  - Opcodes: BIND, ATTEST, CONTEST, WITHDRAW, ...     │ │
│  │  - Local Embedder (32-d char n-gram)                 │ │
│  └──────────────────────────────────────────────────────┘ │
│             ▲                                             │
│             │  request                                    │
│  ┌──────────┴──────────────────────────────────────────┐  │
│  │ Compute Tier (auto-fallback)                        │  │
│  │  1. WebGPU compute shaders (FNV-1a, JEV cosine)    │  │
│  │  2. WebNN graph builder (MatMul, MLP)              │  │
│  │  3. WebAssembly (future)                           │  │
│  │  4. Pure JS / TypedArrays (always)                 │  │
│  └──────────────────────────────────────────────────┘  │
│             ▲                                             │
│             │  result                                     │
│  ┌──────────┴──────────────────────────────────────────┐  │
│  │ Visualization Tier                                  │  │
│  │  - 3D cell-graph (substrate-3d.html)                │  │
│  │  - 2D canvas (substrate-playground.html)            │  │
│  │  - IoT network projection (iot-nodes.html)          │  │
│  │  - Witness-chain boxes                             │  │
│  └──────────────────────────────────────────────────┘  │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Persistence                                         │  │
│  │  - IndexedDB "quilt-substrate"                      │  │
│  │  - IndexedDB "quilt-ml-substrate"                   │  │
│  │  - JSON export/import                               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Distributed Coordinator (Cloudflare Worker)         │  │
│  │  - POST /api/node/register                          │  │
│  │  - POST /api/node/:id/heartbeat                     │  │
│  │  - POST /api/submit                                 │  │
│  │  - GET  /api/leaderboard                            │  │
│  │  - POST /api/session/create                         │  │
│  │  - WS   /api/ws/:sessionId                          │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Use as IoT network

The substrate can be projected across IoT devices:

- **Each IoT node is a cell.** A cell has an ID, state, embedding, witness-chain.
- **P2P via WebRTC or WebTransport.** No central server. The quilt is the network.
- **Spreadsheet projection.** Each cell's bookkeeping (state, witness, neighbors) is one row in a spreadsheet view.
- **Reflex speed** when cells talk directly. Projected representation always available.
- **Bookkeeping via prev_hash chain.** Every state change is hash-chained.

## Distributed training

Each user's machine contributes to the Quilt:

1. **User enables hardware** (RTX 4050, Ryzen 9 HX, Apple Silicon NPU, anything)
2. **Browser detects backend** (WebGPU → WebNN → WASM → CPU)
3. **Schedule training** (overnight, budget-bounded)
4. **Train locally** (gradient descent on substrate primitives)
5. **Submit to Quilt Cloud** (in the morning)
6. **Keep or share** (decided by user)

The cloud has the models. The user has the hardware. They exchange intelligently.

## Multiplayer

- **Live sessions** via WebSocket (Coordinated by Cloudflare Worker)
- **Each locale has its own pedagogy** (Socratic, Confucian, Ubuntu, Whakaako, etc.)
- **Player-as-guide** (playtesters become experts, then teach new players)
- **Hardware contributes during play** (your GPU helps even while you play)

## Polyformalism

Same substrate, different languages:

- **TypeScript** (npm: `@superinstance/cargo-line-tycoon-substrate`)
- **Rust** (crates.io: `cargo-line-tycoon-substrate`)
- **Python** (`pip install cargo-line-tycoon-substrate`)
- **C99** (header-only)
- **Browser JS** (this directory)

All byte-exact via canary hash `0x024a555471370b18d`.

## Deploy anywhere

The browser substrate is a static bundle. Deploy to:

- **Cloudflare Pages** ✅ (currently deployed)
- **GitHub Pages** ✅ (push to repo, enable Pages)
- **AWS S3** (upload, enable static hosting)
- **Netlify** (drag & drop)
- **Vercel** (CLI: `vercel deploy`)
- **Local file system** (just open `index.html`)
- **IoT device** (Raspberry Pi, ESP32 with HTTP server)
- **Projected onto a wall** (Chromecast, etc.)

The substrate has no server-side dependencies.

## Browser support

| Browser | substrate.html | substrate-ml.html | substrate-gpu.html | substrate-webnn.html |
|---|---|---|---|---|
| Chrome 113+ | ✓ | ✓ | ✓ | ✓ (with flag) |
| Edge 113+ | ✓ | ✓ | ✓ | ✓ (with flag) |
| Firefox 110+ | ✓ | ✓ | partial | partial |
| Safari 17+ | ✓ | ✓ | partial | — |
| Older | ✓ (no GPU) | ✓ (CPU fallback) | ✗ | ✗ |

## Future

1. **WASM kernels** — heavy compute via WebAssembly
2. **WebGPU gradient descent** — train MLP on GPU
3. **WebNN full graph** — compile entire substrate to WebNN
4. **WebXR** — VR/AR view of cell-graph
5. **WebTransport sync** — real-time witness-log replication
6. **Service Worker offline** — substrate works without network
7. **SharedArrayBuffer** — multi-threaded CPU compute
8. **IndexedDB sharding** — substrates > 50MB

## License

MIT
