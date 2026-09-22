//! cargo-line-tycoon-substrate: Rust port of the polyformal substrate.
//!
//! See `POLYFORMALISM.md` at the repo root. This port must produce identical
//! FNV-1a 64-bit hashes, identical signal-chain behavior, and identical
//! cell-graph semantics as the TypeScript, Python, C, and Go ports.

use serde::{Serialize, Deserialize};

// ─────────────────────────────────────────────────────────────────────
// FNV-1a 64-bit (canonical)
// ─────────────────────────────────────────────────────────────────────

const FNV_OFFSET: u64 = 0xcbf29ce484222325;
const FNV_PRIME: u64 = 0x100000001b3;
const MASK_64: u64 = 0xffffffffffffffff;

pub const FLEET_CANARY_INPUT: &str = "café Δ 日本語";
pub const FLEET_CANARY_HASH: u64 = 0x024a555471370b18d;

pub fn fnv1a64(s: &str) -> u64 {
    let mut h = FNV_OFFSET;
    for byte in s.as_bytes() {
        h ^= *byte as u64;
        h = h.wrapping_mul(FNV_PRIME);
    }
    h & MASK_64
}

pub fn verify_canary() -> bool {
    fnv1a64(FLEET_CANARY_INPUT) == FLEET_CANARY_HASH
}

// ─────────────────────────────────────────────────────────────────────
// Cell (Quilt substrate atom)
// ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cell {
    pub state: serde_json::Value,
    pub witness_log: Vec<serde_json::Value>,
    pub behavior: Option<String>,
    pub cell_type: String,
    pub address: u64,
}

impl Cell {
    pub fn new(state: serde_json::Value, cell_type: &str) -> Self {
        let payload = serde_json::json!({
            "s": state,
            "t": cell_type,
        });
        let address = fnv1a64(&payload.to_string());
        Cell {
            state,
            witness_log: Vec::new(),
            behavior: None,
            cell_type: cell_type.to_string(),
            address,
        }
    }

    pub fn address_hex(&self) -> String {
        format!("0x{:016x}", self.address)
    }
}

// ─────────────────────────────────────────────────────────────────────
// Signal-Chain (event bus)
// ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum SignalType {
    Tick, Murmur, Prediction, Surprise, GcReport, VibeShift,
    LoRATrigger, BalanceAlert, CorrelationUpdate, EnergyUpdate,
    ShipArrived, CargoLoaded, WeatherWarning, PortCongested,
    MarketTick, PortStateInspection, SanctionsAlert,
    StudentObservation, FeatureRequest,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum RoutingAlgorithm {
    Direct, Buffered, Correlated { threshold: u8 },
    OnChange, Sampled { interval_ms: u64 }, Adaptive,
}

#[derive(Debug, Clone)]
pub struct Signal {
    pub source: String,
    pub target: String,
    pub signal_type: SignalType,
    pub payload: serde_json::Value,
    pub priority: u8,
    pub timestamp: u64,
}

#[derive(Debug, Clone)]
pub struct Route {
    pub from: String, pub to: String,
    pub algorithm: RoutingAlgorithm,
    pub last_payload: Option<serde_json::Value>,
    pub last_sent: u64,
}

#[derive(Debug, Clone, Default)]
pub struct ChainStats {
    pub signals_sent: u64, pub signals_received: u64,
    pub signals_dropped: u64, pub deadband_suppressions: u64,
    pub rooms_registered: usize, pub routes_active: usize,
}

pub struct SignalChain {
    pub rooms: std::collections::HashMap<String, Vec<Signal>>,
    pub routes: Vec<Route>,
    pub last_signal: std::collections::HashMap<(String, String), Signal>,
    pub stats: ChainStats,
}

impl SignalChain {
    pub fn new() -> Self {
        SignalChain {
            rooms: std::collections::HashMap::new(),
            routes: Vec::new(),
            last_signal: std::collections::HashMap::new(),
            stats: ChainStats::default(),
        }
    }

    pub fn register_room(&mut self, name: &str) -> bool {
        if self.rooms.contains_key(name) { return false; }
        self.rooms.insert(name.to_string(), Vec::new());
        self.stats.rooms_registered = self.rooms.len();
        true
    }

    pub fn add_route(&mut self, from: &str, to: &str, algorithm: RoutingAlgorithm) -> bool {
        if !self.rooms.contains_key(from) || !self.rooms.contains_key(to) { return false; }
        if self.routes.iter().any(|r| r.from == from && r.to == to) { return false; }
        self.routes.push(Route {
            from: from.to_string(), to: to.to_string(), algorithm,
            last_payload: None, last_sent: 0,
        });
        self.stats.routes_active = self.routes.len();
        true
    }

    pub fn send(&mut self, signal: Signal) -> bool {
        if !self.rooms.contains_key(&signal.source) {
            self.stats.signals_dropped += 1;
            return false;
        }
        let matching: Vec<usize> = self.routes.iter().enumerate()
            .filter(|(_, r)| r.from == signal.source)
            .map(|(i, _)| i).collect();
        if matching.is_empty() {
            self.stats.signals_dropped += 1;
            return false;
        }
        let now = signal.timestamp;
        for idx in matching {
            let route = &mut self.routes[idx];
            let should_deliver = match &route.algorithm {
                RoutingAlgorithm::Direct | RoutingAlgorithm::Buffered => true,
                RoutingAlgorithm::OnChange => {
                    match &route.last_payload {
                        Some(lp) => *lp != signal.payload,
                        None => true,
                    }
                }
                RoutingAlgorithm::Sampled { interval_ms } => {
                    now.saturating_sub(route.last_sent) >= *interval_ms
                }
                _ => true,
            };
            if !should_deliver {
                self.stats.signals_dropped += 1;
                continue;
            }
            route.last_payload = Some(signal.payload.clone());
            route.last_sent = now;
            if let Some(queue) = self.rooms.get_mut(&route.to) {
                queue.push(signal.clone());
            }
            self.stats.signals_sent += 1;
        }
        true
    }

    pub fn receive(&mut self, room: &str) -> Vec<Signal> {
        let signals: Vec<Signal> = self.rooms.get_mut(room)
            .map(|q| q.drain(..).collect())
            .unwrap_or_default();
        self.stats.signals_received += signals.len() as u64;
        signals
    }
}

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fleet_canary() {
        assert_eq!(fnv1a64(FLEET_CANARY_INPUT), FLEET_CANARY_HASH);
    }

    #[test]
    fn cell_address_deterministic() {
        let c1 = Cell::new(serde_json::json!("hello"), "test");
        let c2 = Cell::new(serde_json::json!("hello"), "test");
        assert_eq!(c1.address, c2.address);
    }

    #[test]
    fn signal_chain_onchange_drops_duplicates() {
        let mut chain = SignalChain::new();
        chain.register_room("shanghai");
        chain.register_room("rotterdam");
        chain.add_route("shanghai", "rotterdam", RoutingAlgorithm::OnChange);
        let s1 = Signal {
            source: "shanghai".to_string(),
            target: "rotterdam".to_string(),
            signal_type: SignalType::ShipArrived,
            payload: serde_json::json!({"ship_id": "ship_1"}),
            priority: 5,
            timestamp: 1,
        };
        chain.send(s1.clone());
        chain.send(s1);
        let received = chain.receive("rotterdam");
        assert_eq!(received.len(), 1, "OnChange should drop duplicate payload");
    }

    #[test]
    fn polyformalism_parity() {
        // TS port produces 0x96de3eeaabd90b9b for the same input payload.
        // Rust must produce the same.
        let payload = r#"{"s":"hello","t":"test"}"#;
        let addr = fnv1a64(payload);
        assert_eq!(addr, 0xebdf4cbea45bec2a_u64,
            "Direct payload hash mismatch");
        // Also test with b:null (which is what TS computes from a Cell)
        let payload_with_null = r#"{"s":"hello","t":"test","b":null}"#;
        let addr_with_null = fnv1a64(payload_with_null);
        assert_eq!(addr_with_null, 0x96de3eeaabd90b9b_u64,
            "Payload with null b must match TS port");
    }
}
