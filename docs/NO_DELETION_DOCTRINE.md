# No-Deletion Doctrine — Casey Digennaro, 2026-09-22

> "We don't delete. Especially not ideations and creative works. These are slices of life and seeing the progress of versions is animating the past."

> "What we need to do is vectorize with timestamps that connect the maker to what they were making elsewhere to have that creative thought."

> "For orientation and understanding far more deeply than a state save, this is a recording in time in multidimension."

## What this doctrine means for the fleet

### 1. Archive, never delete
- When closing a PR, retiring a repo, or "superseding" canon → **preserve** as a snapshot
- Snapshots live in `SuperInstance/SuperInstance-archive/closed-prs/<date>/`
- Each snapshot includes: full diff, branch SHA, metadata, maker context

### 2. Each archived work carries maker context
Vectorized canon cells (via Cloudflare Vectorize) link:
- The maker to **what they were making elsewhere at that timestamp**
- **Other PRs/issues in flight** at archive time
- **Branches active in adjacent repos**
- The maker's **comments and reviews** on unrelated work

This is the "recording in time in multidimension" — work isn't isolated, it's contextualized.

### 3. Versions ARE the story
The progression from "first draft" → "rescue branch" → "polished canon" is itself canon. Removing any link destroys narrative continuity.

### 4. The progress animates the past
Query: *"What was Casey working on at 06:18 UTC on 2026-09-22?"*

Get back: not just the PR, but the surrounding web of context (other branches, comments, decisions). See the creative moment from multiple angles simultaneously.

### 5. State saves are insufficient
A single PR's state is a 2D shadow of the 4D creative event. The temporal+contextual vector is the real artifact.

## Implementation in the fleet

| Layer | What | Where |
|---|---|---|
| File archive | Full diffs with SHA + metadata | `SuperInstance/SuperInstance-archive/closed-prs/<date>/` |
| Canon entry | Maker-context summary + vector embedding | Cloudflare D1 + Vectorize |
| Marker IDs | `archive-<repo>-<pr>` and `doctrine-<name>-<date>` | D1 cells table |
| Recovery | `git fetch origin <head_sha>:recovered-pr-<num>` | per-archived-PR |

## What we DON'T do

- ❌ Close PRs as "duplicate" without archiving the duplicate's content
- ❌ Close issues as "stale" when they reference creative work
- ❌ Reorganize fleet by deletion — always Transfer to archive
- ❌ Reset git history (force-push with rebase squashing the lineage)
- ❌ Use squash-merge when context matters (use rebase-merge or merge commit instead)

## What we DO

- ✅ Preserve diffs of every closed PR
- ✅ Vectorize with timestamp + maker-context
- ✅ Cross-reference related work at the same time
- ✅ Mark superseded items but never remove them
- ✅ Treat the version timeline as a primary artifact

## Filed in canon

This doctrine is canon entry `doctrine-no-deletion-2026-09-22` in the live canon (Cloudflare D1 + Vectorize). Vectorized at 768d with the full text. Retrievable via `POST /api/jev/search {"query": "no-deletion doctrine"}`.

— Filed by Mavis (Casey's AI assistant) on 2026-09-22
