# PLAYTEST — Phase 0 + Phase 1 (cargo-line-tycoon)

This is the fun-first MVP from `CARGO-LINE-TYCOON.md`: Phase 0 (a booked,
replayable world-model kernel) and Phase 1 (a playable single-player tycoon
toy on the 10 real US/CA ports). This file is the honest record of how it was
verified — automated, and by actually playing it in a real browser.

## Play it

Open `browser-deploy/tycoon-live.html` directly in a browser (double-click it,
or `python3 -m http.server` from the repo root and visit it — both work; see
"Offline-first" below). Pick a seed or leave it blank, hit **Start a New
Run**, and:

1. **Buy** a Feeder Container Ship ($2,000,000 of your starting $10,000,000).
2. **Assign** it — the form defaults to a real, meaningful lane (not a
   trivial one), but any of the 10 ports are pickable as either end.
3. Hit **Advance 1 Day** (or **Auto-play**) and **watch cargo ship**: the
   ship's dot moves along the route on the map, a progress bar fills, and it
   **profits** on arrival — logged, with the amount.
4. **Reinvest**: once you've got a few hundred thousand back, buy a second
   ship and put it on a different lane.
5. Sooner or later (seeded, not scripted to a fixed tick) the **Panama Canal
   disruption** banner appears. Any route crossing coasts gets visibly
   slower and costs more — a same-coast lane is completely unaffected. This
   is the moment to react: recall a Panama ship and park it, or ride it out.
6. Doubling your starting cash fires the **First Profit Double** achievement
   (a real "you did it" moment and a reason to bank the run or push on); a
   profitable delivery during the disruption fires **Storm Rider**.
7. **New Run** any time, with a different seed, for a different Panama-timing
   puzzle and different market drift.

## How this was verified

### Automated (run these; no network, no build step)

```
cd cargo-line-tycoon-substrate-ts && npm test          # Phase 0 kernel, standalone repo
cd substrate/ts && node test.js && node test-world.js   # Phase 0 kernel, vendored copy
node game/test/economy.test.js                          # routing, ship classes, price/demand, Panama chokepoint
node game/test/loop.test.js                              # the core loop + the early win, end to end
node game/test/replay.test.js                             # engine-level replay ≡ live
```

All green. Together they check:

- **Replay ≡ live (Phase 0's predicate):** two `World`s (and, separately, two
  full `GameEngine`s) built from the same seed and fed the exact same ordered
  action script produce byte-identical witness-logs and state hashes, every
  time (`test-world.js`, `game/test/replay.test.js`).
- **The economy is real, not decorative:** great-circle distance is really
  computed (`haversineNm`); the 3 ship classes really differ in
  capacity/speed/cost; a ULCV is really refused on a Panama-crossing route
  (it's too large for the locks) but fine coastal; the Panama disruption
  really lengthens transit and raises the toll on a crossing route while
  leaving a same-coast route's numbers completely untouched — the exact
  "visibly changes optimal routing" predicate (`game/test/economy.test.js`).
- **The core loop actually completes, unprompted:** a first-time-player-shaped
  script (buy → assign a real short coastal lane → run enough ticks for two+
  round trips → reinvest in a second ship) earns real money and can afford
  the second ship — no scripted shortcuts (`game/test/loop.test.js`).
- **There's a reachable early win and a reason to run it back:** the "double
  your starting cash" achievement is reachable within a normal early session
  on a single well-run lane, and is surfaced in the player-facing log,
  proving the win is real and legible, not internal-only.

### By hand, in a real browser (Chromium via Playwright, headless)

Everything above only proves the *engine* works; the actual predicate is a
human completing the loop *in the UI*. So the full page was driven end to end
in a real browser, exactly the way a player would click it:

- Loaded `tycoon-live.html` cold — zero console errors, zero page errors.
- Typed a seed, clicked **Start a New Run** — start screen closes, cash
  shows `$10,000,000`, the map renders all 10 real ports.
- Clicked **Buy** on the Feeder card, then **Assign** on the resulting idle
  ship (the pre-filled from/to — Los Angeles → Seattle by default — is a
  real ~950nm, multi-day lane, not the trivial 8-mile Long Beach hop the
  naive "nearest port" heuristic first suggested; see "Deviations" below).
- Clicked **Advance 1 Day** repeatedly: the ship dot visibly moves along the
  route line, the progress bar fills, and on arrival the log posts a dollar
  amount and the header cash figure updates live.
- Kept clicking through a longer session (250–400 days): the Panama Canal
  banner appeared, cross-coast route previews visibly got slower and
  costlier while the same-coast lane's preview didn't move, cash compounded
  from $10,000,000 past $20,000,000+, and the **First Profit Double** badge
  appeared with a matching log line.
- No console/page errors at any point across a 400-tick session.

This is the same script `game/test/loop.test.js` and `replay.test.js` run
headlessly — the browser run is the same loop, played, not a different path.

## Offline-first

`tycoon-live.html` loads only local, relative `<script src>` files — the
kernel (`substrate/ts/src/{index,world}.js`, untouched), the game
(`game/{data,src}/*.js`), and its own `game/ui.js`. No `fetch`, no `XHR`, no
CDN, no build step. It was tested opened directly via `file://` (double-click)
in Chromium and works fully offline; if a particular browser is stricter
about local script loading, `python3 -m http.server` from the repo root and
opening `http://localhost:8000/browser-deploy/tycoon-live.html` is the
zero-dependency fallback — still entirely offline/local, just over `http://`
instead of `file://`.

## Deviations / findings worth flagging

- **Two real bugs found and fixed in the shared kernel while building this**
  (see the top-level report for detail): `fnv1a64` never masked its
  intermediate BigInt to 64 bits inside its loop, making it O(n²) — hashing a
  32KB witness-log took ~2.4s before the fix, a few ms after. And it silently
  depended on Node's `Buffer` global, which doesn't exist in a browser. The
  first was fixed in `fnv1a64` itself (byte-identical output, ~170x faster
  on realistic inputs); the second was solved with a small polyfill scoped
  to the game's own HTML page, not by touching `index.js`.
- **`GameEngine.getState()` deliberately does not compute a replay hash.**
  `World.stateHash()` is O(witness-log length) by design (it hashes the
  whole run) — calling it every tick (once per UI frame in a live session)
  would make the whole game O(n²) over a session even after the fnv1a64 fix.
  `getState()` is the hot per-tick UI path; `replayHash()` is a separate,
  deliberate, on-demand call, used by tests and meant for checkpoints, never
  polled every frame.
- **The default route suggestion needed a second pass.** The naive "nearest
  port to ~1000nm" heuristic defaulted Los Angeles → Vancouver, which is a
  guaranteed structural loss (Vancouver's base commodity, grain, is worth far
  less per TEU than LA's electronics, regardless of play skill). Fixed by
  only suggesting a destination whose base price is at least as good as the
  origin's, which lands on Seattle — a real, fair, multi-day lane. Players
  can still pick any pair, including a deliberately bad one.
- **Progression is a lightweight stand-in, not the full Elementary/Middle/
  Advanced tier tree** from the architecture doc §3 — two achievements
  (`first_profit_double`, `storm_rider`) are enough to prove "an early win
  and a reason to run it back" for this MVP; the fuller unlock tree is real
  scope for Phase 2+, not something this pass should gold-plate.
- Money is stored as **integer whole dollars** (not integer cents) — still
  exact/integer per the ℚ₁₆ discipline ("identity never floats"), just a
  coarser minor unit, chosen for a more readable tycoon UI. `World.bookLedger`
  enforces non-negative integers regardless of the unit chosen.
