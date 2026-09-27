// Cargo Line Tycoon — Phase 1 GameEngine (browser + Node dual-mode)
//
// Wires the Phase 0 kernel (World/booked tick loop/seeded RNG/game cells)
// to the Phase 1 economy (great-circle routing, ship classes, price/demand,
// the one live Panama Canal chokepoint) into a playable single-player loop:
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
    );
  } else {
    root.CLTEngine = factory(root.CLTWorld, root.CLTEconomy, root.CLT_PORTS);
  }
})(typeof window !== 'undefined' ? window : this, function (kernel, economy, portsData) {
  const { World, makeCompanyCell, makeShipCell, makeRouteCell, makePortCell, makeMarketCell } = kernel;
  const {
    SHIP_CLASSES, computeRouteLeg, initialMarketState, driftPrice,
    applyLoadPressure, applyDeliverPressure, tripRevenue,
  } = economy;
  const { PORTS, PORTS_BY_ID } = portsData;

  const STARTING_CASH = 10_000_000;
  const HOME_PORT_ID = 'los_angeles';

  const PANAMA_EVENT_WARMUP_TICKS = 5;
  const PANAMA_EVENT_CHANCE_PER_TICK = 0.035;
  const PANAMA_EVENT_MIN_DURATION = 8;
  const PANAMA_EVENT_MAX_DURATION = 16;

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

      for (const p of PORTS) {
        this.world.entities.put(`port:${p.id}`, makePortCell({
          id: p.id, name: p.name, lat: p.lat, lng: p.lng, country: p.country,
          annualTeus: p.annual_teus, tier: p.tier,
          provenance: { source: 'canon', source_url: 'locales/en/canon/ports.json', trust: 1.0 },
        }));
      }

      const markets = initialMarketState();
      for (const portId of Object.keys(markets)) {
        const m = markets[portId];
        this.world.entities.put(`market:${portId}`, makeMarketCell({
          portId, commodity: PORTS_BY_ID[portId].commodity, basePrice: m.basePrice, price: m.price, demand: m.demand,
        }));
      }

      this.world.entities.put(companyId, makeCompanyCell({
        id: companyId, name: companyName, cashMinorUnits: STARTING_CASH, reputation: 0, unlocks: [],
      }));
      this.world.book({ type: 'game_start', seed, home_port_id: HOME_PORT_ID, starting_cash: STARTING_CASH });
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

    _startLeg(shipId, routeId, routeFrom, routeTo, leg) {
      const ship = this.world.entities.get(shipId).state;
      const cls = SHIP_CLASSES[ship.classId];
      const originId = leg === 'outbound' ? routeFrom : routeTo;
      const destId = leg === 'outbound' ? routeTo : routeFrom;
      const legInfo = computeRouteLeg(originId, destId, cls, this.panama.disrupted);
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
        tollTotal: legInfo.usesPanama ? legInfo.tollTotal : 0,
        buyPrice,
      };
      this.world.entities.put(shipId, makeShipCell({
        ...ship, positionPortId: originId, cargoTeu: cls.capacityTeu, routeId,
      }));
      this.world.book({ type: 'leg_started', ship_id: shipId, route_id: routeId, from: originId, to: destId, ticks: legInfo.legDurationTicks, uses_panama: legInfo.usesPanama });
      return true;
    }

    _tickPanamaEvent() {
      const w = this.world;
      if (this.panama.disrupted) {
        this.panama.ticksRemaining -= 1;
        if (this.panama.ticksRemaining <= 0) {
          this.panama.disrupted = false;
          w.book({ type: 'panama_disruption_end' });
          this._log('The Panama Canal disruption has cleared. Transit times and tolls are back to normal.');
        }
        return;
      }
      if (w.tick_no < PANAMA_EVENT_WARMUP_TICKS) return;
      const rng = w.rng.fork(`panama_check:${w.tick_no}`);
      if (rng.chance(PANAMA_EVENT_CHANCE_PER_TICK)) {
        this.panama.disrupted = true;
        this.panama.ticksRemaining = rng.int(PANAMA_EVENT_MIN_DURATION, PANAMA_EVENT_MAX_DURATION);
        w.book({ type: 'panama_disruption_start', duration_ticks: this.panama.ticksRemaining });
        this._log(`⚠ Panama Canal disruption! Drought-driven congestion has spiked trans-coast transit time and tolls for about ${this.panama.ticksRemaining} days. Reroute coastal, or ride it out.`);
      }
    }

    _tickShip(shipId) {
      const t = this.transit[shipId];
      if (!t) return; // idle ship, no route, no cost
      const ship = this.world.entities.get(shipId).state;
      const cls = SHIP_CLASSES[ship.classId];

      this.world.bookLedger({ debit: this.companyId, credit: 'operations', amount: cls.dailyOpCost, memo: `daily ops ${shipId}` });
      this._setCompany({ cash: this.company.cash - cls.dailyOpCost });

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

      this.world.book({ type: 'ship_arrived', ship_id: shipId, port_id: destId, net, uses_panama: t.usesPanama });
      this._log(`${cls.name} ${shipId} arrived at ${PORTS_BY_ID[destId].name}: ${net >= 0 ? '+' : ''}$${net.toLocaleString()}${t.usesPanama ? ` (Panama toll $${t.tollTotal.toLocaleString()})` : ''}`);

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
      return computeRouteLeg(fromPortId, toPortId, cls, this.panama.disrupted);
    }

    assignShip(shipId, fromPortId, toPortId) {
      const shipCell = this.world.entities.get(shipId);
      if (!shipCell) return { ok: false, reason: `Unknown ship ${shipId}` };
      const ship = shipCell.state;
      if (ship.companyId !== this.companyId) return { ok: false, reason: 'Not your ship' };
      const cls = SHIP_CLASSES[ship.classId];
      const probe = computeRouteLeg(fromPortId, toPortId, cls, this.panama.disrupted);
      if (!probe.ok) return { ok: false, reason: probe.reason };
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
      return {
        tick: this.world.tick_no,
        seed: this.world.seed,
        company: this.company,
        ships,
        routes,
        markets,
        panama: { ...this.panama },
        achievements: [...this.achievements],
        log: this._eventLog.slice(-200),
      };
    }

    // Explicit, on-demand replay-verification hash (see note above).
    replayHash() {
      return this.world.stateHash();
    }
  }

  return { GameEngine, STARTING_CASH, HOME_PORT_ID, SHIP_CLASSES, PORTS, PORTS_BY_ID };
});
