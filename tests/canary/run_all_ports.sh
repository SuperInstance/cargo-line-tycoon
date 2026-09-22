#!/bin/bash
# run_all_ports.sh - the single polyformalism-truth command
#
# Runs all 4 substrate ports and verifies byte-exact parity.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  cargo-line-tycoon — all 4 ports polyformalism check        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"

# TypeScript (in-process via Node)
echo ""
echo "[1/4] TypeScript port"
cd "$REPO_ROOT"
node -e "
const sub = require('./substrate/ts/src/index.js');
const c = sub.verifyCanary();
console.log('  canary:', c.hash_hex, '==', c.expected_hex, c.match ? '✓' : '✗');
const cell = new sub.Cell({state:'hello',type:'test'});
console.log('  cell:  ', '0x' + cell.address);
process.exit(c.match && cell.address === '96de3eeaabd90b9b' ? 0 : 1);
"

# Python
echo ""
echo "[2/4] Python port"
cd "$REPO_ROOT/substrate/py"
python3 clt_substrate/__init__.py

# Rust
echo ""
echo "[3/4] Rust port"
cd "$REPO_ROOT/substrate/rust"
cargo test --lib --quiet

# C99
echo ""
echo "[4/4] C99 port"
cd "$REPO_ROOT/substrate/c"
make test > /dev/null 2>&1
./test_algebra

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✓ All 4 ports pass polyformalism checks"
echo "═══════════════════════════════════════════════════════════════"
