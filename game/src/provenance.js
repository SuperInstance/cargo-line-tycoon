// Cargo Line Tycoon — Phase 2 provenance envelope (browser + Node dual-mode)
//
// The one rule this file exists to enforce: every world-fact the economy
// reads — a port attribute, a chokepoint toll/transit/status, a fuel or
// freight snapshot, a disruption event — is wrapped in a small, honest
// envelope: { value?, source, source_url?, as_of?, trust, seed_label?,
// notes? }. REAL/attested facts (source 'canon' or 'scout') and
// procedurally-invented facts (source 'procgen') must be tellable apart by
// *reading the data*, not by guessing — this is the hook the eventual
// "ink still wet" / Pencil Sea look-and-feel renders (Fable §5.5, §6.3).
//
// Schema (fixed by the Fable apex call, additive to the Phase 2 brief):
//   source ∈ { canon, scout, procgen, player }
//   trust: number in [0,1], required for every source
//   source_url: REQUIRED when source is 'canon' or 'scout' — a real external
//     citation for a researched fact, or (for an internal game-design
//     constant that is canon but not an external citation) a precise
//     repo-relative pointer to the file/constant that defines it.
//   seed_label: REQUIRED when source is 'procgen' — names the deterministic
//     generator/derivation that produced the value (a literal RNG fork
//     label like 'panama_check:17', or a descriptive derivation label like
//     'derived:fuel_index_mult' for a non-random but self-generated value).
//   as_of, value, notes: optional everywhere.
//
// Refusal, never default (mirrors the substrate's G20a discipline): attest()
// throws on a missing/invalid required field rather than filling in a
// plausible-looking default — an unmarked fact is worse than a rejected one.
// The same law is enforced one level up, at the Cell/witness-log boundary,
// in substrate/ts/src/world.js (cellFor()/book()) — this module supplies the
// envelope those refuse to go without.
//
// Nothing here reads Date.now() or Math.random() — `as_of` is always an
// explicit, caller-supplied date string (a real calendar date for a
// 'canon'/'scout' fact), and `seed_label` for a 'procgen' fact names its
// generator rather than embedding a wall-clock timestamp — so provenance
// stays replay-deterministic like everything else in this engine.

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CLTProvenance = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  const SOURCES = {
    CANON: 'canon', // a hand-curated, dated real-world fact (or an internal game-design constant), cited
    SCOUT: 'scout', // discovered at runtime by the (unbuilt, opt-in) L1 background-scouting moat — reserved, not produced by this Phase 2 pass
    PROCGEN: 'procgen', // invented, simulated, or derived by this game's own generator/RNG — never presented as observed truth
    PLAYER: 'player', // authored by the player's own actions (ship/route/company cells, a game_start event) — trivially trust 1.0
  };
  const VALID_SOURCES = new Set(Object.values(SOURCES));

  function isFiniteTrust(t) {
    return typeof t === 'number' && Number.isFinite(t) && t >= 0 && t <= 1;
  }

  // Build a provenance envelope around `value`. Throws — never defaults — on
  // any missing/invalid required field, so an un-sourced, un-scored, or
  // (for canon/scout) un-cited "fact" can never enter the world-model.
  function attest(value, opts) {
    const o = opts || {};
    if (!VALID_SOURCES.has(o.source)) {
      throw new Error(`provenance.attest: "source" must be one of ${[...VALID_SOURCES].join('|')}, got ${JSON.stringify(o.source)}`);
    }
    if (!isFiniteTrust(o.trust)) {
      throw new Error(`provenance.attest: "trust" must be a number in [0,1], got ${o.trust}`);
    }
    if ((o.source === SOURCES.CANON || o.source === SOURCES.SCOUT) && !o.source_url) {
      throw new Error(`provenance.attest: source:'${o.source}' requires "source_url" (a real citation, or a precise repo-relative pointer for an internal game-design constant) — refused, not defaulted`);
    }
    if (o.source === SOURCES.PROCGEN && !o.seed_label) {
      throw new Error('provenance.attest: source:\'procgen\' requires "seed_label" (names the generator/derivation) — refused, not defaulted');
    }
    return Object.freeze({
      value,
      source: o.source,
      source_url: o.source_url || null,
      as_of: o.as_of || null,
      trust: o.trust,
      seed_label: o.seed_label || null,
      notes: o.notes || null,
    });
  }

  // The minimal envelope for a player-authored fact (a ship the player
  // bought, a route they assigned, the company itself, a game_start event):
  // {source:'player', trust:1.0} — a player action is ground truth about
  // itself by definition, so there is nothing else to cite or score.
  function player() {
    return Object.freeze({ value: undefined, source: SOURCES.PLAYER, source_url: null, as_of: null, trust: 1.0, seed_label: null, notes: null });
  }

  function isCell(x) {
    return !!x && typeof x === 'object' && Object.prototype.hasOwnProperty.call(x, 'source')
      && Object.prototype.hasOwnProperty.call(x, 'trust');
  }

  // The one function the economy is asked to route every world-fact through:
  // "read" a provenance cell down to its raw value. Throws on anything that
  // isn't a properly-attested cell, so a stray unwrapped number/string can't
  // silently slip past the provenance boundary.
  function read(cell) {
    if (!isCell(cell)) {
      throw new Error(`provenance.read: not a provenance cell (missing source/trust): ${JSON.stringify(cell)}`);
    }
    return cell.value;
  }

  function isReal(cell) {
    return isCell(cell) && (cell.source === SOURCES.CANON || cell.source === SOURCES.SCOUT);
  }

  // A short, human-legible line for UI/log/debug use — this is literally
  // what the "ink still wet" / Pencil Sea look-and-feel would render
  // per-fact: ink (canon/scout) vs. pencil (procgen) vs. the player's own
  // hand (player).
  function describe(cell) {
    if (!isCell(cell)) return 'unknown provenance';
    const label = cell.source === SOURCES.PROCGEN ? 'PENCIL' : (cell.source === SOURCES.PLAYER ? 'PLAYER' : 'INK');
    const trustPct = Math.round(cell.trust * 100);
    let s = `${label} · ${cell.source}`;
    if (cell.as_of) s += ` · as of ${cell.as_of}`;
    s += ` · trust ${trustPct}%`;
    if (cell.seed_label) s += ` · ${cell.seed_label}`;
    if (cell.notes) s += ` — ${cell.notes}`;
    return s;
  }

  // Re-attest a *new* value/status for something that already had a cell.
  // The caller is expected to keep the OLD cell around (never overwrite it
  // in place — the substrate's append-only witness-log law applies to
  // provenance too: an old attestation becomes a scar, not a deletion).
  function reattest(oldCell, patch) {
    if (!isCell(oldCell)) throw new Error('provenance.reattest: not a provenance cell');
    const p = patch || {};
    return attest(Object.prototype.hasOwnProperty.call(p, 'value') ? p.value : oldCell.value, {
      source: p.source || oldCell.source,
      source_url: Object.prototype.hasOwnProperty.call(p, 'source_url') ? p.source_url : oldCell.source_url,
      as_of: Object.prototype.hasOwnProperty.call(p, 'as_of') ? p.as_of : oldCell.as_of,
      trust: Object.prototype.hasOwnProperty.call(p, 'trust') ? p.trust : oldCell.trust,
      seed_label: Object.prototype.hasOwnProperty.call(p, 'seed_label') ? p.seed_label : oldCell.seed_label,
      notes: Object.prototype.hasOwnProperty.call(p, 'notes') ? p.notes : oldCell.notes,
    });
  }

  // The specific, common re-attestation the engine does at runtime: the game
  // itself changed a status (a seeded event fired), which is never a new
  // real observation. Always source: PROCGEN, always a seed_label naming
  // the deterministic RNG fork that decided it (never a wall-clock date),
  // so it can never be confused for a researched fact — and always carries
  // a pointer back to the real cell it is temporarily overriding, so the UI
  // can show both (getState().chokepoints[id] = {real, current}).
  function reattestSimulated(oldCell, value, seedLabel, notes) {
    return reattest(oldCell, {
      value,
      source: SOURCES.PROCGEN,
      source_url: null,
      as_of: null,
      trust: 0.5,
      seed_label: seedLabel,
      notes: notes || 'in-game simulated change, not a new real-world observation — pencil, not news',
    });
  }

  // Optional trust decay for the "compressed timeline stays live" idea: a
  // canon/scout cell's trust drifts toward a floor the longer compressed
  // game-time runs past its as_of, so a stale-but-never-refreshed fact is
  // honestly less certain, not silently treated as still-current forever.
  // Pure function of (cell, elapsed) — no wall-clock read.
  function decayedTrust(cell, daysElapsedSinceAsOf, halfLifeDays, floor) {
    if (!isCell(cell)) throw new Error('provenance.decayedTrust: not a provenance cell');
    const hl = halfLifeDays || 180;
    const fl = typeof floor === 'number' ? floor : 0.15;
    if (!daysElapsedSinceAsOf || daysElapsedSinceAsOf <= 0) return cell.trust;
    const factor = Math.pow(0.5, daysElapsedSinceAsOf / hl);
    return Math.max(fl, cell.trust * factor);
  }

  return { SOURCES, attest, player, isCell, read, isReal, describe, reattest, reattestSimulated, decayedTrust };
});
