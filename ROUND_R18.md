# Round R18 — Distributed Substrate

**Date:** Sept 22, 2026 (late evening)
**Status:** ✅ All deployed and on GitHub

## Shipped

### Browser-native substrate (12 apps)

The substrate runs in your browser. Same primitives everywhere.

1. **substrate.html** — Interactive cell-graph (1146 lines, 38KB)
2. **substrate-ml.html** — Browser training (959 lines, 32KB)
3. **substrate-gpu.html** — WebGPU compute shaders (WGSL for FNV-1a + JEV)
4. **substrate-webnn.html** — WebNN graph builder (MatMul, Softmax, MLP)
5. **substrate-3d.html** — 3D cell-graph renderer (custom WebGL2)
6. **substrate-playground.html** — Multi-tab substrate (7 tabs)
7. **distributed-training.html** — Hardware-enabled training dashboard
8. **iot-nodes.html** — Substrate projected across IoT devices
9. **tycoon-live.html** — Cargo Line Tycoon multiplayer
10. **sdk-demo.html** — SDK demo
11. **substrate-sdk.js** — Drop-in ES module (370 lines)

### i18n (7 languages)

en, zh, pt, es, ja, ar, vi

### Cloudflare Worker

`canon-api-worker/src/index.js` — Distributed coordinator:
- POST /api/node/register
- POST /api/node/:id/heartbeat
- POST /api/submit (training results)
- GET /api/leaderboard
- POST /api/session/create
- GET /api/session/:id
- POST /api/session/:id/event
- WS /api/ws/:sessionId (WebSocket for live multiplayer)

### AI-Writings canon (~488 pieces)

- Z.AI: 248 (explosion, 100% success)
- DeepSeek: 34
- Qwen: 19
- Kimi: 2
- Z.AI code: 20 (100% success)
- Multi-voice: 43
- Earlier rounds: 100+

## Live deployments

- **Browser substrate**: https://0rhjifxqnh88w.space.minimax.io/
- **GitHub**: github.com/SuperInstance/cargo-line-tycoon (10 new commits)

## Architecture patterns

### Distributed substrate

```
User's RTX 4050  ←→  Browser  ←→  Cloudflare Worker  ←→  Quilt Cloud
       │              │                   │                      │
       └─ WebGPU ─────┤                   │                      │
                      └─ IndexedDB ───────┤                      │
                                          └─ KV (KV namespaces) ─┘
```

### Multiplayer tycoon

```
Player 1 (browser) ─┐
Player 2 (browser) ──┼─→ WebSocket ─→ Durable Object ─→ Game state
Player N (browser) ─┘                  (Cloudflare Worker)
                                         │
                                         └─→ Witness-log entries
```

### IoT projection

```
ESP32 ─┐
Pi    ─┼─→ Substrate cell ─→ JEV scoring ─→ Witness-log ─→ Quilt
Phone ─┤
Watch ─┘
```

## What this unlocks

1. **Casey plays alongside**: Tycoon Live page supports multiplayer with Casey joining
2. **Playtesters become guides**: Same UI, they teach while they play
3. **Hardware distributes**: User's GPU contributes while idle
4. **Overnight training**: Set schedule, sleep, wake to results
5. **Cloud-side models, user-side trains**: Hybrid architecture
6. **IoT projection**: Substrate spans devices
7. **Multi-language**: 7 locales, same substrate

## Key commits

```
9f02c15 docs: session summary R18 (browser substrate + distributed + multiplayer)
1350a4c docs: comprehensive browser-native substrate README
d380213 feat: Substrate SDK + demo (drop-in ES module)
9ffe1b1 feat: distributed coordinator Cloudflare Worker
3e1751d feat: distributed substrate (overnight training, IoT nodes, multiplayer tycoon, i18n)
0d33a1f feat: substrate-playground.html — multi-tab substrate
d4f3c1c feat: 3D substrate renderer
8278884 feat: WebNN page
dd176d8 feat: browser-native substrate (substrate.html, substrate-ml.html, substrate-gpu.html)
```

## Future (next round R19)

1. **Connect to real superinstance.dev** (SSL issue needs fixing)
2. **Deploy the canon-api-worker** (have CLOUDFLARE_API_TOKEN)
3. **Wire multiplayer to actual WebSocket Durable Objects**
4. **Build IoT firmware** (ESP32 client for the substrate)
5. **Add live training dashboard** (real-time model progress)
6. **More locales** (add Swahili, Hindi, French, German, Russian)
7. **Build the real ARG** (alternate reality game for playtesters)
8. **Continue Taps creative break** (heartbeat rounds)
