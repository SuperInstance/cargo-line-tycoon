const sub = require('../../../substrate/ts/src/index.js');
const portsCanon = require('../../../locales/es/canon/ports.json');
const agentsCanon = require('../../../locales/es/agents/personas.json');
const curriculum = require('../../../locales/es/curriculum/tiers.json');

console.log(`[classroom-es] Locale: es, framing: ${portsCanon.framing}, ports: ${portsCanon.ports.length}`);
const classroom = new sub.LocaleClassroom({
  locale: 'es',
  portCanon: portsCanon.ports,
  agentCanon: agentsCanon.agents,
  curriculum: curriculum,
});
console.log(`[classroom-es] Encuadre pedagógico: ${classroom.pedagogicalFraming()}`);

classroom.emitEvent(sub.SignalTypes.StudentObservation, 'agent:capitana_iris', {
  student_id: 'alumno_004',
  observation: '¿Qué pasa si elijo la ruta del Estrecho en lugar del Cabo?',
  tier: 2,
});

for (const agent of agentsCanon.agents) {
  const events = classroom.receiveFor(`agent:${agent.id}`);
  console.log(`[classroom-es] ${agent.name} recibió ${events.length} evento(s)`);
}

console.log(`[classroom-es] Substrate stats:`, classroom.chain.stats);
