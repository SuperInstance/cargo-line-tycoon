"""Cargo Line Tycoon Substrate — Python port.

Polyformal-stable core: FNV-1a 64-bit + signal-chain + cell algebra.
This module must produce identical hashes and behavior as the TypeScript,
Rust, C, and Go ports.
"""
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Any
import json
import time

# ─────────────────────────────────────────────────────────────────────
# FNV-1a 64-bit (canonical)
# ─────────────────────────────────────────────────────────────────────

FNV_OFFSET = 0xcbf29ce484222325
FNV_PRIME = 0x100000001b3
MASK_64 = 0xffffffffffffffff

FLEET_CANARY_INPUT = 'café Δ 日本語'
FLEET_CANARY_HASH = 0x024a555471370b18d


def fnv1a64(s: str) -> int:
    """FNV-1a 64-bit hash. Must match TS, Rust, C, Go ports."""
    h = FNV_OFFSET
    for b in s.encode('utf-8'):
        h ^= b
        h = (h * FNV_PRIME) & MASK_64
    return h


def verify_canary(input: str = FLEET_CANARY_INPUT) -> bool:
    return fnv1a64(input) == FLEET_CANARY_HASH


# ─────────────────────────────────────────────────────────────────────
# Cell (Quilt substrate atom)
# ─────────────────────────────────────────────────────────────────────

@dataclass
class Cell:
    state: Any = None
    witness_log: List[Dict] = field(default_factory=list)
    behavior: Optional[str] = None
    type: str = 'cell'
    address: int = 0
    
    def __post_init__(self):
        if self.address == 0:
            self.address = self.compute_address()
    
    def compute_address(self) -> int:
        payload = json.dumps({'s': self.state, 't': self.type}, separators=(',', ':'))
        return fnv1a64(payload)
    
    @property
    def address_hex(self) -> str:
        return f'0x{self.address:016x}'


# ─────────────────────────────────────────────────────────────────────
# Signal Chain (event bus)
# ─────────────────────────────────────────────────────────────────────

class SignalType:
    TICK = 'tick'
    SHIP_ARRIVED = 'ship_arrived'
    CARGO_LOADED = 'cargo_loaded'
    WEATHER_WARNING = 'weather_warning'
    PORT_CONGESTED = 'port_congested'
    MARKET_TICK = 'market_tick'
    PORT_STATE_INSPECTION = 'port_state_inspection'
    SANCTIONS_ALERT = 'sanctions_alert'
    STUDENT_OBSERVATION = 'student_observation'
    FEATURE_REQUEST = 'feature_request'


class RoutingAlgorithm:
    DIRECT = 'direct'
    BUFFERED = 'buffered'
    CORRELATED = 'correlated'
    ON_CHANGE = 'on_change'
    SAMPLED = 'sampled'
    ADAPTIVE = 'adaptive'


@dataclass
class Signal:
    source: str
    target: str
    signal_type: str
    payload: Dict = field(default_factory=dict)
    priority: int = 5
    timestamp: int = field(default_factory=lambda: int(time.time() * 1000))


class SignalChain:
    def __init__(self):
        self.rooms: Dict[str, List[Signal]] = {}
        self.routes: List[Dict] = []
        self.stats = {
            'signals_sent': 0, 'signals_received': 0,
            'signals_dropped': 0, 'deadband_suppressions': 0,
            'rooms_registered': 0, 'routes_active': 0,
        }
    
    def register_room(self, name: str) -> bool:
        if name in self.rooms:
            return False
        self.rooms[name] = []
        self.stats['rooms_registered'] = len(self.rooms)
        return True
    
    def add_route(self, from_room: str, to_room: str, algorithm: str) -> bool:
        if from_room not in self.rooms or to_room not in self.rooms:
            return False
        if any(r['from'] == from_room and r['to'] == to_room for r in self.routes):
            return False
        self.routes.append({'from': from_room, 'to': to_room, 'algorithm': algorithm, 'last_payload': None, 'last_sent': 0})
        self.stats['routes_active'] = len(self.routes)
        return True
    
    def send(self, signal: Signal) -> bool:
        if signal.source not in self.rooms:
            self.stats['signals_dropped'] += 1
            return False
        matching = [(i, r) for i, r in enumerate(self.routes) if r['from'] == signal.source]
        if not matching:
            self.stats['signals_dropped'] += 1
            return False
        
        for idx, route in matching:
            if route['algorithm'] == RoutingAlgorithm.ON_CHANGE:
                if route['last_payload'] == signal.payload:
                    self.stats['signals_dropped'] += 1
                    continue
            if route['algorithm'] == RoutingAlgorithm.SAMPLED:
                interval = signal.payload.get('interval_ms', 1000)
                if signal.timestamp - route['last_sent'] < interval:
                    self.stats['signals_dropped'] += 1
                    continue
            route['last_payload'] = signal.payload
            route['last_sent'] = signal.timestamp
            if route['to'] in self.rooms:
                self.rooms[route['to']].append(signal)
            self.stats['signals_sent'] += 1
        return True
    
    def receive(self, room: str) -> List[Signal]:
        signals = self.rooms.get(room, [])
        out = list(signals)
        self.rooms[room] = []
        self.stats['signals_received'] += len(out)
        return out


# ─────────────────────────────────────────────────────────────────────
# Tests (run via: python -m clt_substrate)
# ─────────────────────────────────────────────────────────────────────

def test_canary():
    assert fnv1a64(FLEET_CANARY_INPUT) == FLEET_CANARY_HASH
    print('  fleet_canary: PASS')


def test_cell_polyformalism():
    """TS/Rust produce 0x96de3eeaabd90b9b for the same payload."""
    payload = '{"s":"hello","t":"test","b":null}'
    addr = fnv1a64(payload)
    assert addr == 0x96de3eeaabd90b9b, f'expected 0x96de3eeaabd90b9b, got 0x{addr:016x}'
    print('  cell_polyformalism: PASS')


def test_signal_chain_onchange():
    chain = SignalChain()
    chain.register_room('shanghai')
    chain.register_room('rotterdam')
    chain.add_route('shanghai', 'rotterdam', RoutingAlgorithm.ON_CHANGE)
    sig = Signal('shanghai', 'rotterdam', SignalType.SHIP_ARRIVED, {'ship_id': 'ship_1'})
    chain.send(sig)
    chain.send(sig)
    received = chain.receive('rotterdam')
    assert len(received) == 1, f'expected 1 (dedup), got {len(received)}'
    print('  signal_chain_onchange: PASS')


if __name__ == '__main__':
    print('Cargo Line Tycoon Substrate — Python tests:')
    test_canary()
    test_cell_polyformalism()
    test_signal_chain_onchange()
    print('All Python polyformalism tests passed.')
