# NOTE-04 — Double-entry transitions: perspectives get the tycoon's accounting

**Idea-branch:** `double-entry`

## What exists (cited)

- It's a **tycoon**: the cargo economy is inherently double-entry —
  every shipment is a debit here, a credit there, a hallway in between.
- Witness-log: prev_hash chains, 100% provenance-conflict resolution
  (v0.5.0 result). Storage layer is already audit-grade.
- But: perspective movement (students changing rooms, agents switching
  contexts) is booked as single entries at most — an arrival observation
  with no matching departure.

## The way-different bet

Casey: *"What double-entry bookkeeping makes explicitly… enables modern
society in a spreadsheet."*

The fleet already keeps modern books for *content* (witness-log). It
keeps *single-entry* diaries for *perspectives*. Upgrade: every
perspective transition books **three** rows:

```
1. DEPARTURE (credit the room left):   EFFECT(room_from, {perspective, left_at})
2. ARRIVAL   (debit the room entered): EFFECT(room_to,   {perspective, arrived_at})
3. PENDING PAIR (the hallway books it while unresolved):
   BIND(transition_cell, {perspective, from, to, opened_at})
   → resolved by LINK(transition_cell, arrival_effect)
   → or aged out by LINK(transition_cell, REFUSED/timeout)
```

Why it matters: a room whose departures consistently outnumber arrivals
is leaking engagement — visible *from the books*, no surveys. A pending
pair that never resolves is a perspective that dropped mid-transition
(session abandonment, client crash) — the oldest unsolved problem in
web ops, now a ledger query. And the transition_cell gives NOTE-01's
hallway a permanent address to LINK against.

The auditor's question — *"where did everyone go during the outage?"* —
becomes a range scan on unresolved PENDING pairs, not a log grep.

## Smallest first build (one evening)

- `substrate/ts/transitions.ts`: `move(perspective, from, to)` booking
  the triple; `pending()` returning unresolved transition cells;
  `resolve(transition_id, effect_ref)`.
- Test: move → 3 rows, chain verifies; kill before resolve → pending()
  finds it; resolve → LINK closes it.

## Value × feasibility

- **Value:** engagement analytics and crash forensics for free, from the
  same chain; gives every other note (hallway, dice, echogram) a stable
  addressing scheme for movement.
- **Feasibility:** very high — pure composition of existing opcodes, no
  canon change. The 4 ports make it 4× the tests but each is small.

## Open questions to the lane

1. Aging policy: when does a PENDING pair become REFUSED (timeout)?
   3 ticks? 30? Locale-dependent?
2. Should transition_cells be per-perspective (one traveler = one chain)
   or per-room-pair (a corridor = one chain)? Corridor chains make
   congestion analysis natural.
3. The tycoon's *cargo* transitions already exist in game logic — do
   they book to the witness-log today? If not, that's the first
   double-entry pilot: goods move before perspectives do.
