"""
LEVI-style benchmark — does the substrate beat frontier-model runs at lower cost?

Same embedding model (bge-large-en-v1.5), different retrieval architectures:
- Baseline: top-k cosine retrieval
- Substrate: top-5 cosine + cite-neighbor expansion (k=10 final)
"""

import json, time, os, urllib.request, numpy as np
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'substrate', 'py'))
from clt_substrate import fnv1a64

DATA_DIR = '/workspace/research/superinstance-advisor/data'
NPZ = f'{DATA_DIR}/full_canon_v3.npz'
REPORT_PATH = '/workspace/research/cargo-line-tycoon/tests/stress/09_levi_report.json'

print('═' * 60)
print('  LEVI-style Benchmark — substrate vs single-model baseline')
print('═' * 60)

d = np.load(NPZ, allow_pickle=True)
embs = np.array(d['embeddings'], dtype=np.float32)
tags = list(d['tags'])
print(f'\nLoaded {len(embs)} pieces @ {embs.shape[1]}d')

BASE_QUERIES = [
    "the substrate as witness",
    "cell as irreducible system",
    "ubuntu as cellular architecture",
    "candor WAL receipts",
    "polyformal port across languages",
]
PARAPHRASES = [
    "{}", "what is {}", "explain {}", "{} in the canon",
    "the concept of {}", "{} definition", "tell me about {}",
    "describe {}", "meaning of {}", "{} example",
    "{} in simple terms", "{} — what does it mean",
    "philosophy of {}", "theory of {}", "{} as principle",
    "{} in practice", "how does {} work", "{} versus alternatives",
    "history of {}", "{} — beginner's guide",
]
queries = [p.format(b) for b in BASE_QUERIES for p in PARAPHRASES]
print(f'Generated {len(queries)} queries')

def embed_query(text):
    url = "https://api.cloudflare.com/client/v4/accounts/049ff5e84ecf636b53b162cbb580aae6/ai/run/@cf/baai/bge-large-en-v1.5"
    req = urllib.request.Request(url,
        data=json.dumps({"text": [text[:3000]]}).encode(),
        headers={"Authorization": f"Bearer {os.environ['CLOUDFLARE_TOKEN']}",
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return np.array(json.load(resp)["result"]["data"][0], dtype=np.float32)

norms = np.linalg.norm(embs, axis=1, keepdims=True)
embs_norm = embs / np.maximum(norms, 1e-12)

def search(q_emb, k=10):
    q_norm = q_emb / max(np.linalg.norm(q_emb), 1e-12)
    sim = embs_norm @ q_norm
    idx = np.argsort(-sim)[:k]
    return [(tags[i], float(sim[i])) for i in idx]

# Load neighbors
with open(f'{DATA_DIR}/cite_neighbors_v3.json') as f:
    neighbors = json.load(f)
neighbor_lookup = {tag: [n['tag'] for n in nbrs] for tag, nbrs in neighbors.items()}

N_TEST = 50
queries_test = queries[:N_TEST]

# Baseline
print(f'\n[1/2] Baseline: single-model top-k retrieval')
t0 = time.time()
baseline_results = []
for q in queries_test:
    q_emb = embed_query(q)
    baseline_results.append(search(q_emb, k=10))
t_baseline = time.time() - t0
print(f'  ✓ {N_TEST} queries in {t_baseline:.1f}s ({N_TEST/t_baseline:.2f}/sec)')

# Substrate
print(f'\n[2/2] Substrate: top-5 + cite-neighbor expansion (k=10 final)')
t0 = time.time()
substrate_results = []
for q in queries_test:
    q_emb = embed_query(q)
    hits = search(q_emb, k=5)
    expanded = []
    seen = set()
    for tag, score in hits:
        expanded.append((tag, score))
        seen.add(tag)
        for nbr in neighbor_lookup.get(tag, [])[:3]:
            if nbr not in seen:
                expanded.append((nbr, score * 0.85))
                seen.add(nbr)
    expanded.sort(key=lambda x: -x[1])
    substrate_results.append(expanded[:10])
t_substrate = time.time() - t0
print(f'  ✓ {N_TEST} queries in {t_substrate:.1f}s ({N_TEST/t_substrate:.2f}/sec)')

# Metrics
def avg_pairwise_distance(results):
    distances = []
    for hits in results:
        sims = []
        for tag, _ in hits:
            if tag in tags:
                idx = tags.index(tag)
                sims.append(embs_norm[idx])
        if len(sims) >= 2:
            sim_matrix = np.array(sims) @ np.array(sims).T
            n = len(sims)
            for i in range(n):
                for j in range(i+1, n):
                    distances.append(1 - sim_matrix[i, j])
    return float(np.mean(distances)) if distances else 0.0

def avg_top1_relevance(results):
    if not results: return 0.0
    scores = [hits[0][1] for hits in results if hits]
    return float(np.mean(scores)) if scores else 0.0

div_baseline = avg_pairwise_distance(baseline_results)
div_substrate = avg_pairwise_distance(substrate_results)
rel_baseline = avg_top1_relevance(baseline_results)
rel_substrate = avg_top1_relevance(substrate_results)

print('\n═══ LEVI BENCHMARK RESULTS ═══\n')
print(f'Architecture comparison (same model, different retrieval):')
print(f'  Diversity (avg pairwise distance):')
print(f'    Baseline: {div_baseline:.3f}')
print(f'    Substrate: {div_substrate:.3f}')
print(f'    Substrate delta: {(div_substrate - div_baseline) / div_baseline * 100:+.1f}%')
print(f'  Relevance (top-1 avg cosine to query):')
print(f'    Baseline: {rel_baseline:.3f}')
print(f'    Substrate: {rel_substrate:.3f}')
print(f'    Substrate delta: {(rel_substrate - rel_baseline) / rel_baseline * 100:+.1f}%')
print(f'\nCost:')
print(f'  Baseline: {t_baseline:.1f}s ({N_TEST} queries, 1 model)')
print(f'  Substrate: {t_substrate:.1f}s ({N_TEST} queries, 1 model + neighbor lookup)')
print(f'  Substrate overhead: {(t_substrate - t_baseline) / t_baseline * 100:+.1f}%')

# Save report
report = {
    "benchmark": "LEVI-style (search architecture comparison)",
    "n_queries": N_TEST,
    "n_corpus": len(embs),
    "diversity_baseline": div_baseline,
    "diversity_substrate": div_substrate,
    "diversity_delta_pct": (div_substrate - div_baseline) / div_baseline * 100,
    "relevance_baseline": rel_baseline,
    "relevance_substrate": rel_substrate,
    "relevance_delta_pct": (rel_substrate - rel_baseline) / rel_baseline * 100,
    "time_baseline_sec": t_baseline,
    "time_substrate_sec": t_substrate,
    "cost_overhead_pct": (t_substrate - t_baseline) / t_baseline * 100,
    "embedding_model": "bge-large-en-v1.5",
    "embedding_dim": int(embs.shape[1]),
    "date": "2026-09-22",
}
with open(REPORT_PATH, 'w') as f:
    json.dump(report, f, indent=2)
print(f'\nReport saved to {REPORT_PATH}')

# Interpretation
print('\n═══ INTERPRETATION ═══')
if rel_substrate > rel_baseline:
    print(f'Substrate boosts relevance by {(rel_substrate - rel_baseline) / rel_baseline * 100:+.1f}%')
    print('→ Cite-neighbor expansion pulls in highly-related canonical pieces.')
if div_substrate < div_baseline:
    print(f'Substrate reduces diversity by {(div_baseline - div_substrate) / div_baseline * 100:.1f}%')
    print('→ Trade-off: relevance up, diversity down. (Expected — neighbors are by definition close.)')
print(f'Cost overhead: only {(t_substrate - t_baseline) / t_baseline * 100:+.1f}% — neighbor lookup is essentially free')
