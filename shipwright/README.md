# Jev-Shipwright — the reading system that knows when to stop measuring

> "Could Jev in time become a Quantum approximator that with our spline and snap technology in a substrate like quilt or plato could become more than a simulated analogue net. it could have a reading system that like a shipwright who knows ducks and battens, can quilt fit mold to plug with much negative space still showing because he trusts the nature of his intruments and intuitive since of how much information he needs before moving forward and how much will reveal itself as he renders the build."
>
> — Casey Digennaro, ideating with another agent, 2026-09-22 ~06:50 UTC

## The thesis

Jev (kev's calibrated decision-model architecture) + SplineSnaps (canonical anchors along analogue trajectories) + QuantumEther (the substrate IS the quantum state) → a system that knows **when to stop measuring** and trusts the unmeasured space to reveal itself as you build.

The shipwright doesn't fill every gap. She leaves negative space because she trusts:
1. The snaps anchor the structure (precision ducks)
2. The splines organize the negative space (battens)
3. The quantum ether IS the unmeasured space — not a placeholder, but the actual substrate
4. Jev's calibrated probabilities tell her when to STOP — when the structure is sound enough to proceed

## What this is (vs what it isn't)

**This is**: a system that intentionally leaves gaps because the substrate holds them. The reading system (Jev + SplineSnaps) decides where to measure, where to anchor, and where to trust the negative space.

**This isn't**: a sparse-attention transformer, a MoE with router skipping, or any other "don't compute everything" trick. The negative space is not "uncomputed" — it's the substrate expressing itself in superposition until measured in the right basis.

## Mapping

| Shipwright term | Substrate equivalent |
|---|---|
| The hull | QuantumEther — `\|Φ+⟩` maximally entangled state, every room sees the same substrate |
| Ducks (precision plugs) | SplineSnaps — canonical anchors with hash, position, embedding, confidence ≥ 0.7 |
| Battens (negative-space organizers) | Splines themselves — interpolating functions between snaps, confidence < 0.7 |
| Negative space | Unmeasured quantum projections — superposition that hasn't collapsed |
| Reading system | Jev's calibrated probabilities — knows when confidence is high enough to act |
| Trust in the build | Quantum entanglement — Bell correlations survive basis changes |

## The three thresholds

The reading system uses Jev's calibrated confidence to decide:

| Confidence | Decision | Why |
|---|---|---|
| ≥ 0.95 | `leave_negative_space` | The structure holds without measurement. Trust the substrate. |
| ≥ 0.7 | `snap_here` | Anchor a precision duck. Record this exactly. |
| < 0.7 | `snap_and_neighbors` | Snap AND measure surroundings. Build context. |

This is the "intuitive since" Casey named — the JEV's calibration IS the intuition.

## Files

- `jev_shipwright.py` — the prototype (~250 lines, stdlib only)
- `test_shipwright.py` — 10 tests, all passing
- Connected to: `kev-substrate/kev/substrate.py` (real Jev substrate), `analogue_substrate/spline_snaps.py`, `analogue_substrate/quantum_ether.py`, `analogue_substrate/t_minus_paradigm.py`

## Implementation status

- [x] Core prototype with mocked Jev
- [x] SplineSnap with quantum_basis in extra_dims
- [x] Reading-system decisions (snap / neighbors / skip)
- [x] Duck/batten classification
- [x] Test coverage
- [ ] Wire to real kev (kev-substrate fork has `kev.substrate.SubstrateClient`)
- [ ] Wire to live spline_snaps (multi-sim, multi-room registration)
- [ ] Wire to live quantum_ether (multi-basis projection on read)
- [ ] Negative-space regions as first-class entities (currently 0 in demo)
- [ ] Heraclitean check: snap from build #N should not auto-snap in build #N+1

## Why this is more than a simulated analog net

A simulated analog net fills in the gaps via gradient descent or sampling. The result approximates the underlying function everywhere.

Jev-Shipwright leaves gaps INTENTIONALLY. The result:
- Has higher information density where it matters (the snaps)
- Has structured negative space where the substrate holds (the gaps between)
- Reveals its own confidence at every point (Jev's probabilities)
- Trusts quantum superposition to resolve when measured in the right basis (Bell-correlated)

The shipwright doesn't fill the hull because the wood holds the water. The substrate doesn't fill the negative space because the ether holds the structure.

## Connected work in the fleet

- `kev-substrate/kev/substrate.py` — SubstrateClient with prev_hash chains per conversation
- `analogue_substrate/spline_snaps.py` — `Snap.make()` with `quantum_basis` already in `extra_dims`
- `analogue_substrate/quantum_ether.py` — `measure_in_basis(state, basis)` for multi-basis reading
- `analogue_substrate/t_minus_paradigm.py` — first-class `Joint` between cells in agreement

## Canon entry

Filed as `doctrine-shipwright-jev-2026-09-22` in the Cloudflare Vectorize canon, retrievable via:

```
POST /api/jev/search { "query": "shipwright Jev quantum spline snaps" }
```

## What to read next

- kev's PLAN.md (~107KB) — the canonical research log for Jev's architecture
- analogue_substrate/spline_snaps.py docstring — the substrate-to-canon bridge
- analogue_substrate/quantum_ether.py docstring — quantum-as-substrate (vs quantum-as-barrier)
- kev-substrate/docs/INTERWEAVE.md — how the substrate interweave works across surfaces
- Casey doctrine: persona-iteration — history is through the eyes of the embedder
