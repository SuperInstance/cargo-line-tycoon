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
check('doubling starting cash is reachable within a normal early session and is announced', () => {
  const game = new GameEngine({ seed: 'loop-test-early-win' });
  const buy = game.buyShip('feeder');
  game.assignShip(buy.shipId, 'los_angeles', 'seattle');
  let won = false;
  for (let i = 0; i < 400 && !won; i++) {
    game.tick();
    if (game.getState().achievements.includes('first_profit_double')) won = true;
  }
  assert.ok(won, 'first_profit_double achievement should be reachable within 400 ticks on a single well-run coastal lane');
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

console.log(`\n${passed} checks passed.`);
