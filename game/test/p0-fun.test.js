// P0 "make it fun" predicates (arch/CARGO-LINE-FUN-AND-GRAPHICS.md §5, P0.1-
// P0.4): the exact acceptance tests the plan names, run against the real
// engine. Run with: node game/test/p0-fun.test.js
const assert = require('assert');
const { GameEngine, STARTING_CASH } = require('../src/engine.js');
const provenance = require('../src/provenance.js');

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`  ok — ${label}`);
}

const VALID_SOURCES = new Set(['canon', 'scout', 'procgen', 'player']);

// ─────────────────────────────────────────────────────────────────────────
console.log('P0.1 — Sailing resolves the wager (M1, the keystone)');

check('a staked pencil port lands within N ticks of its ship arriving, and 0 staked ports land before their ship is en route', () => {
  const game = new GameEngine({ seed: 'p01-predicate-1' });
  const pencilId = 'pencil_oakland'; // pool-backed, stable id (game/src/pencil.js)

  const buy = game.buyShip('feeder');
  // Nothing landed before the stake even exists.
  assert.strictEqual(game.world.witness_log.filter((e) => e.type === 'fact_landed' && e.entity_id === `port:${pencilId}`).length, 0);

  const assign = game.assignShip(buy.shipId, 'los_angeles', pencilId);
  assert.strictEqual(assign.ok, true);
  assert.strictEqual(assign.medium, 'pencil');
  // Still 0: staking alone (no tick yet) must not resolve anything — "0
  // staked ports land before their ship is en route" holds at t=0 exactly.
  assert.strictEqual(game.world.witness_log.filter((e) => e.type === 'fact_landed' && e.entity_id === `port:${pencilId}`).length, 0);

  const N = 40;
  let landedAtTick = null;
  for (let i = 0; i < N && landedAtTick === null; i++) {
    game.tick();
    if (game.world.witness_log.some((e) => e.type === 'fact_landed' && e.entity_id === `port:${pencilId}`)) landedAtTick = i + 1;
  }
  assert.ok(landedAtTick !== null, `expected the staked port to land within ${N} ticks of the ship sailing`);

  const landing = game.world.witness_log.find((e) => e.type === 'fact_landed' && e.entity_id === `port:${pencilId}`);
  assert.strictEqual(landing.landed_by, 'scout', 'a staked port must land landed_by:scout — player-caused, under the ship\'s own keel');
  assert.strictEqual(landing.verdict, 'proven');

  // The ship really was en route (not merely assigned) by the time it landed:
  // at least one tick elapsed between staking and the landing.
  assert.ok(landedAtTick >= 1);
});

check('an UNstaked pencil port still breathes on its own — a low ambient rate, landed_by pool/decoy — with zero player action', () => {
  const game = new GameEngine({ seed: 'p01-predicate-2' });
  // No ships bought, no ticks skipped, no staking at all — pure ambient.
  for (let i = 0; i < 30; i++) game.tick();
  const landings = game.world.witness_log.filter((e) => e.type === 'fact_landed');
  assert.ok(landings.length > 0, 'the ambient clock must still land some facts with zero player action');
  assert.ok(landings.every((e) => e.landed_by === 'pool' || e.landed_by === 'decoy' || e.landed_by === 'snapshot'), 'every unstaked landing must be ambient (never scout — nothing was ever staked)');
});

check('staking a port RETIRES it from the ambient prove/erase schedule: its ambient proven/erased entry never ALSO fires once scout has resolved it', () => {
  const game = new GameEngine({ seed: 'p01-predicate-3' });
  const pencilId = 'pencil_oakland';
  const buy = game.buyShip('feeder');
  game.assignShip(buy.shipId, 'los_angeles', pencilId);
  for (let i = 0; i < 40; i++) game.tick();
  const landings = game.world.witness_log.filter((e) => e.type === 'fact_landed' && e.entity_id === `port:${pencilId}`);
  const proveOrErase = landings.filter((e) => e.verdict === 'proven' || e.verdict === 'erased');
  assert.strictEqual(proveOrErase.length, 1, 'a staked port must be proven/erased exactly once, never twice (ambient + scout)');
  assert.strictEqual(proveOrErase[0].landed_by, 'scout');
  // A later ambient `revised` (re-stamp) entry is a legitimate separate
  // occasion, not a duplicate — it can only ever apply to an
  // already-proven port, whichever landed it.
  assert.ok(landings.every((e) => e.verdict !== 'revised' || e.landed_by === 'snapshot'));
});

check('replay ≡ live holds with M1\'s scout resolution running (staked pencil ports included)', () => {
  function scriptedPlaythrough(seed) {
    const game = new GameEngine({ seed });
    const buy = game.buyShip('feeder');
    game.assignShip(buy.shipId, 'los_angeles', 'pencil_oakland');
    for (let i = 0; i < 50; i++) game.tick();
    return game;
  }
  const g1 = scriptedPlaythrough('p01-replay-seed');
  const g2 = scriptedPlaythrough('p01-replay-seed');
  assert.strictEqual(g1.replayHash(), g2.replayHash());
  assert.deepStrictEqual(
    g1.world.witness_log.map((e) => JSON.stringify(e)),
    g2.world.witness_log.map((e) => JSON.stringify(e)),
  );
});

check('provenance sweep stays green with M1 running: every port/market cell and every *_start/*_end/chokepoint_status_change entry still carries valid provenance', () => {
  const game = new GameEngine({ seed: 'p01-predicate-1' });
  const buy = game.buyShip('feeder');
  game.assignShip(buy.shipId, 'los_angeles', 'pencil_oakland');
  for (let i = 0; i < 60; i++) game.tick();

  for (const [entityId] of game.world.entities.latest) {
    const cell = game.world.entities.get(entityId);
    if (cell.type === 'port' || cell.type === 'market') {
      const prov = cell.state.provenance;
      assert.ok(provenance.isCell(prov), `${entityId} must carry a provenance cell`);
      assert.ok(VALID_SOURCES.has(prov.source));
      if (prov.source === 'canon' || prov.source === 'scout') assert.ok(prov.source_url);
      if (prov.source === 'procgen') assert.ok(prov.seed_label);
    }
  }
  for (const entry of game.world.witness_log) {
    const isNamedEvent = /(_start|_end)$/.test(entry.type) || entry.type === 'chokepoint_status_change';
    if (!isNamedEvent) continue;
    assert.ok(provenance.isCell(entry.provenance), `witness-log entry "${entry.type}" must carry provenance`);
  }
  // Every fact_landed entry (proven/erased, ambient or scout) still carries
  // provenance-shaped from/to — M1 changed the trigger, never the content.
  for (const entry of game.world.witness_log.filter((e) => e.type === 'fact_landed')) {
    assert.ok(provenance.isCell(entry.from));
    assert.ok(provenance.isCell(entry.to));
  }
});

// ─────────────────────────────────────────────────────────────────────────
console.log('P0.2 — Cost of commitment (M2 + M3)');

check('a lane\'s 3rd round-trip earns measurably less than its 1st (a single ship, hammering the same lane)', () => {
  const game = new GameEngine({ seed: 'p02-predicate-1' });
  const buy = game.buyShip('feeder');
  game.assignShip(buy.shipId, 'los_angeles', 'seattle');
  for (let i = 0; i < 250; i++) game.tick();

  const arrivals = game.world.witness_log.filter((e) => e.type === 'ship_arrived');
  assert.ok(arrivals.length >= 6, `expected at least 3 round trips (6 arrivals), got ${arrivals.length}`);
  const roundTrips = [];
  for (let i = 0; i + 1 < arrivals.length; i += 2) roundTrips.push(arrivals[i].net + arrivals[i + 1].net);
  assert.ok(roundTrips.length >= 3, 'expected at least 3 completed round trips');
  assert.ok(roundTrips[2] < roundTrips[0], `3rd round trip (${roundTrips[2]}) should earn measurably less than the 1st (${roundTrips[0]})`);
});

check('an over-served ship idles at port and pings for reassignment (contract exhausted or margin below ops cost)', () => {
  const game = new GameEngine({ seed: 'p02-predicate-2' });
  const buy = game.buyShip('feeder');
  game.assignShip(buy.shipId, 'los_angeles', 'seattle');
  let idledAtTick = null;
  for (let i = 0; i < 300 && idledAtTick === null; i++) {
    game.tick();
    const ship = game.getState().ships[0];
    if (ship.needsReassignment) idledAtTick = i + 1;
  }
  assert.ok(idledAtTick !== null, 'expected the ship to eventually idle (contract exhausted or margin too thin)');
  const ship = game.getState().ships[0];
  assert.strictEqual(ship.transit, null, 'an idled ship must have no active transit');
  assert.strictEqual(ship.routeId, null);
  const contractEnd = game.world.witness_log.find((e) => e.type === 'contract_ended');
  assert.ok(contractEnd, 'expected a contract_ended booking');
  assert.ok(['margin_below_ops', 'trip_cap_reached'].includes(contractEnd.reason));
  const log = game.getState().log;
  assert.ok(log.some((e) => /idling, pinging for reassignment/.test(e.msg)), 'the idle must be surfaced in the player-facing log as a ping for reassignment');

  // Idle bleed: cash keeps draining a bit even with no ship sailing.
  const cashAtIdle = game.getState().company.cash;
  for (let i = 0; i < 10; i++) game.tick();
  assert.ok(game.getState().company.cash < cashAtIdle, 'an idle (needsReassignment) ship must still bleed a fixed cost per tick');
});

check('margins force rotation: a ship returned immediately to the SAME lane it just exhausted earns far less than that lane\'s original, unhammered 1st trip', () => {
  const game = new GameEngine({ seed: 'p02-predicate-3' });
  const buy = game.buyShip('feeder');
  game.assignShip(buy.shipId, 'los_angeles', 'seattle');
  let idled = false;
  for (let i = 0; i < 300 && !idled; i++) {
    game.tick();
    if (game.getState().ships[0].needsReassignment) idled = true;
  }
  assert.ok(idled, 'setup: the ship must have idled before we can test an immediate re-stake');
  const arrivalsBefore = game.world.witness_log.filter((e) => e.type === 'ship_arrived');
  const originalFirstRoundTrip = arrivalsBefore[0].net + arrivalsBefore[1].net;

  const ship = game.getState().ships[0];
  game.assignShip(ship.id, ship.positionPortId, 'seattle'); // same, still-hammered lane, no rest given
  for (let i = 0; i < 40; i++) game.tick();
  const arrivalsAfter = game.world.witness_log.filter((e) => e.type === 'ship_arrived');
  const immediateReturnRoundTrip = arrivalsAfter[arrivalsBefore.length].net + arrivalsAfter[arrivalsBefore.length + 1].net;

  assert.ok(
    immediateReturnRoundTrip < originalFirstRoundTrip * 0.6,
    `an immediate return to the same hammered lane (${immediateReturnRoundTrip}) should earn far less than that lane's original 1st trip (${originalFirstRoundTrip}) — the lane itself, not just one contract, stays depressed`,
  );
});

// ─────────────────────────────────────────────────────────────────────────
console.log('P0.3 — Session goal + fail state + comeback');

check('a scripted BAD line goes genuinely bankrupt (cash negative, nothing earning) — the line folds, booked and replayable', () => {
  function scriptedBadLine(seed) {
    const game = new GameEngine({ seed });
    const buy = game.buyShip('panamax'); // an expensive ship, most of starting cash spent
    game.assignShip(buy.shipId, 'los_angeles', 'new_york'); // a tolled, Panama-crossing lane
    // Deliberately never reassigns/manages the fleet again — the "bad line":
    // ride the one contract out, then let it idle-bleed to ruin.
    for (let i = 0; i < 1500 && !game.getState().gameOver; i++) game.tick();
    return game;
  }
  const game = scriptedBadLine('p03-bad-line-seed');
  const state = game.getState();
  assert.ok(state.gameOver, 'expected the run to resolve within 1500 ticks');
  assert.strictEqual(state.gameOver.result, 'bankrupt');
  assert.ok(state.company.cash < 0, 'a folded line must actually have negative cash');
  const noShipEarning = state.ships.every((s) => !s.transit);
  assert.ok(noShipEarning, 'the fold predicate requires no ship currently earning');
  const resolved = game.world.witness_log.find((e) => e.type === 'run_resolved' && e.result === 'bankrupt');
  assert.ok(resolved, 'the fold must be booked (run_resolved)');
  const log = state.log;
  assert.ok(log.some((e) => /line folds/.test(e.msg)), 'the fold must be surfaced in the player-facing log');

  // Once resolved, the engine freezes further simulation (deterministically).
  const hashAtEnd = game.replayHash();
  const tickAtEnd = game.getState().tick;
  game.tick(); game.tick(); game.tick();
  assert.strictEqual(game.getState().company.cash, state.company.cash, 'a folded line must not keep losing/gaining money after resolution');
  assert.notStrictEqual(game.getState().tick, tickAtEnd, 'the world clock itself may still tick (booked, replay-safe)');

  // Replayable: the SAME seed+script folds identically.
  const game2 = scriptedBadLine('p03-bad-line-seed');
  assert.strictEqual(game2.getState().gameOver.result, 'bankrupt');
  assert.strictEqual(game2.getState().tick, tickAtEnd);
  assert.strictEqual(game2.replayHash(), hashAtEnd);
});

check('a scripted RIDE-THE-DISRUPTION line recovers from well behind — a live Panama disruption is the comeback path, not a cosmetic clock', () => {
  function scriptedComebackLine(seed, ticks) {
    const game = new GameEngine({ seed });
    const buy = game.buyShip('panamax');
    game.assignShip(buy.shipId, 'los_angeles', 'new_york'); // stays on the Panama-crossing lane THROUGH the disruption — the bet
    let minCash = Infinity;
    let sawDisruption = false;
    let recoveredTick = null;
    for (let i = 0; i < ticks; i++) {
      game.tick();
      const s = game.getState();
      minCash = Math.min(minCash, s.company.cash);
      if (s.panama.disrupted) sawDisruption = true;
      if (sawDisruption && s.company.cash >= STARTING_CASH * 0.6 && recoveredTick === null) recoveredTick = i + 1;
      if (s.gameOver) break;
    }
    return { game, minCash, sawDisruption, recoveredTick };
  }
  const { game, minCash, sawDisruption, recoveredTick } = scriptedComebackLine('p03-comeback-seed', 120);
  assert.ok(minCash < STARTING_CASH * -0.15, `expected the line to have gone genuinely behind (well negative), got minCash=${minCash}`);
  assert.ok(sawDisruption, 'expected a live Panama disruption to fire during the run');
  assert.ok(recoveredTick !== null, 'expected cash to recover to a healthy level after the disruption began');
  assert.strictEqual(game.getState().gameOver, null, 'the line must not have folded — a real recovery, not a lucky non-death');

  // Booked and replayable.
  const disruptionEvents = game.world.witness_log.filter((e) => e.type === 'panama_disruption_start' || e.type === 'panama_disruption_end');
  assert.ok(disruptionEvents.length > 0, 'the disruption must be booked');
  const replay = scriptedComebackLine('p03-comeback-seed', 120);
  assert.strictEqual(replay.game.replayHash(), game.replayHash());
});

check('reaching the cash win target resolves the run as WON (booked, replay-safe)', () => {
  // A short, deterministic proof the win path itself works (not a real
  // 8-12 minute session) — directly exercise _checkGameEnd's cash branch by
  // running a healthy lane long enough to cross WIN_CASH_TARGET, rotating
  // ships as P0.2 now requires.
  const game = new GameEngine({ seed: 'p03-win-seed' });
  const buy = game.buyShip('feeder');
  const shipId = buy.shipId;
  const lanes = ['seattle', 'vancouver', 'long_beach'];
  let laneIdx = 0;
  game.assignShip(shipId, 'los_angeles', lanes[laneIdx]);
  let won = false;
  for (let i = 0; i < 3000 && !won; i++) {
    game.tick();
    const s = game.getState();
    const ship = s.ships.find((sh) => sh.id === shipId);
    if (ship && ship.needsReassignment) {
      laneIdx = (laneIdx + 1) % lanes.length;
      game.assignShip(shipId, ship.positionPortId, lanes[laneIdx]);
    }
    if (s.gameOver) won = true;
  }
  assert.ok(won, 'expected the run to resolve (won) within a long actively-managed session');
  assert.strictEqual(game.getState().gameOver.result, 'won');
  const resolved = game.world.witness_log.find((e) => e.type === 'run_resolved' && e.result === 'won');
  assert.ok(resolved);
});

// ─────────────────────────────────────────────────────────────────────────
console.log('P0.4 — The reward ladder');

check('a proven scout LAND visibly compounds the streak multiplier (×1.1, ×1.25, ×1.5 …), booked as a player-sourced standing cell', () => {
  const game = new GameEngine({ seed: 'p04-predicate-1' });
  assert.strictEqual(game.getState().company.streak, 0);
  assert.strictEqual(game.getState().company.streakMultiplier, 1);

  const buy = game.buyShip('feeder');
  game.assignShip(buy.shipId, 'los_angeles', 'pencil_oakland');
  for (let i = 0; i < 10; i++) game.tick();
  const s1 = game.getState();
  assert.strictEqual(s1.company.streak, 1);
  assert.strictEqual(s1.company.streakMultiplier, 1.1);

  const streakEvent = game.world.witness_log.find((e) => e.type === 'streak_updated' && e.streak === 1);
  assert.ok(streakEvent, 'the streak change must be booked');
  assert.strictEqual(streakEvent.provenance.source, 'player', 'the streak is a player-sourced standing cell, never dressed as a world fact');
  assert.strictEqual(streakEvent.provenance.trust, 1.0);

  // The company cell (a real, player-sourced cell) carries the streak too.
  const companyCell = game.world.entities.get(game.companyId).state;
  assert.strictEqual(companyCell.provenance.source, 'player');
  assert.strictEqual(companyCell.streak, 1);
});

check('one scout ERASE resets the streak to ×1, even after it had compounded', () => {
  const game = new GameEngine({ seed: 'p04-predicate-2' });
  const buy = game.buyShip('feeder');
  game.assignShip(buy.shipId, 'los_angeles', 'pencil_oakland');
  for (let i = 0; i < 10; i++) game.tick();
  assert.ok(game.getState().company.streak >= 1, 'setup: expected the streak to have started building');

  const ship = game.getState().ships[0];
  let staked = null;
  for (const d of ['pencil_decoy_0', 'pencil_decoy_1', 'pencil_decoy_2', 'pencil_decoy_3']) {
    const r = game.assignShip(ship.id, ship.positionPortId, d);
    if (r.ok) { staked = d; break; }
  }
  assert.ok(staked, 'expected at least one decoy reachable from the ship\'s current position');
  for (let i = 0; i < 40; i++) game.tick();

  assert.strictEqual(game.getState().company.streak, 0, 'a scout-caused ERASE must reset the streak to 0');
  assert.strictEqual(game.getState().company.streakMultiplier, 1);
});

check('a pencil LAND collapses the payout to the high end of the stake-time preview, times the current streak multiplier', () => {
  const game = new GameEngine({ seed: 'p04-predicate-3' });
  const buy = game.buyShip('feeder');
  const preview = game.previewStake(buy.shipId, 'pencil_oakland');
  assert.strictEqual(preview.ok, true);
  assert.ok(preview.unproven);
  game.assignShip(buy.shipId, 'los_angeles', 'pencil_oakland');
  const multiplierAtStake = game.getState().company.streakMultiplier;
  for (let i = 0; i < 10; i++) game.tick();

  const arrival = game.world.witness_log.find((e) => e.type === 'ship_arrived');
  assert.ok(arrival, 'expected the ship to arrive and deliver');
  const streakAfter = game.getState().company.streakMultiplier; // the multiplier AFTER this LAND is what pays it
  const expected = Math.round(preview.high * streakAfter);
  assert.strictEqual(arrival.net, expected, `pencil LAND payout should be the stake-time preview's high end (${preview.high}) × the post-LAND streak multiplier (${streakAfter}) = ${expected}, got ${arrival.net}`);
});

check('provenance sweep stays green with the reward ladder running (streak_updated/contract_ended/run_resolved all carry valid provenance)', () => {
  const game = new GameEngine({ seed: 'p04-predicate-1' });
  const buy = game.buyShip('feeder');
  game.assignShip(buy.shipId, 'los_angeles', 'pencil_oakland');
  for (let i = 0; i < 60; i++) game.tick();
  for (const entry of game.world.witness_log) {
    if (!['streak_updated', 'contract_ended', 'run_resolved'].includes(entry.type)) continue;
    assert.ok(provenance.isCell(entry.provenance), `"${entry.type}" must carry a provenance cell`);
    assert.ok(VALID_SOURCES.has(entry.provenance.source));
  }
});

console.log(`\n${passed} checks passed.`);
