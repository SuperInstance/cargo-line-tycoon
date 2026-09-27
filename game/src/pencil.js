// Cargo Line Tycoon — the pencil generator (browser + Node dual-mode)
//
// Implements arch/cargo-line-fact-landed.md §5.3 ("pencil-from-pool with
// decoys"): every pencil feeder port is emitted FROM a real pool fact
// (game/data/pool.js), at a jittered position, so it is provably
// wrong-but-never-illegal — always within sight of a real coastal port. A
// tunable ~25% share of pencil ports are decoys: no pool fact behind them at
// all, seeded around a random real anchor port instead. Proven ⇒ snap to the
// pool fact's true lat/lng; decoy ⇒ erased (a ghost, never a mutation — G12).
//
// Pure functions of (rng, poolFacts, realPorts) — nothing here reads
// Date.now()/Math.random(); every draw goes through the caller-supplied
// SeededRNG (world.rng.fork('procgen:ports') / world.rng.fork('pool:reveal')
// per arch/cargo-line-fact-landed.md §5.2), so pencil generation and the
// reveal schedule are both replay-deterministic.

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./economy.js'), require('../data/ports.js'));
  } else {
    root.CLTPencil = factory(root.CLTEconomy, root.CLT_PORTS);
  }
})(typeof window !== 'undefined' ? window : this, function (economy, portsData) {
  const { haversineNm } = economy;
  const { PORTS } = portsData;

  // A small nautical-sounding word bank for invented pencil-port names —
  // "Port <word>", one word, never a real port name (so a pencil port is
  // never confusable with a real one on sight). Fable §3.3 names "Port
  // Alder" as the worked example; it's the first entry here on purpose.
  const NAME_BANK = [
    'Alder', 'Bracken', 'Cormorant', 'Driftwood', 'Ember', 'Fathom', 'Gull',
    'Halcyon', 'Ironwood', 'Juniper', 'Kestrel', 'Larkspur', 'Mariner',
    'Nettle', 'Osprey', 'Pelican', 'Quillon', 'Reed', 'Saltmarsh', 'Tern',
    'Umber', 'Vale', 'Willow', 'Xebec', 'Yaupon', 'Zephyr',
  ];

  const DECOY_SHARE = 0.25; // §5.3: "a tunable share (~25%) of decoys"
  const JITTER_DEG_POOL = 0.3; // §5.3: "a jittered position (±0.3°)"
  const JITTER_DEG_DECOY = 0.4; // decoys: same never-illegal bound, slightly wider

  function nearestRealPort(latlng, realPorts) {
    let best = null, bestNm = Infinity;
    for (const p of realPorts) {
      const nm = haversineNm(latlng, p);
      if (nm < bestNm) { bestNm = nm; best = p; }
    }
    return best;
  }

  // For each pool fact, one pencil cell; plus ~25% decoys with no fact
  // behind them. Returns a flat, seeded, order-stable list — the order IS
  // the reveal order (see buildRevealSchedule below), so it must never
  // depend on iteration order of anything non-deterministic.
  function generatePencilPorts(rng, poolFacts, realPorts) {
    const used = new Set();
    function pickName() {
      // Draw until we find a name not already used this game (14-26 items,
      // a handful of decoys — collisions are rare but not impossible).
      for (let tries = 0; tries < NAME_BANK.length * 2; tries++) {
        const w = rng.pick(NAME_BANK);
        if (!used.has(w)) { used.add(w); return `Port ${w}`; }
      }
      return `Port ${rng.pick(NAME_BANK)} ${used.size}`; // exhausted the bank — still deterministic
    }

    const pencilPorts = [];

    for (const fact of poolFacts) {
      const lat = fact.value.lat + rng.float(-JITTER_DEG_POOL, JITTER_DEG_POOL);
      const lng = fact.value.lng + rng.float(-JITTER_DEG_POOL, JITTER_DEG_POOL);
      const parent = nearestRealPort({ lat, lng }, realPorts);
      // Pencil trust starts well below the pool fact's eventual (post-proof)
      // canon trust — it IS a guess, even though it happens to be right.
      const trust = Math.max(0.2, Math.min(0.75, fact.trust * 0.6));
      pencilPorts.push({
        id: `pencil_${fact.id}`, name: pickName(), lat, lng,
        parentPortId: parent.id, poolId: fact.id, isDecoy: false,
        trust, seedLabel: `port:${fact.id}`,
      });
    }

    const decoyCount = Math.round(poolFacts.length * DECOY_SHARE);
    for (let i = 0; i < decoyCount; i++) {
      const anchor = rng.pick(realPorts);
      const lat = anchor.lat + rng.float(-JITTER_DEG_DECOY, JITTER_DEG_DECOY);
      const lng = anchor.lng + rng.float(-JITTER_DEG_DECOY, JITTER_DEG_DECOY);
      pencilPorts.push({
        id: `pencil_decoy_${i}`, name: pickName(), lat, lng,
        parentPortId: anchor.id, poolId: null, isDecoy: true,
        trust: 0.3, seedLabel: `decoy:${i}`,
      });
    }

    return pencilPorts;
  }

  // The seeded reveal schedule (arch/cargo-line-fact-landed.md §5.2): each
  // pencil port is assigned a reveal_tick from a fork of `rng` + its index —
  // seeded, so replay ≡ live and the same seed reveals the same facts in the
  // same order. Tuned so the first landing fires at ~tick 4 and successive
  // reveals land roughly every 3 ticks, so an early pencil stake resolves
  // within a small handful of ticks of being placed (Fable §7.2). One
  // `snapshot` entry is appended: a `revised` landing on the first
  // pool-backed port a few ticks after it inks, so all three verdicts
  // (`proven`, `erased`, `revised`) are reachable inside a 60-tick window,
  // fully offline.
  function buildRevealSchedule(rng, pencilPorts) {
    const schedule = [];
    let tick = 4;
    for (const pp of pencilPorts) {
      const jitter = rng.int(-1, 1);
      const revealTick = Math.max(1, tick + jitter);
      schedule.push({ tick: revealTick, pencilPortId: pp.id, kind: pp.isDecoy ? 'decoy' : 'pool' });
      tick += 3;
    }
    const firstPool = pencilPorts.find((p) => !p.isDecoy);
    if (firstPool) {
      const firstEntry = schedule.find((e) => e.pencilPortId === firstPool.id);
      schedule.push({
        tick: firstEntry.tick + 8, pencilPortId: firstPool.id, kind: 'snapshot',
        newAsOf: '2026-06-01',
      });
    }
    schedule.sort((a, b) => a.tick - b.tick);
    return schedule;
  }

  return { generatePencilPorts, buildRevealSchedule, NAME_BANK, DECOY_SHARE };
});
