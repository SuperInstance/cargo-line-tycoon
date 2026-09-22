# motif-quilt

> Quilt-first adaptation of [SuperInstance/Motifcode4quilt](https://github.com/SuperInstance/Motifcode4quilt).
> Motif agents (explorer, reviewer, tester) operate on **substrate cells**, not files.

## Why?

Motifcode4quilt is a coding agent harness for Motif-3. Its agents edit files.
For **quilt-first thinking**, the cell is the irreducible unit, so the agents
should edit cells, not files.

Every cell patch creates a new cell with `prev_hash` pointing to the old one.
Nothing is deleted. Every patch is observable. Every patch is traceable.

## Tools

| Tool | What it does |
|---|---|
| `cell_read(cell_id)` | Read a substrate cell |
| `cell_patch(cell_id, state)` | Create new cell with prev_hash → old |
| `cell_bash(cell_id, cmd)` | Run cmd, record as witness |
| `cell_term(cell_id, cmd)` | Long-running bash |
| `cell_skill(cell_id, name)` | Invoke skill, record as witness |
| `cell_task(cell_id, agent)` | Spawn subagent on cell |
| `cell_done(cell_id)` | Mark cell done |

## Agents

- `cell-explorer` — read-only cell reconnaissance
- `cell-reviewer` — correctness review of cell changes (checks prev_hash chain)
- `cell-tester` — run tests on cell logic, fix via cell_patch

## Files

- `CANON.md` — Layer C join declaration
- `docs/MOTIF_QUILT_INTERWEAVE.md` — design doc
- `tools/cell_tools.py` — Python tool implementations
- `agents/cell_agents.py` — CellAgent dataclass + 3 agents
- `agents/test_agents.py` — 5 tests (all pass)
- `prompts/cell_explorer.md` — system prompt

## Run

```bash
cd motif_quilt/agents
python3 -m unittest test_agents.py  # 5/5 pass
```

## See also

- [SuperInstance/Motifcode4quilt](https://github.com/SuperInstance/Motifcode4quilt) — source
- [SuperInstance/kev-substrate](https://github.com/SuperInstance/kev-substrate) — substrate wrapper
- [SuperInstance/cargo-line-tycoon](https://github.com/SuperInstance/cargo-line-tycoon) — the bundle
- `motifs/` — substrate cell in many languages
- `composite_jev/` — multi-agent JEV competition
