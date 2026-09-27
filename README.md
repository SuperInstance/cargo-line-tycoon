# cargo-line-tycoon

A cargo shipping tycoon game, **built ground-up on the Quilt substrate**, with **polyformalism** along two axes: coding language AND cultural locale.

> "The cell is becoming a being." — R10 canon point

This is the live, polyformal, canary-pinned substrate where the same 11-opcode algebra runs in TypeScript, Rust, Python, and C99 with byte-exact parity, and where 5 cultural locales teach the same cell-graph through 5 different pedagogical lenses.

```
┌─────────────────────────────────────────────────────────────────────┐
│  CARGO LINE TYCOON — POLYFORMAL SUBSTRATE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   TypeScript   Rust   Python   C99                                  │
│       \        |       |      /                                     │
│        ─────────┴───────┴─────  ← FNV-1a 64-bit canary pin         │
│                       |              0x024a555471370b18d             │
│                  substrate                                          │
│                       |                                             │
│        ───────────────┼─────────────────                            │
│       /       |       |       |       \                             │
│      en      zh      pt      es      ja                             │
│      Socratic Confucian Ubuntu  ??    Whakaako (reciprocal)         │
│                                                                     │
│   5 locales, 4 framings, 1 cell-graph doctrine                     │
│   670+ pieces in live canon, 8 stress tests, 22 memory-sandbox tests│
└─────────────────────────────────────────────────────────────────────┘
```

## What this is

- A procedurally-developing game where the player runs a shipping empire
- Difficulty tiers: elementary (ports) → middle (economics) → advanced (governance)
- A built-in chatbot dev-agent that ships features based on player evidence (conscription loop)
- A teaching tool for Quilt itself — players are substrate users without knowing it
- A **production-grade defensive substrate** against memory-poisoning attacks

## What makes this publishable

The substrate has been stress-tested against the 2026-09 frontier:

| Frontier paper | Threat | Substrate defense | Result |
|---|---|---|---|
| **Leong 2605.08442** | Injection-execution dissociation (97.5% storage / 0-95% execution) | Memory Sandbox (6 patterns × 5 authority classes) | 22/22 tests pass |
| **FluctlightDB 2608.12365** | Provenance conflict under shared brain (18% top-1) | prev_hash chain (intrinsic temporal order) | **100% top-1** (5.6× better) |
| **LEVI 2605.09764** | Stronger search architectures vs frontier models | Substrate + cite-neighbor expansion | +6% cost, defends what it prevents |

Two-layer defense position:
- **Storage layer**: witness-log (candor-WAL) — auditable writes
- **Execution layer**: Memory Sandbox (safe_envelope) — payload.text never reaches LLM agents directly

## Polyformalism doctrine

Two axes of polyformalism (see `POLYFORMALISM.md`):

### Axis 1: Coding language
The substrate ships in 4 languages with byte-exact canary:
- **TypeScript** — web app (`substrate/ts/`)
- **Rust** — native runtime (`substrate/rust/`)
- **C99** — algebraic proof (`substrate/c/`)
- **Python** — agent runtime (`substrate/py/`)

The canary hash `0x024a555471370b18d` (from `"café Δ 日本語"`) reproduces byte-exactly in all four. Verified by `tests/stress/01_fnv1a64_fuzz.js` (29 pathological inputs, all green).

### Axis 2: Cultural locale
Each locale is a complete instance with its own canon, agents, ports, and curriculum:

| Locale | Region | Framing | Status |
|---|---|---|---|
| **`en/`** | North America | Socratic (dialectic) | ✓ Active |
| **`zh/`** | East Asia | Confucian (关系) | ✓ Active |
| **`pt/`** | South America | Ubuntu (νημπούτου) | ✓ Active |
| **`es/`** | Europe/Iberia | (inherits Socratic) | ✓ Active |
| **`ja/`** | Japan/Pacific | **Whakaako** (reciprocal) | ✓ Active |
| **`ar/`** | MENA/Suez corridor | (planned) | |
| **`vi/`** | Southeast Asia | (planned) | |

## Pedagogical framings (Quartet)

Every locale belongs to one of 4 pedagogical traditions, each producing a distinct cell-graph topology:

1. **Socratic** (διαλεκτική) — European — dialectic. Single director + questioning agents.
2. **Confucian** (关系) — East Asian — relationship. Hierarchical mentor-student relations.
3. **Ubuntu** (νημπούτου) — African — community. Cells-as-others; multi-witness attestation.
4. **Whakaako** — Pacific — reciprocal exchange (ako). Bidirectional agent↔agent routes; primary opcodes WITHDRAW + MERGER rotation; 3-beat whakaatu storytelling.

## The 11 Opcodes

The substrate algebra has 11 canonical opcodes:

```
CELL-GRAPH (5)               OBSERVATION (6)
BIND       — establish       ATTEST     — add trust score
LINK       — connect         DELEGATE   — transfer authority
EFFECT     — change state    CONTEST    — challenge validity
VIEW       — project         MERGER     — combine observations
TICK       — advance time    REVOKE     — remove authority
                             WITHDRAW   — pull back delegation
```

The first five are the cell-graph algebra; the second six are the observation-primitive algebra that makes the substrate defensible.

## Repo structure

```
cargo-line-tycoon/
├── POLYFORMALISM.md           # The polyformalism doctrine
├── SUBSTRATE_FOUNDATION.md    # 7-layer architecture
├── THREAT_MODEL.md            # What substrate defends + what it doesn't
├── JEV_AS_DIRECTOR.md         # JEV oracle + authority boundaries
├── DIALECTIC_IN_11_OPCODES.md # Pedagogical spine applied
│
├── substrate/                 # 4-port polyformal substrate (TS/Rust/Py/C99)
│   ├── ts/                    # TypeScript port + Memory Sandbox
│   ├── rust/                  # Rust port + safe_envelope parity
│   ├── py/                    # Python port + clt_substrate
│   └── c/                     # C99 algebraic proof
│
├── locales/                   # 5 cultural locales
│   ├── en/                    # Socratic (North America)
│   ├── zh/                    # Confucian (East Asia)
│   ├── pt/                    # Ubuntu (South America)
│   ├── es/                    # Socratic (Europe/Iberia)
│   └── ja/                    # Whakaako (Japan/Pacific)
│
├── openmaic_compat/           # 14 OpenMAIC action types → substrate signals
├── cron/                      # Conscription cron (witness-log → feature patches)
├── tests/stress/              # 8 stress tests, 100+ assertions
└── research/                  # JEPA tutor + frontier analysis
```

## Quickstart

```bash
git clone https://github.com/SuperInstance/cargo-line-tycoon
cd cargo-line-tycoon
npm install
npm test
```

## Stress test status

```
tests/stress/01_fnv1a64_fuzz.js            29/29  ✓ byte-exact across 4 ports
tests/stress/02_signal_chain_stress.js     11/11  ✓ signal chain + OnChange
tests/stress/03_memory_poisoning.js         8/8   ✓ forged prev_hash + replay + quorum-bypass
tests/stress/04_agent_prompt_injection.js   ✓     ✓ substrate is verbatim, not sanitizer
tests/stress/05_locale_divergence.js        4/4   ✓ same cell address for same observation
tests/stress/06_conscription_loop.js        5/5   ✓ 16 features reach 5% quorum
tests/stress/07_memory_sandbox.js          22/22  ✓ 6 Leong patterns × 5 authority classes
tests/stress/08_provenance_conflict.js     100%   ✓ beats FluctlightDB 18% by 5.6×
```

## Published versions

- **npm**: `@superinstance/cargo-line-tycoon-substrate@0.2.0`
- **crates.io**: `cargo-line-tycoon-substrate@0.2.0`
- **Cloudflare Worker**: https://canon-api-worker.casey-digennaro.workers.dev (live)

## In the broader fleet

This hand-written list used to live here. It has been replaced by the
**generated** Cross-pollination section below — the machine-readable
edition of the same claim, rendered from [`.quilt/links.yml`](.quilt/links.yml)
by [`quilt-links.mjs`](https://github.com/SuperInstance/fleet-seeds/blob/main/quilt-links.mjs)
rather than hand-maintained prose that rots the moment a repo is renamed.
This repo is the **reference example** for the standard: see
[CROSS-POLLINATION.md](https://github.com/SuperInstance/AI-Writings/blob/main/situations/arch/CROSS-POLLINATION.md)
for why.

## What a reader learns

- **A hand-written cross-repo list is a liability, not documentation.** It
  is one-directional, invisible to any tool, and rots silently on a rename.
  A `.quilt/links.yml` manifest is the same claim made machine-readable and
  regenerable.
- **Content-addressing a doctrine pin (`@v0.3`) is different from asserting
  it.** `consumes.at` names the evidence *this repo actually folded*, not a
  live claim about what jev-quilt currently says — if jev-quilt changes, this
  pin still names what was read.
- **Two axes of polyformalism compose independently.** The same 11-opcode
  algebra is both ported across 4 languages (byte-exact canary) and taught
  through 5 cultural pedagogies — changing one axis never has to touch the
  other.
- **A canary hash is a portability contract, not a checksum.** The same
  FNV-1a digest reproducing byte-for-byte across TypeScript, Rust, Python,
  and C99 is the actual proof of "same substrate," verified by running
  `tests/stress/01_fnv1a64_fuzz.js`, not asserted in prose.

## Adjacent research

- [arXiv 2605.08442](https://arxiv.org/abs/2605.08442) — Leong: injection-execution dissociation
- [arXiv 2608.12365](https://arxiv.org/abs/2608.12365) — FluctlightDB: memory as distinct data model
- [arXiv 2605.09764](https://arxiv.org/abs/2605.09764) — LEVI: stronger search architectures
- [arXiv 2503.18808](https://arxiv.org/abs/2503.18808) — JEPA world models (LeCun)

<!-- QUILT:LINKS:START — generated from .quilt/links.yml by quilt-links.mjs. Do not edit by hand. -->
## Cross-pollination — the Reader's Fold

*Part of the **quilt** family. Under [Law 6](https://github.com/SuperInstance/jev-quilt), this repo carries no verdicts about its neighbors — only content-addressed pointers you fold under your own weights.*

**Grown on** — [jev-quilt](https://github.com/SuperInstance/jev-quilt) `@v0.3`

**Provides** (fold these from here)
- `opcode-canon` — the 11-opcode substrate algebra, FNV-1a canary-pinned 0x024a555471370b18d
- `memory-sandbox` — 6-pattern x 5-authority defensive envelope (defends Leong 2605.08442)

**Consumes** (folded from elsewhere)
- [jev-quilt](https://github.com/SuperInstance/jev-quilt) `@v0.3` — cell / hook / bookkeeper doctrine + q16 exact-rational codec

**Related** (1-hop siblings — Law 7)
- [qthe](https://github.com/SuperInstance/qthe) — shares the data-is-geometry framing
- [pong-quilt](https://github.com/SuperInstance/pong-quilt) — sibling "ML you can watch think" teaching artifact

<sub>Regenerate: `node quilt-links.mjs` · Fleet map: [FLEET.md](https://github.com/SuperInstance/fleet-seeds/blob/main/FLEET.md)</sub>
<!-- QUILT:LINKS:END -->

## License

MIT
