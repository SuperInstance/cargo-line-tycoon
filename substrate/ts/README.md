# @superinstance/cargo-line-tycoon-substrate

Polyformal Quilt substrate for cargo-line-tycoon.

## Version 0.1.1 (Sept 22, 2026)

**Changelog from 0.1.0**:
- **LocaleClassroom routing fix**: agents now broadcast to each other (agent↔agent Direct routes)
- **Sampled routing**: agent→port uses Sampled{interval_ms:5000} for "market tick" pattern
- **66 routes** for 10-port + 3-agent locale (was 30). Signal dedup works correctly.

## The fleet canary

```
FNV-1a 64-bit hash of "café Δ 日本語" = 0x024a555471370b18d
```

This hash MUST be identical across all 4 language ports. See the unified test runner in cargo-line-tycoon/tests/canary/.

## Usage

```js
const sub = require('@superinstance/cargo-line-tycoon-substrate');

// Canary
console.log(sub.verifyCanary()); // { match: true, ... }

// Cell
const cell = new sub.Cell({ state: 'hello', type: 'test' });
console.log(cell.address); // FNV-1a 64-bit hex

// Signal chain
const chain = new sub.SignalChain();
chain.registerRoom('shanghai');
chain.registerRoom('rotterdam');
chain.addRoute('shanghai', 'rotterdam', sub.RoutingAlgorithm.OnChange);

chain.send(new sub.Signal('shanghai', 'rotterdam', sub.SignalTypes.ShipArrived, { ship_id: 'ship_1' }));
const received = chain.receive('rotterdam'); // 1 signal (OnChange dedup)

// LocaleClassroom — adapter for locale-specific pedagogical canon
const classroom = new sub.LocaleClassroom({
  locale: 'en',
  portCanon: [{ id: 'shanghai', name: 'Shanghai', lat: 31.2, lng: 121.5, country: 'CN' }],
  agentCanon: [{ id: 'teacher_1', name: 'Test Teacher', persona: 'helpful', language: 'en', framing: 'socratic' }],
  curriculum: { tier_1: [], tier_2: [], tier_3: [], framing: 'socratic' },
});
```

## Director demo

`examples/director_demo.js` shows a substrate-native Director loop (no LLM, pedagogical heuristics).

## Phase 0 — world-model (`src/world.js`)

The shared game kernel the tycoon toy (`../../game/`) runs on, built on top of
`Cell` unchanged: a `SeededRNG` (deterministic mulberry32, seeded via `fnv1a64`),
a booked append-only `World`/tick loop with a double-entry integer-minor-units
ledger (`bookLedger` throws on a non-integer or negative amount — money never
floats), and content-addressed game cell factories (`makeCompanyCell`,
`makeShipCell`, `makeRouteCell`, `makePortCell`, `makeMarketCell`) tracked
per-entity via `EntityStore` so nothing is ever overwritten in place.

**The law this buys:** replay ≡ live. `node test-world.js` scripts a small run
and asserts two independent runs from the same seed produce byte-identical
witness-logs and `stateHash()`. Kept in sync with the standalone
`cargo-line-tycoon-substrate-ts` package (same file, unmodified) — see that
repo's `claude/phase0-worldmodel` branch.

## Polyformalism (cross-language parity)

Same input → same FNV-1a hash, byte-for-byte across:
- **TypeScript** (this package)
- **Rust** (cargo-line-tycoon/substrate/rust/)
- **C99** (cargo-line-tycoon/substrate/c/)
- **Python** (cargo-line-tycoon/substrate/py/)

Verify with: `bash cargo-line-tycoon/tests/canary/run_all_ports.sh`
