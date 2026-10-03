// Cargo Line Tycoon — Phase 2 dated fuel + freight snapshot (browser + Node
// dual-mode). NOT a live feed — the game reads this once at world-init as
// static canon and never refreshes it at runtime (rights/ToS; see
// CARGO-LINE-TYCOON.md §7). Every value is a provenance cell compiled from
// public secondary reporting at research time, dated and trust-scored
// honestly (neither figure is a paid-feed-grade quote, and both say so).
//
// These two snapshots are wired into the economy as gentle, one-time
// multipliers (see game/src/economy.js FUEL_INDEX_MULT / FREIGHT_INDEX_MULT)
// against a documented, judgment-call "typical year" baseline — the honest
// point being that the multiplier itself is derived (provenance.SOURCES.
// DERIVED), and both the researched figure and the baseline it's compared to
// are visible, not just the final number.

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('../src/provenance.js'));
  } else {
    root.CLT_SNAPSHOT = factory(root.CLTProvenance);
  }
})(typeof window !== 'undefined' ? window : this, function (provenance) {
  const { attest, SOURCES } = provenance;

  // USD per tonne, Singapore VLSFO (0.5%S) — one hub's spot price, one day's
  // snapshot; global bunker prices are volatile and vary materially by port.
  // An order-of-magnitude reference for the game's fuel-cost index, not a
  // certified quote.
  const BUNKER_FUEL_VLSFO = attest(470, {
    source: SOURCES.CANON,
    source_url: 'https://www.oilpriceapi.com/marine-fuel/singapore',
    as_of: '2025-10-01',
    trust: 0.6,
    notes: 'This snapshot predates the 2026 Strait of Hormuz crisis (see game/data/chokepoints.js "hormuz"), which very likely pushed bunker/crude prices up materially — a fresher snapshot is exactly the kind of fact Phase 5\'s (unbuilt) scouting moat would refresh. Not fabricated forward to match the crisis narrative; left honestly dated instead.',
  });

  // USD per 40ft container, Drewry World Container Index composite (8 major
  // East-West routes) — compiled from public secondary reporting of the
  // Drewry index, not the primary paid Drewry report itself.
  const FREIGHT_INDEX_WCI = attest(2213, {
    source: SOURCES.CANON,
    source_url: 'https://ufreight.com/as-2025-ends-container-rates-increase-again/',
    as_of: '2025-12-25',
    trust: 0.65,
    notes: '2025 was highly volatile: the composite ranged roughly $1,900-2,200+/40ft across the year (e.g. $2,168 on 2025-03-27, $1,913 on 2025-09-18 — a 14th-straight down week and -56% YoY off 2024\'s Red-Sea-diversion-driven highs — then $2,213 on 2025-12-25, a 4th straight up week). This is a single dated point, not a trend line.',
  });

  // Judgment-call "typical/calm year" reference anchors the two snapshots
  // above are compared against to produce a gameplay multiplier. These are
  // NOT researched, externally-cited facts — they are a documented baseline
  // choice the build team generated as a reference point, so they are
  // source:'procgen' (self-generated, not observed), each carrying a
  // seed_label naming the derivation rather than a random draw, so the
  // multiplier's honesty stays visible: the "how far from normal" judgment
  // is exposed, not baked in silently.
  const BUNKER_FUEL_BASELINE = attest(500, {
    source: SOURCES.PROCGEN, seed_label: 'baseline:bunker_fuel_typical_year', as_of: '2024-01-01', trust: 0.5,
    notes: 'A round "typical year" bunker-price anchor, chosen by the build team as a reference point, not a specific cited year\'s average.',
  });
  const FREIGHT_INDEX_BASELINE = attest(1800, {
    source: SOURCES.PROCGEN, seed_label: 'baseline:freight_index_typical_year', as_of: '2024-01-01', trust: 0.5,
    notes: 'A round "typical, non-crisis" WCI composite anchor (above the pre-2020 norm of roughly $1,300-1,600, since post-2020 baseline freight costs settled structurally higher), chosen by the build team as a reference point, not a specific cited year\'s average.',
  });

  return { BUNKER_FUEL_VLSFO, FREIGHT_INDEX_WCI, BUNKER_FUEL_BASELINE, FREIGHT_INDEX_BASELINE };
});
