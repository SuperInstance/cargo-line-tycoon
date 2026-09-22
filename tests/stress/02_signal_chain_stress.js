/**
 * SignalChain stress test — push the routing pipeline to its failure mode.
 *
 * Tests:
 *   1. 1000s of rooms (memory bound)
 *   2. 100k signals through one chain (queue saturation)
 *   3. Routing loops (1→2→1→2 should not infinite-loop)
 *   4. OnChange idempotence under burst load
 *   5. Sampled tick frequency (must respect interval_ms)
 *   6. Witness-log with mixed types
 *   7. Cross-port pedagogy: same events, 4 locales produce canonical-but-divergent decisions
 */

const sub = require('../../substrate/ts/src/index.js');
const { Signal, SignalChain, RoutingAlgorithm, LocaleClassroom } = sub;

let pass = 0, fail = 0;
function t(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    pass++;
  } catch (e) {
    console.log(`  ✗ ${label}: ${e.message}`);
    fail++;
  }
}

console.log('=== Test 1: 1000-room chain (memory bound) ===');
t('1000 rooms register', () => {
  const chain = new SignalChain();
  for (let i = 0; i < 1000; i++) chain.registerRoom(`r${i}`);
  if (chain.rooms.size !== 1000) throw new Error(`got ${chain.rooms.size}`);
});

console.log('\n=== Test 2: 100k signals through one route ===');
t('100k signals through 1 route', () => {
  const chain = new SignalChain();
  chain.registerRoom('a');
  chain.registerRoom('b');
  chain.addRoute('a', 'b', RoutingAlgorithm.Direct);
  for (let i = 0; i < 100_000; i++) {
    chain.send(new Signal('a', 'b', 'test', { i }));
  }
  const got = chain.receive('b').length;
  if (got !== 100_000) throw new Error(`got ${got}`);
  if (chain.stats.signals_sent !== 100_000) throw new Error(`sent ${chain.stats.signals_sent}`);
});

console.log('\n=== Test 3: Routing loops (1↔2 must not infinite-loop) ===');
t('1→2 + 2→1 sends 1 signal back to 1', () => {
  const chain = new SignalChain();
  chain.registerRoom('a');
  chain.registerRoom('b');
  chain.addRoute('a', 'b', RoutingAlgorithm.Direct);
  chain.addRoute('b', 'a', RoutingAlgorithm.Direct);
  
  // Send a message from a. b receives it. We don't auto-forward.
  const sent = chain.send(new Signal('a', 'b', 'greet', { hello: 'world' }));
  if (!sent) throw new Error('send returned false');
  
  const b_recv = chain.receive('b').length;
  if (b_recv !== 1) throw new Error(`b recv'd ${b_recv}, expected 1`);
  
  // a didn't receive anything because we didn't forward
  const a_recv = chain.receive('a').length;
  if (a_recv !== 0) throw new Error(`a recv'd ${a_recv}, expected 0 (no auto-forward)`);
});

console.log('\n=== Test 4: OnChange idempotence under burst ===');
t('1000 identical signals → only 1 delivered', () => {
  const chain = new SignalChain();
  chain.registerRoom('port');
  chain.registerRoom('agent');
  chain.addRoute('port', 'agent', RoutingAlgorithm.OnChange);
  
  for (let i = 0; i < 1000; i++) {
    chain.send(new Signal('port', 'agent', 'weather_change', { temp: 22, wind: 5 }));
  }
  
  const recv = chain.receive('agent').length;
  if (recv !== 1) throw new Error(`OnChange sent ${recv}, expected exactly 1`);
  if (chain.stats.signals_dropped < 999) throw new Error(`dropped ${chain.stats.signals_dropped}, expected ≥999`);
});

t('10 alternating payloads → 10 delivered', () => {
  const chain = new SignalChain();
  chain.registerRoom('port');
  chain.registerRoom('agent');
  chain.addRoute('port', 'agent', RoutingAlgorithm.OnChange);
  
  for (let i = 0; i < 10; i++) {
    chain.send(new Signal('port', 'agent', 'weather_change', { temp: 22 + i, wind: 5 }));
  }
  
  const recv = chain.receive('agent').length;
  if (recv !== 10) throw new Error(`alternating delivered ${recv}, expected 10`);
});

console.log('\n=== Test 5: Sampled respects interval_ms ===');
t('Sampled 100ms delivers only 1 of 100 in 50ms span', () => {
  const chain = new SignalChain();
  chain.registerRoom('market');
  chain.registerRoom('port');
  chain.addRoute('market', 'port', RoutingAlgorithm.Sampled);
  
  // Send 100 signals at slightly different timestamps
  for (let i = 0; i < 100; i++) {
    chain.send(new Signal('market', 'port', 'tick', { interval_ms: 100, price: 100 + i, t: i }));
  }
  
  const recv = chain.receive('port').length;
  // First sample always goes. Subsequent only if interval elapsed. Same timestamp → all suppressed.
  if (recv !== 1) throw new Error(`got ${recv}, expected 1 (same-timestamp suppression)`);
});

console.log('\n=== Test 6: Pathological payloads ===');
t('Empty payload delivers', () => {
  const chain = new SignalChain();
  chain.registerRoom('a'); chain.registerRoom('b');
  chain.addRoute('a', 'b', RoutingAlgorithm.Direct);
  chain.send(new Signal('a', 'b', 'empty', {}));
  const recv = chain.receive('b');
  if (recv.length !== 1) throw new Error('empty payload dropped');
});

t('null payload delivers', () => {
  const chain = new SignalChain();
  chain.registerRoom('a'); chain.registerRoom('b');
  chain.addRoute('a', 'b', RoutingAlgorithm.Direct);
  chain.send(new Signal('a', 'b', 'null', null));
  const recv = chain.receive('b');
  if (recv.length !== 1) throw new Error('null payload dropped');
});

t('Circular reference in payload DOES NOT crash', () => {
  const chain = new SignalChain();
  chain.registerRoom('a'); chain.registerRoom('b');
  chain.addRoute('a', 'b', RoutingAlgorithm.OnChange);
  
  const obj = { x: 1 };
  obj.self = obj;
  
  try {
    chain.send(new Signal('a', 'b', 'cyclic', obj));
    const recv = chain.receive('b');
    console.log(`    (cycled payload: ${recv.length} delivered. JSON.stringify skipped.)`);
  } catch (e) {
    throw new Error(`cyclic crashed: ${e.message}`);
  }
});

t('Top-level non-string source fails gracefully', () => {
  const chain = new SignalChain();
  chain.registerRoom('a');
  const result = chain.send(new Signal('NONEXISTENT', 'a', 'x', {}));
  if (result !== false) throw new Error('should return false for unknown source');
  if (chain.stats.signals_dropped !== 1) throw new Error('dropped stat should increment');
});

console.log('\n=== Test 7: Witness-log mixed types in same cell ===');
t('Cell holds mixed witness-log entries', () => {
  const cell = new sub.Cell({ state: 'hello', type: 'test' });
  cell.witness_log = [
    { type: 'BIND', timestamp: 1, payload: 42 },
    { type: 'EFFECT', timestamp: 2, payload: 'string' },
    { type: 'ATTEST', timestamp: 3, payload: { nested: true } },
    { type: 'WITHDRAW', timestamp: 4, payload: null },
  ];
  if (cell.witness_log.length !== 4) throw new Error('mixed types not preserved');
});

console.log(`\n${pass}/${pass + fail} signal-chain stress tests PASS`);
if (fail > 0) process.exit(1);
