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
    module.exports = factory(require('../data/ports.js'));
  } else {
    root.CLTEconomy = factory(root.CLT_PORTS);
  }
})(typeof window !== 'undefined' ? window : this, function (portsData) {
  const { PORTS_BY_ID, WEST_COAST, EAST_GULF_COAST } = portsData;

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

  function basePriceForPort(portId) {
    const port = PORTS_BY_ID[portId];
    return BASE_PRICE_BY_COMMODITY[port.commodity] || 1000;
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
  };
});
