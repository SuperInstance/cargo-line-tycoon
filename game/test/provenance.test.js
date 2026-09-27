// Phase 2 predicate: every world-fact resolves through provenance with
// {source, trust, ...}, and the refusal law (raise, never default) holds at
// the Cell/witness-log boundary. Run with: node game/test/provenance.test.js
const assert = require('assert');
const provenance = require('../src/provenance.js');
const { GameEngine } = require('../src/engine.js');
const { CHOKEPOINTS, CHOKEPOINT_IDS } = require('../data/chokepoints.js');
const { PORTS } = require('../data/ports.js');
const snapshotData = require('../data/fuel_freight_snapshot.js');

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`  ok — ${label}`);
}

const VALID_SOURCES = new Set(['canon', 'scout', 'procgen', 'player']);

console.log('provenance.attest(): refusal, never default');
check('throws with no source', () => {
  assert.throws(() => provenance.attest(1, { trust: 0.5 }), /source/);
});
check('throws with an unknown source', () => {
  assert.throws(() => provenance.attest(1, { source: 'vibes', trust: 0.5 }), /source/);
});
check('throws with no trust', () => {
  assert.throws(() => provenance.attest(1, { source: 'canon', source_url: 'x' }), /trust/);
});
check('throws with an out-of-range trust', () => {
  assert.throws(() => provenance.attest(1, { source: 'canon', source_url: 'x', trust: 1.5 }), /trust/);
});
check("throws for source:'canon' with no source_url", () => {
  assert.throws(() => provenance.attest(1, { source: 'canon', trust: 0.9 }), /source_url/);
});
check("throws for source:'scout' with no source_url", () => {
  assert.throws(() => provenance.attest(1, { source: 'scout', trust: 0.9 }), /source_url/);
});
check("throws for source:'procgen' with no seed_label", () => {
  assert.throws(() => provenance.attest(1, { source: 'procgen', trust: 0.5 }), /seed_label/);
});
check("succeeds for source:'canon' with a source_url", () => {
  const c = provenance.attest(42, { source: 'canon', source_url: 'https://example.com', as_of: '2024-01-01', trust: 0.9 });
  assert.strictEqual(provenance.read(c), 42);
  assert.strictEqual(provenance.isReal(c), true);
});
check("succeeds for source:'procgen' with a seed_label, and isReal() is false", () => {
  const c = provenance.attest('open', { source: 'procgen', seed_label: 'test:1', trust: 0.5 });
  assert.strictEqual(provenance.isReal(c), false);
});
check("provenance.player() is a minimal {source:'player', trust:1.0} tag", () => {
  const p = provenance.player();
  assert.strictEqual(p.source, 'player');
  assert.strictEqual(p.trust, 1.0);
});
check('describe() renders INK for canon/scout, PENCIL for procgen, PLAYER for player', () => {
  const ink = provenance.attest(1, { source: 'canon', source_url: 'u', trust: 0.9 });
  const pencil = provenance.attest(1, { source: 'procgen', seed_label: 's', trust: 0.5 });
  assert.ok(/^INK/.test(provenance.describe(ink)));
  assert.ok(/^PENCIL/.test(provenance.describe(pencil)));
  assert.ok(/^PLAYER/.test(provenance.describe(provenance.player())));
});
check('reattestSimulated() always produces a procgen cell carrying a seed_label, never a source_url', () => {
  const real = provenance.attest('disrupted', { source: 'canon', source_url: 'https://example.com', as_of: '2026-08-27', trust: 0.85 });
  const sim = provenance.reattestSimulated(real, 'congested', 'chokepoint:hormuz:12', 'de-escalated');
  assert.strictEqual(sim.source, 'procgen');
  assert.strictEqual(sim.seed_label, 'chokepoint:hormuz:12');
  assert.strictEqual(sim.source_url, null);
  assert.strictEqual(provenance.read(sim), 'congested');
});

console.log('Every chokepoint canon cell is a valid, sourced provenance cell');
check('all 6 chokepoints exist with tollPerTeu/transitDays/sizeLimit/status, each canon-sourced with a source_url', () => {
  assert.deepStrictEqual(new Set(CHOKEPOINT_IDS), new Set(['panama', 'suez', 'bab_el_mandeb', 'hormuz', 'malacca', 'gibraltar']));
  for (const id of CHOKEPOINT_IDS) {
    const cp = CHOKEPOINTS[id];
    for (const field of ['tollPerTeu', 'transitDays', 'sizeLimit', 'status']) {
      const cell = cp[field];
      assert.ok(provenance.isCell(cell), `${id}.${field} must be a provenance cell`);
      assert.ok(VALID_SOURCES.has(cell.source), `${id}.${field}.source must be a valid source`);
      assert.ok(cell.trust >= 0 && cell.trust <= 1, `${id}.${field}.trust must be in [0,1]`);
      if (cell.source === 'canon' || cell.source === 'scout') {
        assert.ok(cell.source_url, `${id}.${field} is source:'${cell.source}' but has no source_url`);
      }
    }
  }
});
check('every port carries a provenance cell (canon, with a source_url)', () => {
  for (const p of PORTS) {
    assert.ok(provenance.isCell(p.provenance), `port ${p.id} must carry a provenance cell`);
    assert.strictEqual(p.provenance.source, 'canon');
    assert.ok(p.provenance.source_url, `port ${p.id}'s provenance must carry a source_url`);
  }
});
check('the fuel/freight snapshot cells are canon+sourced; the baselines they are judged against are procgen+seed_labeled', () => {
  assert.strictEqual(snapshotData.BUNKER_FUEL_VLSFO.source, 'canon');
  assert.ok(snapshotData.BUNKER_FUEL_VLSFO.source_url);
  assert.strictEqual(snapshotData.FREIGHT_INDEX_WCI.source, 'canon');
  assert.ok(snapshotData.FREIGHT_INDEX_WCI.source_url);
  assert.strictEqual(snapshotData.BUNKER_FUEL_BASELINE.source, 'procgen');
  assert.ok(snapshotData.BUNKER_FUEL_BASELINE.seed_label);
  assert.strictEqual(snapshotData.FREIGHT_INDEX_BASELINE.source, 'procgen');
  assert.ok(snapshotData.FREIGHT_INDEX_BASELINE.seed_label);
});

console.log('Refusal law: cellFor()/book() raise on a missing provenance envelope (never a silent default)');
check('World.book() refuses a *_start event with no provenance, whether reached via the kernel directly or an engine bug', () => {
  const { World } = require('../../substrate/ts/src/world.js');
  const w = new World({ seed: 'refusal-from-game-test' });
  assert.throws(() => w.book({ type: 'anything_start' }), /provenance/);
  assert.doesNotThrow(() => w.book({ type: 'anything_start', provenance: { source: 'player', trust: 1.0 } }));
});

console.log('A full scripted GameEngine run: no unmarked mark');
check('every port/market cell and every *_start/*_end/chokepoint_status_change booking in a 60-tick scripted run carries valid provenance; two engines from the same seed still agree on replayHash (the law does not cost replay)', () => {
  function scriptedPlaythrough(seed) {
    const game = new GameEngine({ seed });
    const buy1 = game.buyShip('feeder');
    game.assignShip(buy1.shipId, 'los_angeles', 'new_york');
    for (let i = 0; i < 60; i++) game.tick();
    return game;
  }

  const g1 = scriptedPlaythrough('provenance-sweep-seed');

  // Walk every current entity cell of type port/market.
  for (const [entityId] of g1.world.entities.latest) {
    const cell = g1.world.entities.get(entityId);
    if (cell.type === 'port' || cell.type === 'market') {
      const prov = cell.state.provenance;
      assert.ok(provenance.isCell(prov), `${entityId} (${cell.type}) must carry a provenance cell`);
      assert.ok(VALID_SOURCES.has(prov.source), `${entityId}.provenance.source must be valid, got ${prov.source}`);
      assert.ok(typeof prov.trust === 'number' && prov.trust >= 0 && prov.trust <= 1, `${entityId}.provenance.trust must be in [0,1]`);
      if (prov.source === 'canon' || prov.source === 'scout') assert.ok(prov.source_url, `${entityId} is source:'${prov.source}' but has no source_url`);
      if (prov.source === 'procgen') assert.ok(prov.seed_label, `${entityId} is source:'procgen' but has no seed_label`);
    }
  }

  // Walk every witness-log entry that is a *_start/*_end event or a
  // chokepoint status change and check the same rule.
  let sawStart = 0, sawEnd = 0, sawStatusChange = 0;
  for (const entry of g1.world.witness_log) {
    const isNamedEvent = /(_start|_end)$/.test(entry.type) || entry.type === 'chokepoint_status_change';
    if (!isNamedEvent) continue;
    if (/_start$/.test(entry.type)) sawStart++;
    if (/_end$/.test(entry.type)) sawEnd++;
    if (entry.type === 'chokepoint_status_change') sawStatusChange++;
    const prov = entry.provenance;
    assert.ok(provenance.isCell(prov), `witness-log entry "${entry.type}" (tick ${entry.tick}) must carry provenance`);
    assert.ok(VALID_SOURCES.has(prov.source));
    if (prov.source === 'canon' || prov.source === 'scout') assert.ok(prov.source_url);
    if (prov.source === 'procgen') assert.ok(prov.seed_label);
  }
  assert.ok(sawStart >= 1, 'expected at least one *_start event in a 60-tick run (game_start, at minimum)');

  // Replay ≡ live still holds — the provenance law did not cost determinism.
  const g2 = scriptedPlaythrough('provenance-sweep-seed');
  assert.strictEqual(g1.replayHash(), g2.replayHash());
});

console.log('The Opus predicate (arch/cargo-line-fact-landed.md §6): all three fact_landed verdicts land OFFLINE inside 60 ticks');
check('a 60-tick scripted run books >=1 fact_landed of each verdict (proven/erased/revised), all landed_by pool/decoy/snapshot — no L1/roster dependency, no player pencil-staking required', () => {
  function scriptedPlaythrough(seed) {
    const game = new GameEngine({ seed });
    const buy1 = game.buyShip('feeder');
    game.assignShip(buy1.shipId, 'los_angeles', 'new_york');
    for (let i = 0; i < 60; i++) game.tick();
    return game;
  }
  const game = scriptedPlaythrough('provenance-sweep-seed');
  const landings = game.world.witness_log.filter((e) => e.type === 'fact_landed');
  const verdicts = new Set(landings.map((e) => e.verdict));
  const landedBy = new Set(landings.map((e) => e.landed_by));
  assert.ok(verdicts.has('proven'), 'expected >=1 proven fact_landed within 60 ticks');
  assert.ok(verdicts.has('erased'), 'expected >=1 erased fact_landed within 60 ticks');
  assert.ok(verdicts.has('revised'), 'expected >=1 revised fact_landed within 60 ticks');
  assert.ok(landedBy.has('pool') && landedBy.has('decoy') && landedBy.has('snapshot'), `expected pool/decoy/snapshot landed_by, got ${[...landedBy]}`);
  for (const entry of landings) {
    assert.ok(provenance.isCell(entry.from), `fact_landed ${entry.entity_id} .from must be provenance-shaped`);
    assert.ok(provenance.isCell(entry.to), `fact_landed ${entry.entity_id} .to must be provenance-shaped`);
  }
});

console.log(`\n${passed} checks passed.`);
