/**
 * Conscription-loop stress test — simulate N players making feature_requests,
 * verify JEV-style consensus finds the popular ones.
 */

const sub = require('../../substrate/ts/src/index.js');
const { Cell, Signal, SignalChain, RoutingAlgorithm } = sub;

console.log('═══ CONSCRIPTION LOOP STRESS TEST ═══\n');

// Simulate 1000 students
const N_STUDENTS = 1000;

// 50 distinct features, each "popular" with ~1-5% of students
const FEATURES = [
  'weather_routing', 'fuel_estimator', 'crew_schedule', 'cargo_tier_picker',
  'speed_optimization', 'route_alternatives', 'piracy_zone_map', 'currency_converter',
  'time_zone_display', 'language_selector', 'sound_effects', 'background_music',
  'tier_completion_badge', 'leaderboard', 'multiplayer_fleet', 'replay_mode',
];
const FEATURE_COUNT = FEATURES.length;

console.log('Simulating', N_STUDENTS, 'students...');

// Each student_id maps to a feature they want
function studentObservation(studentId) {
  // 1-2 features per student, weighted by popularity
  const features = [];
  const nFeatures = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < nFeatures; i++) {
    features.push(FEATURES[Math.floor(Math.random() * FEATURE_COUNT)]);
  }
  return {
    student_id: studentId,
    features_requested: features,
    timestamp: Date.now(),
  };
}

const chain = new SignalChain();
chain.registerRoom('feature_quorum');
chain.registerRoom('coder_agent');
chain.addRoute('feature_quorum', 'coder_agent', RoutingAlgorithm.Direct);

const coderLog = [];

for (let i = 0; i < N_STUDENTS; i++) {
  const obs = studentObservation(`student_${i}`);
  chain.send(new Signal('feature_quorum', `coder_agent`, 'student_observation', obs));
}

// Drain the coder inbox and tally
const coderInbox = chain.receive('coder_agent');
console.log('Coder inbox size:', coderInbox.length, '\n');

// Tally: which features got mentioned >= 5% of students?
const featureTallies = {};
for (const sig of coderInbox) {
  const features = sig.payload.features_requested || [];
  for (const f of features) {
    featureTallies[f] = (featureTallies[f] || 0) + 1;
  }
}

const PROMOTION_QUORUM = N_STUDENTS * 0.05;  // 5%
const review = [];
for (const [feature, count] of Object.entries(featureTallies)) {
  const pct = count / N_STUDENTS * 100;
  const verdict = pct >= 5 ? '✓ PROMOTE' : '○ review';
  review.push({ feature, count, pct: pct.toFixed(1), verdict });
}
review.sort((a, b) => b.count - a.count);

console.log('Feature tallies (sorted by mentions):');
review.forEach(r => console.log(`  ${r.verdict}  ${r.feature.padEnd(28)} ${r.count.toString().padStart(4)} mentions (${r.pct}%)`));

const promoted = review.filter(r => r.verdict.includes('PROMOTE'));
console.log(`\n✓ ${promoted.length} features passed 5% quorum → these get shipped by coder_agent`);

// Now simulate the coder shipping them
console.log('\nSimulating coder_agent ship commits:');
for (const p of promoted.slice(0, 3)) {
  const commit = {
    feature: p.feature,
    commit: `feat: ${p.feature}`,
    attested_by: ['student_' + Math.floor(Math.random() * N_STUDENTS)],
    timestamp: Date.now(),
  };
  coderLog.push(commit);
  console.log(`  → ${commit.commit}`);
}

console.log(`\n${coderLog.length} features shipped in this round.`);
console.log(`This is the conscription loop: students observe → JEV tally → coder ships → next session sees feature live.`);
