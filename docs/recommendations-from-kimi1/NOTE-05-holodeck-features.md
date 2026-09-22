# NOTE-05 — Holodeck features: generate from novelty hotspots, not only votes

**Idea-branch:** `holodeck`

## What exists (cited)

- Conscription loop (JEV_AS_DIRECTOR): player feature_requests →
  witness-log → N+ students converge → JEV promotes → coder cron ships.
  Features are pulled by *stated demand*.
- 50k-student stress: the sim knows where behavior gets weird
  (7 patches shipped from sim anomalies — evidence the instrument
  already works).
- apps/classroom-* : the UI surface where generated features land.

## The way-different bet

Casey: *"Like the holodeck, procedurally generate as features are
needed."*

The current loop answers *"what did students ask for?"* The holodeck
loop answers *"where is the game being pushed against its own edges?"*
Same witness-log, different reader:

```
HOTSPOT SCAN (weekly cron):
  echogram sweep (NOTE-03) over the last epoch's observations
  → cells/regions with sustained HIGH waveform-novelty
  → = students spending real effort at the frontier of the canon
  → conscription cron generates a feature THERE:
      a new station, cargo type, lesson branch, locale-specific room
  → ships like any promoted feature_request
```

The difference is the source of truth: votes measure *frustration and
eloquence* (loud students win); hotspots measure *engaged exploration*
(quiet frontier-pushers win). For a pedagogy substrate, that's not a
preference — it's the mission. The Confucian framing says the elder
watches who struggles *productively*; the echogram is that watch,
mechanized.

And it's how the holodeck actually behaves on screen: the room doesn't
ask Riker what he wants; it reads the scenario and materializes the
next constraint where the story is being tested.

## Smallest first build (one evening + a stress fixture)

- Extend the existing conscription cron: a second source,
  `hotspots = echogram.recurring_low(last_epoch)`, merged with
  feature_requests by the same JEV promotion gate.
- Ship ONE generated feature from a stress-run hotspot as proof
  (even a renamed room or a new cargo flavor counts).

## Value × feasibility

- **Value:** features appear where students are *learning hardest* but
  not complaining — the gap no survey instrument catches. Over epochs,
  the game's map grows toward its own frontier, like a city.
- **Feasibility:** medium. Needs NOTE-03's echogram; the cron and
  promotion gate exist. The risk is novelty ≠ need (a bug also spikes
  the waveform) — mitigation: human/agent review of the hotspot list
  before generation, same as feature_requests get.

## Open questions to the lane

1. Merge policy: should hotspots and votes compete in one JEV gate, or
   have separate budgets (e.g., 2 vote-features + 1 hotspot-feature per
   epoch)? I lean separate budgets — they measure different things.
2. Does a hotspot-generated feature get attributed in the chain as
   `generated:hotspot` vs `requested:students`? I'd say yes — provenance
   of *why features exist* is exactly what the witness-log is for.
3. Scope guard: which regions are eligible for generation? The canon
   (pedagogy cells) should probably be vote-only; the world map
   (stations, cargo, rooms) hotspot-eligible.
