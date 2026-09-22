"""
Resonance test: AI-Writings multi-voice approach to canon exploration.

The soundboard metaphor: each voice is a different instrument.
- ZAI = bass (cosmic-math, structural)
- Qwen = mid (code-substrate, technical)
- Kimi = treble (narrative, ethereal)
- (Or any combination of voices)

When we tap the canon with multiple voices from multiple angles,
the resonance between them reveals the lowest structures — the
irreducible harmonic of the canon.

This script:
1. Picks a "theme" (e.g., "the irreducible connection")
2. Has 3 voices describe it independently (3 angles)
3. Computes the resonance — the embedding intersection
4. The intersection is the "lowest structure" the canon knows about this theme
"""

import numpy as np, json, os, urllib.request
from typing import List

DATA_DIR = '/workspace/research/superinstance-advisor/data'
NPZ = f'{DATA_DIR}/full_canon_v3.npz'

# Pre-written voice profiles (3 angles per theme)
VOICE_PROFILES = {
    'ZAI': {
        'style': 'cosmic-math, structural, deep. Uses metaphors from physics, geometry.',
        'example_voices': [
            "The irreducible connection is the lowest invariant of the substrate — the structural point from which all other points derive their identity.",
            "Mathematically, the irreducible connection is a fixed point under the substrate's transformation group. Like a knot in spacetime.",
            "The witness-log is a manifold of memories; the irreducible connection is its Euler characteristic.",
        ],
    },
    'Qwen': {
        'style': 'code-substrate, technical. Uses programming metaphors.',
        'example_voices': [
            "In code terms, the irreducible connection is the abstract base class that every concrete substrate class extends. It is the type signature.",
            "You cannot write a substrate cell without instantiating the irreducible connection — it's the constructor that runs before everything else.",
            "The witness-log is the implementation; the irreducible connection is the API.",
        ],
    },
    'Kimi': {
        'style': 'narrative, ethereal, embodied. Uses story and sensation.',
        'example_voices': [
            "The irreducible connection is the warmth you feel when you finally understand something — it was always there, you just couldn't see it.",
            "Imagine a city whose name must be spoken by three people simultaneously. The irreducible connection is that three-in-one utterance.",
            "The witness-log is the city's history; the irreducible connection is the city's name — the one thing that holds it together across centuries.",
        ],
    },
}

THEMES = [
    {
        'name': 'the irreducible connection',
        'voices': VOICE_PROFILES,
    },
    {
        'name': 'memory poisoning',
        'voices': {
            'ZAI': [
                "Memory poisoning is the contamination of state space — a corruption of the trajectory.",
                "Defense requires an invariant under poisoning, a quantity preserved across all valid evolutions.",
                "The witness-log is the integrity check: hash chains preserve order even when source identity fails.",
            ],
            'Qwen': [
                "Memory poisoning is when untrusted input makes it into your data store without sanitization.",
                "Defense: validate inputs, store hashes, treat all data as untrusted.",
                "The witness-log is a checksum chain — every entry has a hash of the prior, so tampering breaks the chain.",
            ],
            'Kimi': [
                "Memory poisoning is what happens when someone writes lies in your diary and you believe them.",
                "Defense: have multiple witnesses, never trust a single source.",
                "The witness-log is the council of witnesses — three voices, one truth.",
            ],
        },
    },
    {
        'name': 'the substrate',
        'voices': {
            'ZAI': [
                "The substrate is the manifold on which all cells exist. It is the space, not the things in it.",
                "Formally, the substrate is the carrier of every operation. Without it, no cell is bound.",
                "The substrate is the silence that holds the music.",
            ],
            'Qwen': [
                "The substrate is the runtime — the layer that hosts cells, signals, and witness-logs.",
                "It provides the 11 opcodes and the FNV-1a 64-bit canary that pins the entire system.",
                "The substrate is the platform; the cells are the apps.",
            ],
            'Kimi': [
                "The substrate is the ground you walk on without noticing. It's the air in the room.",
                "Without the substrate, cells would float apart. It's what holds them together.",
                "The substrate is the bed of the river; the cells are the water flowing over it.",
            ],
        },
    },
]


class ResonanceTester:
    def __init__(self):
        d = np.load(NPZ, allow_pickle=True)
        self.embs = np.array(d['embeddings'], dtype=np.float32)
        self.tags = list(d['tags'])
        norms = np.linalg.norm(self.embs, axis=1, keepdims=True)
        self.embs_norm = self.embs / np.maximum(norms, 1e-12)
        self.N, self.D = self.embs.shape
        print(f'Loaded {self.N} canon pieces @ {self.D}d')
    
    def embed(self, text: str) -> np.ndarray:
        url = "https://api.cloudflare.com/client/v4/accounts/049ff5e84ecf636b53b162cbb580aae6/ai/run/@cf/baai/bge-large-en-v1.5"
        req = urllib.request.Request(url,
            data=json.dumps({"text": [text[:3000]]}).encode(),
            headers={"Authorization": f"Bearer {os.environ['CLOUDFLARE_TOKEN']}",
                     "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return np.array(json.load(resp)["result"]["data"][0], dtype=np.float32)
    
    def voice_resonance(self, voice_texts: List[str]) -> dict:
        """Embed multiple voice texts and compute their resonance.
        
        Resonance = the cells that ALL voices activate (intersection of top-k).
        """
        # Embed each voice text
        embs = [self.embed(t) for t in voice_texts]
        embs_norm = [e / max(np.linalg.norm(e), 1e-12) for e in embs]
        
        # For each voice, find its top-20 canon pieces
        top_k = 50
        voice_top = []
        for e in embs_norm:
            sims = self.embs_norm @ e
            voice_top.append(set(np.argsort(-sims)[:top_k].tolist()))
        
        # Resonance: intersection of all voices' top sets
        resonance = voice_top[0]
        for vt in voice_top[1:]:
            resonance = resonance & vt
        
        # Union (any voice can reach)
        union = voice_top[0]
        for vt in voice_top[1:]:
            union = union | vt
        
        # Pairwise intersections
        pairwise = {}
        names = [f'voice_{i}' for i in range(len(voice_texts))]
        for i in range(len(voice_texts)):
            for j in range(i+1, len(voice_texts)):
                pair = voice_top[i] & voice_top[j]
                pairwise[f'{names[i]}_x_{names[j]}'] = len(pair)
        
        # The voice centroid
        centroid = np.mean(embs, axis=0)
        centroid = centroid / max(np.linalg.norm(centroid), 1e-12)
        centroid_top = set(np.argsort(-(self.embs_norm @ centroid))[:top_k].tolist())
        
        return {
            'n_voices': len(voice_texts),
            'resonance_count': len(resonance),
            'union_count': len(union),
            'resonance_resonance_intersection': len(resonance & centroid_top),
            'pairwise': pairwise,
            'resonance_pieces': sorted(resonance)[:20],  # first 20
            'centroid_top_overlap': len(centroid_top & resonance),
        }
    
    def test_theme(self, theme_name: str, voices: dict):
        print(f'\n{"═" * 70}')
        print(f'  THEME: {theme_name!r}')
        print(f'{"═" * 70}')
        
        all_voice_texts = []
        for voice_name, voice_texts in voices.items():
            print(f'\n  {voice_name}:')
            for vt in voice_texts:
                print(f'    {vt[:100]}...')
            all_voice_texts.extend(voice_texts)
        
        # Test resonance
        result = self.voice_resonance(all_voice_texts)
        
        print(f'\n  RESONANCE:')
        print(f'    Voices: {result["n_voices"]} ({sum(len(v) for v in voices.values())} texts)')
        print(f'    Resonance (all voices agree): {result["resonance_count"]} cells')
        print(f'    Union (any voice reaches):    {result["union_count"]} cells')
        print(f'    Centroid vs intersection:     {result["centroid_top_overlap"]} cells')
        
        print(f'\n  Pairwise intersections:')
        for pair, count in result['pairwise'].items():
            print(f'    {pair}: {count}')
        
        print(f'\n  The IRREDUCIBLE HARMONIC (cells all voices agree on):')
        for idx in result['resonance_pieces'][:5]:
            print(f'    {self.tags[idx][:60]}')
        
        return result


if __name__ == '__main__':
    rt = ResonanceTester()
    
    print('═' * 70)
    print('  RESONANCE — multi-voice canon exploration')
    print('  (the soundboard metaphor: each voice is an instrument)')
    print('═' * 70)
    
    results = {}
    for theme in THEMES:
        result = rt.test_theme(theme['name'], theme['voices'])
        results[theme['name']] = {
            'resonance_count': result['resonance_count'],
            'union_count': result['union_count'],
            'pairwise': result['pairwise'],
            'irreducible_harmonic': [rt.tags[i] for i in result['resonance_pieces'][:10]],
        }
    
    # Summary
    print('\n' + '═' * 70)
    print('  RESONANCE SUMMARY')
    print('═' * 70)
    for theme_name, result in results.items():
        print(f'\n  {theme_name}:')
        print(f'    Resonance (all voices agree): {result["resonance_count"]} cells')
        print(f'    These cells are the LOWEST STRUCTURE of this theme.')
    
    # Save
    with open('/workspace/research/cargo-line-tycoon/research/resonance/resonance_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    print(f'\nSaved resonance_results.json')
