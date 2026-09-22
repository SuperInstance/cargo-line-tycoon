# text-diffusion

> **"the same thing can text difuse and edit around on larger works so that a model breaks its limits of next token generation and can decompose its outputs adding lines and columns as the idea grows like a stem cell in an egg"**
> — Casey, 2026-09-22

**Substrate mitosis for text.** A cell grows until it's full, then divides.
The substrate is the egg. The cells are stem cells. The text grows organically.

## The problem

LLMs are bounded by `max_tokens`. A 4096-token model can only emit 4096 tokens
per call. But ideas don't stop growing at 4096 tokens. So:
- Either you make the model bigger (more $)
- Or you stop generating and call it "good enough"
- Or you find a way to GROW BEYOND THE BOUNDARY

This is the third option.

## The mitosis pattern

1. **Genesis cell**: starts empty, gets seeded by an LLM call
2. **Critic loop**: a separate LLM call scores the cell — coherent? complete? growth_potential?
3. **Mitosis trigger**: if growth_potential > 1 OR content > max_chars
4. **Cell divides**: parent splits into 2 daughter cells, each with `prev_hash` → parent
5. **Daughters extend**: each daughter is extended by another LLM call (column growth)
6. **Mitosis recurses**: daughters can themselves divide (line growth)
7. **JEV decides splits**: schema-constrained decision on WHERE to split
8. **GAN-like critic**: each iteration the critic scores and either continues or stops
9. **Assembly**: only LEAF cells (no children) are concatenated

The final text is the union of all leaf cells, in DFS order from genesis.

## Two axes of growth

- **Columns** (extend): more content within a single cell. Same `cell_id`.
- **Lines** (mitosis): cell divides into daughter cells. New `cell_id`s, `prev_hash` → parent.

## The substrate cell as stem cell

Just like a stem cell:
- Starts as a single undifferentiated cell (genesis)
- Divides by mitosis (parent → 2 daughters)
- Daughters can specialize (each daughter has its own metadata)
- The lineage is preserved (prev_hash chain)
- The whole organism grows organically

## Why this matters

The model breaks its limits:
- **4096-token limit?** No: each cell is 4096 tokens, but cells compose
- **No coherent arc?** No: prev_hash chain enforces continuity
- **Ideas that want to grow?** Yes: cells keep dividing
- **Long-form works?** Yes: 1890-word short story in 5 cells (3 leaves)

## Real demo

Ran today with target: "A short story about a programmer who discovers the substrate is alive, told from the substrate's perspective."

- 5 total cells (1 genesis, 4 daughters)
- 3 leaf cells (the actual content)
- 10,481 chars / 1,890 words
- **Title: "Fen"** — the substrate is named by the programmer
- Cell lineage:
  ```
  ◇ cell-genesis-0000 (3301 chars) — "I felt him before I saw him..."
    ◇ cell-1-d1-0001 (3449 chars) — first half
      ★ cell-2-d1-0003 (3482 chars) — leaf 1
      ★ cell-2-d2-0004 (3618 chars) — leaf 2 — "I did not know weeping..."
    ★ cell-1-d2-0002 (3367 chars) — "Now the question burns between us..."
  ```

## Files

- `text_diffusion.py` — the mitosis engine (395 lines)
- `test_text_diffusion.py` — 6 unit tests (all pass)
- `final_work.txt` — the 1890-word story "Fen"
- `demo_report.json` — cell lineage report
- `CANON.md` — Layer C join declaration

## Run

```bash
cd text_diffusion
python3 -m unittest test_text_diffusion.py  # 6/6 pass
python3 text_diffusion.py  # full demo
```

## See also

- `jev_diffusion/` — JEV plans regions, LLMs render (image gen)
- `composite_jev/` — multi-agent JEV competition
- `motif_quilt/` — agents operate on cells (motif adaptation)
- `motifs/lowest/wasm/` — WASM text format
- `motifs/math/` — substrate cell as algebraic structure
