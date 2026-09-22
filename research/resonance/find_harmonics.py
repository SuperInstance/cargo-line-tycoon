"""
Find the irreducible harmonic of each theme by centroid-based resonance.
"""

import json, os, urllib.request, numpy as np

DATA_DIR = '/workspace/research/superinstance-advisor/data'
d = np.load(f'{DATA_DIR}/full_canon_v3.npz', allow_pickle=True)
embs = np.array(d['embeddings'], dtype=np.float32)
tags = list(d['tags'])
norms = np.linalg.norm(embs, axis=1, keepdims=True)
embs_norm = embs / np.maximum(norms, 1e-12)

def embed(text):
    url = "https://api.cloudflare.com/client/v4/accounts/049ff5e84ecf636b53b162cbb580aae6/ai/run/@cf/baai/bge-large-en-v1.5"
    req = urllib.request.Request(url,
        data=json.dumps({"text": [text[:3000]]}).encode(),
        headers={"Authorization": f"Bearer {os.environ['CLOUDFLARE_TOKEN']}",
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return np.array(json.load(resp)["result"]["data"][0], dtype=np.float32)

THEMES = {
    'the irreducible connection': [
        "The irreducible connection is the lowest invariant of the substrate — the structural point from which all other points derive their identity.",
        "Mathematically, the irreducible connection is a fixed point under the substrate's transformation group.",
        "The witness-log is a manifold of memories; the irreducible connection is its Euler characteristic.",
        "In code terms, the irreducible connection is the abstract base class that every concrete substrate class extends.",
        "You cannot write a substrate cell without instantiating the irreducible connection — it's the constructor.",
        "The witness-log is the implementation; the irreducible connection is the API.",
        "The irreducible connection is the warmth you feel when you finally understand something.",
        "Imagine a city whose name must be spoken by three people simultaneously. The irreducible connection is that three-in-one utterance.",
        "The witness-log is the city's history; the irreducible connection is the city's name.",
    ],
    'memory poisoning': [
        "Memory poisoning is the contamination of state space — a corruption of the trajectory.",
        "Defense requires an invariant under poisoning, a quantity preserved across all valid evolutions.",
        "The witness-log is the integrity check: hash chains preserve order even when source identity fails.",
        "Memory poisoning is when untrusted input makes it into your data store without sanitization.",
        "Defense: validate inputs, store hashes, treat all data as untrusted.",
        "The witness-log is a checksum chain — every entry has a hash of the prior.",
        "Memory poisoning is what happens when someone writes lies in your diary and you believe them.",
        "Defense: have multiple witnesses, never trust a single source.",
        "The witness-log is the council of witnesses — three voices, one truth.",
    ],
    'the substrate': [
        "The substrate is the manifold on which all cells exist. It is the space, not the things in it.",
        "Formally, the substrate is the carrier of every operation. Without it, no cell is bound.",
        "The substrate is the silence that holds the music.",
        "The substrate is the runtime — the layer that hosts cells, signals, and witness-logs.",
        "It provides the 11 opcodes and the FNV-1a 64-bit canary that pins the entire system.",
        "The substrate is the platform; the cells are the apps.",
        "The substrate is the ground you walk on without noticing. It's the air in the room.",
        "Without the substrate, cells would float apart. It's what holds them together.",
        "The substrate is the bed of the river; the cells are the water flowing over it.",
    ],
    'the witness': [
        "The witness is the prediction: every scar a checksum, every address a hypothesis of damage written before the effect arrives.",
        "To witness, then, is not to record but to predict — the effect of the past pressing on the present like a keel pressing on water.",
        "The witness is the carrier of truth; the witness-log is the chain that holds it.",
        "The witness is not neutral. It interprets what it sees. The substrate is the interpretation framework.",
        "A witness without a witness-log is just a person with opinions.",
    ],
}

results = {}

print('═' * 70)
print('  IRREDUCIBLE HARMONICS — centroid-based resonance')
print('═' * 70)

for theme, voice_texts in THEMES.items():
    print(f'\n  THEME: {theme!r}')
    embs_list = [embed(t) for t in voice_texts]
    centroid = np.mean(embs_list, axis=0)
    centroid = centroid / max(np.linalg.norm(centroid), 1e-12)
    
    sims = embs_norm @ centroid
    top_idx = np.argsort(-sims)[:10]
    
    print(f'    Centroid top-5:')
    harmonic = []
    for i in top_idx[:5]:
        print(f'      cos={sims[i]:.4f}  {tags[i][:60]}')
        harmonic.append({'tag': tags[i], 'cosine': float(sims[i])})
    
    # Per-voice: which cells does EACH voice rank in top-20?
    voice_tops = []
    for e in embs_list:
        e_n = e / max(np.linalg.norm(e), 1e-12)
        sims_v = embs_norm @ e_n
        voice_tops.append(set(np.argsort(-sims_v)[:20].tolist()))
    
    # Pairwise overlap (Jaccard)
    pairwise_jaccard = {}
    for i in range(len(voice_tops)):
        for j in range(i+1, len(voice_tops)):
            pair_name = f'v{i}_v{j}'
            inter = len(voice_tops[i] & voice_tops[j])
            union = len(voice_tops[i] | voice_tops[j])
            jaccard = inter / max(union, 1)
            pairwise_jaccard[pair_name] = jaccard
    
    print(f'    Pairwise Jaccard (top-20): min={min(pairwise_jaccard.values()):.3f}, mean={np.mean(list(pairwise_jaccard.values())):.3f}')
    
    results[theme] = {
        'centroid_top5': harmonic,
        'n_voices': len(voice_texts),
        'pairwise_jaccard': pairwise_jaccard,
    }

# Save
with open('/workspace/research/cargo-line-tycoon/research/resonance/harmonics.json', 'w') as f:
    json.dump(results, f, indent=2)
print(f'\nSaved harmonics.json')
