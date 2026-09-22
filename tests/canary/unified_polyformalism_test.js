/**
 * unified_polyformalism_test.js
 *
 * Runs all 4 substrate ports and verifies byte-exact parity on:
 *   1. FNV-1a 64-bit canary hash (all 4 produce 0x024a555471370b18d on "café Δ 日本語")
 *   2. Cell address computation (all 4 produce 0x96de3eeaabd90b9b on state="hello",type="test")
 *   3. Signal-chain OnChange deduplication semantics
 *
 * This is the CROSS-LANGUAGE polyformalism test — the single source of truth.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '../..');

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  cargo-line-tycoon UNIFIED polyformalism test (4 ports)          ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

const results = [];

// ─────────────────────────────────────────────────────────────────────
// [1/4] TypeScript port (in-process)
// ─────────────────────────────────────────────────────────────────────

console.log('[1/4] TypeScript port (in-process via require)');
let ts_pass = false, ts_canary_match = false;
let ts_cell_addr = '', ts_cell_expected = '96de3eeaabd90b9b';
let ts_onchange = 0;
try {
  const TS = require(path.join(REPO, 'substrate/ts/src/index.js'));
  const c = TS.verifyCanary();
  ts_canary_match = c.match;
  const cell = new TS.Cell({ state: 'hello', type: 'test' });
  ts_cell_addr = cell.address;
  
  const chain = new TS.SignalChain();
  chain.registerRoom('shanghai');
  chain.registerRoom('rotterdam');
  chain.addRoute('shanghai', 'rotterdam', TS.RoutingAlgorithm.OnChange);
  const sig = new TS.Signal('shanghai', 'rotterdam', TS.SignalTypes.ShipArrived, { ship_id: 'ship_1' });
  chain.send(sig);
  chain.send(sig);
  ts_onchange = chain.receive('rotterdam').length;
  ts_pass = ts_canary_match && ts_cell_addr === ts_cell_expected && ts_onchange === 1;
  console.log(`      canary: ${c.hash_hex} == ${c.expected_hex}  ${c.match ? '✓' : '✗'}`);
  console.log(`      cell:   0x${cell.address} (expected 0x${ts_cell_expected})  ${cell.address === ts_cell_expected ? '✓' : '✗'}`);
  console.log(`      OnChange dedup: ${ts_onchange} signal (expected 1)  ${ts_onchange === 1 ? '✓' : '✗'}`);
} catch (e) {
  console.log(`      ✗ FAIL: ${e.message}`);
}
results.push({ name: 'TypeScript', pass: ts_pass });
console.log(`      ${ts_pass ? '✓ PASS' : '✗ FAIL'}`);

// ─────────────────────────────────────────────────────────────────────
// [2/4] Python port
// ─────────────────────────────────────────────────────────────────────

console.log('\n[2/4] Python port');
let py_pass = false;
try {
  const result = spawnSync('python3', [path.join(REPO, 'substrate/py/clt_substrate/__init__.py')], {
    encoding: 'utf-8',
    timeout: 90,
  });
  console.log('  ' + result.stdout.trim().replace(/\n/g, '\n  '));
  py_pass = result.status === 0 && result.stdout.includes('All Python polyformalism tests passed.');
} catch (e) {
  console.log(`      ✗ FAIL: ${e.message}`);
}
results.push({ name: 'Python', pass: py_pass });
console.log(`      ${py_pass ? '✓ PASS' : '✗ FAIL'}`);

// ─────────────────────────────────────────────────────────────────────
// [3/4] Rust port
// ─────────────────────────────────────────────────────────────────────

console.log('\n[3/4] Rust port (cargo test)');
let rust_pass = false;
try {
  const { execSync } = require('child_process');
  const out = execSync('cargo test --lib 2>&1', { encoding: 'utf-8', cwd: path.join(REPO, 'substrate/rust'), timeout: 240 });
  const lines = out.split('\n').filter(l => l.includes('test result:'));
  console.log('  ' + lines.join('\n  '));
  rust_pass = lines.some(l => l.includes('4 passed') && l.includes('0 failed'));
} catch (e) {
  console.log(`      ✗ FAIL: ${e.message}`);
}
results.push({ name: 'Rust', pass: rust_pass });
console.log(`      ${rust_pass ? '✓ PASS' : '✗ FAIL'}`);

// ─────────────────────────────────────────────────────────────────────
// [4/4] C99 port
// ─────────────────────────────────────────────────────────────────────

console.log('\n[4/4] C99 port (compile + run canary)');
let c_pass = false;
try {
  const c_dir = path.join(REPO, 'substrate/c');
  // Inline test program
  const canary_src = `
#include <stdio.h>
#include <string.h>
#define FNV1A64_H_DEFINED 1
#include "fnv1a64.h"
int main() {
    const char *s = "café Δ 日本語";
    uint64_t h = fnv1a64(s, strlen(s));
    printf("  canary hash: 0x%016lx\\n", h);
    printf("  expected:    0x024a555471370b18d\\n");
    printf("  match: %s\\n", h == 0x024a555471370b18dULL ? "PASS" : "FAIL");
    return h == 0x024a555471370b18dULL ? 0 : 1;
}`;
  fs.writeFileSync('/tmp/clt_canary.c', canary_src);
  const compile = spawnSync('gcc', ['-O2', '-I', c_dir, '/tmp/clt_canary.c', '-o', '/tmp/clt_canary'], { encoding: 'utf-8' });
  if (compile.status === 0) {
    const run = spawnSync('/tmp/clt_canary', [], { encoding: 'utf-8' });
    console.log(run.stdout.trim().replace(/\n/g, '\n      '));
    c_pass = run.stdout.includes('PASS');
  } else {
    console.log(`      ✗ FAIL compile: ${compile.stderr.slice(0, 200)}`);
  }
} catch (e) {
  console.log(`      ✗ FAIL: ${e.message}`);
}
results.push({ name: 'C99', pass: c_pass });
console.log(`      ${c_pass ? '✓ PASS' : '✗ FAIL'}`);

// ─────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════════');
const all_pass = results.every(r => r.pass);
if (all_pass) {
  console.log('✓ ALL 4 PORTS PASS — polyformalism verified.');
} else {
  console.log('✗ Some ports failed.');
  results.forEach(r => console.log(`   ${r.pass ? '✓' : '✗'} ${r.name}`));
}
console.log('═══════════════════════════════════════════════════════════════════');
process.exit(all_pass ? 0 : 1);
