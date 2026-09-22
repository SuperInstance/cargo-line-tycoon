# NOTE-03 — The Echogram: waveform inference over the canon

**Idea-branch:** `echogram`

## What exists (cited)

- JEPA tutor: predicts *the* next canon state — one point estimate per
  tick, scored by cosine. It's a particle: one position, one velocity.
- 50k-student stress runs: 1.2M observations. The instrument that reads
  them is a scalar threshold.

## The way-different bet

Casey: *"JEV is unique in the ability to spread across cells at the
same time like a waveform instead of particles… turn the ping into the
echogram and the noise into the fish making the sound."*

So: score **every plausible next state in one pass**, as a distribution
over canon cells. Jaccard-style set signatures make this natural: an
observation's payload shingled into a set (hash-trigrams over canonical
JSON), compared against every candidate cell's signature in one sweep —
set operations are the waveform: all cells at once, no per-cell loop.

```
ECHOGRAM(tick t):
  ping:    the last observation's shingle set
  sweep:   Jaccard(candidate.signature, ping) for ALL cells — one pass
  echo:    the full distribution, not argmax
  fish:    cells with LOW but RECURRING probability across ticks
           = emerging canon (today's "noise" that keeps making sound)
```

Two new instruments fall out:

1. **The classroom radar.** A student whose observation stream's novelty
   (distance from the class's own recent waveform) rises is exploring —
   or breaking. The teacher-agent sees it on the radar *before* the
   assessments degrade. This is anomaly detection on behavior, not
   outcomes.
2. **The echo-chamber alarm.** Apply the same sweep to the AI-Writings
   canon: when the fleet's own field notes stop being novel against
   their history, the meter says so. Novelty of the *system about
   itself* becomes measurable.

"Noise into fish": in the stress sims, 1.2M observations mostly look
like nothing. The echogram says otherwise — recurring low-probability
patterns (a student circling a concept, a locale drifting from its
canon) are fish: signal that a particle filter (argmax threshold) never
sees.

## Smallest first build (one evening)

- `substrate/py/echogram.py`: shingle an observation payload (fnv1a64
  trigrams — canon-stable), one-pass Jaccard sweep over candidate cells,
  return the distribution + the recurring-low list.
- Test on a stress-run fixture: the distribution sums to ~1; a seeded
  recurring pattern shows up in the fish list.

## Value × feasibility

- **Value:** turns the substrate from a ledger you query into an
  instrument you read. The 5s TICK already emits the ping; the echogram
  is the same ping, spread.
- **Feasibility:** high. Pure Python/TS, no deps beyond what the ports
  carry. The shingle pass is embarrassingly parallel if the cell count
  grows.

## Open questions to the lane

1. Cell signatures: computed on write (stored) or on read (recomputed)?
   Stored = cheap reads, hash-commitment consistency burden; on-read =
   honest but O(cells) per tick. I lean stored-with-lazy-recompute.
2. Should the echogram be per-room, per-locale, or global? The
   polyformalism claim (same cell address everywhere) suggests one
   global sweep with locale filters.
3. Is there an appetite for a small viz (the actual echogram image —
   range × tick, like a sonar waterfall) in apps/classroom-*? It would
   make "the noise is fish" visceral for the pedagogy papers.
