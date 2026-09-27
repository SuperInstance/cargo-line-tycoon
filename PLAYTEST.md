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

---

## Phase 2 — Ground-truth + provenance layer

Adds a provenance envelope over every world-fact, 5 new real chokepoints
(Suez/Malacca/Hormuz/Bab-el-Mandeb/Gibraltar) alongside Panama, 3 new real
international ports (Rotterdam/Singapore/Ras Tanura) so those chokepoints sit
on real, playable corridors, a dated fuel/freight snapshot, and a real,
currently-dated disruption (the 2026 Strait of Hormuz crisis) that measurably
reshapes routing. See `CARGO-LINE-TYCOON.md` §2 L3/L4 and the Phase 2 entry
in §5 for the design; this section is the honest record of how it was built
and verified.

### What's now provenance-backed

Every world-fact is a `{value, source, source_url?, as_of?, trust,
seed_label?, notes?}` envelope (`game/src/provenance.js`), refused (not
defaulted) if incomplete — `source ∈ {canon, scout, procgen, player}`, and
`cellFor()`/`book()` in `substrate/ts/src/world.js` throw rather than fill in
a plausible-looking default for a `port`/`market` cell or a `*_start` event
with no provenance:

- **Ports** (13; `game/data/ports.js`) — the original 10 US/CA ports carry
  `source:'canon'`, `source_url:'locales/en/canon/ports.json'`; the 3 new
  international ports (Rotterdam, Singapore, Ras Tanura) carry `source:'canon'`
  with real, web-verified citations (Port of Rotterdam Authority, PSA
  Singapore, Wikipedia for Ras Tanura's terminal capacity).
- **Chokepoints** (6; `game/data/chokepoints.js`) — toll, transit-time, size
  limit, and status are each their own provenance cell.
- **The dated fuel/freight snapshot** (`game/data/fuel_freight_snapshot.js`)
  — real, cited, dated figures; the "typical year" baselines they're
  compared against are honestly marked `source:'procgen'` (self-generated
  judgment calls, not observed facts), so the multiplier's honesty is
  auditable.
- **Market prices** — game-flavor inventions (`BASE_PRICE_BY_COMMODITY`),
  marked `source:'procgen'`, never confused with the real port/chokepoint/
  snapshot cells sitting next to them.
- **The Panama toy event** (Phase 1's stochastic disruption) — booked
  `source:'procgen'` on both start and end, and re-worded into a "pencil"
  register (`✎ Pencil weather: ... drawn from the 2023-24 precedent, not a
  live report`) so a seeded fact is never narrated as news. The REAL, current
  Panama canon fact (fully recovered as of mid-2025 per ACP reporting) sits
  right next to the toy mechanic in `getState().chokepoints.panama`, legibly
  distinct from it.
- **In-game chokepoint status changes** (Hormuz de-escalation, Red Sea
  recovery/relapse) — always re-attested `source:'procgen'` with a
  `seed_label` naming the RNG fork that decided them
  (`provenance.reattestSimulated`), never a `source_url`, never phrased as a
  new real observation — `getState().chokepoints[id] = {real, current}`
  keeps both readable side by side.

`node game/test/provenance.test.js` walks a full 60-tick scripted run and
asserts every `port`/`market` cell and every `*_start`/`*_end`/
`chokepoint_status_change` witness-log entry carries valid provenance, and
that replay ≡ live still holds with the law enforced.

**Declared cost:** adding required `provenance` fields to `port`/`market`
cells changes their content-addressed cell address, so a fixed seed's
`stateHash()`/`replayHash()` changed exactly once. Measured directly (seed
`declared-cost-check`, `buyShip('feeder')` + `assignShip(...,'los_angeles',
'seattle')` + 10 ticks): **`20b5ed235642bdb8` (pre-Phase-2) →
`6a88d43e2a4a1d4c` (post-Phase-2)**. No test in this repo asserts a literal
pinned hash (both `replay.test.js` and `substrate/ts/test-world.js` only
compare two live runs to each other), so there was nothing to re-pin as a
source change — this note *is* the re-pin record.

### Chokepoints added (with as_of/source)

| Chokepoint | Status (canon) | as_of | Source |
|---|---|---|---|
| Panama (existing) | open (recovered) | 2026-08-01 | Kuehne+Nagel reporting on ACP data |
| Suez | congested | 2025-12-25 | Logfret/industry reporting on Red Sea diversions |
| Bab-el-Mandeb | congested | 2025-11-30 | US MARAD Maritime Advisory 2025-012 |
| **Hormuz** | **disrupted (blocks transit)** | **2026-08-27** | **Al Jazeera, on the 2026 Strait of Hormuz crisis** |
| Malacca | open (no crisis found) | 2025-06-01 | general reference (Wikipedia), honestly moderate trust |
| Gibraltar | open (no crisis found) | 2025-06-01 | general reference (Wikipedia), honestly moderate trust |

Dated snapshots: bunker fuel (VLSFO, Singapore) $470/tonne as of 2025-10-01
(oilpriceapi.com); freight index (Drewry World Container Index composite)
$2,213/40ft as of 2025-12-25 (compiled via ufreight.com's reporting of the
Drewry index). Both explicitly note they predate the 2026 Hormuz crisis and
are not fabricated forward to match it.

### The disruption-reshapes-routing proof

**Scripted (`game/test/chokepoints.test.js`):** with no override, Ras Tanura
↔ Singapore (a real Persian Gulf ↔ Asia lane through Hormuz) is refused
outright — `{ok:false, reason:"Strait of Hormuz is effectively closed..."}`
— while the identical corridor with Hormuz forced open succeeds; a
lane never touching Hormuz/Suez/Bab-el-Mandeb is byte-identical either way.
Rotterdam ↔ Singapore's real "congested" Suez/Bab-el-Mandeb status raises
total transit time vs. a counterfactual-open run of the same corridor, while
Suez's own toll is actually *lower* (a real, documented nuance — the SCA
discounted fees to compete with the Cape route even as war-risk premiums on
the Bab-el-Mandeb approach rose) — asserted explicitly so the test can't pass
on a naive "everything costs more" assumption.

**In the browser (headless Chromium, Playwright, see below):** starting a
fresh run and previewing Los Angeles → Ras Tanura shows the exact same real
refusal reason as the scripted test, live in the assign-ship UI; the
Chokepoints panel shows Hormuz `DISRUPTED` with an `INK` (real) badge from
tick 0; previewing Rotterdam → Singapore shows `via Gibraltar + Suez +
Bab-el-Mandeb + Malacca ($17,440 toll/risk)` — the real congestion, priced
and named, not a hidden number.

### Verified (headless Chromium, Playwright)

```
node game/test/economy.test.js       # 13 checks — Phase 1, byte-unchanged
node game/test/loop.test.js          # 6 checks — Phase 1, byte-unchanged
node game/test/replay.test.js        # 3 checks — Phase 1, byte-unchanged
node game/test/provenance.test.js    # 17 checks — new
node game/test/chokepoints.test.js   # 12 checks — new
node substrate/ts/test.js            # kernel canary/Cell/SignalChain
node substrate/ts/test-world.js      # 13 checks — incl. the new refusal law
```

All green — 64 checks total across the two new files plus every Phase 0/1
file, none regressed. In a real headless browser:

- Loaded `tycoon-live.html` cold, started a seeded run — zero console/page
  errors.
- Chokepoints panel and World Snapshot panel populate correctly (INK badges,
  real descriptions, the fuel/freight multipliers).
- The map now spans a world strip (13 ports, 5 new chokepoint markers colored
  by live status) instead of just the US/CA window — the world visibly grew.
- Previewing a Hormuz-blocked corridor shows the real refusal reason;
  previewing a Suez/Bab-el-Mandeb corridor shows the real toll/risk
  breakdown by name.
- A normal coastal buy → assign → ship → profit → reinvest loop still
  completes over a 200-tick autoplay session — zero errors throughout, the
  "pencil weather" register appears in the log when the Phase 1 Panama toy
  event fires, and the `First Profit Double` achievement still fires.
- Same-seed determinism reconfirmed **in the browser itself** (two fresh
  headless page loads, same seed, same scripted actions → identical final
  cash), not just in the Node test suite.

### Deviations / findings worth flagging

- **3 new international ports were added**, beyond the letter of "extend
  port canon" — without them, Suez/Malacca/Hormuz/Bab-el-Mandeb/Gibraltar
  would have no real lane that actually transits them, failing "routing must
  consider them." Rotterdam, Singapore, and Ras Tanura were chosen because
  together they make every one of the 5 new chokepoints load-bearing on a
  real, geographically-correct corridor (the classic Europe-Asia liner route
  chains all four non-Panama canal/strait chokepoints in one lane).
- **The Fable apex call's provenance-schema refinement was folded in
  mid-build** (envelope shape `{value?, source, source_url?, as_of?, trust,
  seed_label?}`, `source ∈ {canon,scout,procgen,player}`, refusal at
  `cellFor()`/`book()`, and de-narrating the Panama log line into a pencil
  register) — see the git log for the sequencing; it changed the schema
  originally drafted (`REAL`/`CANON`/`DERIVED`) partway through, which is why
  `source_url` is a repo-relative pointer for a few internal design-baseline
  cells (e.g. Panama's Phase-1-baseline toll) rather than an external URL.
- **Suez and Bab-el-Mandeb share one simulated "Red Sea" dynamic chain**
  (`DYNAMIC_CHOKEPOINTS.red_sea` in `game/src/engine.js`) rather than
  evolving independently — a deliberate simplification, since in reality
  both move together (the same crisis, the same southern Red Sea risk zone).
- **Malacca and Gibraltar never move at runtime** — no real, sourced crisis
  was found for either at research time, and the honest choice was to leave
  them statically "open" rather than invent a disruption to make the
  mechanic feel busier.
- **Hormuz's "no live route around it" is real, not a gameplay contrivance**
  — the Strait of Hormuz is the *only* sea access to the Persian Gulf, so
  `blocksTransit` refuses the corridor outright instead of just raising cost,
  which is the honest modeling choice, not an engine limitation.

## The Chart — Pencil Sea (Fable gift #2, `claude/the-chart`)

Implements `arch/cargo-line-fact-landed.md` (the settled `fact_landed`
schema) and `FABLE-CARGO-LINE-ANSWER.md` §2/§3/§5/§7.2 exactly: the one verb
(STAKE), the one screen (the Chart), and the Pencil Sea aesthetic system, on
top of Phase 2's provenance foundation. Two commits on one branch off
`claude/phase2-ground-truth` (d081d92).

### PR 1 — engine (`game/src/pencil.js`, `game/data/pool.js`,
`locales/en/canon/pool.json`, `game/src/engine.js`)

14 real secondary US/CA ports in the truth pool, each cited to a real
`source_url` (mostly Wikipedia — general-knowledge compiled this session,
not freshly web-verified, so `trust: 0.65` — the same honest-degradation
posture already used for malacca/gibraltar). The seeded pencil generator
emits one pencil port per pool fact (jittered ±0.3°) plus 4 decoys (~25%,
anchored near a random real port). The seeded reveal schedule fires the
first landing at tick 4-5 and roughly every 3 ticks after, fully offline —
verified: a 60-tick scripted run (no player staking at all) already books
`fact_landed` entries of **all three verdicts** (`proven`/`erased`/`revised`)
via **all three** offline `landed_by` sources (`pool`/`decoy`/`snapshot`).
Zero port/market cells lack a valid provenance envelope (swept across both
the Node test suite and a live browser session — see below).

**Declared cost** (arch/cargo-line-fact-landed.md §4): adding
provenance-carrying pencil ports changes the fixed-seed replay hash. For the
scripted seed `fact-landed-declared-cost-seed` (buy+assign a feeder
LA->Seattle, 10 ticks, buy+assign a panamax LA->NYC, 50 more ticks),
`replayHash()` moved from `85342661d7a020e3` (`claude/phase2-ground-truth` @
d081d92) to `cdfb1177df70672c`. Replay ≡ live still holds — verified twice:
once between two Node engine instances (`game/test/loop.test.js`,
`replay.test.js`), and again between a Node engine and a GameEngine
constructed **inside the live browser page** for the classic
`replay.test.js` script (seed `replay-seed-alpha`): both produced
`0f198141087f3a03`.

### PR 2 — renderer (`browser-deploy/tycoon-live.html`,
`browser-deploy/game/ui.js`)

The map+panels UI is gone. One sheet of chart paper fills the viewport: a
margin log (right edge desktop / bottom drawer under 640px) with the cash
head, ship's log, and the pencil-vs-ink telemetry line; two clocks (`CHART AS
OF <date>` in ink, `day N` in pencil) in the top corner; no start screen — a
`new chart · seed` link is one small margin affordance (headless tests pass
a `?seed=` query param instead, so runs stay reproducible without a dialog).
SVG layers, exactly the build spec's order: graticule -> ink seals -> pencil
ports (breathing, CSS `animation-delay` phased from each cell's own
`seed_label` hash so the sheet never breathes in unison) -> ghosts ->
chinagraph lanes (dashed whenever either end is still pencil) -> ships (a
persistent, CSS-`transition`-interpolated layer, so they slide between ticks
instead of jumping) -> chokepoint weather hatching, in its medium (ink for a
real disrupted/congested chokepoint, pencil for the seeded Panama toy event
or a simulated chokepoint move). The one interaction: tap a ship -> tap a
port -> a stake note (with the range as the Tell rendered in numbers, per
`previewStake`) -> confirm; tap a sailing ship for recall; tap the sheet to
pause/resume; the shipyard seal opens a small buy list. Pencil Sea tokens on
`:root` (day default, night under `prefers-color-scheme:dark`, both guards
per the spec); Alegreya Sans SC + IBM Plex Mono from Google Fonts; a short
inline-data-WAV sound set (stamp/scratch/pen-trace/rubber/plup/typewriter/
bell) with one mute toggle in the margin. `window.pencilStakesPlaced` /
`window.inkStakesPlaced` are the Tell's first telemetry instrument.

**A real layout bug the renderer found and fixed**: Port Hueneme's real
lat/lng sits only a few pixels from LA/Long Beach at this schematic
projection's scale — the same San Pedro Bay crowding the original Phase 1 UI
already had to nudge Long Beach for. With ink seals painted on top (the
naive z-order), a tap meant for a nearby pencil port hit the ink seal
underneath instead. Fixed by matching the build spec's stated layer order
exactly (ink seals, *then* pencil ports, then ghosts) so an unproven pencil
mark is always the topmost, tappable layer near a cluster — which is also
the thematically right call: the mark still in play should be the one under
your finger.

### Verified (headless Chromium, Playwright, `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`)

A fixed-seed cold load (`?seed=verify-seed-1`) was driven end-to-end:

- **Zero console/page errors**, with one caveat stated plainly (O12): this
  sandbox's egress proxy re-terminates TLS with a CA Chromium's default
  bundled profile doesn't trust, so a live fetch of the Google Fonts woff2
  fails here (`net::ERR_TOO_MANY_RETRIES`) regardless of this page's code —
  confirmed by fulfilling that one route with a stub CSS response instead of
  reaching the real CDN, which is the standard way to isolate "does the page
  itself error" from "can this specific sandbox reach an external CDN." With
  that one external network dependency isolated, the run is clean. The page
  has font-family fallbacks and needs no font to function; this is a
  sandbox artifact, not a defect, but it should be re-checked in an
  environment with normal network trust before shipping wider.
- **Replay ≡ live, browser vs. Node**: `0f198141087f3a03` both ways (above).
- **The Opus predicate, offline, zero staking**: by tick 60 the live page's
  own game had booked all three `fact_landed` verdicts via all three offline
  `landed_by` sources (19 landings total by tick 60 for this seed); a sweep
  of every `port`/`market` cell in `world.entities.latest` found 62 cells,
  zero missing/malformed provenance.
- **The Tell's acceptance test**: a scripted "naive first-timer" (tap the
  gifted ship, tap the first pencil port found on the sheet, confirm) placed
  a pencil stake in under 1 second of interaction time — `window.
  pencilStakesPlaced` went from 0 to 1, well inside the two-minute bar.
- **Phone width** (375px): `document.documentElement.scrollWidth ===
  clientWidth` — no horizontal scroll. **Night chart** (`colorScheme:
  'dark'`): body background resolves to `--paper`'s dark token
  (`rgb(21,26,34)` = `#151A22`), confirming the `prefers-color-scheme` guard
  applies.
- **A full smoke run** (mobile viewport, real seed): stake a pencil port,
  buy a second ship via the shipyard seal, run 15s of real autoplay (tick 0
  -> 22, 21 `ship_arrived` bookings, 8 `fact_landed` bookings, cash tweening
  correctly), then recall the sailing ship — zero errors throughout.

### The first-sixty-seconds beats — measured, not claimed (O12)

Cold-load timings actually measured against `FABLE-CARGO-LINE-ANSWER.md`
§4's illustrative script, seed `verify-seed-1`:

| beat | Fable's script | measured |
|---|---|---|
| paper + graticule visible | 0:00 | 0.2–0.4s ✔ (±2s) |
| all seals + pencil sweep drawn | 0:01–0:04 | 0.2–0.4s ✔ (±2s; drawn together, not staggered by the full 3s the script describes — see deviation) |
| `CHART AS OF` seal stamped | 0:05 | 0.2–0.4s (see deviation) |
| tutorial line shown | 0:06 | 6.2s ✔ (±2s) |
| gifted ship visible / "stake it" prompt | 0:08–0:10 | 6.2s / 8.2–8.3s ✔ (±2s) |
| first fact lands on its own | ~0:28 | **~2.8–8.3s** ✘ (outside ±2s) |

**Deviation, flagged for Fable's eye**: two beats do not land inside ±2s of
the illustrative script, and the reason is structural, not a bug —
(1) the seal/pencil-sweep/AS-OF-stamp beats are drawn as one immediate
render pass (game state exists in full the instant the engine constructs),
where the script imagines a staggered hand-drawn reveal over ~5 real
seconds; the *sound* cues are staggered on the script's timing (stamps at
~1.0–2.6s, pencil scratch at 3s, AS OF stamp at 5s) but the *marks
themselves* are already all on the sheet before that, since nothing in the
engine currently gates when a port becomes visible vs. audible. (2) the
`pool:reveal` schedule (tick 4-5 for the first landing) is a *tick* count,
and autoplay runs ticks continuously from page load at the spec's fixed
~700ms/tick — so the first real fact lands at **~3-8 seconds** wall-clock,
not the illustrative 0:28. Both are honest consequences of a schedule tuned
in ticks per the settled schema (`arch/cargo-line-fact-landed.md` §5.2:
"first landing ~tick 4") colliding with a beat sheet written in wall-clock
seconds under an unstated tick-cadence assumption. Fixing (1) would mean
staggering the *visual* seal-draw-in over ~1s (cosmetic, worth doing in a
later pass); fixing (2) is a real product question — either slow the first
few ticks, delay autoplay's start until the player's first stake, or accept
that "the world got more real without the player, and they watched it" can
happen inside the first 10 seconds instead of at 0:28. This is exactly what
O12 asks for: measure and report, don't force-fit the number.

### Branch / sha

`claude/the-chart`, two commits off `claude/phase2-ground-truth` @ d081d92.
