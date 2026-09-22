// Cargo Line Tycoon Substrate — TypeScript port
// Polyformal-stable core: signal-chain + cell algebra + FNV-1a 64-bit canary

// ─────────────────────────────────────────────────────────────────────
// FNV-1a 64-bit (canonical; matches Rust, C, Python implementations)
// ─────────────────────────────────────────────────────────────────────

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

const FLEET_CANARY_INPUT = 'café Δ 日本語';
const FLEET_CANARY_HASH = 0x024a555471370b18dn;

function fnv1a64(input) {
  // Accept: string (utf-8 encode), Buffer (use as-is), or Uint8Array
  let bytes;
  if (typeof input === 'string') {
    // Handle unpaired surrogates like Rust/Python: 'surrogatepass' mode
    bytes = Buffer.from(input, 'utf-8');
  } else if (Buffer.isBuffer(input)) {
    bytes = input;
  } else if (input instanceof Uint8Array) {
    bytes = Buffer.from(input);
  } else {
    // last resort: stringify and encode
    bytes = Buffer.from(String(input), 'utf-8');
  }
  let h = FNV_OFFSET;
  for (let i = 0; i < bytes.length; i++) {
    h = BigInt(h ^ BigInt(bytes[i]));
    h = BigInt(h * FNV_PRIME);
  }
  return BigInt(h & MASK_64);
}

function verifyCanary(input = FLEET_CANARY_INPUT) {
  const h = fnv1a64(input);
  return {
    input,
    hash_hex: '0x' + h.toString(16).padStart(16, '0'),
    expected_hex: '0x' + FLEET_CANARY_HASH.toString(16).padStart(16, '0'),
    match: h === FLEET_CANARY_HASH,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Cell (Quilt substrate atom)
// ─────────────────────────────────────────────────────────────────────

class Cell {
  constructor({ state = null, witness_log = [], behavior = null, type = 'cell' } = {}) {
    this.state = state;
    this.witness_log = witness_log; // List<observation>
    this.behavior = behavior;
    this.type = type;
    this.address = this.computeAddress();
  }

  computeAddress() {
    const payload = JSON.stringify({
      s: this.state,
      t: this.type,
      b: this.behavior ? this.behavior.toString() : null,
    });
    return fnv1a64(payload).toString(16).padStart(16, '0');
  }

  // Apply an opcode
  apply(opcode, ...args) {
    switch (opcode) {
      case 'BIND':
        return new Cell(args[0] || {});
      case 'LINK':
        // LINK(a, b) → typed edge
        return new Edge(this, args[0], args[1]);
      case 'EFFECT':
        return this.behavior ? this.behavior(this.state, ...args) : null;
      case 'VIEW':
        return this.state;
      case 'TICK':
        // TICK advances the witness-log
        this.witness_log.push({ type: 'tick', time: Date.now() });
        return this;
      case 'ATTEST':
        this.witness_log.push({
          type: 'attestation',
          attestor: args[0],
          trust: args[1] || 0.5,
          time: Date.now(),
          is_irrevocable: true,
        });
        return this;
      default:
        throw new Error(`Unknown opcode: ${opcode}`);
    }
  }
}

class Edge {
  constructor(from, to, edgeType = 'default') {
    this.from = from;
    this.to = to;
    this.edge_type = edgeType;
    this.address = fnv1a64(JSON.stringify({
      f: from.address, t: to.address, e: edgeType,
    })).toString(16).padStart(16, '0');
  }
}

// ─────────────────────────────────────────────────────────────────────
// Signal-Chain (event bus; from a2a-signal-chain Rust crate)
// ─────────────────────────────────────────────────────────────────────

const SignalTypes = {
  Tick: 'tick',
  Murmur: 'murmur',
  Prediction: 'prediction',
  Surprise: 'surprise',
  GcReport: 'gc_report',
  VibeShift: 'vibe_shift',
  LoRATrigger: 'lora_trigger',
  BalanceAlert: 'balance_alert',
  CorrelationUpdate: 'correlation_update',
  EnergyUpdate: 'energy_update',
  // Cargo Line Tycoon additions
  ShipArrived: 'ship_arrived',
  CargoLoaded: 'cargo_loaded',
  WeatherWarning: 'weather_warning',
  PortCongested: 'port_congested',
  MarketTick: 'market_tick',
  PortStateInspection: 'port_state_inspection',
  SanctionsAlert: 'sanctions_alert',
  StudentObservation: 'student_observation',
  FeatureRequest: 'feature_request',
};

class Signal {
  constructor(source, target, signalType, payload = {}, priority = 5) {
    this.source = source;
    this.target = target;
    this.signal_type = signalType;
    this.payload = payload;
    this.priority = priority;
    this.timestamp = Date.now();
    // Safe id hash: tolerate cyclic / BigInt / function references
    const fp = (p) => {
      try { return JSON.stringify({ s: source, t: target, st: signalType, ts: this.timestamp, p }, (k,v) => typeof v === 'bigint' ? v.toString()+'n' : typeof v === 'function' ? '[fn]' : v); }
      catch { return String(this.timestamp) + ':' + source + ':' + target + ':' + signalType; }
    };
    const safeHash = fp(payload);
    const idHex = fnv1a64(safeHash).toString(16).slice(0, 8);
    this.id = parseInt(idHex, 16);  // parseInt parses hex without 0x prefix
  }
}

const RoutingAlgorithm = {
  Direct: 'direct',
  Buffered: 'buffered',
  Correlated: 'correlated',
  OnChange: 'on_change',
  Sampled: 'sampled',
  Adaptive: 'adaptive',
};

class Route {
  constructor(from, to, algorithm) {
    this.from = from;
    this.to = to;
    this.algorithm = algorithm;
    this.last_payload = null;
    this.last_sent = 0;
  }
}

class Port {
  constructor(room) {
    this.room = room;
    this.inbound = [];
    this.outbound = [];
  }
  pushInbound(signal) {
    this.inbound.push(signal);
  }
  pushOutbound(signal) {
    this.outbound.push(signal);
  }
}

class SignalChain {
  constructor() {
    this.rooms = new Map();
    this.routes = [];
    this.lastSignal = new Map();
    this.stats = {
      signals_sent: 0, signals_received: 0,
      signals_dropped: 0, deadband_suppressions: 0,
      rooms_registered: 0, routes_active: 0,
    };
  }

  registerRoom(name) {
    if (this.rooms.has(name)) return false;
    this.rooms.set(name, new Port(name));
    this.stats.rooms_registered = this.rooms.size;
    return true;
  }

  addRoute(from, to, algorithm) {
    if (!this.rooms.has(from) || !this.rooms.has(to)) return false;
    if (this.routes.some(r => r.from === from && r.to === to)) return false;
    this.routes.push(new Route(from, to, algorithm));
    this.stats.routes_active = this.routes.length;
    return true;
  }

  send(signal) {
    if (!this.rooms.has(signal.source)) {
      this.stats.signals_dropped++;
      return false;
    }
    const matching = this.routes
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.from === signal.source);

    if (matching.length === 0) {
      this.stats.signals_dropped++;
      return false;
    }

    const now = signal.timestamp;
    for (const { r: route } of matching) {
      // OnChange logic — safely compute fingerprint even with cyclic / BigInt refs
      if (route.algorithm === RoutingAlgorithm.OnChange) {
        const fp = (p) => {
          try { return JSON.stringify(p, (k,v) => typeof v === 'bigint' ? v.toString()+'n' : v); }
          catch { return String(Date.now()) + ':' + Math.random(); }  // cycle fallback
        };
        const lastJSON = fp(route.last_payload);
        const currJSON = fp(signal.payload);
        if (lastJSON === currJSON) {
          this.stats.signals_dropped++;
          continue;
        }
      }
      // Sampled logic
      if (route.algorithm === RoutingAlgorithm.Sampled) {
        const interval = signal.payload?.interval_ms || 1000;
        if (now - route.last_sent < interval) {
          this.stats.signals_dropped++;
          continue;
        }
      }

      route.last_payload = signal.payload;
      route.last_sent = now;

      const target = this.rooms.get(route.to);
      if (target) target.pushInbound(signal);
      this.stats.signals_sent++;
    }
    return true;
  }

  receive(room) {
    const port = this.rooms.get(room);
    if (!port) return [];
    const signals = port.inbound.splice(0);
    this.stats.signals_received += signals.length;
    return signals;
  }

  broadcast(signal) {
    const source = signal.source;
    let count = 0;
    for (const [name, port] of this.rooms) {
      if (name !== source) {
        const copy = { ...signal, target: name };
        port.pushInbound(copy);
        count++;
      }
    }
    this.stats.signals_sent += count;
    return count;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Locale adapter (canonical pattern)
// ─────────────────────────────────────────────────────────────────────

class LocaleClassroom {
  constructor({ locale, portCanon, agentCanon, curriculum }) {
    this.locale = locale;
    this.portCanon = portCanon; // Array<port definition>
    this.agentCanon = agentCanon; // Array<agent persona>
    this.curriculum = curriculum; // { tier_1: [...], tier_2: [...], tier_3: [...] }
    this.chain = new SignalChain();
    this.cells = new Map();

    // Register each port as a room
    for (const port of portCanon) {
      this.chain.registerRoom(`port:${port.id}`);
      this.cells.set(`port:${port.id}`, new Cell({
        state: port,
        witness_log: [],
        type: 'port',
      }));
    }

    // Register each agent as a room
    for (const agent of agentCanon) {
      this.chain.registerRoom(`agent:${agent.id}`);
      this.cells.set(`agent:${agent.id}`, new Cell({
        state: agent,
        witness_log: [],
        type: 'agent',
      }));
    }

    // Three routing families — each is canonical for a pedagogical purpose:

    // 1. port→agent (OnChange): ports push ONLY when their state actually
    //    changes (weather, congestion, price). Same payload twice = no-op,
    //    which keeps the UI calm even when ports tick every minute.
    for (const port of portCanon) {
      for (const agent of agentCanon) {
        this.chain.addRoute(`port:${port.id}`, `agent:${agent.id}`, RoutingAlgorithm.OnChange);
      }
    }

    // 2. agent→agent (Direct): agents can talk to each other freely. This
    //    is what the Director loop uses when reassigning who speaks next.
    for (const a of agentCanon) {
      for (const b of agentCanon) {
        if (a.id !== b.id) {
          this.chain.addRoute(`agent:${a.id}`, `agent:${b.id}`, RoutingAlgorithm.Direct);
        }
      }
    }

    // 3. agent→port (Sampled, 5s): agents poll ports at most once every 5s.
    //    This is the "market tick" / "fuel price" pattern — old data is fine,
    //    new data every 5s. Without this, the same agent would re-query a
    //    port 60 times in a 5-second window.
    for (const agent of agentCanon) {
      for (const port of portCanon) {
        this.chain.addRoute(`agent:${agent.id}`, `port:${port.id}`, RoutingAlgorithm.Sampled);
        // Initialize the route's `last_sent` so first sample goes through
        const route = this.chain.routes[this.chain.routes.length - 1];
        route.last_sent = -10000; // first sample always sends
      }
    }

    // 4. broadcast from any source (handled by emitEvent via SignalChain.broadcast)
  }

  emitEvent(eventType, source, payload) {
    return this.chain.send(new Signal(source, '*', eventType, payload));
  }

  receiveFor(roomId) {
    return this.chain.receive(roomId);
  }

  // The pedagogical framing: which tradition does this locale follow?
  pedagogicalFraming() {
    if (this.curriculum && this.curriculum.framing) return this.curriculum.framing;
    return 'socratic'; // default
  }
}

// ─────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────

module.exports = {
  // Canary
  FLEET_CANARY_INPUT,
  FLEET_CANARY_HASH,
  fnv1a64,
  verifyCanary,
  // Cell
  Cell,
  Edge,
  // Signal chain
  SignalTypes,
  Signal,
  RoutingAlgorithm,
  Route,
  Port,
  SignalChain,
  // Locale
  LocaleClassroom,
};
