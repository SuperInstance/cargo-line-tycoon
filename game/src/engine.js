// Cargo Line Tycoon — Phase 1+2 GameEngine (browser + Node dual-mode)
//
// Wires the Phase 0 kernel (World/booked tick loop/seeded RNG/game cells)
// to the Phase 1+2 economy (great-circle + global corridor routing, ship
// classes, price/demand, the Panama Canal toy event, and the 5 new
// provenance-backed chokepoint cells) into a playable single-player loop:
// buy ship -> assign to route -> ship cargo -> earn profit -> reinvest.
//
// Determinism contract: GameEngine is a pure function of (seed, ordered
// action calls). Two engines built from the same seed and fed the exact
// same ordered sequence of buyShip/assignShip/unassignShip/tick calls
// produce byte-identical witness-logs and stateHash() — see
// game/test/replay.test.js. Nothing here reads Date.now()/Math.random();
// all stochastic decisions go through this.world.rng.

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(
      require('../../substrate/ts/src/world.js'),
      require('./economy.js'),
      require('../data/ports.js'),
      require('../data/chokepoints.js'),
      require('../data/fuel_freight_snapshot.js'),
      require('./provenance.js'),
      require('../data/pool.js'),
      require('./pencil.js'),
    );
  } else {
    root.CLTEngine = factory(root.CLTWorld, root.CLTEconomy, root.CLT_PORTS, root.CLT_CHOKEPOINTS, root.CLT_SNAPSHOT, root.CLTProvenance, root.CLT_POOL, root.CLTPencil);
  }
})(typeof window !== 'undefined' ? window : this, function (kernel, economy, portsData, chokepointsData, snapshotData, provenance, poolData, pencil) {
  const { World, makeCompanyCell, makeShipCell, makeRouteCell, makePortCell, makeMarketCell } = kernel;
  const {
    SHIP_CLASSES, initialMarketState, driftPrice,
    applyLoadPressure, applyDeliverPressure, tripRevenue,
    computeGlobalRouteLeg, adjustedDailyOpCost,
    haversineNm, CORRIDORS, corridorKey, currentChokepointStatus,
    PANAMA_DETOUR_MULT,
  } = economy;
  const { PORTS, PORTS_BY_ID } = portsData;
  const { CHOKEPOINTS, CHOKEPOINT_IDS } = chokepointsData;
  const { read, describe, reattestSimulated } = provenance;
  const { POOL, POOL_BY_ID } = poolData;
  const { generatePencilPorts, buildRevealSchedule } = pencil;

  const STARTING_CASH = 10_000_000;
  const HOME_PORT_ID = 'los_angeles';

  const PANAMA_EVENT_WARMUP_TICKS = 5;
  const PANAMA_EVENT_CHANCE_PER_TICK = 0.035;
  const PANAMA_EVENT_MIN_DURATION = 8;
  const PANAMA_EVENT_MAX_DURATION = 16;

  // Phase 2: the "real news happens while you play" mechanic for the 2
  // chokepoints this canon found an active, dated real event for. Every
  // other chokepoint (malacca, gibraltar) stays exactly at its static canon
  // status for the whole game — no invented crisis, honest silence. Panama
  // keeps its OWN separate Phase 1 toy mechanic below, untouched; its real
  // canon status (recovered, "open") is tracked here only for display.
  //
  // Both dynamic chains bias toward the real trend at research time
  // (Hormuz: acute war, slow chance of de-escalation; Red Sea: a fragile
  // post-ceasefire recovery, more likely to keep improving than relapse) —
  // a deliberate, documented gameplay choice, not a coin flip; see notes.
  const CHOKEPOINT_EVENT_WARMUP_TICKS = 5;
  const DYNAMIC_CHOKEPOINTS = {
    hormuz: {
      // disrupted (blocked) -> congested (armed-escort, costly) -> open
      deescalateChancePerTick: 0.02,
      relapseChancePerTick: 0.01, // congested/open -> back one step worse
      minDwellTicks: 10,
    },
    // suez and bab_el_mandeb move together — the same real Red Sea crisis
    // drives both (see chokepoints.js notes).
    red_sea: { ids: ['suez', 'bab_el_mandeb'], deescalateChancePerTick: 0.03, relapseChancePerTick: 0.008, minDwellTicks: 8 },
  };
  const STATUS_ORDER = ['disrupted', 'congested', 'open']; // worst -> best

  const ACHIEVEMENT_DOUBLE_CASH_MULT = 2;

  class GameEngine {
    constructor({ seed, companyId = 'co_player', companyName = 'Your Line' } = {}) {
      this.world = new World({ seed });
      this.companyId = companyId;
      this.shipSeq = 0;
      this.routeSeq = 0;
      this.shipIds = [];
      this.routeIds = [];
      this.transit = {}; // shipId -> { routeId, routeFrom, routeTo, leg, ticksRemaining, usesPanama, tollTotal, buyPrice }
      this.panama = { disrupted: false, ticksRemaining: 0 };
      this.achievements = new Set();
      this._stormProfit = false;
      this._eventLog = [];

      // Phase 2: every chokepoint's *current* runtime status, seeded from
      // its real canon cell (game/data/chokepoints.js). `real` never
      // changes after init (it's the researched fact); `current` is what
      // routing actually reads and is the only field _tickChokepointEvents
      // ever replaces — always via provenance.reattestSimulated(), so a
      // game-simulated change is provenance-distinguishable (source:
      // 'procgen') from the real cell sitting right next to it.
      this.chokepoints = {};
      for (const id of CHOKEPOINT_IDS) {
        this.chokepoints[id] = { real: CHOKEPOINTS[id].status, current: CHOKEPOINTS[id].status, dwellTicks: 0 };
      }

      for (const p of PORTS) {
        this.world.entities.put(`port:${p.id}`, makePortCell({
          id: p.id, name: p.name, lat: p.lat, lng: p.lng, country: p.country,
          annualTeus: p.annual_teus, tier: p.tier,
          provenance: p.provenance, // real, per-port provenance cell (game/data/ports.js) — Phase 2
        }));
      }

      const markets = initialMarketState();
      for (const portId of Object.keys(markets)) {
        const m = markets[portId];
        this.world.entities.put(`market:${portId}`, makeMarketCell({
          portId, commodity: PORTS_BY_ID[portId].commodity, basePrice: m.basePrice, price: m.price, demand: m.demand,
          // Phase 2 (Fable apex fix): a market price is a procedurally-priced
          // game-flavor invention (BASE_PRICE_BY_COMMODITY), not an observed
          // truth — marked source:'procgen' so it is never confused with the
          // port/chokepoint/snapshot cells that ARE real. See ports.js's own
          // file-header caveat on BASE_PRICE_BY_COMMODITY.
          provenance: { source: 'procgen', trust: 0.5, seed_label: `market:${portId}` },
        }));
      }

      // Pencil Sea (arch/cargo-line-fact-landed.md §5): the pencil generator
      // emits one pencil port per pool fact (game/data/pool.js), jittered
      // ±0.3°, plus ~25% decoys with no fact behind them — seeded via
      // world.rng.fork('procgen:ports') so this is replay-deterministic and
      // never touches Math.random(). `this.pencilPorts` is the per-id
      // registry (parent/coast/seed metadata); the actual world-facts live
      // as ordinary port:<id>/market:<id> cells alongside the real ports, so
      // every existing lookup that reads through EntityStore (this.world.
      // entities.get(`port:${id}`)) already works uniformly for both.
      this.pencilPorts = {};
      const pencilRng = this.world.rng.fork('procgen:ports');
      const pencilList = generatePencilPorts(pencilRng, POOL, PORTS);
      for (const pp of pencilList) {
        this.pencilPorts[pp.id] = pp;
        this.world.entities.put(`port:${pp.id}`, makePortCell({
          id: pp.id, name: pp.name, lat: pp.lat, lng: pp.lng, country: null, annualTeus: 0, tier: 3,
          provenance: { source: 'procgen', trust: pp.trust, seed_label: pp.seedLabel },
        }));
        const parentCommodity = PORTS_BY_ID[pp.parentPortId].commodity;
        const base = economy.basePriceForPort(pp.parentPortId);
        const priceRng = this.world.rng.fork(`market:${pp.id}:init`);
        const price = Math.round(base * (1 + priceRng.float(-0.15, 0.15)));
        this.world.entities.put(`market:${pp.id}`, makeMarketCell({
          portId: pp.id, commodity: parentCommodity, basePrice: base, price, demand: 1.0,
          provenance: { source: 'procgen', trust: pp.trust, seed_label: pp.seedLabel },
        }));
      }
      // The seeded reveal schedule (arch/cargo-line-fact-landed.md §5.2):
      // deterministic from world.rng.fork('pool:reveal') + entry index.
      // Tuned so the first landing fires at ~tick 4 and reveals land roughly
      // every 3 ticks thereafter; a `snapshot`-kind entry (a `revised`
      // landing on the first pool port to ink) rides along so all three
      // fact_landed verdicts are reachable inside a 60-tick window, fully
      // offline (no L1/roster dependency).
      const revealRng = this.world.rng.fork('pool:reveal');
      this.revealSchedule = buildRevealSchedule(revealRng, pencilList);
      this._firstScar = false;

      this.world.entities.put(companyId, makeCompanyCell({
        id: companyId, name: companyName, cashMinorUnits: STARTING_CASH, reputation: 0, unlocks: [],
      }));
      this.world.book({ type: 'game_start', seed, home_port_id: HOME_PORT_ID, starting_cash: STARTING_CASH, provenance: { source: 'player', trust: 1.0 } });
      this._log(`Welcome aboard. ${companyName} starts at ${PORTS_BY_ID[HOME_PORT_ID].name} with $${STARTING_CASH.toLocaleString()}.`);
    }

    // ── internal helpers ────────────────────────────────────────────

    _log(msg) {
      this._eventLog.push({ tick: this.world.tick_no, msg });
    }

    get company() { return this.world.entities.get(this.companyId).state; }

    _setCompany(patch) {
      const next = { ...this.company, ...patch };
      this.world.entities.put(this.companyId, makeCompanyCell({
        id: next.id, name: next.name, cashMinorUnits: next.cash, reputation: next.reputation, unlocks: next.unlocks,
      }));
      return next;
    }

    _market(portId) { return this.world.entities.get(`market:${portId}`).state; }

    _setMarket(portId, patch) {
      const next = { ...this._market(portId), ...patch };
      this.world.entities.put(`market:${portId}`, makeMarketCell(next));
      return next;
    }

    // All world-fact port ids currently in play: the real canon ports plus
    // every generated pencil port (proven or not, erased or not — a ghost
    // still has a market cell, it just shouldn't be routed to; see
    // _computeLegAny / _reroutePencilPort).
    _allPortIds() { return [...Object.keys(PORTS_BY_ID), ...Object.keys(this.pencilPorts)]; }

    _portName(portId) {
      if (PORTS_BY_ID[portId]) return PORTS_BY_ID[portId].name;
      const cell = this.world.entities.get(`port:${portId}`);
      return cell ? cell.state.name : portId;
    }

    // Uniform port metadata for BOTH real and pencil ports — both are stored
    // as ordinary port:<id> cells, so this is just one EntityStore read; the
    // medium (ink/pencil/ghost) is read straight off the cell's own
    // provenance, never guessed from the id's shape.
    _portMeta(portId) {
      const cell = this.world.entities.get(`port:${portId}`);
      if (!cell) throw new Error(`_portMeta: unknown port ${portId}`);
      const s = cell.state;
      return {
        id: portId, name: s.name, lat: s.lat, lng: s.lng, provenance: s.provenance,
        isPencil: s.provenance.source === 'procgen', erased: !!s.provenance.erased,
      };
    }

    // Pencil ports have no entry in portsData.REGIONS, so region/lat-lng
    // lookups fall back to the pencil registry's `parentPortId` (the
    // nearest real port at generation time — see game/src/pencil.js) for
    // anything that isn't a real port. This is the L4 "this-week bound"
    // named in arch/cargo-line-fact-landed.md §5.3/§8: every pencil port
    // inherits a real coast/region rather than needing its own footprint
    // rule.
    _regionAny(portId) {
      if (PORTS_BY_ID[portId]) return portsData.regionOf(portId);
      const pp = this.pencilPorts[portId];
      if (pp) return portsData.regionOf(pp.parentPortId);
      throw new Error(`_regionAny: unknown port ${portId}`);
    }

    _latlngAny(portId) {
      if (PORTS_BY_ID[portId]) return PORTS_BY_ID[portId];
      const cell = this.world.entities.get(`port:${portId}`);
      if (cell) return { lat: cell.state.lat, lng: cell.state.lng };
      throw new Error(`_latlngAny: unknown port ${portId}`);
    }

    // Generalizes economy.computeGlobalRouteLeg() to a leg where either end
    // may be a pencil port. When both ends are real ports this delegates
    // straight to the untouched Phase 1/2 function (byte-identical
    // behavior, same as economy.js's own WEST_COAST<->EAST_GULF_COAST fast
    // path). Otherwise it re-derives the same same-region / cross-region
    // corridor math using the pencil port's own jittered lat/lng and its
    // parent's region — same corridor table, same chokepoint gating
    // (Hormuz's blocksTransit refusal included), just not delegated because
    // economy.js's own PORTS_BY_ID-keyed regionOf() would throw on a pencil
    // id. Kept here (not in economy.js) so economy.js — the Phase 1/2
    // foundation — stays untouched.
    _computeLegAny(fromId, toId, shipClass) {
      if (PORTS_BY_ID[fromId] && PORTS_BY_ID[toId]) {
        return computeGlobalRouteLeg(fromId, toId, shipClass, this._chokepointStatusSnapshot());
      }
      const regionA = this._regionAny(fromId);
      const regionB = this._regionAny(toId);
      const a = this._latlngAny(fromId);
      const b = this._latlngAny(toId);
      const directNm = haversineNm(a, b);

      if (regionA === regionB) {
        const steamingDays = directNm / (shipClass.speedKn * 24);
        return {
          ok: true, usesPanama: false, chokepointsUsed: [], distanceNm: directNm,
          legDurationTicks: Math.max(1, Math.round(steamingDays)), tollTotal: 0, tollBreakdown: [],
        };
      }

      const key = corridorKey(regionA, regionB);
      let corridor = CORRIDORS[key];
      let usesPanamaFastPath = false;
      if (key === corridorKey('WEST_COAST', 'EAST_GULF_COAST')) {
        corridor = { chokepoints: ['panama'], detourMult: PANAMA_DETOUR_MULT, forwardFrom: 'WEST_COAST' };
        usesPanamaFastPath = true;
      }
      if (!corridor) throw new Error(`_computeLegAny: no corridor defined for ${regionA} <-> ${regionB}`);

      const distanceNm = directNm * corridor.detourMult;
      const steamingDays = distanceNm / (shipClass.speedKn * 24);
      let extraDays = 0;
      let tollTotal = 0;
      const tollBreakdown = [];
      const chokepointsUsed = [];
      const orderedChokepoints = regionA === corridor.forwardFrom ? corridor.chokepoints : [...corridor.chokepoints].reverse();

      for (const cpId of orderedChokepoints) {
        const cp = CHOKEPOINTS[cpId];
        const status = currentChokepointStatus(cpId, this._chokepointStatusSnapshot());
        chokepointsUsed.push(cpId);
        if (cpId === 'panama' && !shipClass.canTransitPanama) {
          return { ok: false, reason: `${shipClass.name} is too large to transit the Panama Canal — pick a route that avoids it.` };
        }
        if (cp.blocksTransit && status === 'disrupted') {
          return { ok: false, reason: `${cp.name} is effectively closed to commercial shipping right now — there is no sea route around it for this corridor.` };
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
        ok: true, usesPanama: usesPanamaFastPath || corridor.chokepoints.includes('panama'),
        chokepointsUsed, distanceNm,
        legDurationTicks: Math.max(1, Math.round(steamingDays + extraDays)),
        tollTotal, tollBreakdown,
      };
    }

    // Nearest real (ink) port on the erased pencil port's own coast/region —
    // "reroute affected ships ... nearest ink port same coast" (Fable §7.2).
    _nearestInkPortSameCoast(pencilPortId) {
      const pp = this.pencilPorts[pencilPortId];
      const region = portsData.regionOf(pp.parentPortId);
      let best = null, bestNm = Infinity;
      for (const p of PORTS) {
        if (portsData.regionOf(p.id) !== region) continue;
        const nm = haversineNm({ lat: pp.lat, lng: pp.lng }, p);
        if (nm < bestNm) { bestNm = nm; best = p.id; }
      }
      return best || pp.parentPortId;
    }

    // A decoy just erased: any route/ship pointed at it is rerouted to the
    // nearest ink port on the same coast — `stake_rerouted` booked
    // separately from the fact_landed entry itself (arch/cargo-line-fact-
    // landed.md §2). Simplification, named as a deviation in PLAYTEST.md: a
    // ship already mid-leg keeps its current ticksRemaining rather than
    // recomputing a partial-leg ETA to the new destination — it is
    // "this-week"-buildable and never leaves the ship stranded or the book
    // inconsistent, but it is not a literal recomputation of a ship's
    // position on the new leg.
    _reroutePencilPort(pencilPortId, seedLabel) {
      const inkId = this._nearestInkPortSameCoast(pencilPortId);
      for (const routeId of this.routeIds) {
        const route = this.world.entities.get(routeId).state;
        if (route.fromPortId !== pencilPortId && route.toPortId !== pencilPortId) continue;
        const newFrom = route.fromPortId === pencilPortId ? inkId : route.fromPortId;
        const newTo = route.toPortId === pencilPortId ? inkId : route.toPortId;
        this.world.entities.put(routeId, makeRouteCell({ ...route, fromPortId: newFrom, toPortId: newTo }));
        for (const shipId of route.assignedShipIds) {
          const t = this.transit[shipId];
          if (t) {
            if (t.routeFrom === pencilPortId) t.routeFrom = inkId;
            if (t.routeTo === pencilPortId) t.routeTo = inkId;
          }
          this.world.book({
            type: 'stake_rerouted', ship_id: shipId, route_id: routeId,
            erased_port_id: pencilPortId, rerouted_to_port_id: inkId,
            provenance: { source: 'procgen', trust: 0.6, seed_label: seedLabel },
          });
          this._log(`${shipId} rerouted — nearest real port is ${this._portName(inkId)}.`);
        }
      }
    }

    // ── fact_landed: the one event the ring shares (arch/cargo-line-fact-
    // landed.md §1-2). Three booking occasions, all reachable OFFLINE via
    // the seeded reveal schedule — no L1/roster dependency.

    _revealPoolFact(entry) {
      const pp = this.pencilPorts[entry.pencilPortId];
      if (!pp || pp.proven || pp.erased) return;
      const poolFact = POOL_BY_ID[pp.poolId];
      const portCell = this.world.entities.get(`port:${pp.id}`).state;
      const fromProv = portCell.provenance;
      const toProv = { source: 'canon', trust: poolFact.trust, as_of: poolFact.as_of, source_url: poolFact.source_url };
      this.world.entities.put(`port:${pp.id}`, makePortCell({
        id: pp.id, name: poolFact.value.name, lat: poolFact.value.lat, lng: poolFact.value.lng,
        country: portCell.country, annualTeus: poolFact.value.teu || 0, tier: portCell.tier,
        provenance: toProv,
      }));
      pp.lat = poolFact.value.lat; pp.lng = poolFact.value.lng; pp.name = poolFact.value.name; pp.proven = true;
      this.world.book({
        type: 'fact_landed', entity_id: `port:${pp.id}`, cell_type: 'port',
        from: { source: fromProv.source, trust: fromProv.trust, seed_label: fromProv.seed_label },
        to: { source: 'canon', trust: toProv.trust, as_of: toProv.as_of, source_url: toProv.source_url },
        verdict: 'proven', landed_by: 'pool',
      });
      this._log(`SCOUT · ${poolFact.value.name} · PROVEN · as of ${toProv.as_of} · trust ${Math.round(toProv.trust * 100)}% · source ▸ ${toProv.source_url}`);
    }

    _eraseDecoy(entry) {
      const pp = this.pencilPorts[entry.pencilPortId];
      if (!pp || pp.proven || pp.erased) return;
      const portCell = this.world.entities.get(`port:${pp.id}`).state;
      const fromProv = portCell.provenance;
      const toProv = { source: 'procgen', trust: 0, seed_label: fromProv.seed_label, erased: true };
      this.world.entities.put(`port:${pp.id}`, makePortCell({ ...portCell, provenance: toProv }));
      pp.erased = true;
      this.world.book({
        type: 'fact_landed', entity_id: `port:${pp.id}`, cell_type: 'port',
        from: { source: fromProv.source, trust: fromProv.trust, seed_label: fromProv.seed_label },
        to: toProv,
        verdict: 'erased', landed_by: 'decoy',
      });
      const seedLabel = `decoy_erase:${pp.id}:${this.world.tick_no}`;
      this._log(`✎ ghost — ${pp.name} was never there. Erased.${this._firstScar ? '' : ' first scar — every navigator has one.'}`);
      this._firstScar = true;
      this._reroutePencilPort(pp.id, seedLabel);
    }

    _reviseSnapshot(entry) {
      const pp = this.pencilPorts[entry.pencilPortId];
      if (!pp || !pp.proven) return; // only revises an already-inked cell
      const portCell = this.world.entities.get(`port:${pp.id}`).state;
      const fromProv = portCell.provenance;
      if (fromProv.source !== 'canon') return;
      const toProv = { source: 'canon', trust: Math.min(1, fromProv.trust + 0.05), as_of: entry.newAsOf, source_url: fromProv.source_url };
      this.world.entities.put(`port:${pp.id}`, makePortCell({ ...portCell, provenance: toProv }));
      this.world.book({
        type: 'fact_landed', entity_id: `port:${pp.id}`, cell_type: 'port',
        from: { source: fromProv.source, trust: fromProv.trust, as_of: fromProv.as_of, source_url: fromProv.source_url },
        to: { source: 'canon', trust: toProv.trust, as_of: toProv.as_of, source_url: toProv.source_url },
        verdict: 'revised', landed_by: 'snapshot',
      });
      this._log(`AS OF re-stamp · ${portCell.name} · now as of ${toProv.as_of} (trust ${Math.round(toProv.trust * 100)}%).`);
    }

    _tickRevealSchedule() {
      const dueTick = this.world.tick_no;
      for (const entry of this.revealSchedule) {
        if (entry.tick !== dueTick) continue;
        if (entry.kind === 'pool') this._revealPoolFact(entry);
        else if (entry.kind === 'decoy') this._eraseDecoy(entry);
        else if (entry.kind === 'snapshot') this._reviseSnapshot(entry);
      }
    }

    // The Tell rendered as numbers (Fable §3.3): ink gives a number, pencil
    // gives a spread whose width is (1 - trust). `via` names each
    // chokepoint the leg transits AND the medium of its current weather
    // (ink = a real, dated disruption; pencil = the seeded toy/simulated
    // mechanic — Fable §3.2's chokepoint-weather distinction).
    previewStake(shipId, portId) {
      const shipCell = this.world.entities.get(shipId);
      if (!shipCell) return { ok: false, reason: `Unknown ship ${shipId}` };
      const ship = shipCell.state;
      const cls = SHIP_CLASSES[ship.classId];
      const fromId = ship.positionPortId;
      const leg = this._computeLegAny(fromId, portId, cls);
      if (!leg.ok) return { ok: false, reason: leg.reason };
      const meta = this._portMeta(portId);
      if (meta.erased) return { ok: false, reason: `${meta.name} was erased — it was never there. Pick another port.` };
      const buyPrice = this._market(fromId).price;
      const destMarket = this._market(portId);
      const netMid = tripRevenue({ teu: cls.capacityTeu, buyPrice, sellPrice: destMarket.price }) - leg.tollTotal;
      let low, high;
      if (meta.isPencil) {
        const trust = meta.provenance.trust;
        const spread = 0.35 * (1 - trust) + 0.1; // pencil pays more — the decoy rate IS the risk premium
        low = Math.round(netMid * (1 - spread));
        high = Math.round(netMid * (1 + spread * 1.8));
      } else {
        low = netMid; high = netMid;
      }
      const via = (leg.chokepointsUsed || []).map((id) => {
        if (id === 'panama') return { id, medium: this.panama.disrupted ? 'pencil' : 'ink' };
        const c = this.chokepoints[id];
        return { id, medium: c && c.current.source === 'procgen' ? 'pencil' : 'ink' };
      });
      return { ok: true, low, high, days: leg.legDurationTicks, unproven: meta.isPencil, via };
    }

    // Phase 2: the current status of every chokepoint, in the shape
    // economy.computeGlobalRouteLeg()'s chokepointStatusById param expects —
    // panama included (from the Phase 1 toy mechanic, not this.chokepoints),
    // so a single snapshot covers every corridor uniformly.
    _chokepointStatusSnapshot() {
      const snap = { panama: { status: this.panama.disrupted ? 'disrupted' : 'open' } };
      for (const id of Object.keys(this.chokepoints)) {
        if (id === 'panama') continue; // panama's live gameplay status is the Phase 1 toy mechanic (this.panama) above, not its static canon cell — CHOKEPOINT_IDS includes 'panama' too (for display, see getState()), so this loop must not clobber it
        snap[id] = { status: this.chokepoints[id].current.value };
      }
      return snap;
    }

    _startLeg(shipId, routeId, routeFrom, routeTo, leg) {
      const ship = this.world.entities.get(shipId).state;
      const cls = SHIP_CLASSES[ship.classId];
      const originId = leg === 'outbound' ? routeFrom : routeTo;
      const destId = leg === 'outbound' ? routeTo : routeFrom;
      const legInfo = this._computeLegAny(originId, destId, cls);
      if (!legInfo.ok) {
        this._log(`${shipId} cannot start leg ${originId} -> ${destId}: ${legInfo.reason}`);
        return false;
      }
      const originMarket = this._market(originId);
      const buyPrice = originMarket.price;
      this._setMarket(originId, { price: applyLoadPressure(originMarket, cls.capacityTeu, cls.capacityTeu) });
      this.transit[shipId] = {
        routeId, routeFrom, routeTo, leg,
        ticksRemaining: legInfo.legDurationTicks,
        legTotalTicks: legInfo.legDurationTicks, // kept alongside ticksRemaining purely so the UI can render progress; not read by any game logic
        usesPanama: legInfo.usesPanama,
        chokepointsUsed: legInfo.chokepointsUsed || [],
        tollBreakdown: legInfo.tollBreakdown || [],
        tollTotal: legInfo.tollTotal, // Phase 2 fix: previously zeroed for any non-Panama leg; a Suez/Hormuz/etc toll must survive too
        buyPrice,
      };
      this.world.entities.put(shipId, makeShipCell({
        ...ship, positionPortId: originId, cargoTeu: cls.capacityTeu, routeId,
      }));
      this.world.book({ type: 'leg_started', ship_id: shipId, route_id: routeId, from: originId, to: destId, ticks: legInfo.legDurationTicks, uses_panama: legInfo.usesPanama, chokepoints: legInfo.chokepointsUsed || [] });
      return true;
    }

    // Phase 1's one toy chokepoint event, seeded weather, never news: this
    // is a gameplay abstraction of the real 2023-24 Panama drought
    // precedent (see game/data/chokepoints.js "panama".status for the
    // REAL, currently-recovered canon fact), re-drawn every game from
    // `rng.chance(...)` — so both the booking and the player-facing line
    // carry source:'procgen' / the pencil register, never phrased as an
    // actual current headline (Fable §6.3 / the coordinator's "never
    // narrate a seeded fact as news" rule).
    _tickPanamaEvent() {
      const w = this.world;
      if (this.panama.disrupted) {
        this.panama.ticksRemaining -= 1;
        if (this.panama.ticksRemaining <= 0) {
          this.panama.disrupted = false;
          w.book({ type: 'panama_disruption_end', provenance: { source: 'procgen', trust: 0.6, seed_label: `panama_check:${w.tick_no}` } });
          this._log('✎ Pencil weather clears: the seeded Panama slowdown has ended. Transit times and tolls are back to normal.');
        }
        return;
      }
      if (w.tick_no < PANAMA_EVENT_WARMUP_TICKS) return;
      const rng = w.rng.fork(`panama_check:${w.tick_no}`);
      if (rng.chance(PANAMA_EVENT_CHANCE_PER_TICK)) {
        this.panama.disrupted = true;
        this.panama.ticksRemaining = rng.int(PANAMA_EVENT_MIN_DURATION, PANAMA_EVENT_MAX_DURATION);
        w.book({ type: 'panama_disruption_start', duration_ticks: this.panama.ticksRemaining, provenance: { source: 'procgen', trust: 0.6, seed_label: `panama_check:${w.tick_no}` } });
        this._log(`✎ Pencil weather: Panama Canal — a seeded, drought-style slowdown (drawn from the 2023-24 precedent, not a live report) has spiked trans-coast transit time and tolls for about ${this.panama.ticksRemaining} days. Reroute coastal, or ride it out.`);
      }
    }

    // Phase 2: the news happens while you play. Each dynamic chain (see
    // DYNAMIC_CHOKEPOINTS) has a chance per tick, once past a warmup, of
    // moving one step better (deescalate) or one step worse (relapse) along
    // STATUS_ORDER — deliberately asymmetric toward the real trend at this
    // canon's research date (see chokepoints.js notes), not a coin flip.
    // Every transition is booked AND re-attested through
    // provenance.reattestSimulated() so the change is honestly marked
    // source:'procgen' (an in-game simulation), never confused with the
    // REAL researched cell it started from — both stay readable via
    // getState().chokepoints[id] = {real, current}.
    _tickChokepointEvents() {
      const w = this.world;
      if (w.tick_no < CHOKEPOINT_EVENT_WARMUP_TICKS) return;

      const applyStep = (chainKey, ids, cfg) => {
        const rep = this.chokepoints[ids[0]];
        rep.dwellTicks += 1;
        if (rep.dwellTicks < cfg.minDwellTicks) return;
        const idx = STATUS_ORDER.indexOf(rep.current.value);
        const rng = w.rng.fork(`chokepoint:${chainKey}:${w.tick_no}`);
        let nextIdx = idx;
        if (idx > 0 && rng.chance(cfg.deescalateChancePerTick)) nextIdx = idx - 1; // move toward 'open'
        else if (idx < STATUS_ORDER.length - 1 && rng.chance(cfg.relapseChancePerTick)) nextIdx = idx + 1; // move toward 'disrupted'
        if (nextIdx === idx) return;
        const nextStatus = STATUS_ORDER[nextIdx];
        const improved = nextIdx < idx;
        const seedLabel = `chokepoint:${chainKey}:${w.tick_no}`;
        for (const id of ids) {
          const cur = this.chokepoints[id];
          cur.current = reattestSimulated(cur.current, nextStatus, seedLabel, `${improved ? 'De-escalated' : 'Relapsed'} from '${STATUS_ORDER[idx]}' to '${nextStatus}' — pencil, not news: a seeded, in-game simulation of how the real situation might evolve, not a new real observation.`);
          cur.dwellTicks = 0;
          w.book({ type: 'chokepoint_status_change', chokepoint_id: id, from: STATUS_ORDER[idx], to: nextStatus, provenance: { source: 'procgen', trust: 0.5, seed_label: seedLabel } });
        }
        const names = ids.map((id) => CHOKEPOINTS[id].name).join(' / ');
        this._log(`✎ Pencil update — ${names}: a seeded guess at how the real situation might evolve moves status to "${nextStatus}" (not new real news). ${improved ? 'A route through here is getting cheaper/faster.' : 'A route through here just got more expensive/slower — or blocked outright.'}`);
      };

      applyStep('hormuz', ['hormuz'], DYNAMIC_CHOKEPOINTS.hormuz);
      applyStep('red_sea', DYNAMIC_CHOKEPOINTS.red_sea.ids, DYNAMIC_CHOKEPOINTS.red_sea);
    }

    _tickShip(shipId) {
      const t = this.transit[shipId];
      if (!t) return; // idle ship, no route, no cost
      const ship = this.world.entities.get(shipId).state;
      const cls = SHIP_CLASSES[ship.classId];
      const opCost = adjustedDailyOpCost(cls); // Phase 2: fuel-index-adjusted, see economy.js

      this.world.bookLedger({ debit: this.companyId, credit: 'operations', amount: opCost, memo: `daily ops ${shipId}` });
      this._setCompany({ cash: this.company.cash - opCost });

      t.ticksRemaining -= 1;
      if (t.ticksRemaining > 0) return;

      const destId = t.leg === 'outbound' ? t.routeTo : t.routeFrom;
      const sellPrice = this._market(destId).price;
      const revenue = tripRevenue({ teu: cls.capacityTeu, buyPrice: t.buyPrice, sellPrice });
      const net = revenue - t.tollTotal;

      if (net >= 0) {
        this.world.bookLedger({ debit: 'buyer', credit: this.companyId, amount: net, memo: `cargo delivered ${shipId} @ ${destId}` });
      } else {
        this.world.bookLedger({ debit: this.companyId, credit: 'toll_authority', amount: -net, memo: `net loss ${shipId} @ ${destId}` });
      }
      this._setCompany({ cash: this.company.cash + net });
      this._setMarket(destId, { price: applyDeliverPressure(this._market(destId), cls.capacityTeu, cls.capacityTeu) });

      if (t.usesPanama && this.panama.disrupted && net > 0) this._stormProfit = true;

      this.world.book({ type: 'ship_arrived', ship_id: shipId, port_id: destId, net, uses_panama: t.usesPanama, chokepoints: t.chokepointsUsed });
      const chokeSuffix = (t.chokepointsUsed && t.chokepointsUsed.length)
        ? ` (via ${t.chokepointsUsed.map((id) => CHOKEPOINTS[id].name).join(' + ')}, $${t.tollTotal.toLocaleString()} toll/risk)`
        : '';
      this._log(`${cls.name} ${shipId} arrived at ${this._portName(destId)}: ${net >= 0 ? '+' : ''}$${net.toLocaleString()}${chokeSuffix}`);

      const nextLeg = t.leg === 'outbound' ? 'inbound' : 'outbound';
      this._startLeg(shipId, t.routeId, t.routeFrom, t.routeTo, nextLeg);
    }

    _checkAchievements() {
      const cash = this.company.cash;
      if (!this.achievements.has('first_profit_double') && cash >= STARTING_CASH * ACHIEVEMENT_DOUBLE_CASH_MULT) {
        this.achievements.add('first_profit_double');
        this.world.book({ type: 'achievement', id: 'first_profit_double' });
        this._log(`🏆 First Profit Double — $${STARTING_CASH.toLocaleString()} is now $${cash.toLocaleString()}. Bank it and start a new run, or push your luck.`);
      }
      if (!this.achievements.has('storm_rider') && this._stormProfit) {
        this.achievements.add('storm_rider');
        this.world.book({ type: 'achievement', id: 'storm_rider' });
        this._log('🏆 Storm Rider — you turned a profit on a Panama route during the disruption.');
      }
    }

    // ── public actions (each is a booked, replayable step) ──────────

    buyShip(classId) {
      const cls = SHIP_CLASSES[classId];
      if (!cls) return { ok: false, reason: `Unknown ship class ${classId}` };
      const company = this.company;
      if (company.cash < cls.purchaseCost) {
        return { ok: false, reason: `Not enough cash: need $${cls.purchaseCost.toLocaleString()}, have $${company.cash.toLocaleString()}` };
      }
      this.shipSeq += 1;
      const shipId = `ship_${this.shipSeq}`;
      this.world.entities.put(shipId, makeShipCell({
        id: shipId, companyId: this.companyId, classId, capacityTeu: cls.capacityTeu, speedKn: cls.speedKn,
        canTransitPanama: cls.canTransitPanama, cargoTeu: 0, positionPortId: HOME_PORT_ID, condition: 100, routeId: null,
      }));
      this.world.bookLedger({ debit: this.companyId, credit: 'shipyard', amount: cls.purchaseCost, memo: `buy ${cls.name} (${shipId})` });
      this._setCompany({ cash: company.cash - cls.purchaseCost });
      this.shipIds.push(shipId);
      this._log(`Bought a ${cls.name} (${shipId}) for $${cls.purchaseCost.toLocaleString()}.`);
      return { ok: true, shipId };
    }

    previewRoute(fromPortId, toPortId, classId) {
      const cls = SHIP_CLASSES[classId];
      if (!cls) return { ok: false, reason: `Unknown ship class ${classId}` };
      return this._computeLegAny(fromPortId, toPortId, cls);
    }

    // Generalized to accept a pencil port as `toPortId` — the whole point of
    // STAKE (Fable §2/§3.3): every action is putting a ship on a fact you
    // cannot yet prove. Returns `medium: 'ink'|'pencil'` so the renderer can
    // count pencil-stakes-placed vs ink-stakes-placed (the Tell's first
    // telemetry instrument, Fable §7.3/§8).
    assignShip(shipId, fromPortId, toPortId) {
      const shipCell = this.world.entities.get(shipId);
      if (!shipCell) return { ok: false, reason: `Unknown ship ${shipId}` };
      const ship = shipCell.state;
      if (ship.companyId !== this.companyId) return { ok: false, reason: 'Not your ship' };
      const cls = SHIP_CLASSES[ship.classId];
      const destMeta = this._portMeta(toPortId);
      if (destMeta.erased) return { ok: false, reason: `${destMeta.name} was erased — it was never there. Pick another port.` };
      const probe = this._computeLegAny(fromPortId, toPortId, cls);
      if (!probe.ok) {
        this._log(`Cannot assign ${shipId} on ${this._portName(fromPortId)} → ${this._portName(toPortId)}: ${probe.reason}`);
        return { ok: false, reason: probe.reason };
      }
      this.routeSeq += 1;
      const routeId = `route_${this.routeSeq}`;
      this.world.entities.put(routeId, makeRouteCell({
        id: routeId, companyId: this.companyId, fromPortId, toPortId,
        distanceNm: probe.distanceNm, usesPanama: probe.usesPanama, assignedShipIds: [shipId],
      }));
      this.routeIds.push(routeId);
      this._startLeg(shipId, routeId, fromPortId, toPortId, 'outbound');
      this.world.book({ type: 'ship_assigned', ship_id: shipId, route_id: routeId, from: fromPortId, to: toPortId, medium: destMeta.isPencil ? 'pencil' : 'ink' });
      this._log(`${cls.name} ${shipId} assigned: ${this._portName(fromPortId)} → ${this._portName(toPortId)}${probe.usesPanama ? ' (via Panama)' : ''}.`);
      return { ok: true, routeId, medium: destMeta.isPencil ? 'pencil' : 'ink' };
    }

    unassignShip(shipId) {
      const shipCell = this.world.entities.get(shipId);
      if (!shipCell) return { ok: false, reason: `Unknown ship ${shipId}` };
      const ship = shipCell.state;
      if (!ship.routeId) return { ok: false, reason: `${shipId} is already idle` };
      delete this.transit[shipId];
      this.world.entities.put(shipId, makeShipCell({ ...ship, routeId: null }));
      this.world.book({ type: 'ship_unassigned', ship_id: shipId });
      this._log(`${shipId} pulled off its route, parked at ${this._portName(ship.positionPortId)}.`);
      return { ok: true };
    }

    tick() {
      this.world.tick(() => {
        this._tickPanamaEvent();
        this._tickChokepointEvents();
        this._tickRevealSchedule();
        for (const portId of this._allPortIds()) {
          const m = this._market(portId);
          const rng = this.world.rng.fork(`market:${portId}:${this.world.tick_no}`);
          this._setMarket(portId, { price: driftPrice(m, rng) });
        }
        for (const shipId of this.shipIds) this._tickShip(shipId);
        this._checkAchievements();
      });
      return this.getState();
    }

    // ── read-only snapshot for the UI ────────────────────────────────
    //
    // Deliberately does NOT include world.stateHash() — that hashes the
    // *entire* witness-log and is O(log length); calling it every tick
    // (once per UI frame in a live session) would make the whole game
    // O(n^2) over a session. Call replayHash() explicitly instead, at
    // whatever checkpoint cadence you actually need it (tests, save
    // points), never from the hot per-tick UI path.

    getState() {
      const ships = this.shipIds.map((id) => {
        const s = this.world.entities.get(id).state;
        const t = this.transit[id];
        return { ...s, transit: t ? { ...t } : null };
      });
      const routes = this.routeIds.map((id) => this.world.entities.get(id).state);
      const markets = {};
      for (const portId of this._allPortIds()) markets[portId] = this._market(portId);

      // Pencil Sea: every generated pencil port's CURRENT cell (proven,
      // still pencil, or erased/ghost) — the renderer draws medium straight
      // off `provenance.source` (+ `.erased`), per Fable §5.5 ("provenance =
      // medium; there is no fourth medium, so there is no way to draw an
      // unmarked fact"). `breatheSeed` is the pencil port's own seed_label,
      // for the renderer's per-cell breathing phase (Fable §5.2, φ from the
      // cell's seed hash).
      const pencilPorts = {};
      for (const id of Object.keys(this.pencilPorts)) {
        const meta = this._portMeta(id);
        const pp = this.pencilPorts[id];
        pencilPorts[id] = {
          id, name: meta.name, lat: meta.lat, lng: meta.lng, provenance: meta.provenance,
          isPencil: meta.isPencil, erased: meta.erased, parentPortId: pp.parentPortId,
          isDecoy: pp.isDecoy, breatheSeed: pp.seedLabel,
        };
      }

      // Phase 2: every chokepoint's live status for the UI, carrying BOTH
      // its real researched cell and its current (possibly simulated) one —
      // exactly the REAL-vs-PROCGEN legibility the provenance envelope
      // exists for; describe() renders the human-readable "ink still wet"
      // line for each.
      const chokepoints = {};
      for (const id of Object.keys(this.chokepoints)) {
        const c = this.chokepoints[id];
        chokepoints[id] = {
          id, name: CHOKEPOINTS[id].name, kind: CHOKEPOINTS[id].kind,
          status: c.current.value,
          real: { status: c.real.value, description: describe(c.real) },
          current: { status: c.current.value, description: describe(c.current), isSimulated: c.current.source === 'procgen' },
        };
      }

      return {
        tick: this.world.tick_no,
        seed: this.world.seed,
        company: this.company,
        ships,
        routes,
        markets,
        panama: { ...this.panama },
        chokepoints,
        pencilPorts,
        worldFacts: {
          panamaCanon: { name: CHOKEPOINTS.panama.name, description: describe(CHOKEPOINTS.panama.status) },
          bunkerFuelUsdPerTonne: { value: read(snapshotData.BUNKER_FUEL_VLSFO), description: describe(snapshotData.BUNKER_FUEL_VLSFO) },
          freightIndexUsdPer40ft: { value: read(snapshotData.FREIGHT_INDEX_WCI), description: describe(snapshotData.FREIGHT_INDEX_WCI) },
          fuelIndexMult: economy.FUEL_INDEX_MULT,
          freightIndexMult: economy.FREIGHT_INDEX_MULT,
        },
        achievements: [...this.achievements],
        log: this._eventLog.slice(-200),
      };
    }

    // Explicit, on-demand replay-verification hash (see note above).
    replayHash() {
      return this.world.stateHash();
    }
  }

  return { GameEngine, STARTING_CASH, HOME_PORT_ID, SHIP_CLASSES, PORTS, PORTS_BY_ID, CHOKEPOINTS, CHOKEPOINT_IDS };
});
