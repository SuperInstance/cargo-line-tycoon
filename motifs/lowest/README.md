# Substrate Cell Motif at the Lowest Level

The substrate cell motif expressed at the absolute floor of computing.

## Files

- `wasm/substrate_cell.wat` — WebAssembly Text format
- `forth/substrate_cell.fs` — Forth (concatenative)
- `lisp/substrate_cell.lisp` — Lisp (parenthesized)

## Why bother?

The cell motif has 5 fields:
- id (string)
- prev_hash (8 bytes)
- conversation_id (string)
- source (string)
- state (JSON)

In assembly, this is ~30 bytes of memory + a hash function. The hash itself is FNV-1a:
- Multiply by a prime
- XOR with each byte

That's literally 4 operations. The substrate cell IS small enough to live in cache lines.

## Future

- RISC-V assembly
- x86_64 assembly (Linux syscall)
- FPGA Verilog (1-cycle hash)
- 6502 assembly (Apple II era, fits in 1 page)
