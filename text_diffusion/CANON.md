---
canon: 1
name: text-diffusion
mission: "Text generation via substrate mitosis — cells grow by dividing, like stem cells in an egg, breaking the model token limit."
state: working
family: applications
vessel: SuperInstance
born_from: [casey-2026-09-22, jev_diffusion, motifs]
canonical_docs: [README.md]
ledger: git-log
verified: 2026-09-22
---

# text-diffusion

> Substrate mitosis for text. The cell is the egg. The model grows by division.

## The doctrine

LLMs have `max_tokens` limits. Substrates don't. So when an idea grows beyond
the model's container, we divide the cell, not extend it.

Cells grow along two axes:
- **Columns**: more content within the cell (extend)
- **Lines**: cell divides into daughters (mitosis)

Both are observable via prev_hash chains.

## Mitosis protocol

1. Genesis cell seeded by LLM
2. Critic LLM scores: coherent / complete / specific / growth_potential
3. JEV decides WHERE to split (schema-constrained)
4. Cell divides into 2 daughters (with prev_hash → parent)
5. Each daughter extended by LLM (column growth)
6. Recurse until max_depth or stable
7. Assembly: only LEAF cells (no children) in DFS order

## Files

- `text_diffusion.py` — the mitosis engine
- `test_text_diffusion.py` — 6 unit tests
- `final_work.txt` — "Fen" 1890-word story
- `demo_report.json` — cell lineage

## Status

- [x] Mitosis engine implemented
- [x] Critic loop with 4-dimension scoring
- [x] JEV-driven split point decision
- [x] Prev_hash chain integrity
- [x] Leaf-only assembly (no parent duplication)
- [x] 6/6 unit tests pass
- [x] Real demo: 1890-word short story "Fen"
- [ ] Multi-paradigm mitosis (other LMs besides qwen/deepseek)
- [ ] Interactive editing (human can intervene at split points)
- [ ] Critique-driven re-mitosis (if a daughter splits poorly, re-divide)

## Canon chain

Part of:
- `doctrine-shipwright-jev-2026-09-22` (cell decisions)
- `doctrine-jev-revelation-2026-09-22` (JEV drives splits)
- `doctrine-motif-quilt-2026-09-22` (agents operate on cells)
- `doctrine-text-diffusion-2026-09-22` (THIS — cell mitosis)
