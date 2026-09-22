const sub = require('../../../substrate/ts/src/index.js');
const portsCanon = require('../../../locales/pt/canon/ports.json');
const agentsCanon = require('../../../locales/pt/agents/personas.json');
const curriculum = require('../../../locales/pt/curriculum/tiers.json');

console.log(`[classroom-pt] Locale: pt, framing: ${portsCanon.framing}, ports: ${portsCanon.ports.length}`);
const classroom = new sub.LocaleClassroom({
  locale: 'pt',
  portCanon: portsCanon.ports,
  agentCanon: agentsCanon.agents,
  curriculum: curriculum,
});
console.log(`[classroom-pt] Enquadramento pedagógico: ${classroom.pedagogicalFraming()}`);

classroom.emitEvent(sub.SignalTypes.StudentObservation, 'agent:capitao_joão', {
  student_id: 'aluno_003',
  observation: 'A gente tentou navegar de Santos para Roterdã, mas o custo do combustível tá alto',
  tier: 2,
});

for (const agent of agentsCanon.agents) {
  const events = classroom.receiveFor(`agent:${agent.id}`);
  console.log(`[classroom-pt] ${agent.name} recebeu ${events.length} evento(s)`);
}

console.log(`[classroom-pt] Substrate stats:`, classroom.chain.stats);
