# Quilt Substrate — Deploy Templates

The substrate is a portable bundle. Deploy it anywhere static files are served.

## Bundle Contents (1.0MB total)

```
substrate/
├── index.html                # Landing page (entry point)
├── substrate.html            # Interactive cell-graph + JEV
├── substrate-ml.html         # ML backends (CPU, WebGPU, WebNN, WASM)
├── substrate-gpu.html        # WebGPU compute shaders
├── substrate-webnn.html      # WebNN graph builder
├── substrate-3d.html         # 3D WebGL renderer
├── substrate-playground.html # 7-tab browser playground
├── substrate-sdk.js          # ES module SDK
├── cloudflare-live/          # Live backend demo
├── distributed-training.html # Overnight training dashboard
├── iot-nodes.html            # 12-node IoT simulation
├── tycoon-live.html          # Multiplayer tycoon
├── sdk-demo.html             # SDK demo
├── garden/                   # Truman Architecture wiki
│   ├── index.html
│   ├── visitor-guide.html
│   └── truman.html
├── i18n/                     # 7 language versions
│   ├── en.html
│   ├── zh.html
│   ├── pt.html
│   ├── es.html
│   ├── ja.html
│   ├── ar.html
│   └── vi.html
├── docs/
│   ├── INDEX.html            # Landing docs
│   └── recommendations-from-kimi1/
└── webgpu/
    ├── fnv1a64.wgsl
    └── jev_cosine.wgsl
```

## Deploy Targets

### Option 1: Cloudflare Pages (recommended)

```bash
# Direct upload
npx wrangler pages deploy ./substrate --project-name=quilt-substrate

# Or via Git
git push origin main  # auto-deploys via Pages Git integration
```

**Live URL pattern**: `https://<project-name>.pages.dev`

### Option 2: GitHub Pages

1. Push `substrate/` to a `gh-pages` branch
2. Settings → Pages → Source: gh-pages branch
3. **Live URL**: `https://<user>.github.io/<repo>/`

Or use a workflow:
```yaml
# .github/workflows/pages.yml
name: Deploy to Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./substrate
      - id: deployment
        uses: actions/deploy-pages@v4
```

### Option 3: Local file:// (no server)

Just open `substrate/index.html` in a browser. All features work.

```bash
# macOS
open substrate/index.html

# Linux
xdg-open substrate/index.html

# Or serve locally
python3 -m http.server 8080 --directory substrate
# → http://localhost:8080
```

### Option 4: Oracle Cloud / any static host

```bash
# Upload to OCI Object Storage
oci os object put --bucket-name substrate --file substrate/index.html

# Or copy to any nginx/apache directory
rsync -avz substrate/ user@server:/var/www/html/
```

### Option 5: IoT device (Raspberry Pi / ESP32)

The bundle is small enough (~1MB) to run from device flash:

```bash
# Raspberry Pi
scp -r substrate/ pi@raspberrypi.local:/home/pi/substrate/
# Open http://raspberrypi.local/substrate/

# ESP32 (limited subset)
# Only index.html + substrate.html fit (~50KB)
# Most features work via WebSerial fallback
```

### Option 6: AR/VR / Spatial projection

The substrate-3d.html page works in WebXR-aware browsers:
- Vision Pro Safari
- Quest 3 browser
- Chrome with WebXR flag

## Backend API

The browser apps can run fully offline OR connect to the live API.

**Live API** (Cloudflare Workers):
- Base: `https://quilt-distributed.casey-digennaro.workers.dev`
- Custom: `https://api.superinstance.dev` (after DNS propagation)
- Stable: `https://api.quilt-e4m.pages.dev`

**Self-hosted API**:
1. Clone `cloudflare-stack/` directory
2. Set CLOUDFLARE_API_TOKEN env var
3. Run `wrangler deploy`

**Local API** (Node.js):
```bash
# Install
npm install -g substrate-server

# Run
substrate-server --port 8787
```

## Architecture

```
Browser                    Cloudflare Workers
┌──────────────┐          ┌─────────────────┐
│  HTML/JS     │  ←────→  │  Worker         │
│  substrate   │          │  ├─ KV (fast)   │
│  SDK         │          │  ├─ D1 (SQL)    │
│  apps        │          │  ├─ R2 (blobs)  │
└──────────────┘          │  ├─ Vectorize   │
                         │  ├─ Workers AI  │
                         │  └─ Cron (5min) │
                         └─────────────────┘
```

## Performance

| Browser | substrate.html | substrate-gpu.html |
|---------|----------------|---------------------|
| Chrome 113+ | ✓ | ✓ (GPU) |
| Edge 113+ | ✓ | ✓ (GPU) |
| Firefox 110+ | ✓ | partial |
| Safari 17+ | ✓ | partial |

## Security

All operations are local-first. The browser apps store data in:
- IndexedDB (persistent across sessions)
- localStorage (small config)
- Memory (volatile)

The cloud API is CORS-enabled but read-only by default. Write access requires a node ID obtained via `/api/node/register`.

## License

MIT — see [LICENSE](../LICENSE)
