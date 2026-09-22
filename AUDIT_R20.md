# Audit R20 — Routing & URL Audit

**Date:** 2026-09-22  
**Scope:** All substrate-related repos, all Cloudflare deployments, all docs

## Summary

| Component | Status | Notes |
|---|---|---|
| Cloudflare Pages (quilt-e4m.pages.dev) | ✓ | 24 paths, all 200 OK |
| Cloudflare Worker (quilt-distributed) | ✓ | Full stack: KV + D1 + R2 + Vectorize + Workers AI + Cron |
| GitHub Pages workflow | ✓ | Auto-deploys on push |
| substrate-bundle.zip | ✓ | 129KB portable bundle |
| Live URL redirects | ✓ | minimax → Cloudflare Pages |
| Kimi1 recommendations | ✓ | Brought into main, also in bundle |

## URL Audit Results

### Replaced (minimax → Cloudflare Pages)
- `a5ndg1iv3juc5.space.minimax.io` → `quilt-e4m.pages.dev`
- `0rhjifxqnh88w.space.minimax.io` → `quilt-e4m.pages.dev`
- `3eihi3bltog18.space.minimax.io` → `quilt-e4m.pages.dev`

### Files updated
- docs/INDEX.html (main landing)
- docs/_new_features.html
- browser-deploy/garden/truman.html
- browser-deploy/garden/visitor-guide.html
- browser/README.md
- ROUND_R18.md, ROUND_R19.md
- SESSION_SUMMARY_2026-09-22_LATE.md
- substrate-bundle/* (all HTML files)

## Cloudflare Pages Audit

### Active deployments (24 paths)

| Path | Status | URL |
|------|--------|-----|
| / | 200 | https://quilt-e4m.pages.dev/ |
| /substrate | 200 | https://quilt-e4m.pages.dev/substrate |
| /substrate-ml | 200 | https://quilt-e4m.pages.dev/substrate-ml |
| /substrate-gpu | 200 | https://quilt-e4m.pages.dev/substrate-gpu |
| /substrate-webnn | 200 | https://quilt-e4m.pages.dev/substrate-webnn |
| /substrate-3d | 200 | https://quilt-e4m.pages.dev/substrate-3d |
| /substrate-playground | 200 | https://quilt-e4m.pages.dev/substrate-playground |
| /distributed-training | 200 | https://quilt-e4m.pages.dev/distributed-training |
| /iot-nodes | 200 | https://quilt-e4m.pages.dev/iot-nodes |
| /tycoon-live | 200 | https://quilt-e4m.pages.dev/tycoon-live |
| /sdk-demo | 200 | https://quilt-e4m.pages.dev/sdk-demo |
| /garden/ | 200 | https://quilt-e4m.pages.dev/garden/ |
| /garden/truman | 200 | https://quilt-e4m.pages.dev/garden/truman |
| /garden/visitor-guide | 200 | https://quilt-e4m.pages.dev/garden/visitor-guide |
| /cloudflare-live/ | 200 | https://quilt-e4m.pages.dev/cloudflare-live/ |
| /i18n/en | 200 | https://quilt-e4m.pages.dev/i18n/en |
| /i18n/zh | 200 | https://quilt-e4m.pages.dev/i18n/zh |
| /i18n/pt | 200 | https://quilt-e4m.pages.dev/i18n/pt |
| /i18n/es | 200 | https://quilt-e4m.pages.dev/i18n/es |
| /i18n/ja | 200 | https://quilt-e4m.pages.dev/i18n/ja |
| /i18n/ar | 200 | https://quilt-e4m.pages.dev/i18n/ar |
| /i18n/vi | 200 | https://quilt-e4m.pages.dev/i18n/vi |
| /kimi-recommendations/ | 200 | https://quilt-e4m.pages.dev/kimi-recommendations/ |
| /kimi-recommendations/NOTE-01-hallway | 200 | https://quilt-e4m.pages.dev/kimi-recommendations/NOTE-01-hallway |

### Custom domain

| Domain | Status | URL |
|--------|--------|-----|
| substrate.superinstance.dev | pending SSL | https://substrate.superinstance.dev/ |
| api.superinstance.dev | ✓ | https://api.superinstance.dev/api/health |

## Cloudflare Worker Audit

### Stack
- **KV Namespaces**: 3 (NODES, SESSIONS, WITNESS_LOG) — all bound
- **D1 Database**: quilt-canon — 4 tables (cells, witnesses, nodes, submissions)
- **R2 Buckets**: 2 (quilt-models, quilt-embeddings) — all bound
- **Vectorize Index**: quilt-jev (768d, cosine) — bound
- **Workers AI**: bound (llama-3.1-8b-instruct-fast + bge-base-en-v1.5)
- **Cron**: */5 * * * * (continuous ML)

### Endpoints (30+)
- `/api/health`, `/`, `/api/canon/stats`
- `/api/node/{register,heartbeat,:id,list}`
- `/api/cell{,/:id,list}`
- `/api/jev/search`, `/api/embed`, `/api/infer`
- `/api/submit`, `/api/leaderboard`
- `/api/garden/{visit,state}`
- `/api/canon/attest`, `/api/witness/:cellId`
- `/api/models`, `/api/export`
- `/api/session/create`
- `/api/training/{start,status,list}`

## GitHub Repos Audit

### cargo-line-tycoon (main repo)
- 12 commits this session (R17-R20)
- All temporary URLs replaced
- substrate-bundle.zip downloadable from root
- GitHub Pages workflow added
- Kimi1 recommendations pulled into main

### Related repos (no issues found)
- **quilt-rust** (Rust port) — README has live-canon.superinstance.dev reference (valid)
- **quilt-cloudflare** (Cloudflare Worker) — README has localhost:8787 example (intentional)
- **quilt-substrate** (Python lib) — all external URLs are shields.io badges (safe)

### Recommended cross-references to add
The following repos should ideally link to the substrate-bundle:
- quilt-rust ← substrate-bundle
- quilt-cloudflare ← substrate-bundle  
- quilt-substrate ← substrate-bundle

(Future work — not blocking)

## Deployment Options

### Currently active
1. **Cloudflare Pages** — https://quilt-e4m.pages.dev (24 paths)
2. **Cloudflare Workers** — https://quilt-distributed.casey-digennaro.workers.dev

### Configured but pending
1. **substrate.superinstance.dev** — DNS routed, SSL pending
2. **GitHub Pages** — workflow ready, needs Settings → Pages enable

### Available templates (substrate-bundle.zip)
- Cloudflare Pages — `wrangler pages deploy`
- GitHub Pages — auto-deploys via .github/workflows/pages.yml
- Local file:// — open index.html directly
- Oracle Cloud — rsync or OCI Object Storage
- IoT devices — Raspberry Pi, ESP32 (limited)
- AR/VR — WebXR-aware browsers

## Issues Found & Fixed

1. **Temporary URLs**: Replaced all space.minimax.io references with permanent Cloudflare Pages URLs ✓
2. **Bundle has uppercase INDEX.html**: Removed in favor of lowercase index.html (Pages prefers lowercase) ✓
3. **Internal links used .html extensions**: Stripped — Pages handles auto-redirect ✓
4. **Garden index.html was missing**: Fixed by ensuring bundle includes it ✓
5. **No GitHub Pages workflow**: Added .github/workflows/pages.yml ✓

## Verified by

Manual HTTP curl tests + Cloudflare Pages deployment API + GitHub API checks.
