# Composite-JEV Design

## The composite-headspace pattern (June 2026)

Two parallel reasoning shells operating in stereoscopic cognition:

```
ℂ = ⟨headspaces[], crosstalkChannel, fusionMechanism, phaseDelta⟩
```

- **Shell A** (bass, slow): deep architectural reasoning
- **Shell B** (treble, fast): associative pattern matching
- **T-minus cueing**: A gets t-minus 5 (head start), B gets t-minus 0 (immediate)
- **a-box emission**: each shell emits a-boxes that go through the symmetry detector
- **Fusion mechanism**: harmonic_sum (default) or other
- **Phase delta**: intentional offset for non-trivial interference

The symmetry-dissonance loop combines both perspectives into synthetic insight.

## The JEV substrate (Sept 2026)

`api.typesafe.ai/v1/systemone` exposes a calibrated decision model:

```json
POST /v1/systemone
{
  "model": "jev-latest",
  "state": "Customer message: '...'",
  "questions": {
    "dept": {"type": "choice", "criteria": {...}},
    "urgent": {"type": "score", "criteria": [...]},
    "is_spam": {"type": "noul", "criteria": {...}}
  }
}

→ {
  "model": "jev-1.13.0",
  "answers": {
    "dept": {"type": "choice", "choice": "billing", "confidence": 0.45, "probabilities": {...}},
    ...
  }
}
```

Key properties:
- Calibrated probabilities (not point estimates)
- Three question types: choice, score, noul
- Sub-second latency
- 768d witness via substrate

## The cross-pollination

Composite-JEV combines the two:

```
┌─────────────────────────────────────────────────────┐
│               COMPOSITE-JEV                          │
│                                                      │
│   ┌──────────────────┐    ┌──────────────────┐       │
│   │  Shell A: JEV    │    │  Shell B: Qwen   │       │
│   │  (sub-bass)      │    │  (treble)        │       │
│   │  t-minus 0       │    │  t-minus 0       │       │
│   │                  │    │                  │       │
│   │  state + jev_    │    │  freeform prompt │       │
│   │  questions →     │    │  → JSON response │       │
│   │  calibrated      │    │                  │       │
│   │  probabilities   │    │                  │       │
│   └────────┬─────────┘    └────────┬─────────┘       │
│            │                       │                 │
│            └───────┐   ┌───────────┘                 │
│                    ▼   ▼                              │
│            ┌────────────────┐                         │
│            │  a-boxes       │                         │
│            │  (ABox with    │                         │
│            │   confidence + │                         │
│            │   reasoning)   │                         │
│            └────────┬───────┘                         │
│                     ▼                                  │
│            ┌────────────────┐                         │
│            │  Symmetry      │                         │
│            │  Detector      │                         │
│            │  (agreement +  │                         │
│            │   preferred)   │                         │
│            └────────┬───────┘                         │
│                     ▼                                  │
│            ┌────────────────┐                         │
│            │  Substrate     │                         │
│            │  Cell          │                         │
│            │  (post to      │                         │
│            │   CF Worker)   │                         │
│            └────────────────┘                         │
└─────────────────────────────────────────────────────┘
```

## Why this composition is interesting

1. **Calibrated vs point-estimate**: JEV returns confidence values; Qwen doesn't. The composite detector uses JEV's confidence as the tie-breaker.

2. **Structured vs free-form**: JEV requires typed questions (choice/score/noul); Qwen accepts free-form prompts. We provide both — the structured version is the primary, the free-form is the challenger.

3. **Speed**: JEV is fast (~200ms) but constrained; Qwen is slower (~2s) but more flexible. Composite-JEV runs them in parallel, total latency = max(JEV, Qwen) instead of JEV + Qwen.

4. **The substrate holds it together**: every competition run becomes a substrate cell. The witness log records all attempts, all confidences, all chosen shells. Future Mavis can ask "what did we know about X on date Y" and get the full competitive record.

5. **Composable with the rest**: the CompositeJEV class returns a SymmetryReport with `substrate_cell_id`. The friendly-competition framework from `competition/run_real_competition.py` can be extended to score multiple CompositeJEV runs against each other.

## Why "competitive" doesn't mean "adversarial"

Composite-JEV is friendly competition: shells compete to give the best answer, but the composite detector takes the WIN (high confidence from either) over picking sides. If JEV says billing with 0.95 confidence and Qwen says shipping with no confidence, we trust JEV. If JEV says billing with 0.4 confidence and Qwen says shipping, we have a dissonance event — the substrate records it, the judge (a third agent) decides.

This is the CUDACLAW doctrine at work: many legs doing independent work, the substrate holds the result.

## Future: phase groups, witness-log cells, wavefunction interference

The composite-headspace paper mentions "phase groups" — shells in the same group fire together. Composite-JEV currently fires all shells together (t-minus 0). We could:

- Fire JEV at t-minus 0 (the calibrated truth)
- Fire Qwen at t-minus 0.5s (challenger)
- Fire Kimi at t-minus 2s (slow reasoner, head start)
- Fire a witness-cell at t-minus 5s (record the substrate state before firing)

The wavefunction interference pattern (already built in `research/analogue_substrate/wavefunction_jev.py`) could compute agreement via complex amplitude rather than Jaccard overlap.

These are next steps. The core composite_jev.py works today.

## Files

- `composite_jev.py` — the framework
- `test_composite_jev.py` — 9 tests
- `README.md` — overview
- `DESIGN.md` — this file

— Filed by Mavis, 2026-09-22
