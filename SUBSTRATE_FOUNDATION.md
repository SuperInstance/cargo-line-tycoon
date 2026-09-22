# Substrate Foundation — Cargo Line Tycoon

The canonical substrate that all locales and all language ports share.

## The 7 layers (R11 derivation of R7 layers)

```
Layer 7:  UI / Presentation locale-specific (Next.js app per locale)
Layer 6:  Pedagogical canon  per locale (JSON canon files)
Layer 5:  Director / JEV     multi-agent orchestration (Python + TS)
Layer 4:  Signal-chain       event bus (Rust + TS port)
Layer 3:  Cell algebra       Quilt 11 opcodes + proved laws (C99 + Rust + Python)
Layer 2:  Observation primitive  substrate atom (TS + Rust + Python)
Layer 1:  FNV-1a 64-bit      canary hash (C + Rust + TS + Python)
```

## The 11 opcodes (canonical)

**5 base (proven in C99 algebra)**:
- `BIND` — create or update a cell
- `LINK` — connect two cells (typed edge)
- `EFFECT` — invoke cell behavior
- `VIEW` — read cell state
- `TICK` — advance the substrate clock

**6 proposed (R11 derivative)**:
- `ATTEST` — add trust score to an observation
- `CONTEST` — create counter-observation
- `MERGER` — reach consensus across contradictions
- `REVOKE` — mark observation as superseded (scar)
- `DELEGATE` — grant capability to another cell
- `WITHDRAW` — pull observation into private scope

## The canonical cell

```
cell = {
  state: any,
  witness_log: List<observation>,
  behavior: cell_or_function,
  address: FNV1a-64(cell-contents),  // address IS the data
  type: cell-type-name,
}
```

## The 3 forms of evidence (canonical)

1. **Direct** — payload IS the evidence (hash, measurement, record)
2. **Witness** — observers confirm (attestation, multi-signature)
3. **Pattern** — many instances form a recognized pattern (trend, cluster)

## The 3 forms of forgetting (canonical, scar persists)

1. **Bundle** — collapse detail, retain summary
2. **Traversal** — drop the path; scar remains
3. **Evidence** — stop recording evidence; observations remain but trail dims

## The fleet canary (canonical across all languages and locales)

FNV-1a 64-bit hash of `"café Δ 日本語"` must equal `0x024a555471370b18d`.

Every language port, every locale's pedagogical runtime, every classroom app must verify this canary on startup. If your hash doesn't match, you have a non-canonical port — refuse to ship.

## Cross-language, cross-locale invariants

These four invariants are common across all 6+ language ports AND all 7+ locales:

1. **Identity of canary hash**: Same input → same FNV-1a-64, byte-for-byte.
2. **Cell address determinism**: cell address = FNV-1a-64 of its typed contents.
3. **Witness-log append-only**: no observation deleted; revocations are scars.
4. **Director determinism given state**: same cell state + same observations → same next speaker.

If any of these break in a port or locale, that's a fork, not a port.
