// Cargo Line Tycoon — Phase 1 economy (browser + Node dual-mode, pure functions)
//
// Great-circle routing between the 10 real ports, 3 ship classes, a simple
// but real per-port price/demand model, and the one live chokepoint event
// (a Panama Canal disruption — real, grounded in the 2023-24 drought
// precedent, not fictional) that visibly changes optimal routing.
//
// Nothing in this file touches Date.now()/Math.random()/wall-clock time.
// Every stochastic decision takes an explicit rng (a SeededRNG from the
// kernel) so the whole engine stays replay-deterministic.

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(
      require('../data/ports.js'),
      require('../data/chokepoints.js'),
      require('../data/fuel_freight_snapshot.js'),
      require('./provenance.js'),
    );
  } else {
    root.CLTEconomy = factory(root.CLT_PORTS, root.CLT_CHOKEPOINTS, root.CLT_SNAPSHOT, root.CLTProvenance);
  }
})(typeof window !== 'undefined' ? window : this, function (portsData, chokepointsData, snapshotData, provenance) {
  const { PORTS_BY_ID, WEST_COAST, EAST_GULF_COAST, regionOf } = portsData;
  const { CHOKEPOINTS } = chokepointsData;
  const { read } = provenance;

  // ── Ship classes ──────────────────────────────────────────────────
  // Capacity/speed/cost genuinely differ; the ULCV cannot transit the
  // Panama Canal (real-world constraint on the largest container ships —
  // even the New Panamax locks cap out well below ULCV scale), which gives
  // ship-class choice real strategic weight rather than being a pure
  // bigger-is-better ladder.
  const SHIP_CLASSES = {
    feeder: {
      id: 'feeder', name: 'Feeder Container Ship', capacityTeu: 800, speedKn: 14,
      purchaseCost: 2_000_000, dailyOpCost: 8_000, canTransitPanama: true,
      blurb: 'Small, cheap, flexible. The right first ship.',
    },
    panamax: {
      id: 'panamax', name: 'Panamax Container', capacityTeu: 4_500, speedKn: 18,
      purchaseCost: 9_000_000, dailyOpCost: 22_000, canTransitPanama: true,
      blurb: 'The workhorse. Big enough to matter, still fits the canal.',
    },
    ulcv: {
      id: 'ulcv', name: 'ULCV Container', capacityTeu: 14_000, speedKn: 22,
      purchaseCost: 28_000_000, dailyOpCost: 55_000, canTransitPanama: false,
      blurb: 'Enormous and fast — but too big for the Panama locks. Coastal lanes only.',
    },
  };
  const SHIP_CLASS_IDS = Object.keys(SHIP_CLASSES);

  // ── Great-circle distance (haversine, nautical miles) ─────────────
  const EARTH_RADIUS_KM = 6371.0;
  const KM_TO_NM = 0.539957;

  function toRad(deg) { return (deg * Math.PI) / 180; }

  function haversineNm(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return EARTH_RADIUS_KM * c * KM_TO_NM;
  }

  // ── The one chokepoint: Panama Canal ───────────────────────────────
  // A west<->east/gulf coast route has no real great-circle sea lane (it
  // would cross land); it must transit Panama. We model that as a fixed,
  // honestly-approximate detour multiplier on the great-circle distance
  // (real port-to-port sea-distance tables exist but are out of scope for
  // the Phase 1 toy) plus a flat per-TEU toll and a canal transit time.
  const PANAMA_DETOUR_MULT = 1.35;
  const PANAMA_TOLL_PER_TEU = 12; // USD, normal conditions
  const PANAMA_TRANSIT_DAYS = 1; // added steaming/queue days, normal conditions

  // Disruption multipliers (drought/congestion) — real-world precedent:
  // the 2023-24 Panama Canal drought cut daily transit slots and forced
  // longer queues and re-routing.
  const PANAMA_DISRUPTION_TOLL_MULT = 2.5;
  const PANAMA_DISRUPTION_TRANSIT_MULT = 3.0;

  function isWestCoast(portId) { return WEST_COAST.includes(portId); }

  function crossesPanama(fromPortId, toPortId) {
    return isWestCoast(fromPortId) !== isWestCoast(toPortId);
  }

  // Route geometry + chokepoint-adjusted duration/toll for a ship class.
  // `panamaDisrupted` is a plain boolean the engine computes each tick from
  // world state — this function stays pure.
  function computeRouteLeg(fromPortId, toPortId, shipClass, panamaDisrupted) {
    const from = PORTS_BY_ID[fromPortId];
    const to = PORTS_BY_ID[toPortId];
    if (!from || !to) throw new Error(`computeRouteLeg: unknown port ${fromPortId} or ${toPortId}`);
    const usesPanama = crossesPanama(fromPortId, toPortId);
    if (usesPanama && !shipClass.canTransitPanama) {
      return { ok: false, reason: `${shipClass.name} is too large to transit the Panama Canal — pick a coastal (same-coast) route instead.` };
    }
    const directNm = haversineNm(from, to);
    const distanceNm = usesPanama ? directNm * PANAMA_DETOUR_MULT : directNm;
    const steamingDays = distanceNm / (shipClass.speedKn * 24);
    const panamaExtraDays = usesPanama ? PANAMA_TRANSIT_DAYS * (panamaDisrupted ? PANAMA_DISRUPTION_TRANSIT_MULT : 1) : 0;
    const legDurationTicks = Math.max(1, Math.round(steamingDays + panamaExtraDays));
    const tollPerTeu = usesPanama ? PANAMA_TOLL_PER_TEU * (panamaDisrupted ? PANAMA_DISRUPTION_TOLL_MULT : 1) : 0;
    return {
      ok: true, usesPanama, distanceNm, legDurationTicks,
      tollTotal: Math.round(tollPerTeu * shipClass.capacityTeu),
    };
  }

  // ── Phase 2: global (multi-chokepoint) routing ─────────────────────
  //
  // computeRouteLeg() above is untouched and stays the exact Phase 1
  // function (same signature, same math, same tests) — every existing US/CA
  // port pair still goes through it byte-for-byte. computeGlobalRouteLeg()
  // below is new: it generalizes to the 3 Phase-2 international ports by
  // consulting a small region/corridor graph and the chokepoint canon
  // (game/data/chokepoints.js), but for the one corridor that already
  // existed (WEST_COAST <-> EAST_GULF_COAST) it *delegates* straight back to
  // computeRouteLeg — so gameplay for the original 10 ports is provably
  // unchanged, not just "should be similar."
  //
  // Every corridor here is a real, sourced sea lane (not an invented
  // shortcut): Europe<->Asia and the US East/Gulf coast<->Asia/Persian Gulf
  // both really do transit Gibraltar -> Suez -> Bab-el-Mandeb in sequence
  // (the classic Europe-Asia liner route); Asia<->Persian Gulf and the US
  // West Coast<->Persian Gulf both really do transit Malacca and/or Hormuz.
  // `detourMult` per corridor is the same kind of honest, documented
  // approximation Phase 1 already uses for Panama (PANAMA_DETOUR_MULT) —
  // real port-to-port sea-distance tables exist but are out of scope here.
  // `chokepoints` is listed in real geographic travel order **starting from
  // `forwardFrom`**; computeGlobalRouteLeg() reverses it when the ship is
  // actually sailing the other way (toll/transit sums are order-invariant,
  // so this only matters for display and for the UI's ship-path rendering —
  // but getting it right there is exactly "the player sees why").
  const CORRIDORS = {
    'EAST_GULF_COAST|WEST_COAST': { chokepoints: ['panama'], detourMult: PANAMA_DETOUR_MULT, forwardFrom: 'WEST_COAST' },
    'ASIA_PACIFIC|WEST_COAST': { chokepoints: [], detourMult: 1.05, forwardFrom: 'WEST_COAST' }, // direct trans-Pacific, no strait
    'EUROPE|WEST_COAST': { chokepoints: ['panama'], detourMult: 1.45, forwardFrom: 'WEST_COAST' }, // Panama, then up the Atlantic
    'PERSIAN_GULF|WEST_COAST': { chokepoints: ['malacca', 'hormuz'], detourMult: 1.15, forwardFrom: 'WEST_COAST' }, // west across the Pacific, Malacca, Indian Ocean, Hormuz
    'EAST_GULF_COAST|EUROPE': { chokepoints: [], detourMult: 1.05, forwardFrom: 'EAST_GULF_COAST' }, // direct Atlantic crossing, no strait
    'ASIA_PACIFIC|EAST_GULF_COAST': { chokepoints: ['gibraltar', 'suez', 'bab_el_mandeb', 'malacca'], detourMult: 1.2, forwardFrom: 'EAST_GULF_COAST' },
    'EAST_GULF_COAST|PERSIAN_GULF': { chokepoints: ['gibraltar', 'suez', 'bab_el_mandeb', 'hormuz'], detourMult: 1.15, forwardFrom: 'EAST_GULF_COAST' },
    'ASIA_PACIFIC|EUROPE': { chokepoints: ['gibraltar', 'suez', 'bab_el_mandeb', 'malacca'], detourMult: 1.15, forwardFrom: 'EUROPE' }, // the classic Europe-Asia liner route
    'EUROPE|PERSIAN_GULF': { chokepoints: ['gibraltar', 'suez', 'bab_el_mandeb', 'hormuz'], detourMult: 1.1, forwardFrom: 'EUROPE' },
    'ASIA_PACIFIC|PERSIAN_GULF': { chokepoints: ['malacca', 'hormuz'], detourMult: 1.1, forwardFrom: 'ASIA_PACIFIC' },
  };

  function corridorKey(regionA, regionB) {
    return [regionA, regionB].sort().join('|');
  }

  // Read a chokepoint's *current* status out of the caller-supplied snapshot
  // (falls back to the static canon status if the caller doesn't track that
  // chokepoint dynamically — e.g. gibraltar/malacca, which this Phase 2 pass
  // never moves at runtime). Kept as an explicit parameter (not read off
  // some ambient world object) so this whole module stays a pure function of
  // its inputs, exactly like the panamaDisrupted boolean above.
  function currentChokepointStatus(chokepointId, chokepointStatusById) {
    const override = chokepointStatusById && chokepointStatusById[chokepointId];
    if (override && override.status) return override.status;
    return read(CHOKEPOINTS[chokepointId].status);
  }

  // The Phase 2 predicate function: route geometry + duration/toll/risk for
  // a ship class across *any* of the game's regions, chokepoint(s) included.
  // `chokepointStatusById` is an optional map { [chokepointId]: {status} }
  // the engine passes in each call — e.g. { hormuz: { status: 'congested' } }
  // — reflecting whatever the current in-game (possibly seed-simulated)
  // status is; omitted entries fall back to the static canon status above.
  function computeGlobalRouteLeg(fromPortId, toPortId, shipClass, chokepointStatusById) {
    const from = PORTS_BY_ID[fromPortId];
    const to = PORTS_BY_ID[toPortId];
    if (!from || !to) throw new Error(`computeGlobalRouteLeg: unknown port ${fromPortId} or ${toPortId}`);

    const regionA = regionOf(fromPortId);
    const regionB = regionOf(toPortId);

    if (regionA === regionB) {
      // Same-region: a direct lane, no chokepoint — identical treatment to
      // Phase 1's same-coast case.
      const distanceNm = haversineNm(from, to);
      const steamingDays = distanceNm / (shipClass.speedKn * 24);
      return {
        ok: true, usesPanama: false, chokepointsUsed: [], distanceNm,
        legDurationTicks: Math.max(1, Math.round(steamingDays)), tollTotal: 0, tollBreakdown: [],
      };
    }

    if (corridorKey(regionA, regionB) === corridorKey('WEST_COAST', 'EAST_GULF_COAST')) {
      // Backward-compat fast path: delegate to the untouched Phase 1
      // function so its behavior (and every test that calls it directly)
      // never changes.
      const panamaDisrupted = currentChokepointStatus('panama', chokepointStatusById) === 'disrupted';
      const leg = computeRouteLeg(fromPortId, toPortId, shipClass, panamaDisrupted);
      return leg.ok ? { ...leg, chokepointsUsed: ['panama'], tollBreakdown: [{ chokepointId: 'panama', name: CHOKEPOINTS.panama.name, status: panamaDisrupted ? 'disrupted' : 'open', amount: leg.tollTotal }] } : leg;
    }

    const corridor = CORRIDORS[corridorKey(regionA, regionB)];
    if (!corridor) throw new Error(`computeGlobalRouteLeg: no corridor defined for ${regionA} <-> ${regionB}`);

    const directNm = haversineNm(from, to);
    const distanceNm = directNm * corridor.detourMult;
    const steamingDays = distanceNm / (shipClass.speedKn * 24);

    let extraDays = 0;
    let tollTotal = 0;
    const tollBreakdown = [];
    const chokepointsUsed = [];
    // corridor.chokepoints is authored in travel order starting FROM
    // corridor.forwardFrom; reverse it when this leg actually sails the
    // other way, so chokepointsUsed reflects the real order this ship
    // passes them in (toll/time sums are order-invariant either way).
    const orderedChokepoints = regionA === corridor.forwardFrom ? corridor.chokepoints : [...corridor.chokepoints].reverse();

    for (const cpId of orderedChokepoints) {
      const cp = CHOKEPOINTS[cpId];
      const status = currentChokepointStatus(cpId, chokepointStatusById);
      chokepointsUsed.push(cpId);

      if (cpId === 'panama' && !shipClass.canTransitPanama) {
        return { ok: false, reason: `${shipClass.name} is too large to transit the Panama Canal — pick a route that avoids it.` };
      }
      if (cp.blocksTransit && status === 'disrupted') {
        return {
          ok: false,
          reason: `${cp.name} is effectively closed to commercial shipping right now (${cp.status.notes.split('.')[0]}) — there is no sea route around it for this corridor.`,
        };
      }

      const baseToll = read(cp.tollPerTeu);
      const baseSurcharge = cp.warRiskSurchargePerTeu ? read(cp.warRiskSurchargePerTeu) : 0;
      const baseTransitDays = read(cp.transitDays);

      let tollMult = 1, transitMult = 1, riskMult = 1;
      if (status === 'congested' && cp.congestion) {
        tollMult = cp.congestion.tollMult ?? 1; transitMult = cp.congestion.transitMult ?? 1; riskMult = cp.congestion.warRiskMult ?? 1;
      } else if (status === 'disrupted' && cp.disruption) {
        tollMult = cp.disruption.tollMult ?? 1; transitMult = cp.disruption.transitMult ?? 1; riskMult = cp.disruption.warRiskMult ?? 1;
      }

      const legCost = Math.round((baseToll * tollMult + baseSurcharge * riskMult) * shipClass.capacityTeu);
      tollTotal += legCost;
      tollBreakdown.push({ chokepointId: cpId, name: cp.name, status, amount: legCost });
      extraDays += baseTransitDays * transitMult;
    }

    return {
      ok: true,
      usesPanama: corridor.chokepoints.includes('panama'),
      chokepointsUsed, distanceNm,
      legDurationTicks: Math.max(1, Math.round(steamingDays + extraDays)),
      tollTotal, tollBreakdown,
    };
  }

  // ── Price / demand model ───────────────────────────────────────────
  // Every port carries a base price (per-TEU value of its primary export
  // commodity) and a mutable current price + demand that:
  //   - mean-reverts toward base over time (the market "heals"),
  //   - drifts with small seeded noise every tick (a live, breathing world),
  //   - is pushed by the player's own trading: loading cargo at a port
  //     drains local supply (price up there), delivering cargo floods the
  //     destination (price down there) — the classic self-correcting
  //     arbitrage a tycoon game runs on.
  const BASE_PRICE_BY_COMMODITY = {
    electronics: 1400, apparel: 900, automobiles: 2200, crude_oil: 650, grain: 380,
  };

  // Phase 2: the dated fuel/freight snapshot (game/data/fuel_freight_snapshot.js),
  // read through provenance, wired in as two gentle, one-time, world-level
  // multipliers — this IS "the economy reads values through provenance" for
  // these two facts, not just the chokepoints. Both multipliers are
  // themselves source:'procgen' cells (computed by this file, not observed) —
  // the researched snapshot and the baseline it's judged against are both
  // visible in `notes` (not just the ratio), so the honesty of the
  // comparison is auditable, not asserted; `seed_label` names the
  // deterministic derivation rather than a random draw.
  const FUEL_INDEX_MULT_CELL = provenance.attest(
    read(snapshotData.BUNKER_FUEL_VLSFO) / read(snapshotData.BUNKER_FUEL_BASELINE),
    {
      source: provenance.SOURCES.PROCGEN, seed_label: 'derived:fuel_index_mult', trust: 0.55,
      notes: `Derived: BUNKER_FUEL_VLSFO (${read(snapshotData.BUNKER_FUEL_VLSFO)}, as of ${snapshotData.BUNKER_FUEL_VLSFO.as_of}) / BUNKER_FUEL_BASELINE (${read(snapshotData.BUNKER_FUEL_BASELINE)}). Applied as a multiplier on every ship's daily operating cost.`,
    },
  );
  const FREIGHT_INDEX_MULT_CELL = provenance.attest(
    read(snapshotData.FREIGHT_INDEX_WCI) / read(snapshotData.FREIGHT_INDEX_BASELINE),
    {
      source: provenance.SOURCES.PROCGEN, seed_label: 'derived:freight_index_mult', trust: 0.6,
      notes: `Derived: FREIGHT_INDEX_WCI (${read(snapshotData.FREIGHT_INDEX_WCI)}, as of ${snapshotData.FREIGHT_INDEX_WCI.as_of}) / FREIGHT_INDEX_BASELINE (${read(snapshotData.FREIGHT_INDEX_BASELINE)}). Applied as a multiplier on every port's base commodity price.`,
    },
  );
  const FUEL_INDEX_MULT = read(FUEL_INDEX_MULT_CELL);
  const FREIGHT_INDEX_MULT = read(FREIGHT_INDEX_MULT_CELL);

  function basePriceForPort(portId) {
    const port = PORTS_BY_ID[portId];
    const raw = BASE_PRICE_BY_COMMODITY[port.commodity] || 1000;
    return Math.round(raw * FREIGHT_INDEX_MULT);
  }

  // Phase 2: a ship's real daily operating cost, adjusted by the dated
  // bunker-fuel snapshot above. Kept as a separate function (rather than
  // mutating SHIP_CLASSES.*.dailyOpCost in place) so the ship-class table
  // itself stays a plain, easily-tested set of constants and every call
  // site that needs the *paid* cost has to opt in explicitly.
  function adjustedDailyOpCost(shipClass) {
    return Math.round(shipClass.dailyOpCost * FUEL_INDEX_MULT);
  }

  function initialMarketState() {
    const state = {};
    for (const id of Object.keys(PORTS_BY_ID)) {
      const base = basePriceForPort(id);
      state[id] = { price: base, basePrice: base, demand: 1.0 };
    }
    return state;
  }

  const MEAN_REVERSION = 0.06;
  const NOISE_AMPLITUDE = 0.02; // ±2% of base per tick
  const MIN_PRICE_FRAC = 0.55;
  const MAX_PRICE_FRAC = 1.6;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Advances one port's price by one tick. Pure given (state, rng draw).
  function driftPrice(marketEntry, rng) {
    const { price, basePrice } = marketEntry;
    const reversion = MEAN_REVERSION * (basePrice - price);
    const noise = rng.float(-NOISE_AMPLITUDE, NOISE_AMPLITUDE) * basePrice;
    const next = clamp(price + reversion + noise, basePrice * MIN_PRICE_FRAC, basePrice * MAX_PRICE_FRAC);
    return Math.round(next);
  }

  // Player loaded `teu` units of cargo at this port: local supply drains,
  // price nudges up (bounded).
  function applyLoadPressure(marketEntry, teu, capacityTeu) {
    const { basePrice } = marketEntry;
    const pressure = 0.15 * (teu / Math.max(1, capacityTeu)); // up to ~15% of base
    const next = clamp(marketEntry.price + basePrice * pressure, basePrice * MIN_PRICE_FRAC, basePrice * MAX_PRICE_FRAC);
    return Math.round(next);
  }

  // Player delivered `teu` units of cargo here: local supply floods, price
  // nudges down (bounded).
  function applyDeliverPressure(marketEntry, teu, capacityTeu) {
    const { basePrice } = marketEntry;
    const pressure = 0.15 * (teu / Math.max(1, capacityTeu));
    const next = clamp(marketEntry.price - basePrice * pressure, basePrice * MIN_PRICE_FRAC, basePrice * MAX_PRICE_FRAC);
    return Math.round(next);
  }

  // Revenue for delivering `teu` units of cargo bought at `buyPrice` and
  // sold at the destination's current price, in integer dollars.
  function tripRevenue({ teu, buyPrice, sellPrice }) {
    return Math.round(sellPrice * teu) - Math.round(buyPrice * teu);
  }

  return {
    SHIP_CLASSES, SHIP_CLASS_IDS,
    haversineNm, isWestCoast, crossesPanama, computeRouteLeg,
    PANAMA_DETOUR_MULT, PANAMA_TOLL_PER_TEU, PANAMA_TRANSIT_DAYS,
    PANAMA_DISRUPTION_TOLL_MULT, PANAMA_DISRUPTION_TRANSIT_MULT,
    basePriceForPort, initialMarketState, driftPrice,
    applyLoadPressure, applyDeliverPressure, tripRevenue,
    // Phase 2 additions:
    CHOKEPOINTS, CORRIDORS, corridorKey, currentChokepointStatus,
    computeGlobalRouteLeg, adjustedDailyOpCost,
    FUEL_INDEX_MULT, FREIGHT_INDEX_MULT, FUEL_INDEX_MULT_CELL, FREIGHT_INDEX_MULT_CELL,
  };
});
