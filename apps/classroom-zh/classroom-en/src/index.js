/**
 * Cargo Line Tycoon Classroom — English (Socratic) locale
 *
 * Mounts the substrate, loads the locale canon, registers ports as rooms,
 * wires the signal-chain, and exposes a tiny UI.
 */

const sub = require('../../../substrate/ts/src/index.js');
const portsCanon = require('../../../locales/en/canon/ports.json');
const agentsCanon = require('../../../locales/en/agents/personas.json');
const curriculum = require('../../../locales/en/curriculum/tiers.json');

console.log(`[classroom-en] Locale: en, framing: ${portsCanon.framing}, ports: ${portsCanon.ports.length}`);

// Build the locale-aware classroom
const classroom = new sub.LocaleClassroom({
  locale: 'en',
  portCanon: portsCanon.ports,
  agentCanon: agentsCanon.agents,
  curriculum: curriculum,
});

// Demonstrate the pedagogical framing
console.log(`[classroom-en] Pedagogical framing: ${classroom.pedagogicalFraming()}`);

// Dispatch a few events
classroom.emitEvent(sub.SignalTypes.StudentObservation, 'agent:ms_athena', {
  student_id: 'player_001',
  observation: 'tried to sail through Red Sea; fees too high',
  tier: 2,
});

// Each agent receives
for (const agent of agentsCanon.agents) {
  const events = classroom.receiveFor(`agent:${agent.id}`);
  console.log(`[classroom-en] ${agent.name} received ${events.length} event(s)`);
}

console.log(`[classroom-en] Substrate stats:`, classroom.chain.stats);
