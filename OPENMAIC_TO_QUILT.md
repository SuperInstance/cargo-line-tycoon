# OpenMAIC → Quilt — The Ground-Up Rebuild

OpenMAIC is a multi-agent AI classroom built on LangGraph + Next.js. This document explains how every piece of OpenMAIC maps to Quilt primitives, and why Quilt is a better substrate.

## Architecture comparison

### OpenMAIC (LangGraph-based)
```
Next.js + TypeScript frontend
        ↓
LangGraph state machine (orchestration)
        ↓
Director agent (LLM call)
        ↓
Agent profile dispatch (LLM call)
        ↓
Action execution (28+ action types)
        ↓
PostgreSQL persistence
```

### Quilt-native (cargo-line-tycoon)
```
Next.js + TypeScript frontend (apps/classroom-XX/)
        ↓
Quilt cell graph (each port, ship, agent is a cell)
        ↓
Signal-chain event bus (substrate/rust/, substrate/ts/)
        ↓
JEV oracle (the director)
        ↓
11 opcodes (BIND, LINK, EFFECT, VIEW, TICK + ATTEST, CONTEST, MERGER, REVOKE, DELEGATE, WITHDRAW)
        ↓
Witness-log (append-only, hash-chained)
```

## Component mapping

| OpenMAIC | Quilt | Why Quilt is better |
|---|---|---|
| LangGraph state machine | Quilt cell graph + signal-chain | Signal-chain is a typed event bus; cells are typed; both polyformal-stable across languages |
| Director agent | JEV oracle | Director is heuristic; JEV is canonically-validated with embedding similarity |
| Agent profile | Quilt cell (type=agent) | Agent becomes a hash-addressable cell; same address everywhere |
| Generation pipeline (outline → scene) | Quilt opcodes (BIND=create, EFFECT=generate, TICK=advance) | Opcodes are proven in C99 algebra; generation becomes deterministic |
| Action types (28+) | Quilt evidence types (direct, witness, pattern) | Reduces 28 ad-hoc types to 3 canonical forms |
| Whiteboard | Quilt cell with witness-log | Every draw is an observation with evidence |
| SSE streaming | Signal-chain streams | Signal-chain already supports 6 routing algorithms incl. OnChange |
| PostgreSQL | Witness-log | Append-only; revocations are scars; no schema migrations |
| Action engine (28+ types) | Quilt opcodes (11) | Canonical; fewer primitives, deeper composition |

## Why this rebuild is better

1. **Polyformalism**: Quilt substrate ships in 6+ languages with byte-exact canary. OpenMAIC is Next.js-only.
2. **Canonical actions**: 11 opcodes are proved in C99; OpenMAIC's 28+ actions are ad-hoc.
3. **Append-only witness-log**: Better than PostgreSQL for educational data — students can't game the system by editing history.
4. **Locale-specific pedagogy**: OpenMAIC is English-first; cargo-line-tycoon has 7+ locales with culturally-tuned agents and curricula.
5. **Procedural development**: Player chat becomes observations → JEV validates patterns → coder agent ships features. OpenMAIC has no equivalent.

## What this enables

1. **A student who plays cargo-line-tycoon is using Quilt**. They don't know it. But by age 15 they can `quilt view-fleet` and see their fleet as a cell graph.
2. **Teachers can fork the cell graph** for any maritime subject. Same substrate, different canon.
3. **Researchers can study how a child learns** by reading the witness-log — every observation is canonically-validated.
4. **The substrate is a curriculum**: each tier 1/2/3 lesson corresponds to specific opcodes. Geography → BIND/LINK. Economics → EFFECT/VIEW. Governance → ATTEST/CONTEST/REVOKE.

## Concrete next steps

1. ✅ Substrate: TS, Rust, C, Python ports (polyformalism verified)
2. ✅ Locales: en (Socratic), zh (Confucian), pt (Ubuntu) — 3 pedagogical framings
3. ⏳ Next.js classroom app scaffold (apps/classroom-en/)
4. ⏳ Director agent (Python + signal-chain)
5. ⏳ Procedural-development coder agent (cron-driven, reads witness-log)
6. ⏳ Player chat → observation pipeline
7. ⏳ JEV integration (which observations become features)
