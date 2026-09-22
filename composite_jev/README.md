# Composite-JEV: cross-pollination of composite-headspace + JEV substrate

> Two parallel reasoning shells compete, collaborate, and converge — the substrate holds them together.

## What this is

**Composite-JEV** = [`composite-headspace`](https://github.com/SuperInstance/composite-headspace)'s dual-shell architecture (June 2026) + [`TYPESAFEAI` JEV](https://api.typesafe.ai) (Sept 2026 substrate) + Qwen/DeepSeek/Kimi as fast/mid/bass shells.

The cross-pollination:

| composite-headspace concept | Composite-JEV mapping |
|---|---|
| Shell A (bass, slow, t-minus 5) | JEV (calibrated decision model, sub-bass) |
| Shell B (treble, fast, t-minus 0) | Qwen or DeepSeek (free-form LLM, treble) |
| Frequency bands (sub-bass → ultrasonic) | Agent specialties (deep → rapid) |
| a-box emission | Substrate cell record |
| Symmetry-Dissonance loop | Judge agent scoring (JEV preferred when confidence > 0.5) |
| Headspace (coordinator) | CompositeJEV class |
| T-minus cueing | Parallel asyncio dispatch with phase_delta offset |
| Shell competition/collaboration/convergence | The friendly competition framework |

## How it works

1. **Define shells**: JEV (deep, calibrated) + Qwen/DeepSeek/Kimi (fast/mid/bass, free-form)
2. **Cue both shells** with the same task — JEV gets structured `questions`, LLM gets free-form `prompt`
3. **Run in parallel** via asyncio + ThreadPoolExecutor (JEV and LLM are both HTTP)
4. **a-box emission**: each shell returns its result as an ABox with confidence + reasoning
5. **Symmetry detection**: heuristic agreement score + preferred-shell logic (JEV wins when confidence > 0.5)
6. **Substrate record**: each run posts a cell to the substrate (TODO: wire to substrate worker)

## Why this matters

Casey's 2026-09-22 directive: "have agents work in friendly competition for the best quality code, documentation playtesting and further research and novel ideas to experiment and test."

Composite-JEV is the implementation:
- JEV's calibrated probabilities are the **scoring substrate**
- Qwen/DeepSeek provide **fast ideation alternatives**
- The composite detector decides when to **trust JEV vs trust the LLM**
- The substrate holds the **witness log** of every competition

## Demo output

```
======================================================================
COMPOSITE-JEV: composite-headspace × JEV substrate
======================================================================
Shell A: JEV (sub-bass deep architect) (t-minus 0)
Shell B: Qwen (treble pattern matcher) (t-minus 0)

Task: A customer message: "I ordered a shirt 3 weeks ago, tracking shows...

======================================================================
SYMMETRY REPORT
======================================================================
Shell A: shell-jev
Shell B: shell-qwen
Agreement score: 0.015  # low — different vocabularies
Preferred shell: shell-jev  # JEV has higher confidence (0.65)
Synthesis: Agreement: 0.01. Shell A confidence: 0.65. Shell B confidence: 0.00.

Shell A (JEV) result:
  dept: billing (prob 0.49)
  urgent: 1.23/2 (prob 0.77 → score 1)
  sentiment: angry

Shell B (Qwen) result:
  dept: shipping
  urgent: 2
  sentiment: angry
```

Same task, two different "dept" answers. JEV prefers `billing` (refund = billing dept), Qwen prefers `shipping` (lost package = shipping dept). Both agree on urgency and sentiment. Composite-JEV picks JEV because its calibrated confidence is higher.

## Files

- `composite_jev.py` — the cross-pollinated framework (~200 lines, async)
- `test_composite_jev.py` — 9 tests, all passing (stdlib only)
- `README.md` — this file

## Related

- `composite-headspace` (June 2026) — the source architecture
- `TYPESAFEAI / JEV` — the calibrated decision model
- `equipment-consensus-engine` (March 2026) — Pathos/Logos/Ethos multi-agent deliberation
- `kev-substrate-mojo` — the Mojo port of the substrate interweave
- `competition/run_real_competition.py` — the simpler competition framework
- `fleet_archaeology/` — the pre-cursor repos identified

## Future work

- Wire substrate worker so every CompositeJEV run posts a cell with prev_hash chain
- Add Kimi (bass, slow reasoning) as a third shell
- Use JEV's wavefunction interference to compute agreement instead of Jaccard
- Add human-in-the-loop gate for low-confidence runs (composite-headspace's pattern)
- Implement shell "phase groups" (all shells in same group fire together)

— Filed by Mavis, 2026-09-22
