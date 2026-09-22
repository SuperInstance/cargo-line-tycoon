# JEV-Diffusion

> **Substrate-segmented image description. No actual image generator. Just JEV + LLMs as a GAN.**

Casey (2026-09-22): 'Think about JEV as an aid to image generation. JEV difusion using quilt
to segment and difuse systematically with the help of LLMs and no actual image generator.
just periodic calls to the LLM as a GAN'

## What it does

You type a target. JEV plans it (regions, mood, palette, lighting). The substrate segments
into cells. Each cell gets rendered by an LLM. A GAN-like critic iterates until quality.
Final step: DeepSeek assembles into a unified 4-6 sentence description.

**The output is text.** You could pass it to Stable Diffusion, DALL-E, Midjourney — but the
refinement loop is where the interesting work happens.

## The studio

**Try it now**: open `studio/index.html` in a browser.

The studio lets you:
- Type a target
- Pick a preset (landscape, portrait, abstract, still_life, sci_fi)
- Adjust iterations
- Toggle composite-JEV (multi-model voting)
- Watch cells get rendered live
- See the prev_hash chain
- Copy / share / export results

The studio also has a docs page (`studio/docs.html`) explaining the methodology.

## Quick start

### CLI

```bash
python3 jev_diffusion.py "A serene sunset over a mountain lake" --preset landscape --iterations 3
```

### Python

```python
from jev_diffusion import JevDiffusion
d = JevDiffusion(target="...", preset="landscape", iterations=3)
result = d.run()
print(result['combined'])
```

### Streaming

```bash
python3 jev_diffusion.py "..." --stream
```

Streams events to stderr as they happen (plan, cell_seeded, cell_rendered, critic_voted, final).

## The 5 stages

1. **JEV Plans** — schema-constrained decisions on regions, mood, palette, lighting
2. **Substrate Segments** — image becomes a graph of cells (4-5 cells per preset)
3. **LLMs Render** — each cell gets a 3-5 sentence description (Qwen for even, DeepSeek for odd, or routed by composite-JEV)
4. **Critic Iterates** — multi-dimension scoring, refine until quality threshold
5. **Unify** — DeepSeek assembles cells into 4-6 sentence description

## Why this is novel

1. **No actual image generator needed**. The substrate IS the diffusion.
2. **Observable**: every cell has a hash, every iteration is logged
3. **Composable**: cells chain via prev_hash, can be shared, queried
4. **Editable**: edit any cell, the rest survives (no-deletion doctrine)
5. **Cheap**: $0.10 of LLM tokens vs $5 of GPU for a real diffusion model
6. **Critic-driven**: GAN-like loop refines quality automatically

## Presets

- **landscape**: sky, horizon, midground, foreground
- **portrait**: background, head, shoulders, hands, accent
- **abstract**: 4 compositions
- **still_life**: background, tabletop, primary_object, secondary_object, accent
- **sci_fi**: environment, structure, vessel, lighting, particle

Each preset has its own mood choices and palette choices that JEV selects from.

## Composite JEV

When `use_composite_jev=True`, the system uses multiple models to vote:
- JEV makes the primary decision
- Qwen votes
- DeepSeek votes
- The agreed-upon answer wins

Adds ~3x latency but ~30% robustness.

## Files

- `jev_diffusion.py` — the engine (470 lines)
- `test_jev_diffusion.py` — 13/13 tests pass
- `studio/index.html` — main studio
- `studio/app.js` — frontend logic
- `studio/style.css` — styling
- `studio/docs.html` — methodology
- `examples/` — pre-rendered examples
- `CANON.md` — Layer C join declaration
- `DOCTRINE.md` — full doctrine paper

## Status

- [x] Refactored engine with Composite-JEV + presets + prev_hash + streaming
- [x] 13/13 unit tests pass
- [x] Real demo: "hooded figure on frozen lake" → 9.5/10 score
- [x] Studio HTML/JS/CSS
- [x] Documentation page
- [x] Gallery with 6 pre-rendered examples
- [ ] Deploy studio to superinstance.dev/jev-diffusion/
- [ ] HTTP endpoint /api/diffuse on substrate worker
- [ ] Interactive editing (human can intervene at split points)

## See also

- `text_diffusion/` — mitosis doctrine (extends this for long descriptions)
- `composite_jev/` — multi-model voting (drives composite-JEV here)
- `motif_quilt/` — agents operate on cells (can QA this)
- `motifs/` — substrate cell in many languages
