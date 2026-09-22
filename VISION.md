# The JEV-GAN Family: A Vision

> Casey (2026-09-22): "create new repos for these JEV defusion and GAN technologies. people desire to have them in a few forms for many different applications later"

## The 5 repos

```
jev-diffusion (Python, npm, Rust, PyPI, GitHub Pages)
  └─ substrate-segmented image description (JEV plans → LLMs render → critic iterates)

peanut-gallery (Python, npm)
  └─ multi-model adversarial creativity (producer + critics + JEV voting)

madlibs-gan (Python, npm)
  └─ higher-abstraction Madlibs (paradigms with slots, models fill them)

paradigm-edges (Python)
  └─ systematic edge case discovery (where models break)

jev-gan (umbrella)
  └─ composes all of the above
```

## The 4 paradigms

| Paradigm | Slots | Use case |
|---|---|---|
| image_description | target, regions, mood, palette, lighting, composition | JEV-Diffusion |
| code_function | name, inputs, output, algorithm, edge_cases, tests | Code generation |
| story_arc | protagonist, antagonist, setting, conflict, climax, resolution | Story writing |
| math_proof | theorem, axioms, lemma, proof_steps, qed | Formal proofs |

## The substrate cell as unit

Every output is a substrate cell:
- `cell_id`: unique
- `prev_hash`: chain link (audit trail)
- `hash`: FNV-1a 64-bit (`0x24a555471370b18d` for `café Δ 日本語`)
- `content`: the actual output
- `metadata`: model, score, round, etc.

## The composite pattern

```
JEV decides ─┐
             ├─→ substrate cell (the output)
Qwen does   ─┤
             │
DeepSeek does┤
             │
Kimi does   ─┘
```

Multiple models + JEV voting = robust output. Each model contributes a cell.
The substrate records who did what, when, and how well.

## The 6 atomic operations

1. **plan**: JEV decides what to do
2. **segment**: substrate becomes cells
3. **render**: LLMs fill the cells
4. **critic**: another LLM scores
5. **vote**: JEV + JEPA decide
6. **canonize**: winning cell becomes canon

## The cross-cutting properties

- **No deletion**: every cell persists with prev_hash
- **Observable**: every cell is queryable in the substrate worker
- **Composable**: cells chain via prev_hash, can be shared
- **Reproducible**: same input + same seeds = same cells
- **Auditable**: full witness-log of who did what

## The shipping strategy

| Form | Repo | Status |
|---|---|---|
| Python engine | SuperInstance/jev-diffusion | ✓ |
| Web studio | SuperInstance/jev-diffusion/studio/ | ✓ GitHub Pages |
| npm package | @superinstance/jev-diffusion | ✓ v0.1.0 |
| Rust bindings | SuperInstance/jev-diffusion-rust | ✓ |
| PyPI source | SuperInstance/jev-diffusion-pypi | ✓ (workaround) |
| CLI wrapper | @superinstance/jev-gan-cli | ✓ v0.1.0 |
| Peanut gallery npm | @superinstance/peanut-gallery | ✓ v0.1.0 |
| Madlibs npm | @superinstance/madlibs-gan | ✓ v0.1.0 |

## The 7 canon cells filed today

1. `doctrine-shipwright-jev-2026-09-22`
2. `doctrine-cudaclaw-2026-09-22`
3. `doctrine-fleet-archaeology-2026-09-22`
4. `doctrine-jev-revelation-2026-09-22`
5. `doctrine-motif-quilt-2026-09-22`
6. `doctrine-text-diffusion-2026-09-22`
7. `doctrine-jev-gan-family-2026-09-22`

## The "use everything" doctrine

The repos USE each other:
- `text_diffusion` extends cells when descriptions are too long
- `motif_quilt` operates on cells (cell_patch is mutation, cell_mitosis is division)
- `composite_jev` drives critic voting
- `peanut-gallery` runs adversarial competitions
- `madlibs-gan` generalizes the pattern
- `paradigm-edges` finds where it breaks
- `jev-gan` composes everything

Each is a substrate cell. Each composes via prev_hash. Each is auditable.

## The use cases

1. **Image description without an image generator** (JEV-Diffusion)
2. **Multi-model adversarial creativity** (peanut-gallery)
3. **Paradigm-driven generation** (madlibs-gan)
4. **Edge case discovery** (paradigm-edges)
5. **Cross-paradigm composition** (jev-gan)

## The next steps

- Wire HTTP /api/diffuse to substrate worker (worker v0.7.0)
- Add CellPatch + CellMitosis APIs to motif_quilt
- Publish paradigm-edges to npm
- Create @superinstance/jev-gan meta-package (depends on all 4)
- Compose all 4 in jev-gan umbrella tests
- Build the human-in-the-loop studio (interactive editing)
- Wire cross-paradigm mitosis (text + image + code in one chain)
