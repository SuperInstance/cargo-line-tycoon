const sub = require('../../../substrate/ts/src/index.js');
const portsCanon = require('../../../locales/zh/canon/ports.json');
const agentsCanon = require('../../../locales/zh/agents/personas.json');
const curriculum = require('../../../locales/zh/curriculum/tiers.json');

console.log(`[classroom-zh] Locale: zh, framing: ${portsCanon.framing}, ports: ${portsCanon.ports.length}`);
const classroom = new sub.LocaleClassroom({
  locale: 'zh',
  portCanon: portsCanon.ports,
  agentCanon: agentsCanon.agents,
  curriculum: curriculum,
});
console.log(`[classroom-zh] Pedagogical framing: ${classroom.pedagogicalFraming()}`);

classroom.emitEvent(sub.SignalTypes.StudentObservation, 'agent:li_laoshi', {
  student_id: 'student_002',
  observation: '想从上海开船到鹿特丹,燃油成本怎么算?',
  tier: 2,
});

for (const agent of agentsCanon.agents) {
  const events = classroom.receiveFor(`agent:${agent.id}`);
  console.log(`[classroom-zh] ${agent.name} 收到 ${events.length} 个事件`);
}

console.log(`[classroom-zh] Substrate stats:`, classroom.chain.stats);
