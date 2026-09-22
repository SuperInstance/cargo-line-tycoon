# Motif-Quilt Interweave

The cross-pollination of `Motifcode4quilt` (Sept 22, 2026) with the Quilt substrate.

## The pattern

Motifcode4quilt is a coding agent harness for Motif-3. Its agents:
- explorer (read-only)
- reviewer (read-only)
- tester (run + fix)

For quilt-first thinking, the agent's tools become **cell-aware**.

## Tool mapping

| Motif tool | Quilt-first tool | What it does |
|---|---|---|
| `read(path)` | `cell_read(cell_id)` | Read a substrate cell |
| `apply_patch(path, ...)` | `cell_patch(cell_id, state)` | Create new cell with prev_hash → old |
| `bash(cmd)` | `cell_bash(cell_id, cmd)` | Run cmd, record as witness on cell |
| `term(cmd)` | `cell_term(cell_id, cmd)` | Same as bash, longer timeout |
| `skill(name)` | `cell_skill(cell_id, name)` | Invoke skill, record as witness |
| `task(agent)` | `cell_task(cell_id, agent)` | Spawn subagent on cell |
| `done()` | `cell_done(cell_id)` | Mark cell done |

The tool ordering matches Motif's: `done, bash, read, apply_patch, term, skill, task, mcp`.

## Agent mapping

| Motif agent | Quilt-first agent | Specialization |
|---|---|---|
| explorer | cell-explorer | read-only cells, JEV search |
| reviewer | cell-reviewer | correctness review of cell changes, prev_hash chain integrity |
| tester | cell-tester | run tests on cell logic, fix via cell_patch |
| (none) | cell-publisher | publish cell to substrate worker |

## Why quilt-first?

When a Motif agent edits a file, the change is unobservable. When a quilt agent
patches a cell, the prev_hash chain makes the change:
- **Observable** — JEV can search for it
- **Queryable** — witness-log contains the change context
- **Traceable** — prev_hash chain shows the history
- **Composed** — multiple cells can be linked into a graph

The cell is the irreducible unit. The agent operates on cells, not files.

## Connection to other doctrines

- **Substrate cell doctrine**: cell = irreducible unit, this is the operationalization
- **CUDACLAW**: many cells, peer-to-peer, no central coordinator
- **Composite-JEV**: each cell can be the result of a multi-agent competition
- **Wavefunction JEV**: each cell is a measurement of the quantum substrate

## The cell_patch is the key innovation

Unlike `apply_patch` (overwrites the file), `cell_patch` creates a NEW cell with
`prev_hash` pointing to the old one. This means:

- Every patch is observable (it's a new cell, not a destruction)
- Every patch is traceable (the prev_hash chain shows what was patched)
- Every patch is composable (multiple patches create a graph)
- Nothing is deleted (no-deletion doctrine preserved)

This is the no-deletion doctrine in operational form.

## Files

- `tools/cell_tools.py` — Python cell tool implementations
- `agents/cell_agents.py` — CellAgent dataclass + 3 built-in agents
- `agents/test_agents.py` — 5 tests
- `prompts/cell_explorer.md` — cell-explorer system prompt
- `CANON.md` — Layer C join declaration

## Status

- [x] CANON.md
- [x] Cell tools implemented
- [x] Cell agents ported (3)
- [x] Tests pass (5/5)
- [ ] Integrate with Motifcode4quilt's actual TypeScript loop
- [ ] Add MCP tools (browser/playwright/curl)
- [ ] Wire to real substrate worker
