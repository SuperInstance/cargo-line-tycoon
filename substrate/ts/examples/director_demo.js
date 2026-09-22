/**
 * director_demo.js — A SUBSTRATE-NATIVE Director loop, no LLM calls.
 *
 * Demonstrates the canonical director pattern using only the substrate
 * primitives (Signal-chain + Cell + OnChange routing). Picks the next
 * speaker using pedagogical heuristics (in production: JEV.decide).
 *
 * In production, the heuristic is replaced with jev.decide() — see
 * docs/JEV_AS_DIRECTOR.md.
 */

const { 
  LocaleClassroom, SignalTypes, RoutingAlgorithm, Signal, SignalChain
} = require('../src/index.js');

function loadLocale(locale) {
  return {
    ports: require(`../../../locales/${locale}/canon/ports.json`).ports,
    agents: require(`../../../locales/${locale}/agents/personas.json`).agents,
    curriculum: require(`../../../locales/${locale}/curriculum/tiers.json`),
  };
}

class SubstrateDirector {
  constructor(classroom) {
    this.classroom = classroom;
    this.tick_count = 0;
    this.history = [];
    this.framing = classroom.pedagogicalFraming();
    this.student_observations = []; // direct in-memory queue (signal-chain routes are wired too)
    
    // Wire agent→director OnChange so student observations also reach the director
    for (const agent of classroom.agentCanon) {
      classroom.chain.addRoute(`agent:${agent.id}`, 'director', RoutingAlgorithm.OnChange);
    }
  }
  
  record_observation(observation) {
    this.student_observations.unshift(observation);
    if (this.student_observations.length > 10) this.student_observations.pop();
  }
  
  who_speaks_next() {
    const recent = this.student_observations;
    
    // Confucius mode: elder always first
    if (this.framing === 'confucian') {
      const elder = this.classroom.agentCanon[0]; // first-listed = elder in zh canon
      return { agent: elder, reason: 'elder_speaks_first', trust: 0.95 };
    }
    
    // No observations yet → teacher introduces
    if (recent.length === 0) {
      return { agent: this.classroom.agentCanon[0], reason: 'introduction', trust: 0.7 };
    }
    
    // Default (socratic, ubuntu, whakaako): topic-match the most recent observation
    const last = recent[0].observation || recent[0];
    let best = null, best_score = -1, best_reason = '';
    for (const agent of this.classroom.agentCanon) {
      const persona = (agent.persona || '').toLowerCase();
      const q = (typeof last === 'string' ? last : JSON.stringify(last)).toLowerCase();
      let score = 0;
      const qWords = q.split(/\s+/).filter(w => w.length > 4);
      let matched = [];
      for (const w of qWords) {
        if (persona.includes(w)) { score++; matched.push(w); }
      }
      if (score > best_score) {
        best_score = score;
        best = agent;
        best_reason = `topic_match(${matched.slice(0,3).join(',')})`;
      }
    }
    return {
      agent: best || this.classroom.agentCanon[0],
      reason: best_reason || 'fallback',
      trust: Math.min(0.95, 0.5 + 0.1 * best_score),
    };
  }
  
  tick() {
    const recent_drain = this.classroom.receiveFor('director');
    if (recent_drain.length > 0) {
      for (const sig of recent_drain) {
        const obs = sig.payload?.observation || sig.payload;
        if (obs) this.record_observation(obs);
      }
    }
    
    const decision = this.who_speaks_next();
    
    this.classroom.chain.send(new Signal(
      'director', `agent:${decision.agent.id}`,
      'director_prompt',
      { reason: decision.reason, trust: decision.trust, observation_count: this.student_observations.length }
    ));
    
    this.history.unshift({
      tick: this.tick_count,
      chose: decision.agent.name,
      reason: decision.reason,
      trust: decision.trust,
    });
    if (this.history.length > 5) this.history.pop();
    
    this.tick_count++;
    return decision;
  }
}


console.log('═══════════════════════════════════════════════════════════════');
console.log('  Substrate-native Director demo (Socratic, en)');
console.log('═══════════════════════════════════════════════════════════════\n');

const en = loadLocale('en');
const classroom = new LocaleClassroom({
  locale: 'en',
  portCanon: en.ports,
  agentCanon: en.agents,
  curriculum: en.curriculum,
});
classroom.chain.registerRoom('director');
const director = new SubstrateDirector(classroom);

let r;
console.log('Tick 0:');
r = director.tick();
console.log(`  → ${r.agent.name} (${r.reason}, trust=${r.trust.toFixed(2)})\n`);

console.log('Tick 1 (after student question about fuel costs):');
director.record_observation({
  student_id: 'demo',
  observation: 'How much does fuel cost for a trans-Pacific voyage?',
  tier: 2,
});
r = director.tick();
console.log(`  → ${r.agent.name} (${r.reason}, trust=${r.trust.toFixed(2)})\n`);

console.log('Tick 2 (after geography question about Cape Horn):');
director.record_observation({
  student_id: 'demo',
  observation: 'What is the geography of Cape Horn and storms?',
  tier: 1,
});
r = director.tick();
console.log(`  → ${r.agent.name} (${r.reason}, trust=${r.trust.toFixed(2)})\n`);

console.log('Recent director decisions:');
director.history.forEach(h => {
  console.log(`  tick ${h.tick}: ${h.chose} (${h.reason}, trust=${h.trust.toFixed(2)})`);
});

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  Confucius-mode demo (zh, elder-always-first)');
console.log('═══════════════════════════════════════════════════════════════\n');

const zh = loadLocale('zh');
const zh_classroom = new LocaleClassroom({
  locale: 'zh',
  portCanon: zh.ports,
  agentCanon: zh.agents,
  curriculum: zh.curriculum,
});
zh_classroom.chain.registerRoom('director');
const zh_director = new SubstrateDirector(zh_classroom);

console.log('Tick 0 (Confucian):');
r = zh_director.tick();
console.log(`  → ${r.agent.name} (${r.reason}, trust=${r.trust.toFixed(2)})`);

zh_director.record_observation({
  student_id: 'demo',
  observation: '我想问燃油成本',
  tier: 2,
});
console.log('\nTick 1 (Confucian): elder still speaks first regardless of student input');
r = zh_director.tick();
console.log(`  → ${r.agent.name} (${r.reason}, trust=${r.trust.toFixed(2)})`);

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  Conscription-loop demonstration');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('A student observation became feature_request:');
classroom.chain.send(new Signal(
  'agent:alex_9b', 'agent:ms_athena', 'feature_request',
  { requested_by: 'student_demo', feature: 'weather_routing_for_fishing_fleet', tier: 2 }
));
classroom.chain.send(new Signal(
  'agent:mr_atlas', 'agent:ms_athena', 'feature_request',
  { requested_by: 'student_demo_2', feature: 'weather_routing_for_fishing_fleet', tier: 2 }
));
console.log('  → 2 students requested weather_routing_for_fishing_fleet');
console.log('  → JEV would now promote to canonical feature when consensus reached');
console.log('  → Coder agent (cron, weekly) writes the patch');
console.log('  → Next session sees the feature live');

console.log('\nAll director decisions emitted as Signals.');
console.log('The Director is a substrate-native loop, not an LLM.');
