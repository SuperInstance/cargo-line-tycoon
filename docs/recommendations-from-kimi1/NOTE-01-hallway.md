# NOTE-01 — The Hallway: transition as a first-class, receipted state

**Idea-branch:** `hallway`

## What exists (cited)

- `docs/JEV_AS_DIRECTOR.md`: the Director ticks every 5s, reads
  witness-logs, and JEV-decides *who speaks next*. The decision is typed,
  scored, receipted. But the decision is about **who acts in a room** —
  movement between rooms is implicit.
- The 11 opcodes (`docs/DIALECTIC_IN_11_OPCODES.md`): BIND anchors a
  cell, LINK connects two cells, EFFECT invokes, VIEW reads. Nothing
  models a perspective *between* anchors.
- The 5s TICK loop gives us a natural clock: a perspective that is not
  in a room at tick *t* is — definitionally — in transition.

## The way-different bet

Casey's line: *"A perspective is only in one room at a time, otherwise
it's in transition… there's a moment where they are in a JEV then they
have Schrödinger's cat revealed and the dice actually land."*

So: **model the hallway explicitly.** When a perspective (student,
agent, teacher, cargo inspection officer — anything with a POV) moves
between rooms, do not teleport them. Create a hallway state:

```
HALLWAY(perspective P, tick t):
  candidates: {room R_i with weight w_i}
  weights: JEV(P's recent observation history × each R_i's recent activity)
  forecast: JEPA(P's trajectory) shifts the weights one tick forward
  state: NOT YET COLLAPSED — the cat is alive-and-dead over the candidate set
```

Then the landing:

```
LAND(P, R_j):
  dice: weighted by the hallway distribution — the collapse is the roll
  receipt: EFFECT(hallway_land, {perspective, from_distribution, chosen, w_j})
  departure room books its witness; arrival room books its witness
```

The receipt books **both the weights and the landing**. That is the
whole point: you can later audit not just where someone went, but *what
the dice looked like when they were thrown*. A student's odd trajectory
shows up as "they were 80% likely to go to the tutoring room and landed
in the exam room" — visible in the chain, not in a heuristic.

## Smallest first build (one evening)

- `substrate/ts/hallway.ts`: a `Hallway` class over the existing
  chain/TICK: `enter(perspective, candidates, weights)`,
  `land(perspective, chosen)` — booking EFFECT rows in the witness-log.
- One test: a perspective enters a hallway over 3 rooms, lands in one;
  the chain verifies; the distribution and the landing are both
  recoverable by VIEW.
- No JEPA integration yet (weights come in as a plain dict).

## Value × feasibility

- **Value:** every future anomaly-detector and pedagogy-analysis tool
  gets a new signal for free — *how* perspectives move, not just where
  they end up. The Director (JEV_AS_DIRECTOR) currently picks who acts;
  the hallway lets it pick *where they are while deciding*.
- **Feasibility:** high. Pure substrate, no new opcodes needed (BIND the
  hallway as a cell, LINK candidates, EFFECT the landing). The 4-language
  ports make it a canary-parity exercise.

## Open questions to the lane

1. Should the hallway be a *cell* (addressable, LINKable) or a transient
   signal type? Cell = auditable forever; signal = cheap. I lean cell.
2. Do we want hallway distributions readable by the classroom UI (the
   "who's coming to this room" indicator), or substrate-only for now?
3. The 11-opcode canon is load-bearing across 4 ports. Is a 12th
   (`TRANSIT`?) worth the port tax, or is hallway = BIND+EFFECT+EFFECT?
