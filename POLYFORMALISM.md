# Cargo Line Tycoon — Polyformalism Doctrine

## What this is

A **cargo shipping tycoon game**, grounded-up in the Quilt substrate, where:

1. **The player runs a shipping empire** through tiered difficulty (elementary: ports → middle: economics → advanced: governance).
2. **The backend IS the substrate**: every port, ship, route, contract is a Quilt cell. Every event is an observation. The signal-chain is the event bus.
3. **The dev-agent chatbot is built in**, with three voices: tip, feature-request, and coder.
4. **Players are conscripted into development**: their chat messages become observations, JEV validates patterns, the coder agent ships features.
5. **OpenMAIC patterns, rebuilt ground-up on Quilt**: the multi-agent classroom orchestration runs on Quilt cells + signal-chain instead of LangGraph state machines.
6. **Polyformalism across TWO axes**: coding language AND cultural locale.

## The two axes of polyformalism

### Axis 1: Coding language (the substrate is polyformal-stable)

The substrate (Quilt + signal-chain + canonical cell algebra) is implemented in **6+ languages**. The same input always produces the same FNV-1a 64-bit canary hash (`0x024a555471370b18d` on "café Δ 日本語"):

| Layer | Languages | Why |
|---|---|---|
| Algebra / proof | C (C99 substrate), Python, Rust | proven laws |
| Signal-chain | Rust, TypeScript | pub/sub router |
| Game logic | TypeScript, Rust (WASM), Python | web app + native runtime |
| Agent runtime | Python, TypeScript | OpenMAIC-style director loop |
| Pedagogical canon | JSON locale packs | locale-agnostic data |
| Math/physics engine | Rust, C | numerical stability |

### Axis 2: Cultural locale (the canon is locale-specific)

The pedagogical content lives in **at least 7 locales**. Each is a complete instance with its own:

| Dimension | What changes per locale | What stays the same |
|---|---|---|
| **Curriculum** | National standards (US Common Core, 中国课程标准, BNCC Brazil) | Tier 1/2/3 progression |
| **Ports** | Region-relevant ports (US/CA/MX, CN/JP/KR, BR/AR/CL, etc.) | FNV-1a canonical port ID |
| **Agent voice** | Cultural pedagogical norm (Socratic, Confucian, Ubuntu, etc.) | Quilt cell identity |
| **Discourse patterns** | Turn-taking, interruption norms, debate styles | Director state machine |
| **Vessel types** | Regional shipping types (Great Lakes bulkers,珠江三角洲驳船, etc.) | Substrate primitives |
| **Example cargo** | Regionally traded goods | Cargo observation shape |
| **Assessment** | Locale-native testing/grading conventions | Witness-log audit trail |

## The 4 pedagogical framings (Quartet)

Every locale belongs to one of 4 pedagogical traditions:

1. **Socratic (διαλεκτική)** — Greek/European — classroom as **dialectic**
2. **Confucian (关系)** — East Asian — classroom as **relationship**
3. **Ubuntu (νημπούτου)** — African — classroom as **community**
4. **Whakaako (reciprocal)** — Pacific — classroom as **reciprocal exchange**

These produce 4 distinct cell-graph topologies (how agents connect, how the director selects next speaker, how evidence is weighted).

## Why this teaches Quilt

A kid playing this game is unknowingly using the Quilt substrate:
- Every port is a `cell(state, witness_log, behavior, address, type)`
- Every action is one of the 11 opcodes (BIND, LINK, EFFECT, VIEW, TICK + ATTEST, CONTEST, MERGER, REVOKE, DELEGATE, WITHDRAW)
- The witness-log records every move
- JEV in the background evaluates "is this fleet still canonical?"
- By tier 3, the player can call `quilt view-fleet` and see their graph

By age 15, they're a substrate user. The Quilt CLI feels like a more powerful version of the dev-agent they grew up with.

## The conscription loop

```
Player action → observation → witness-log → JEV evaluates → 
  if pattern matches (multiple players, similar observations): 
    feature_request observation created → 
    weekly cron reads witness-log → 
    coding agent writes cell/module → 
    next session ships the feature → 
    player gets "🎉 You asked for this!" notification
```

The game ships faster the more people play it. The player thinks they're chatting.

## OpenMAIC → Quilt mapping

| OpenMAIC component | Quilt equivalent |
|---|---|
| LangGraph state machine | Quilt cell graph + signal-chain |
| Director agent | JEV oracle + Quilt VIEW opcode |
| Agent profile | Quilt cell (state, behavior, type=teacher/assistant/student) |
| Classroom state (slides, scenes, audio) | Quilt cells with witness-log |
| Generation pipeline (outline → scene → media → TTS) | Quilt opcodes: BIND=create, EFFECT=generate, TICK=advance, VIEW=read |
| Action types (speak, draw, quiz, highlight) | Quilt evidence types (direct, witness, pattern) |
| Whiteboard | Quilt cell with witness-log (every draw is an observation) |
| SSE streaming | Signal-chain (rooms=classroom sessions, signals=events) |
| PostgreSQL persistence | Quilt witness-log (append-only, hash-chained) |
| 28+ action types | Quilt opcodes + extended proposal |

## Status

- [ ] substrate/ts/ — signal-chain TS port
- [ ] substrate/rust/ — signal-chain Rust port (have a2a-signal-chain)
- [ ] substrate/c/ — C99 algebraic substrate port
- [ ] locales/en/ — English/NA (tier 1, basic)
- [ ] locales/zh/ — Chinese (tier 1)
- [ ] locales/pt/ — Portuguese (tier 1)
- [ ] apps/classroom-en/ — Next.js classroom app, English locale
- [ ] tests/canary/ — Cross-language, cross-locale canary hash identity
