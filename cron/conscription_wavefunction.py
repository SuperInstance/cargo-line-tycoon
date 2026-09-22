"""
Conscription cron v2 — uses wavefunction JEV as the canonicity oracle.
"""

import sys, os, json, time
sys.path.insert(0, '/workspace/research/cargo-line-tycoon/research/wavefunction_jev')

from wavefunction_jev import WavefunctionJEV
import numpy as np

CRON_RUNS = '/workspace/research/cargo-line-tycoon/cron/runs'

class WavefunctionConscriptionCron:
    def __init__(self):
        self.jev = WavefunctionJEV()
    
    def build_demo_witness_log(self, n_students=10000, p_feature=0.20):
        """Build a synthetic witness log with feature requests."""
        log = []
        for i in range(n_students):
            n_obs = 20 + (i % 80)
            for j in range(n_obs):
                if (i * 7 + j) % 100 < p_feature * 100:
                    # Feature request
                    feats = ['add-fuel-cost', 'add-currency', 'add-pirate-event', 
                             'add-storm-event', 'add-trade-agreement', 'add-new-port']
                    feat = feats[(i + j) % len(feats)]
                    log.append({
                        'op': 'ATTEST',
                        'source': f'student_{i}',
                        'payload': {'feature': feat},
                    })
                else:
                    log.append({
                        'op': 'BIND',
                        'source': f'student_{i}',
                        'payload': {'observation': f'normal observation {i}'},
                    })
        return log
    
    def tally_features(self, witness_log):
        tally = {}
        for entry in witness_log:
            if entry.get('op') == 'ATTEST' and entry.get('payload', {}).get('feature'):
                feat = entry['payload']['feature']
                tally[feat] = tally.get(feat, 0) + 1
        return tally
    
    def run(self, witness_log=None):
        if witness_log is None:
            witness_log = self.build_demo_witness_log()
        
        tally = self.tally_features(witness_log)
        
        # Build descriptions
        feature_descriptions = {}
        for feat, count in sorted(tally.items(), key=lambda x: -x[1]):
            feature_descriptions[feat] = f"feature request: add {feat} to the cargo-line-tycoon game"
        
        # Evaluate with wavefunction JEV
        results = {}
        for feat, desc in feature_descriptions.items():
            emb = self.jev.embed(desc)
            particle_score = float(self.jev.score_particle(emb).max())
            probs, diag = self.jev.score_wavefunction(emb, phase_mode='cluster')
            wave_max = float(probs.max())
            
            if wave_max >= 0.85 and particle_score >= 0.75:
                verdict = 'CANON'
            elif wave_max >= 0.70 or particle_score >= 0.65:
                verdict = 'REVIEW'
            else:
                verdict = 'REJECT'
            
            results[feat] = {
                'count': tally[feat],
                'particle_score': particle_score,
                'wavefunction_score': wave_max,
                'psi_magnitude': diag['psi_magnitude'],
                'entropy': diag['entropy'],
                'verdict': verdict,
            }
        
        total_students = 10000
        quorum_threshold = 0.05 * total_students
        
        ships = []
        for feat, r in results.items():
            if r['count'] >= quorum_threshold and r['verdict'] in ('CANON', 'REVIEW'):
                ships.append({
                    'feature': feat,
                    'count': r['count'],
                    'verdict': r['verdict'],
                    'wavefunction_score': r['wavefunction_score'],
                    'particle_score': r['particle_score'],
                })
        
        return {
            'n_features_tallied': len(tally),
            'ships': ships,
        }


if __name__ == '__main__':
    print('═' * 70)
    print('  CONSCRIPTION CRON v2 — wavefunction JEV as canonicity oracle')
    print('═' * 70)
    print()
    
    cron = WavefunctionConscriptionCron()
    
    result = cron.run()
    
    print(f'\nResults:')
    print(f'  Features tallied: {result["n_features_tallied"]}')
    print(f'  Ships:')
    print(f'    {"feature":25} {"count":>6}  {"verdict":8} {"wave":>7} {"part":>7} {"psi":>9} {"entropy":>8}')
    for ship in result['ships']:
        r = cron.run.__self__.jev if False else None  # we need to redo this
        # Skip the verbose fields for clean output
        print(f'    {ship["feature"]:25} {ship["count"]:>6}  {ship["verdict"]:8} {ship["wavefunction_score"]:7.4f} {ship["particle_score"]:7.4f}')
    
    # Save
    with open('/workspace/research/cargo-line-tycoon/cron/runs/last_run.json', 'w') as f:
        json.dump(result, f, indent=2)
    print(f'\nSaved cron/runs/last_run.json')
