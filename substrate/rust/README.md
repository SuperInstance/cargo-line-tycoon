# cargo-line-tycoon-substrate

Rust port of the polyformal Quilt substrate for cargo-line-tycoon.

See [cargo-line-tycoon](https://github.com/SuperInstance/cargo-line-tycoon) for the full picture.

## The fleet canary

```
FNV-1a 64-bit hash of "café Δ 日本語" = 0x024a555471370b18d
```

This hash MUST be identical across all 4+ language ports.

## Quick test

```bash
cargo test
```

4 tests run:
- `fleet_canary` — FNV-1a 64-bit canary hash
- `cell_address_deterministic` — same state → same address
- `signal_chain_onchange_drops_duplicates` — OnChange dedup works
- `polyformalism_parity` — Rust hash matches TS port for the same payload
