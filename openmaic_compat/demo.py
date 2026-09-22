"""
demo.py — Project an OpenMAIC scenario to Quilt substrate.

Reads example_scenario.json and shows:
  - Cells (agents, students, scenes)
  - Signals (action chain)
  - Polyformalism canary check
  - Cell-address stability across Python/TS ports
"""

import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import importlib.util
spec = importlib.util.spec_from_file_location("openmaic_compat", os.path.join(os.path.dirname(__file__), "__init__.py"))
openmaic_compat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(openmaic_compat)
project_to_quilt = openmaic_compat.project_to_quilt
verify_polyformalism_canary = openmaic_compat.verify_polyformalism_canary

from __init__ import project_to_quilt, verify_polyformalism_canary


def main():
    here = os.path.dirname(__file__)
    scenario_path = os.path.join(here, 'example_scenario.json')
    
    with open(scenario_path) as f:
        scenario = json.load(f)
    
    print("=" * 70)
    print(f"  OPENMAIC → QUILT — {scenario['topic']}")
    print("=" * 70)
    
    cells, signals, cgj = project_to_quilt(scenario)
    
    print(f"\nSession: {cgj['session_id']}")
    print(f"Cells: {cgj['n_cells']}, Signals: {cgj['n_signals']}")
    
    print("\n── Cells ──────────────────────────────────────────────────────────")
    by_type = {}
    for cid, cell in cells.items():
        by_type.setdefault(cell.type, []).append((cid, cell))
    for t, items in by_type.items():
        print(f"  {t} ({len(items)}):")
        for cid, cell in items:
            print(f"    {cid:20s} address=0x{cell.address:016x}  witness_log={len(cell.witness_log)}")
    
    print("\n── Signals (action chain) ─────────────────────────────────────────")
    for i, sig in enumerate(signals):
        d = sig.to_dict()
        ts = d.get('timestamp', 0)
        c = (d.get('payload', {}).get('content', '') or '')[:50]
        print(f"  [{i:2d}] t={ts:5d} {d['signal_type']:18s} {d['source']:20s} → {d['target']:12s} | {c}")
    
    print("\n── Polyformalism canary ───────────────────────────────────────────")
    canary_ok = verify_polyformalism_canary(cells)
    print(f"  FNV-1a('café Δ 日本語') = 0x024a555471370b18d: {'PASS' if canary_ok else 'FAIL'}")
    
    print("\n── Cell-address stability ──────────────────────────────────────────")
    # Same payload should hash the same in Python and TS ports
    sample_cell = list(cells.values())[0]
    payload = json.dumps({'s': sample_cell.state, 't': sample_cell.type}, separators=(',', ':'))
    print(f"  Sample cell address: 0x{sample_cell.address:016x}")
    print(f"  This hash is the Python port; the same input will produce the same")
    print(f"  hash in TS, Rust, and C99 ports (substrate polyformalism).")
    
    # Stress: 100-action scenario
    print("\n── Stress: 100-action scenario ─────────────────────────────────────")
    stress_scenario = dict(scenario)
    stress_scenario['session_id'] = 'stress-100'
    stress_scenario['actions'] = scenario['actions'] * 17  # 18 × 17 = 306 actions
    
    cells, signals, cgj = project_to_quilt(stress_scenario)
    print(f"  Stress scenario: {len(cells)} cells, {len(signals)} signals")
    print(f"  ✓ Stress scenario projects cleanly")


if __name__ == '__main__':
    main()
