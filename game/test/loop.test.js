// Phase 1 predicate: the core loop actually works end to end, unprompted —
// buy -> assign -> ship -> profit -> reinvest -> an early win worth chasing
// again. Run with: node game/test/loop.test.js
const assert = require('assert');
const { GameEngine, STARTING_CASH } = require('../src/engine.js');

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`  ok — ${label}`);
}

console.log('New game');
check('starts with real cash at the real home port, no ships yet', () => {
  const game = new GameEngine({ seed: 'loop-test-1' });
  const s = game.getState();
  assert.strictEqual(s.company.cash, STARTING_CASH);
  assert.strictEqual(s.ships.length, 0);
  assert.ok(s.markets.los_angeles.price > 0);
});

console.log('Rejects invalid actions cleanly (no crash, a reason string)');
check('cannot buy a ship you cannot afford', () => {
  const game = new GameEngine({ seed: 'loop-test-2' });
  const r = game.buyShip('ulcv'); // $28M > $10M starting cash
  assert.strictEqual(r.ok, false);
  assert.ok(typeof r.reason === 'string' && r.reason.length > 0);
});
check('cannot assign an unowned/unknown ship', () => {
  const game = new GameEngine({ seed: 'loop-test-3' });
  const r = game.assignShip('ship_999', 'los_angeles', 'seattle');
  assert.strictEqual(r.ok, false);
});

console.log('The core loop: buy -> assign -> ship -> profit -> reinvest');
check('a first-time-player-shaped script completes the loop and earns a real profit', () => {
  const game = new GameEngine({ seed: 'loop-test-happy-path' });

  // BUY a feeder (affordable on starting cash)
  const buy = game.buyShip('feeder');
  assert.strictEqual(buy.ok, true);
  const cashAfterBuy = game.getState().company.cash;
  assert.ok(cashAfterBuy < STARTING_CASH, 'buying a ship must actually cost money');

  // ASSIGN it to a real, short coastal lane
  const assign = game.assignShip(buy.shipId, 'los_angeles', 'seattle');
  assert.strictEqual(assign.ok, true);

  // SHIP cargo, watch profit land: run enough ticks for at least two full
  // round trips (out + back) so we see repeated, not one-off, profit.
  let deliveries = 0;
  let cashPeak = cashAfterBuy;
  for (let i = 0; i < 60; i++) {
    const before = game.getState().company.cash;
    game.tick();
    const after = game.getState().company.cash;
    if (after > before) deliveries++;
    cashPeak = Math.max(cashPeak, after);
  }
  assert.ok(deliveries >= 2, `expected at least 2 profitable ticks, got ${deliveries}`);
  assert.ok(cashPeak > cashAfterBuy, 'the ship must have earned real money back');

  // REINVEST: profit should be enough to afford a second ship at some point.
  const state = game.getState();
  const canReinvest = state.company.cash >= 2_000_000; // feeder's own price
  assert.ok(canReinvest, `expected enough profit to reinvest in a 2nd ship, cash=${state.company.cash}`);
  const buy2 = game.buyShip('feeder');
  assert.strictEqual(buy2.ok, true, 'reinvestment purchase should succeed');
  const assign2 = game.assignShip(buy2.shipId, 'los_angeles', 'vancouver');
  assert.strictEqual(assign2.ok, true);
});

console.log('A reason to play again: an early win the player can actually reach');
check('doubling starting cash is reachable within a normal early session (actively re-assigning a contract-idled ship) and is announced', () => {
  // P0.2 (M3) retired infinite auto-repeat: a route is now a finite,
  // decaying contract, so "a single well-run coastal lane" now means
  // rotating the ship onto a fresh lane every time its contract ends
  // (needsReassignment) — exactly the "steady stream of where-next
  // decisions" M3 is meant to force. The achievement is still reachable
  // within a normal early session; it just now costs active management
  // instead of one setup then forever-autopilot.
  const game = new GameEngine({ seed: 'loop-test-early-win' });
  const buy = game.buyShip('feeder');
  const shipId = buy.shipId;
  const lanes = ['seattle', 'vancouver', 'long_beach'];
  let laneIdx = 0;
  game.assignShip(shipId, 'los_angeles', lanes[laneIdx]);
  let won = false;
  for (let i = 0; i < 1500 && !won; i++) {
    game.tick();
    const s = game.getState();
    const ship = s.ships.find((sh) => sh.id === shipId);
    if (ship && ship.needsReassignment) {
      laneIdx = (laneIdx + 1) % lanes.length;
      game.assignShip(shipId, ship.positionPortId, lanes[laneIdx]);
    }
    if (s.achievements.includes('first_profit_double')) won = true;
  }
  assert.ok(won, 'first_profit_double achievement should be reachable within a normal actively-managed session');
  const log = game.getState().log;
  assert.ok(log.some((e) => /First Profit Double/.test(e.msg)), 'the win must be surfaced in the player-facing log');
});

console.log('The chokepoint event visibly changes optimal routing');
check('a Panama-crossing route gets slower and costlier during the disruption window', () => {
  // A seed chosen (by scanning) to trigger the disruption early and
  // predictably, so this test does not need hundreds of ticks to be useful.
  let found = null;
  for (let n = 0; n < 200 && !found; n++) {
    const seed = `panama-scan-${n}`;
    const game = new GameEngine({ seed });
    const buy = game.buyShip('panamax');
    game.assignShip(buy.shipId, 'los_angeles', 'new_york');
    const previewBefore = game.previewRoute('los_angeles', 'new_york', 'panamax');
    for (let t = 0; t < 30; t++) {
      game.tick();
      if (game.getState().panama.disrupted) {
        const previewDuring = game.previewRoute('los_angeles', 'new_york', 'panamax');
        found = { previewBefore, previewDuring };
        break;
      }
    }
  }
  assert.ok(found, 'expected at least one seed in the scan to trigger the Panama disruption within 30 ticks');
  assert.ok(found.previewDuring.legDurationTicks > found.previewBefore.legDurationTicks);
  assert.ok(found.previewDuring.tollTotal > found.previewBefore.tollTotal);
  // and the alternative — a same-coast lane — is untouched, which is exactly
  // the "reroute" signal a player should notice and act on.
  const game2 = new GameEngine({ seed: 'panama-scan-0' });
});

console.log('Pencil Sea: fact_landed — a pencil stake that PROVES (P0.1: sailing resolves the wager)');
check('staking a ship on a pool-backed pencil port lands it INK (proven) landed_by scout, under the ship\'s own keel, not the ambient clock', () => {
  const game = new GameEngine({ seed: 'loop-test-pencil-proves' });
  const pencilId = 'pencil_oakland'; // pool-backed — id is stable across seeds (see game/src/pencil.js)
  const revealEntry = game.revealSchedule.find((e) => e.pencilPortId === pencilId && e.kind === 'pool');
  assert.ok(revealEntry, 'expected an ambient pool reveal scheduled for pencil_oakland (for unstaked play)');

  // P0.1 predicate: 0 staked ports land before their ship is en route — no
  // fact_landed exists for this port before assignShip (staking) at all.
  assert.strictEqual(
    game.world.witness_log.filter((e) => e.type === 'fact_landed' && e.entity_id === `port:${pencilId}`).length, 0,
  );

  const buy = game.buyShip('feeder');
  const assign = game.assignShip(buy.shipId, 'los_angeles', pencilId);
  assert.strictEqual(assign.ok, true, 'a feeder should be able to stake on a pencil port on its own coast');
  assert.strictEqual(assign.medium, 'pencil', 'staking on an unproven pencil port must be reported as a pencil stake');

  // Still 0 immediately after staking (assignShip alone), before any tick —
  // "before their ship is en route" means before world-time has advanced.
  assert.strictEqual(
    game.world.witness_log.filter((e) => e.type === 'fact_landed' && e.entity_id === `port:${pencilId}`).length, 0,
  );

  const previewBefore = game.previewStake(buy.shipId, pencilId);
  assert.ok('low' in previewBefore || previewBefore.ok === false, 'previewStake should return a shape, not throw');

  let landedAtTick = null;
  for (let i = 0; i < 40 && landedAtTick === null; i++) {
    game.tick();
    const hit = game.world.witness_log.some((e) => e.type === 'fact_landed' && e.entity_id === `port:${pencilId}`);
    if (hit) landedAtTick = i + 1;
  }
  assert.ok(landedAtTick !== null, 'expected the staked pencil port to land within 40 ticks of its ship sailing');

  const landed = game.world.witness_log.filter((e) => e.type === 'fact_landed' && e.entity_id === `port:${pencilId}`);
  assert.ok(landed.some((e) => e.verdict === 'proven' && e.landed_by === 'scout'), 'a STAKED port must land landed_by:scout (player-caused), not the ambient schedule');
  assert.strictEqual(landed.length, 1, 'a resolved port must not also fire the ambient schedule\'s entry (staked ports are retired from the ambient clock)');

  const portState = game.world.entities.get(`port:${pencilId}`).state;
  assert.strictEqual(portState.provenance.source, 'canon', 'a proven pencil port must become canon (ink)');

  // The reward ladder (P0.4): a scout-caused proven LAND builds the streak.
  assert.strictEqual(game.getState().company.streak, 1);
  assert.ok(game.getState().company.streakMultiplier > 1, 'the first proven scout LAND should already show a compounding multiplier');
});

console.log('Pencil Sea: fact_landed — a pencil stake that ERASES (P0.1: sailing resolves the wager)');
check('a decoy pencil port erases only when its own ship reaches it (landed_by scout), ghosts (never mutates the past), and reroutes the staked ship', () => {
  const game = new GameEngine({ seed: 'loop-test-pencil-erases' });
  const decoyId = 'pencil_decoy_0'; // stable id — the first decoy generated (game/src/pencil.js)
  const pp = game.pencilPorts[decoyId];
  assert.ok(pp && pp.isDecoy, 'pencil_decoy_0 must be a decoy (no pool fact behind it)');
  const revealEntry = game.revealSchedule.find((e) => e.pencilPortId === decoyId && e.kind === 'decoy');
  assert.ok(revealEntry, 'expected an ambient decoy reveal scheduled for pencil_decoy_0 (for unstaked play)');

  const buy = game.buyShip('feeder');
  const assign = game.assignShip(buy.shipId, 'los_angeles', decoyId);
  assert.strictEqual(assign.ok, true);
  assert.strictEqual(assign.medium, 'pencil');
  const routeId = assign.routeId;

  // The ambient schedule's OWN tick passes without firing (the port is
  // staked — P0.1's keystone: retire the fixed reveal timer for staked
  // ports) — confirm no fact_landed exists yet at/just past that tick.
  for (let i = 0; i < revealEntry.tick + 1; i++) game.tick();
  assert.strictEqual(
    game.world.witness_log.filter((e) => e.type === 'fact_landed' && e.entity_id === `port:${decoyId}`).length, 0,
    'a staked decoy must not erase on the ambient schedule\'s own tick',
  );

  let landedAtTick = null;
  for (let i = revealEntry.tick + 1; i < 60 && landedAtTick === null; i++) {
    game.tick();
    const hit = game.world.witness_log.some((e) => e.type === 'fact_landed' && e.entity_id === `port:${decoyId}`);
    if (hit) landedAtTick = i + 1;
  }
  assert.ok(landedAtTick !== null, 'expected the staked decoy to erase once its own ship actually reaches it');

  const landed = game.world.witness_log.filter((e) => e.type === 'fact_landed' && e.entity_id === `port:${decoyId}`);
  assert.ok(landed.some((e) => e.verdict === 'erased' && e.landed_by === 'scout'), 'expected an erased/scout fact_landed entry (player-caused, under the ship\'s own keel)');

  const portState = game.world.entities.get(`port:${decoyId}`).state;
  assert.strictEqual(portState.provenance.source, 'procgen', 'an erased cell keeps its procgen source — never mutated into a different source (G12: fold the erasure in, do not mutate the past out)');
  assert.strictEqual(portState.provenance.erased, true);

  const rerouted = game.world.witness_log.filter((e) => e.type === 'stake_rerouted');
  assert.ok(rerouted.some((e) => e.route_id === routeId), 'expected the ship staked on the erased decoy to be booked as stake_rerouted');

  const route = game.world.entities.get(routeId).state;
  assert.notStrictEqual(route.toPortId, decoyId, 'the route must no longer point at the erased (ghost) port');

  // The game must not crash on any further ticks after a reroute.
  for (let i = 0; i < 10; i++) game.tick();
});

console.log('Pencil Sea: replay ≡ live still holds with the pencil generator + reveal schedule running');
check('two engines from the same seed produce identical replayHash after 60 ticks with pencil stakes placed', () => {
  function scriptedPencilPlaythrough(seed) {
    const game = new GameEngine({ seed });
    const buy1 = game.buyShip('feeder');
    game.assignShip(buy1.shipId, 'los_angeles', 'pencil_oakland');
    for (let i = 0; i < 30; i++) game.tick();
    const buy2 = game.buyShip('feeder');
    if (buy2.ok) game.assignShip(buy2.shipId, 'los_angeles', 'pencil_decoy_0');
    for (let i = 0; i < 30; i++) game.tick();
    return game;
  }
  const g1 = scriptedPencilPlaythrough('replay-pencil-seed');
  const g2 = scriptedPencilPlaythrough('replay-pencil-seed');
  assert.strictEqual(g1.replayHash(), g2.replayHash());
  assert.deepStrictEqual(
    g1.world.witness_log.map((e) => JSON.stringify(e)),
    g2.world.witness_log.map((e) => JSON.stringify(e)),
  );
});

console.log(`\n${passed} checks passed.`);
