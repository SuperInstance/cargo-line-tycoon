// Phase 1 economy sanity checks. Run with: node game/test/economy.test.js
const assert = require('assert');
const economy = require('../src/economy.js');
const portsData = require('../data/ports.js');

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`  ok — ${label}`);
}

console.log('Great-circle distance');
check('same-coast route is much shorter than a naive straight line to the opposite coast', () => {
  const laToSeattle = economy.haversineNm(portsData.PORTS_BY_ID.los_angeles, portsData.PORTS_BY_ID.seattle);
  const laToNewYork = economy.haversineNm(portsData.PORTS_BY_ID.los_angeles, portsData.PORTS_BY_ID.new_york);
  assert.ok(laToSeattle > 800 && laToSeattle < 1200, `LA-Seattle should be roughly 900-1000nm, got ${laToSeattle}`);
  assert.ok(laToNewYork > laToSeattle, 'LA-NY should be a longer haul than LA-Seattle');
});

console.log('Ship classes');
check('3 classes with distinct capacity/speed/cost', () => {
  const ids = economy.SHIP_CLASS_IDS;
  assert.strictEqual(ids.length, 3);
  const caps = ids.map((id) => economy.SHIP_CLASSES[id].capacityTeu);
  const speeds = ids.map((id) => economy.SHIP_CLASSES[id].speedKn);
  const costs = ids.map((id) => economy.SHIP_CLASSES[id].purchaseCost);
  assert.strictEqual(new Set(caps).size, 3, 'capacities must all differ');
  assert.strictEqual(new Set(speeds).size, 3, 'speeds must all differ');
  assert.strictEqual(new Set(costs).size, 3, 'costs must all differ');
});
check('ULCV cannot transit Panama; feeder and panamax can', () => {
  assert.strictEqual(economy.SHIP_CLASSES.ulcv.canTransitPanama, false);
  assert.strictEqual(economy.SHIP_CLASSES.feeder.canTransitPanama, true);
  assert.strictEqual(economy.SHIP_CLASSES.panamax.canTransitPanama, true);
});

console.log('Panama chokepoint routing');
check('same-coast route never uses Panama', () => {
  const leg = economy.computeRouteLeg('los_angeles', 'seattle', economy.SHIP_CLASSES.feeder, false);
  assert.strictEqual(leg.ok, true);
  assert.strictEqual(leg.usesPanama, false);
});
check('cross-coast route uses Panama and carries a toll', () => {
  const leg = economy.computeRouteLeg('los_angeles', 'new_york', economy.SHIP_CLASSES.feeder, false);
  assert.strictEqual(leg.ok, true);
  assert.strictEqual(leg.usesPanama, true);
  assert.ok(leg.tollTotal > 0);
});
check('ULCV is rejected on a cross-coast (Panama) route', () => {
  const leg = economy.computeRouteLeg('los_angeles', 'new_york', economy.SHIP_CLASSES.ulcv, false);
  assert.strictEqual(leg.ok, false);
  assert.ok(/too large/i.test(leg.reason));
});
check('ULCV is fine on a same-coast route', () => {
  const leg = economy.computeRouteLeg('los_angeles', 'seattle', economy.SHIP_CLASSES.ulcv, false);
  assert.strictEqual(leg.ok, true);
});
check('disruption visibly increases cross-coast transit time and toll (the predicate)', () => {
  const normal = economy.computeRouteLeg('los_angeles', 'new_york', economy.SHIP_CLASSES.panamax, false);
  const disrupted = economy.computeRouteLeg('los_angeles', 'new_york', economy.SHIP_CLASSES.panamax, true);
  assert.ok(disrupted.legDurationTicks > normal.legDurationTicks, 'disrupted transit must take visibly longer');
  assert.ok(disrupted.tollTotal > normal.tollTotal, 'disrupted toll must be visibly higher');
});
check('disruption does not affect a same-coast route at all (that IS the reroute incentive)', () => {
  const normal = economy.computeRouteLeg('los_angeles', 'seattle', economy.SHIP_CLASSES.feeder, false);
  const disrupted = economy.computeRouteLeg('los_angeles', 'seattle', economy.SHIP_CLASSES.feeder, true);
  assert.strictEqual(normal.legDurationTicks, disrupted.legDurationTicks);
  assert.strictEqual(normal.tollTotal, disrupted.tollTotal);
});

console.log('Price/demand model');
check('every port has a base price derived from its commodity', () => {
  const market = economy.initialMarketState();
  for (const id of Object.keys(portsData.PORTS_BY_ID)) {
    assert.ok(market[id].basePrice > 0, `port ${id} must have a positive base price`);
    assert.strictEqual(market[id].price, market[id].basePrice);
  }
});
check('loading cargo raises the origin price; delivering cargo lowers the destination price', () => {
  const market = economy.initialMarketState();
  const port = 'los_angeles';
  const before = market[port].price;
  const afterLoad = economy.applyLoadPressure(market[port], 800, 800);
  assert.ok(afterLoad > before, 'buying up local supply should push the price up');
  const afterDeliver = economy.applyDeliverPressure(market[port], 800, 800);
  assert.ok(afterDeliver < before, 'flooding local supply should push the price down');
});
check('price drift is seeded and deterministic, and mean-reverts toward base', () => {
  const { SeededRNG } = require('../../substrate/ts/src/world.js');
  const entry = { price: 2000, basePrice: 1000 }; // far above base
  const r1 = new SeededRNG('drift-test');
  const r2 = new SeededRNG('drift-test');
  const next1 = economy.driftPrice(entry, r1);
  const next2 = economy.driftPrice(entry, r2);
  assert.strictEqual(next1, next2, 'same seed must drift identically');
  assert.ok(next1 < entry.price, 'a price far above base should drift back down on average');
});
check('trip revenue is the simple margin: (sell - buy) * teu', () => {
  const rev = economy.tripRevenue({ teu: 800, buyPrice: 1000, sellPrice: 1200 });
  assert.strictEqual(rev, 200 * 800);
});

console.log(`\n${passed} checks passed.`);
