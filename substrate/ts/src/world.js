// Cargo Line Tycoon — Phase 0 world-model kernel
//
// Adds, on top of the existing Cell + SignalChain substrate:
//   - SeededRNG          deterministic PRNG (seed -> stream of draws)
//   - World              a booked, append-only tick loop over content-addressed cells
//   - Game cell factories  Company / Ship / Route / Port / Market
//
// The one law that matters here: replay ≡ live. A World booted with the same
// seed and fed the same ordered list of actions must produce a byte-identical
// witness-log and state hash, every time, on every machine. Nothing in this
// file may read Date.now(), Math.random(), or any other ambient/non-replayable
// source for anything that affects game state. (Date.now() *is* still used by
// the base Cell/Signal classes for bookkeeping timestamps that are display-only
// and are excluded from the replay hash below.)
//
// Wrapped as UMD (dual Node/browser) so it can also be loaded as a plain
// classic <script> in the offline game UI. This matters beyond convenience:
// it keeps this file's own top-level `const Cell = ...` etc. scoped to this
// module's closure instead of the shared global lexical scope that all
// classic <script> tags in one page draw from — loading index.js (which
// declares `class Cell`) and an unwrapped version of this file (which would
// otherwise declare `const Cell` again) side by side would throw
// "Identifier 'Cell' has already been declared". index.js itself is never
// modified; only this file (wholly new in Phase 0) is written defensively.

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./index.js'));
  } else {
    root.CLTWorld = factory(root.CLTSubstrateCore);
  }
})(typeof window !== 'undefined' ? window : this, function (kernel) {
  const { Cell, fnv1a64 } = kernel;

  // ─────────────────────────────────────────────────────────────────────
  // Seeded deterministic RNG (mulberry32, seeded via FNV-1a of the seed)
  // ─────────────────────────────────────────────────────────────────────

  function seedToUint32(seed) {
    // Fold the 64-bit FNV hash of the (stringified) seed down to a 32-bit
    // unsigned int for mulberry32's state. Deterministic across runs/machines
    // because fnv1a64 only depends on the UTF-8 bytes of the input string.
    const h = fnv1a64(String(seed));
    return Number(h & 0xffffffffn) >>> 0;
  }

  class SeededRNG {
    constructor(seed) {
      this.seed = seed;
      this.state = seedToUint32(seed) || 0x9e3779b9; // avoid a zero state
      this.draws = 0;
    }

    // Returns a float in [0, 1). Pure function of internal state; internal
    // state is a pure function of (seed, number of prior draws).
    next() {
      this.draws++;
      let t = (this.state += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // Integer in [min, max] inclusive.
    int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    }

    // Float in [min, max).
    float(min, max) {
      return min + this.next() * (max - min);
    }

    // true with probability p (0..1).
    chance(p) {
      return this.next() < p;
    }

    pick(arr) {
      return arr[this.int(0, arr.length - 1)];
    }

    // Fork a child RNG deterministically keyed off this stream + a label, so
    // independent subsystems (market, events, ...) don't perturb each other's
    // draw sequence when one of them changes call count.
    fork(label) {
      return new SeededRNG(`${this.seed}::${label}::${this.draws}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Game cell factories — content-addressed, typed, via the base Cell
  // ─────────────────────────────────────────────────────────────────────
  // Each factory returns a plain Cell whose `type` marks it and whose `state`
  // carries the typed payload. Cells are immutable snapshots: a game entity's
  // history is the ordered list of cell addresses booked for its entity id
  // (see EntityStore below), never a mutation in place.

  // Phase 2 (Fable apex refinement): a world-fact cell must carry a
  // provenance envelope, or cellFor refuses it outright — raise, never
  // default (mirrors the substrate's own R2/G20a "refusal, not a silent
  // default" discipline for revocable standing). A minimal shape check
  // only (a real `source` string + numeric `trust`), not a dependency on
  // game/src/provenance.js — this file stays the shared, game-agnostic
  // kernel; the richer envelope (required source_url/seed_label per
  // source, etc.) is enforced one level up, in provenance.attest() itself,
  // before a cell is ever built. `ship`/`route`/`company` are player cells
  // (not required to carry provenance, but default to a minimal
  // {source:'player', trust:1.0} tag when the caller doesn't supply one).
  const PROVENANCE_REQUIRED_CELL_TYPES = new Set(['port', 'market', 'event']);

  function hasMinimalProvenance(provenance) {
    return !!provenance && typeof provenance === 'object'
      && typeof provenance.source === 'string' && provenance.source.length > 0
      && typeof provenance.trust === 'number' && provenance.trust >= 0 && provenance.trust <= 1;
  }

  function cellFor(type, state) {
    if (PROVENANCE_REQUIRED_CELL_TYPES.has(type) && !hasMinimalProvenance(state && state.provenance)) {
      throw new Error(`cellFor: '${type}' cells require a provenance envelope (state.provenance = {source, trust, ...}) — refused, not defaulted. See game/src/provenance.js.`);
    }
    return new Cell({ type, state });
  }

  const PLAYER_PROVENANCE = { source: 'player', trust: 1.0 };

  // P0.4 (the reward ladder): `streak`/`streakMultiplier` live ON the
  // company cell rather than as a bespoke new cell type, because the
  // company cell already IS the one place in this kernel that is a
  // `player`-sourced standing fact by construction (PLAYER_PROVENANCE
  // default below) — exactly "a player-standing number... booked as a
  // `player` cell, never dressed as a world fact" (arch/CARGO-LINE-FUN-AND-
  // GRAPHICS.md §2.2). `streak` is the count of consecutive proven
  // scout-caused LANDs; `streakMultiplier` is the payout multiplier that
  // count currently earns (see game/src/engine.js streakMultiplierFor()).
  function makeCompanyCell({ id, name, cashMinorUnits, reputation = 0, unlocks = [], streak = 0, streakMultiplier = 1, provenance = PLAYER_PROVENANCE }) {
    return cellFor('company', { id, name, cash: cashMinorUnits, reputation, unlocks, streak, streakMultiplier, provenance });
  }

  // P0.2 (cost of commitment, M3): `needsReassignment` marks a ship whose
  // contract just ended (finite round-trips exhausted, or its own margin
  // fell below its ops cost) and is now idling at port, bleeding a reduced
  // fixed cost until the player re-assigns it — see engine.js's contract
  // bookkeeping in _tickShip(). Defaults false so every pre-existing call
  // site (a ship mid-leg, or freshly bought/gifted) is unaffected.
  function makeShipCell({ id, companyId, classId, capacityTeu, speedKn, canTransitPanama = true, cargoTeu = 0, positionPortId, condition = 100, routeId = null, needsReassignment = false, provenance = PLAYER_PROVENANCE }) {
    return cellFor('ship', {
      id, companyId, classId, capacityTeu, speedKn, canTransitPanama,
      cargoTeu, positionPortId, condition, routeId, needsReassignment, provenance,
    });
  }

  function makeRouteCell({ id, companyId, fromPortId, toPortId, distanceNm, legs = [], usesPanama = false, assignedShipIds = [], provenance = PLAYER_PROVENANCE }) {
    return cellFor('route', { id, companyId, fromPortId, toPortId, distanceNm, legs, usesPanama, assignedShipIds, provenance });
  }

  // No default here (unlike Phase 1): a port cell's provenance must be
  // supplied by the caller — see game/data/ports.js's per-port `provenance`
  // field, sourced through game/src/provenance.js. cellFor() refuses a
  // missing one rather than silently assuming {source:'canon', trust:1.0}.
  function makePortCell({ id, name, lat, lng, country, annualTeus, tier, provenance }) {
    return cellFor('port', { id, name, lat, lng, country, annualTeus, tier, provenance });
  }

  // Phase 2: market cells are procedurally-priced (BASE_PRICE_BY_COMMODITY is
  // game flavor, not observed truth — see game/data/ports.js's own file-header
  // caveat), so every caller must now pass a provenance envelope; cellFor()
  // refuses a missing one. There is deliberately no default here either.
  // `deliverDebt` (P0.2, M2 — arch/CARGO-LINE-FUN-AND-GRAPHICS.md §2.1): the
  // persistent "this port has been hammered by deliveries lately" fatigue
  // accumulator economy.js's bumpDeliverDebt()/decayDeliverDebt() maintain;
  // defaults to 0 so every pre-existing call site is unaffected.
  function makeMarketCell({ portId, commodity, basePrice, price, demand, deliverDebt = 0, provenance }) {
    return cellFor('market', { portId, commodity, basePrice, price, demand, deliverDebt, provenance });
  }

  // ─────────────────────────────────────────────────────────────────────
  // EntityStore — tracks the *current* cell address per mutable entity id,
  // while every version ever booked stays in World.cells (content-addressed,
  // append-only — nothing is ever overwritten in place).
  // ─────────────────────────────────────────────────────────────────────

  class EntityStore {
    constructor(world) {
      this.world = world;
      this.latest = new Map(); // entityId -> address
      this.history = new Map(); // entityId -> [address, ...]
    }

    put(entityId, cell) {
      this.world.bookCell(cell);
      this.latest.set(entityId, cell.address);
      if (!this.history.has(entityId)) this.history.set(entityId, []);
      this.history.get(entityId).push(cell.address);
      this.world.book({ type: 'entity_update', entity_id: entityId, address: cell.address, cell_type: cell.type });
      return cell;
    }

    get(entityId) {
      const addr = this.latest.get(entityId);
      if (!addr) return null;
      return this.world.cells.get(addr) || null;
    }

    all() {
      const out = {};
      for (const [id] of this.latest) out[id] = this.get(id);
      return out;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // World — the booked tick loop. Everything that can affect the game's
  // future must be booked as a witness_log entry via book()/bookLedger()
  // before it takes effect, so the log alone is sufficient to replay the run.
  // ─────────────────────────────────────────────────────────────────────

  class World {
    constructor({ seed }) {
      this.seed = seed;
      this.tick_no = 0;
      this.rng = new SeededRNG(seed);
      this.cells = new Map(); // address -> Cell (every version, ever)
      this.witness_log = []; // append-only, ordered, replay-sufficient
      this.entities = new EntityStore(this);
    }

    bookCell(cell) {
      this.cells.set(cell.address, cell);
      return cell.address;
    }

    // Book an arbitrary event into the witness-log. `entry` must be JSON-safe
    // and must not embed wall-clock time or any other non-replayable value.
    // Phase 2 (Fable apex refinement): any '*_start' event marks the
    // beginning of something that will be narrated to the player (a
    // disruption, a game starting) — refuse it outright if it carries no
    // provenance, so a seeded fact can never enter the book already
    // wearing the disguise of unattributed truth. Same minimal shape check
    // as cellFor() above; not scoped to only 'port'/'market'/'event' types
    // because an event *entry* (not a Cell) is exactly what a '*_start'
    // booking is.
    book(entry) {
      if (typeof entry.type === 'string' && entry.type.endsWith('_start') && !hasMinimalProvenance(entry.provenance)) {
        throw new Error(`book: a '*_start' event ("${entry.type}") requires a provenance envelope (entry.provenance = {source, trust, ...}) — refused, not defaulted. See game/src/provenance.js.`);
      }
      const booked = Object.freeze({ tick: this.tick_no, seq: this.witness_log.length, ...entry });
      this.witness_log.push(booked);
      return booked;
    }

    // Double-entry ledger booking. Money is integer minor units (cents) —
    // identity never floats. `amount` is always >= 0; `debit`/`credit` name
    // the accounts (e.g. company id and 'fuel', or 'revenue' and company id).
    bookLedger({ debit, credit, amount, memo }) {
      if (!Number.isInteger(amount) || amount < 0) {
        throw new Error(`bookLedger: amount must be a non-negative integer (minor units), got ${amount}`);
      }
      return this.book({ type: 'ledger', debit, credit, amount, memo });
    }

    // Advance the clock by one tick. `step(world)` is any deterministic
    // function of world state + world.rng; callers pass their game-specific
    // per-tick logic here so this module stays engine-agnostic.
    tick(step) {
      this.tick_no += 1;
      this.book({ type: 'tick', tick_no: this.tick_no });
      if (typeof step === 'function') step(this);
      return this.tick_no;
    }

    // A deterministic hash of everything that defines "the state of the
    // world so far": the full witness-log (which is itself append-only and
    // replay-sufficient) plus the current address of every entity. Two worlds
    // booted from the same seed and fed the same ordered actions must produce
    // an identical stateHash() after each tick — that equality *is* the Phase 0
    // predicate (replay ≡ live). O(log length): cheap for periodic/final
    // verification, not meant to be called every tick of a live session.
    stateHash() {
      const payload = JSON.stringify({
        seed: this.seed,
        tick_no: this.tick_no,
        log: this.witness_log.map(({ tick, seq, ...rest }) => ({ tick, seq, ...rest })),
        entities: [...this.entities.latest.entries()].sort(),
      });
      return fnv1a64(payload).toString(16).padStart(16, '0');
    }
  }

  return {
    SeededRNG,
    World,
    EntityStore,
    makeCompanyCell,
    makeShipCell,
    makeRouteCell,
    makePortCell,
    makeMarketCell,
  };
});
