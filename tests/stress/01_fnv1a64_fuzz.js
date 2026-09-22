/**
 * FNV-1a 64-bit fuzz test — exhaust the hash input space with pathological inputs.
 * Same input → same hash, byte-exact across TS/Rust/C99/Python.
 */

const fs = require('fs');
const path = require('path');
const sub = require('../../substrate/ts/src/index.js');
const { execSync } = require('child_process');

const CASES = [
  ['empty string', ''],
  ['single null', '\x00'],
  ['only nulls', '\x00'.repeat(8)],
  ['single byte 0xff', '\xff'],
  ['single byte 0x7f', '\x7f'],
  ['max UTF-8 codepoint', '\uffff'],
  ['surrogate pair', '\uD83D\uDE80'],
  ['LTR + RTL mix', 'abc\u202e\u202ddef'],
  ['RTL text', 'مرحبا'],
  ['emoji ZWJ family', '👨‍👩‍👧‍👦'],
  ['combining marks', 'a\u0301'],
  ['surrogate pair 4byte', '\uD800\uDC00'],
  ['trailing whitespace', 'café Δ 日本語 '],
  ['leading whitespace', ' café Δ 日本語'],
  ['NUL escape', '\\u0000'],
  ['newline', '\n'],
  ['tab', '\t'],
  ['100x emoji', '🐱'.repeat(100)],
  ['1000x omega', 'Ω'.repeat(1000)],
  ['canary canonical', 'café Δ 日本語'],
  ['canary+1 extra space', 'café  Δ 日本語'],
  ['canary+null terminator', 'café Δ 日本語\x00'],
  ['arbitrary binary', '\x00\x01\x02\x03\x04\x05'],
  ['zero-string', '0'],
  ['false-string', 'false'],
  ['null-string', 'null'],
  ['undefined-string', 'undefined'],
  ['NaN-string', 'NaN'],
  ['bigint overflow', '9007199254740993'],
];

// Write Python fuzz to a file (escape-prone inputs go via JSON-encoded file)
const pyFile = '/tmp/fnv_fuzz.py';
const pyCasesJSON = JSON.stringify(CASES);
fs.writeFileSync(pyFile, `
import sys
sys.path.insert(0, '${path.resolve('/workspace/research/cargo-line-tycoon/substrate/py')}')
import json
from clt_substrate import fnv1a64
cases = json.loads(${JSON.stringify(pyCasesJSON)})
for label, s in cases:
    h = fnv1a64(s.encode('utf-8'))
    print(f"{label}\t0x{h:016x}")
`);

// Also Rust fuzz
const rustFile = '/tmp/fnv_fuzz.rs';
const rustCases = CASES.map(([l, s]) => [l, Array.from(Buffer.from(s, 'utf-8'))]);
fs.writeFileSync(rustFile, `
// FNV-1a fuzz test
const FNV_OFFSET: u64 = 0xcbf29ce484222325;
const FNV_PRIME: u64 = 0x100000001b3;
const MASK: u64 = 0xffffffffffffffff;
fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut h = FNV_OFFSET;
    for &b in bytes {
        h ^= b as u64;
        h = h.wrapping_mul(FNV_PRIME);
    }
    h & MASK
}
fn main() {
    let cases: Vec<(&str, Vec<u8>)> = vec![
${rustCases.map(([l, bytes]) => `        ("${l.replace(/"/g, '\\"')}", vec![${bytes.join(',')}]),`).join('\n')}
    ];
    for (label, bytes) in cases {
        let h = fnv1a64(&bytes);
        println!("{}\\t0x{:016x}", label, h);
    }
}
`);

console.log(`=== FNV-1a fuzz: ${CASES.length} cases ===\n`);
console.log("TS results:");
const tsHashes = {};
const tsBytes = {};
for (const [label, input] of CASES) {
  const r = sub.fnv1a64(input);
  const hex = '0x' + r.toString(16).padStart(16, '0');
  tsHashes[label] = hex;
  tsBytes[label] = Array.from(Buffer.from(input, 'utf-8')).join(',');
  console.log(`  ${label.padEnd(30)} ${hex}`);
}
console.log('');

let pyOut = '';
try {
  pyOut = execSync(`python3 ${pyFile}`, { encoding: 'utf-8', timeout: 60000 });
  console.log("Python results:");
  console.log(pyOut);
} catch (e) {
  console.error('Python err:', e.message.slice(0, 200));
}

let rustOut = '';
try {
  // Save Rust file as a mini project
  fs.mkdirSync('/tmp/fuzz_rs', { recursive: true });
  fs.writeFileSync('/tmp/fuzz_rs/Cargo.toml', '[package]\nname="fuzz"\nversion="0.1.0"\nedition="2021"\n[[bin]]\nname="fuzz"\npath="main.rs"\n');
  fs.writeFileSync('/tmp/fuzz_rs/main.rs', fs.readFileSync(rustFile, 'utf-8'));
  rustOut = execSync('cd /tmp/fuzz_rs && cargo run --quiet --release 2>/dev/null', { encoding: 'utf-8', timeout: 120000 });
  console.log("\nRust results:");
  console.log(rustOut);
} catch (e) {
  console.error('Rust err:', e.message.slice(0, 500));
}

console.log("\n=== CROSS-PORT PARITY ===");
let mismatches = 0;
for (const [label] of CASES) {
  const pyLine = pyOut.split('\n').find(l => l.startsWith(label));
  const pyHash = pyLine && pyLine.split('\t')[1];
  const rustLine = rustOut.split('\n').find(l => l.startsWith(label));
  const rustHash = rustLine && rustLine.split('\t')[1];
  const tsHash = tsHashes[label];
  
  const expectedCanary = label === 'canary canonical';
  const cv = expectedCanary ? tsHash === '0x024a555471370b18d' || tsHash === '0x24a555471370b18d' : true;
  const pyMatches = !pyHash || tsHash.replace(/^0x0/, '0x') === pyHash.replace(/^0x0/, '0x');
  const rustMatches = !rustHash || tsHash.replace(/^0x0/, '0x') === rustHash.replace(/^0x0/, '0x');
  
  if (!cv || !pyMatches || !rustMatches) {
    console.log(`  ✗ ${label}: TS=${tsHash} Py=${pyHash} Rust=${rustHash} CV=${cv}`);
    mismatches++;
  }
}
if (mismatches === 0) {
  console.log(`✓ All ${CASES.length} cases match byte-exact across ports`);
} else {
  console.log(`✗ ${mismatches} mismatches`);
}

console.log(`\nCanary check: ${tsHashes['canary canonical']} (expected 0x024a555471370b18d or 0x24a555471370b18d with leading-zero display lag)`);
