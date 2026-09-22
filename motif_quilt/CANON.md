---
canon: 1
name: motif-quilt
mission: "Motifcode4quilt adapted for quilt-first thinking — Motif agents operate on substrate cells. The cell is the irreducible unit; the agent's tools are cell-aware."
state: scaffolded
family: applications
vessel: SuperInstance
born_from: [SuperInstance/Motifcode4quilt, SuperInstance/kev-substrate]
canonical_docs: [README.md, docs/MOTIF_QUILT_INTERWEAVE.md]
ledger: git-log
verified: 2026-09-22
---

# motif-quilt

> Quilt-first adaptation of Motifcode4quilt — Motif agents operate on substrate cells.

## The adaptation

`Motifcode4quilt` is a coding agent harness for Motif-3. Its agents:
- **explorer** — read-only reconnaissance
- **reviewer** — correctness review
- **tester** — run + fix tests

For **quilt-first thinking**, the agent's tools become **cell-aware**:

| Motif tool | Quilt-first tool |
|---|---|
| `read(path)` | `cell_read(cell_id)` |
| `apply_patch(path, ...)` | `cell_patch(cell_id, state, prev_hash)` |
| `bash(cmd)` | `cell_bash(cell_id, cmd)` |
| `term(cmd)` | `cell_term(cell_id, cmd)` |
| `skill(name)` | `cell_skill(cell_id, skill)` |
| `task(agent)` | `cell_task(cell_id, agent)` |

The agents themselves become cell-specialized:
- **cell-explorer** — read-only cells
- **cell-reviewer** — review cells with prev_hash consistency check
- **cell-tester** — run tests on cell logic

The cell is the irreducible unit. The agent operates ON cells, not files.

## Why?

In Motif, agents operate on files. In quilt, agents operate on cells. Cells have:
- An id (canonical)
- A prev_hash (chain link)
- A content hash (FNV-1a 64-bit, fleet canary)
- A state JSON
- A witness chain

When a Motif agent edits a file, the change is unobservable. When a quilt agent patches a cell, the prev_hash chain makes the change observable, queryable, and traceable.

## Files

- `README.md` — overview
- `docs/MOTIF_QUILT_INTERWEAVE.md` — design doc
- `tools/cell_tools.py` — Python implementations of cell_read, cell_patch, etc.
- `agents/cell_agents.py` — cell-specialized agents
- `prompts/cell_explorer.md` — cell-explorer system prompt

## Status

- [x] CANON.md
- [x] Architecture designed
- [x] Cell tools implemented
- [ ] All agents ported
- [ ] Integration with Motifcode4quilt harness
- [ ] Tests

## See also

- `Motifcode4quilt` — the source architecture (Sept 22, 2026)
- `kev-substrate` — the substrate wrapper
- `composite_jev` — dual-shell with JEV
- `motifs/` — the substrate cell in many languages
