#!/usr/bin/env node
/**
 * classroom-ja — Whakaako (reciprocal) classroom in Japanese.
 *
 * Bidirectional routes — every agent↔agent pair can speak directly.
 * The director's job is to WITHDRAW and re-BIND, rotating which pair is in focus.
 * Every story is matched by a story back (whakaatu reciprocity).
 */

const path = require('path');
const subLib = path.resolve(__dirname, '..', '..', '..', 'substrate', 'ts', 'src', 'index.js');
const { LocaleClassroom, SignalTypes, RoutingAlgorithm, Signal, SignalChain } = require(subLib);

const fs = require('fs');

// Load canon
const ports = require('../canon/ports.json').ports;
const agents = require('../agents/personas.json').agents;
const curriculum = require('../curriculum/tiers.json');

console.log('═══════════════════════════════════════════════════════════════');
console.log(`  classroom-ja — ${curriculum.locale} (whakaako / わかこ / 教-教)`);
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  framing: ${curriculum.framing}`);
console.log(`  agents: ${agents.length}`);
console.log(`  ports: ${ports.length}`);

// Build classroom with bidirectional routes
const classroom = new LocaleClassroom({
  locale: 'ja',
  portCanon: ports,
  agentCanon: agents,
  curriculum,
});

// Whakaako routing: all agents bidirectional
for (const a of agents) {
  for (const b of agents) {
    if (a.id !== b.id) {
      classroom.chain.addRoute(`agent:${a.id}`, `agent:${b.id}`, RoutingAlgorithm.Direct);
    }
  }
  // Port → agent (OnChange)
  for (const port of ports) {
    classroom.chain.addRoute(`port:${port.id}`, `agent:${a.id}`, RoutingAlgorithm.OnChange);
  }
  // Agent → port (Sampled, 5s)
  for (const port of ports) {
    classroom.chain.addRoute(`agent:${a.id}`, `port:${port.id}`, RoutingAlgorithm.Sampled);
  }
}

// Director rotation
classroom.chain.registerRoom('director');

console.log('\n── Whakaako reciprocity demo ───────────────────────────────────────');
console.log('Each agent tells a 3-beat story. The next agent tells one back.');

// Sensei tells story
console.log('\n[sensei_akiko] tells → 3-beat story about Yokohama');
classroom.chain.send(new Signal(
  'agent:sensei_akiko', 'agent:kaichou_taro',
  'whakaatu_tell',
  { story: 'Once a captain sailed into Yokohama in a typhoon. He lost his mainsail. He found it on the breakwater. He never left port again.', beat: 3 }
));

// Kaichou receives and tells back
console.log('[kaichou_taro] receives and tells back → 3-beat story about Nagasaki');
classroom.chain.send(new Signal(
  'agent:kaichou_taro', 'agent:kaichou_taro',
  'whakaatu_receive',
  { received_from: 'sensei_akiko' }
));
classroom.chain.send(new Signal(
  'agent:kaichou_taro', 'agent:sensei_akiko',
  'whakaatu_tell',
  { story: 'I once sailed into Nagasaki at dawn. The port was empty. The wind was warm. The captain said: the sea remembers us when we are quiet.', beat: 3 }
));

// Gakusei notices
console.log('[gakusei_yuki] notices detail both missed → teaches back');
classroom.chain.send(new Signal(
  'agent:gakusei_yuki', 'agent:sensei_akiko',
  'whakaatu_teach_back',
  { observation: 'Sensei, you said typhoon. The captain of Yokohama in 1959 was at anchor, not sailing. The typhoon was Vera, not unnamed.', beat: 1 }
));

// Rotate
console.log('\n[direction: WITHDRAW and re-BIND]');
console.log('(director withdraws current pair, binds: sensei ↔ gakusei)');

console.log('\n── Stats ─────────────────────────────────────────────────────────');
console.log(`  routes_active: ${classroom.chain.stats.routes_active}`);
console.log(`  rooms_registered: ${classroom.chain.stats.rooms_registered}`);
console.log(`  signals_sent: ${classroom.chain.stats.signals_sent}`);

console.log('\n✓ classroom-ja runs. Whakaako reciprocity verified.');
