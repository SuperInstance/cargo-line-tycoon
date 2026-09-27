// Phase 1 predicate (engine-level replay ≡ live): a scripted playthrough of
// the full GameEngine — not just the bare kernel — replays bit-for-bit.
// Same seed + same ordered action calls => identical witness-log and
// replayHash(), every time. Run with: node game/test/replay.test.js
const assert = require('assert');
const { GameEngine } = require('../src/engine.js');

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`  ok — ${label}`);
}

// A believable early-session script: buy two ships, put them on different
// lanes (one coastal, one across Panama), react to whatever the Panama
// event does, and reinvest into a third ship partway through.
function scriptedPlaythrough(seed) {
  const game = new GameEngine({ seed });
  const buy1 = game.buyShip('feeder');
  game.assignShip(buy1.shipId, 'los_angeles', 'seattle');

  for (let i = 0; i < 10; i++) game.tick();

  const buy2 = game.buyShip('panamax');
  if (buy2.ok) game.assignShip(buy2.shipId, 'los_angeles', 'new_york');

  for (let i = 0; i < 20; i++) {
    game.tick();
    if (game.getState().panama.disrupted) {
      // A player reacting to the news: pull the Panama ship home and park it.
      game.unassignShip(buy2.shipId);
      break;
    }
  }

  for (let i = 0; i < 15; i++) game.tick();

  if (game.getState().company.cash >= 2_000_000) {
    const buy3 = game.buyShip('feeder');
    if (buy3.ok) game.assignShip(buy3.shipId, 'los_angeles', 'vancouver');
  }

  for (let i = 0; i < 15; i++) game.tick();

  return game;
}

console.log('Phase 1 predicate: engine-level replay determinism');
check('same seed + same scripted playthrough => identical witness-log and replayHash', () => {
  const g1 = scriptedPlaythrough('replay-seed-alpha');
  const g2 = scriptedPlaythrough('replay-seed-alpha');
  assert.strictEqual(g1.replayHash(), g2.replayHash(), 'replayHash must match on replay');
  assert.deepStrictEqual(
    g1.world.witness_log.map((e) => JSON.stringify(e)),
    g2.world.witness_log.map((e) => JSON.stringify(e)),
    'witness logs must be byte-identical on replay',
  );
  assert.deepStrictEqual(g1.getState().company, g2.getState().company, 'company state must match on replay');
  assert.deepStrictEqual(g1.getState().markets, g2.getState().markets, 'market state must match on replay');
});
check('different seed => a materially different run (the test can actually fail)', () => {
  const g1 = scriptedPlaythrough('replay-seed-alpha');
  const g2 = scriptedPlaythrough('replay-seed-beta');
  assert.notStrictEqual(g1.replayHash(), g2.replayHash());
});
check('the same engine instance is internally consistent: replayHash after N ticks depends only on the ordered history so far', () => {
  const g = new GameEngine({ seed: 'consistency-check' });
  const buy = g.buyShip('feeder');
  g.assignShip(buy.shipId, 'los_angeles', 'seattle');
  g.tick();
  g.tick();
  const hashAt2 = g.replayHash();
  const g2 = new GameEngine({ seed: 'consistency-check' });
  const buy2 = g2.buyShip('feeder');
  g2.assignShip(buy2.shipId, 'los_angeles', 'seattle');
  g2.tick();
  g2.tick();
  assert.strictEqual(g2.replayHash(), hashAt2);
  // Advancing further changes it (sanity: hash isn't trivially constant).
  g2.tick();
  assert.notStrictEqual(g2.replayHash(), hashAt2);
});

console.log(`\n${passed} checks passed.`);
