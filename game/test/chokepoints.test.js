// Phase 2 predicate: the 5 new chokepoint cells (Suez/Malacca/Hormuz/
// Bab-el-Mandeb/Gibraltar) sit on real, playable corridors, routing
// genuinely considers them (ship-class size limits + status), and — the
// core predicate — a real, currently-dated disruption cell measurably
// changes the optimal route/cost in a scripted run. Run with:
// node game/test/chokepoints.test.js
const assert = require('assert');
const economy = require('../src/economy.js');
const { GameEngine } = require('../src/engine.js');
const { CHOKEPOINTS } = require('../data/chokepoints.js');

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`  ok — ${label}`);
}

const { SHIP_CLASSES } = economy;
const ALL_OPEN = {
  panama: { status: 'open' }, suez: { status: 'open' }, bab_el_mandeb: { status: 'open' },
  hormuz: { status: 'open' }, malacca: { status: 'open' }, gibraltar: { status: 'open' },
};

console.log('Corridors: real lanes for the 3 new international ports');
check('Rotterdam <-> Singapore transits Gibraltar -> Suez -> Bab-el-Mandeb -> Malacca (the classic Europe-Asia liner route)', () => {
  const r = economy.computeGlobalRouteLeg('rotterdam', 'singapore', SHIP_CLASSES.panamax, ALL_OPEN);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.chokepointsUsed, ['gibraltar', 'suez', 'bab_el_mandeb', 'malacca']);
});
check('a ULCV (too big for Panama) transits Suez just fine — a real, notable asymmetry between the two canals', () => {
  const viaSuez = economy.computeGlobalRouteLeg('rotterdam', 'singapore', SHIP_CLASSES.ulcv, ALL_OPEN);
  assert.strictEqual(viaSuez.ok, true);
  const viaPanama = economy.computeGlobalRouteLeg('los_angeles', 'new_york', SHIP_CLASSES.ulcv, ALL_OPEN);
  assert.strictEqual(viaPanama.ok, false);
});
check('Ras Tanura <-> Singapore transits Malacca and Hormuz', () => {
  const r = economy.computeGlobalRouteLeg('ras_tanura', 'singapore', SHIP_CLASSES.panamax, ALL_OPEN);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(new Set(r.chokepointsUsed), new Set(['malacca', 'hormuz']));
});
check('a same-region lane (e.g. within US West Coast) still never uses a chokepoint — Phase 1 behavior preserved', () => {
  const r = economy.computeGlobalRouteLeg('los_angeles', 'seattle', SHIP_CLASSES.feeder, ALL_OPEN);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.chokepointsUsed, []);
});
check('the original US/CA Panama pair computes byte-identical numbers via the new global function and the untouched Phase 1 function', () => {
  const viaGlobal = economy.computeGlobalRouteLeg('los_angeles', 'new_york', SHIP_CLASSES.panamax, ALL_OPEN);
  const viaPhase1 = economy.computeRouteLeg('los_angeles', 'new_york', SHIP_CLASSES.panamax, false);
  assert.strictEqual(viaGlobal.distanceNm, viaPhase1.distanceNm);
  assert.strictEqual(viaGlobal.legDurationTicks, viaPhase1.legDurationTicks);
  assert.strictEqual(viaGlobal.tollTotal, viaPhase1.tollTotal);
});

console.log('THE PREDICATE: a real, currently-dated disruption cell measurably changes routing');
check('Hormuz\'s REAL, currently-dated status (the 2026 Strait of Hormuz crisis) BLOCKS Persian Gulf routing outright — not just a cost bump', () => {
  // No override map: this exercises the chokepoints' actual canon status,
  // exactly as a freshly-started game would see it.
  const real = economy.computeGlobalRouteLeg('ras_tanura', 'singapore', SHIP_CLASSES.panamax);
  assert.strictEqual(real.ok, false, 'a Persian Gulf corridor must be refused while Hormuz canon status is "disrupted"');
  assert.ok(/Strait of Hormuz/.test(real.reason));
  // The counterfactual proves it is THIS fact doing the work: force Hormuz
  // open and the same corridor succeeds.
  const counterfactual = economy.computeGlobalRouteLeg('ras_tanura', 'singapore', SHIP_CLASSES.panamax, { ...ALL_OPEN });
  assert.strictEqual(counterfactual.ok, true);
});
check('Suez/Bab-el-Mandeb\'s REAL "congested" status (the Red Sea crisis) raises both cost and transit time vs. the counterfactual-open case — the exact "visibly changes optimal routing" predicate, generalized past Panama', () => {
  const real = economy.computeGlobalRouteLeg('rotterdam', 'singapore', SHIP_CLASSES.panamax); // canon status: suez congested, bab_el_mandeb congested
  const allOpen = economy.computeGlobalRouteLeg('rotterdam', 'singapore', SHIP_CLASSES.panamax, ALL_OPEN);
  assert.strictEqual(real.ok, true);
  assert.strictEqual(allOpen.ok, true);
  assert.ok(real.legDurationTicks > allOpen.legDurationTicks, 'the real congested corridor must take visibly longer than the counterfactual-open one');
  // Suez's own toll is actually DISCOUNTED while congested (a real,
  // documented nuance — SCA cut fees to compete with the Cape route) even
  // though total transit time still rises; assert that nuance explicitly so
  // it isn't lost to a naive "everything costs more" assumption.
  const suezLegReal = real.tollBreakdown.find((b) => b.chokepointId === 'suez');
  const suezLegOpen = allOpen.tollBreakdown.find((b) => b.chokepointId === 'suez');
  assert.ok(suezLegReal.amount < suezLegOpen.amount, 'Suez toll should be lower while congested (SCA discount), even as overall transit time rises');
  const babLegReal = real.tollBreakdown.find((b) => b.chokepointId === 'bab_el_mandeb');
  const babLegOpen = allOpen.tollBreakdown.find((b) => b.chokepointId === 'bab_el_mandeb');
  assert.ok(babLegReal.amount > babLegOpen.amount, 'Bab-el-Mandeb war-risk surcharge should be higher while congested');
});
check('a corridor that never touches Hormuz/Suez/Bab-el-Mandeb is completely unaffected by their real disrupted/congested status (the reroute signal a player should notice)', () => {
  const r1 = economy.computeGlobalRouteLeg('los_angeles', 'seattle', SHIP_CLASSES.feeder); // real canon status
  const r2 = economy.computeGlobalRouteLeg('los_angeles', 'seattle', SHIP_CLASSES.feeder, ALL_OPEN);
  assert.strictEqual(r1.legDurationTicks, r2.legDurationTicks);
  assert.strictEqual(r1.tollTotal, r2.tollTotal);
});

console.log('Wired into the playable engine: the disruption is felt, not just computable');
check('a fresh GameEngine refuses to assign a ship on a Hormuz-blocked corridor, with a legible reason', () => {
  const game = new GameEngine({ seed: 'hormuz-block-check' });
  const buy = game.buyShip('feeder');
  const r = game.assignShip(buy.shipId, 'los_angeles', 'ras_tanura'); // WEST_COAST <-> PERSIAN_GULF transits Hormuz
  assert.strictEqual(r.ok, false);
  assert.ok(/Hormuz/.test(r.reason));
  const log = game.getState().log;
  assert.ok(log.some((e) => /Hormuz/.test(e.msg)), 'the refusal must be surfaced in the player-facing log');
});
check('getState().chokepoints exposes both the REAL canon fact and the current (possibly simulated) one for every chokepoint, legibly', () => {
  const game = new GameEngine({ seed: 'chokepoint-state-check' });
  const s = game.getState();
  for (const id of ['panama', 'suez', 'bab_el_mandeb', 'hormuz', 'malacca', 'gibraltar']) {
    assert.ok(s.chokepoints[id], `getState().chokepoints must include ${id}`);
    assert.ok(typeof s.chokepoints[id].real.description === 'string' && s.chokepoints[id].real.description.length > 0);
    assert.ok(typeof s.chokepoints[id].current.description === 'string');
  }
  assert.strictEqual(s.chokepoints.hormuz.status, 'disrupted');
  assert.strictEqual(s.chokepoints.hormuz.current.isSimulated, false, 'at tick 0, nothing has been simulated yet — this must read as the real fact, not pencil');
});
check('the dynamic chokepoint mechanic (Hormuz / Red Sea) is seeded and deterministic — replay ≡ live still holds with it running', () => {
  function run(seed) {
    const g = new GameEngine({ seed });
    for (let i = 0; i < 80; i++) g.tick();
    return g;
  }
  const g1 = run('chokepoint-dynamics-seed');
  const g2 = run('chokepoint-dynamics-seed');
  assert.strictEqual(g1.replayHash(), g2.replayHash());
  assert.deepStrictEqual(g1.getState().chokepoints.hormuz.status, g2.getState().chokepoints.hormuz.status);
});
check('a status change, when it fires, is booked as source:\'procgen\' with a seed_label — pencil, never news, and distinguishable from the real cell', () => {
  // Scan seeds for one where at least one status actually moves within a
  // reasonable horizon (mirrors the existing Panama-scan pattern in
  // game/test/loop.test.js), so this test does not depend on tuning exact
  // probabilities to a single fixed seed.
  let found = null;
  for (let n = 0; n < 60 && !found; n++) {
    const g = new GameEngine({ seed: `chokepoint-scan-${n}` });
    for (let t = 0; t < 60 && !found; t++) {
      g.tick();
      const change = g.world.witness_log.find((e) => e.type === 'chokepoint_status_change');
      if (change) found = { g, change };
    }
  }
  assert.ok(found, 'expected at least one seed in the scan to produce a chokepoint_status_change within 60 ticks');
  assert.strictEqual(found.change.provenance.source, 'procgen');
  assert.ok(found.change.provenance.seed_label);
  const cur = found.g.getState().chokepoints[found.change.chokepoint_id];
  assert.strictEqual(cur.current.isSimulated, true);
});

console.log(`\n${passed} checks passed.`);
