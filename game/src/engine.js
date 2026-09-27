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
    );
  } else {
    root.CLTEngine = factory(root.CLTWorld, root.CLTEconomy, root.CLT_PORTS, root.CLT_CHOKEPOINTS, root.CLT_SNAPSHOT, root.CLTProvenance);
  }
})(typeof window !== 'undefined' ? window : this, function (kernel, economy, portsData, chokepointsData, snapshotData, provenance) {
  const { World, makeCompanyCell, makeShipCell, makeRouteCell, makePortCell, makeMarketCell } = kernel;
  const {
    SHIP_CLASSES, initialMarketState, driftPrice,
    applyLoadPressure, applyDeliverPressure, tripRevenue,
    computeGlobalRouteLeg, adjustedDailyOpCost,
  } = economy;
  const { PORTS, PORTS_BY_ID } = portsData;
  const { CHOKEPOINTS, CHOKEPOINT_IDS } = chokepointsData;
  const { read, describe, reattestSimulated } = provenance;

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
      const legInfo = computeGlobalRouteLeg(originId, destId, cls, this._chokepointStatusSnapshot());
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
      this._log(`${cls.name} ${shipId} arrived at ${PORTS_BY_ID[destId].name}: ${net >= 0 ? '+' : ''}$${net.toLocaleString()}${chokeSuffix}`);

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
      return computeGlobalRouteLeg(fromPortId, toPortId, cls, this._chokepointStatusSnapshot());
    }

    assignShip(shipId, fromPortId, toPortId) {
      const shipCell = this.world.entities.get(shipId);
      if (!shipCell) return { ok: false, reason: `Unknown ship ${shipId}` };
      const ship = shipCell.state;
      if (ship.companyId !== this.companyId) return { ok: false, reason: 'Not your ship' };
      const cls = SHIP_CLASSES[ship.classId];
      const probe = computeGlobalRouteLeg(fromPortId, toPortId, cls, this._chokepointStatusSnapshot());
      if (!probe.ok) {
        this._log(`Cannot assign ${shipId} on ${PORTS_BY_ID[fromPortId].name} → ${PORTS_BY_ID[toPortId].name}: ${probe.reason}`);
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
      this.world.book({ type: 'ship_assigned', ship_id: shipId, route_id: routeId, from: fromPortId, to: toPortId });
      this._log(`${cls.name} ${shipId} assigned: ${PORTS_BY_ID[fromPortId].name} → ${PORTS_BY_ID[toPortId].name}${probe.usesPanama ? ' (via Panama)' : ''}.`);
      return { ok: true, routeId };
    }

    unassignShip(shipId) {
      const shipCell = this.world.entities.get(shipId);
      if (!shipCell) return { ok: false, reason: `Unknown ship ${shipId}` };
      const ship = shipCell.state;
      if (!ship.routeId) return { ok: false, reason: `${shipId} is already idle` };
      delete this.transit[shipId];
      this.world.entities.put(shipId, makeShipCell({ ...ship, routeId: null }));
      this.world.book({ type: 'ship_unassigned', ship_id: shipId });
      this._log(`${shipId} pulled off its route, parked at ${PORTS_BY_ID[ship.positionPortId].name}.`);
      return { ok: true };
    }

    tick() {
      this.world.tick(() => {
        this._tickPanamaEvent();
        this._tickChokepointEvents();
        for (const portId of Object.keys(PORTS_BY_ID)) {
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
      for (const portId of Object.keys(PORTS_BY_ID)) markets[portId] = this._market(portId);

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
