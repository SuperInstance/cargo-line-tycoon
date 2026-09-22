# cargo-line-tycoon

A cargo shipping tycoon game, built **ground-up on the Quilt substrate**, with **polyformalism** along two axes: coding language AND cultural locale.

## What this is

- A procedurally-developing game where the player runs a shipping empire
- Difficulty tiers: elementary (ports) → middle (economics) → advanced (governance)
- A built-in chatbot dev-agent that ships features based on player evidence
- A teaching tool for Quilt itself — players are substrate users without knowing it

## Polyformalism doctrine

Two axes of polyformalism (see `POLYFORMALISM.md`):

### Axis 1: Coding language
The substrate ships in 6+ languages with byte-exact canary:
- **TypeScript** — web app (`substrate/ts/`)
- **Rust** — native runtime (`substrate/rust/`)
- **C99** — algebraic proof (`substrate/c/`)
- **Python** — agent runtime (`substrate/py/`)
- **Go** — alternative runtime (`substrate/go/`, planned)
- **C++** — game engine layer (planned)

### Axis 2: Cultural locale
Each locale is a complete instance with its own canon:
- **`en/`** — North America, Socratic framing (US Common Core)
- **`zh/`** — East Asia, Confucian framing (中国课程标准)
- **`pt/`** — South America, Ubuntu framing (BNCC)
- **`es/`** — Europe/Iberia (planned)
- **`ar/`** — MENA/Suez corridor (planned)
- **`ja/`** — Japan/Pacific (planned)
- **`vi/`** — Southeast Asia (planned)

## Pedagogical framings (Quartet)

Every locale belongs to one of 4 pedagogical traditions:
1. **Socratic** (διαλεκτική) — European — dialectic
2. **Confucian** (关系) — East Asian — relationship
3. **Ubuntu** (νημπούτου) — African — community
4. **Whakaako** (reciprocal) — Pacific — reciprocal exchange

These produce 4 distinct cell-graph topologies.

## Repo structure

```
cargo-line-tycoon/
├── POLYFORMALISM.md           # The polyformalism doctrine
├── SUBSTRATE_FOUNDATION.md    # 7-layer architecture
├── OPENMAIC_TO_QUILT.md       # How OpenMAIC maps to Quilt
├── README.md
├── substrate/
│   ├── ts/        # TypeScript signal-chain + cell algebra
│   ├── rust/      # Rust port (compiled, native, WASM)
│   ├── c/         # C99 algebraic proof + FNV-1a
│   ├── py/        # Python agent runtime
│   └── go/        # Go alternative runtime (planned)
├── locales/
│   ├── en/        # English/NA (Socratic)
│   ├── zh/        # Chinese (Confucian)
│   ├── pt/        # Portuguese/Brazil (Ubuntu)
│   ├── es/        # Spanish (planned)
│   ├── ar/        # Arabic (planned)
│   ├── ja/        # Japanese (planned)
│   └── vi/        # Vietnamese (planned)
├── apps/
│   ├── classroom-en/        # Next.js app, English locale
│   ├── classroom-zh/        # Next.js app, Chinese locale
│   └── classroom-pt/        # Next.js app, Portuguese locale
├── docs/                     # Architecture, canon, curriculum
└── tests/
    ├── canary/              # Polyformalism tests
    └── pedagogy/            # Pedagogical validation
```

## The conscription loop

```
Player plays → every action is an observation → witness-log → 
  JEV evaluates pattern across players → 
  if consensus: feature_request observation → 
  coder agent (cron) reads witness-log → 
  ships code patch → 
  next player session sees new feature
```

## Quick start

```bash
# 1. Substrate polyformalism test
node tests/canary/polyformalism-test.js

# 2. Python port test
python3 substrate/py/clt_substrate/__init__.py

# 3. Rust port test
cd substrate/rust && cargo test

# 4. C99 port test
cd substrate/c && gcc -O2 -o /tmp/test_algebra cell_algebra.c test_algebra.c -I. && /tmp/test_algebra
```

## Status

- [x] Substrate: 4 language ports with byte-exact canary parity
- [x] Locales: en, zh, pt (with full canon, agents, curriculum)
- [x] Polyformalism test runner (verifies substrate is identical across locales)
- [ ] apps/classroom-en/ — Next.js classroom app
- [ ] Director agent (Python + signal-chain)
- [ ] Player chat → observation pipeline
- [ ] Coder agent (cron-driven)
- [ ] JEV integration
- [ ] More locales (es, ar, ja, vi)

## License

MIT
