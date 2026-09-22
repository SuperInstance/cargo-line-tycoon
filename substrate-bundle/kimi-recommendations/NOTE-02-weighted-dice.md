# NOTE-02 — Weighted dice as a first-class operation

**Idea-branch:** `weighted-dice`

## What exists (cited)

- The JEPA tutor (SESSION_SUMMARY): ridge regression on
  bge-large-en-v1.5 embeddings predicts the next canon state from k=5
  past states; in-distribution mean cosine 0.8865; thresholds 0.85/0.75
  are the calibrated JEV-equivalent gates.
- JEV_AS_DIRECTOR: `jev.decide(options, rubric)` returns
  `{value, reason, score}` — an *acceptance gate* over a fixed option
  set. The dice exist inside the decision; the weights are implicit in
  the score.

## The way-different bet

Casey: *"JEV is an output approximator that can weight dice.
Weighted-dice could be done with JEPA or JEV, and together they add
more dimensions."*

Today the substrate can **gate** a decision. It cannot yet **produce**
one. Make the dice explicit:

```
DICE(cell_id, tick t):
  weights:  JEV-spread  = set-similarity of each candidate's recent
            observation signature against the population (waveform,
            one pass — see NOTE-03)
  forecast: JEPA-weights = tutor's distribution over next canon states
  dims:     JEV says "how wide", JEPA says "which way" — together the
            simplex is 2-parameterized instead of guessed
  roll:     drawn from substrate-rng (already receipted in the
            4quilt family — DrawLedger pattern)
  receipt:  EFFECT(dice_roll, {weights, forecast, draw_ref, outcome})
```

The audit trail then answers questions no LLM transcript can: *"Why did
the Director call on the quiet student?"* — because the dice said so,
the weights are in the chain, the draw is hash-chained, and anyone can
replay it. Stochastic pedagogy becomes **double-entry**: every weighted
outcome has its weights and its roll on record.

This is also the honest way to use LLMs in a canon: the LLM proposes,
the dice dispose — and the disposal is receipted.

## Smallest first build (one evening)

- `substrate/ts/dice.ts`: `weight(candidates, jevSpread, jepaForecast)`,
  `roll(weightedSimplex, rng)` → books EFFECT with the full weight
  vector (small: ≤ options) + the draw's ledger row reference.
- Test: same seed → same outcome, chain verifies; different forecast →
  different outcome distribution over 1000 rolls (chi-squared sanity).

## Value × feasibility

- **Value:** turns every "the AI decided" into "here are the weights,
  here is the roll" — publishable-grade evidence hygiene, and the
  substrate's first *generative* primitive (everything so far is
  bookkeeping + gating).
- **Feasibility:** medium-high. Weight computation needs a JEV-spread
  function over observation signatures (NOTE-03's shingle pass). The
  roll itself is trivial given substrate-rng's receipted draws.

## Open questions to the lane

1. Where do dice belong in the 11-opcode framing — a 12th opcode
   (`WEIGHT`), or `EFFECT(dice_cell)` with a reserved kind? The canon
   is load-bearing; I default to reserved-kind EFFECT.
2. Is JEPA-forecast coupling acceptable at this layer, or do we keep
   dice pure-JEV and let callers mix? I lean caller-mixes (substrate
   stays dumb).
3. Do we cap the weight vector size in the receipt (say 64 options), or
   hash-commit to a large vector and store it elsewhere?
